import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Foursome, FoursomeMember, Round, Trip } from "@/lib/types";

const ACTIVE: Trip["status"][] = ["planning", "open", "closed", "in_progress"];

/** The trip the home page counts down to: the next active trip by start date. */
export async function getUpcomingTrip(): Promise<Trip | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trips")
    .select("*")
    .in("status", ACTIVE)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("year", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Trip | null) ?? null;
}

export type Pairings = {
  rounds: Round[];
  foursomes: Foursome[];
  members: FoursomeMember[];
};

/** Pairings visible to the current user (RLS hides unpublished ones from members). */
export async function getPairings(tripId: string): Promise<Pairings> {
  const supabase = await createClient();
  const { data: rounds } = await supabase
    .from("rounds")
    .select("*")
    .eq("trip_id", tripId)
    .order("sort")
    .order("play_date", { nullsFirst: false });
  const roundIds = (rounds ?? []).map((r) => r.id as string);
  if (roundIds.length === 0) return { rounds: [], foursomes: [], members: [] };
  const [{ data: foursomes }, { data: members }] = await Promise.all([
    supabase.from("foursomes").select("*").in("round_id", roundIds).order("tee_time", { nullsFirst: false }).order("sort"),
    supabase.from("foursome_members").select("*").in("round_id", roundIds),
  ]);
  return {
    rounds: (rounds ?? []) as Round[],
    foursomes: (foursomes ?? []) as Foursome[],
    members: (members ?? []) as FoursomeMember[],
  };
}

export function pairingsPublished(trip: Trip, now = Date.now()): boolean {
  return !!trip.pairings_publish_at && new Date(trip.pairings_publish_at).getTime() <= now;
}
