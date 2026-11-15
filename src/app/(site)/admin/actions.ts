"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { parseDollarsToCents } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone, zonedLocalToUtcIso } from "@/lib/time";

const enc = encodeURIComponent;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = z.uuid();

function go(path: string, kind: "msg" | "error", text: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${enc(text)}`);
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------
const tripSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug: lowercase letters, numbers and dashes").max(60),
  year: z.coerce.number().int().min(2000).max(2100),
  destination: z.string().min(2).max(100),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
  status: z.enum(["planning", "open", "closed", "in_progress", "completed", "cancelled"]),
  max_participants: z.union([z.literal(""), z.coerce.number().int().min(1).max(500)]),
  description: z.string().max(5000),
  venmo_handle: z.string().max(60),
  zelle_info: z.string().max(120),
  payment_policy: z.string().min(10).max(2000),
});

function readTrip(fd: FormData, path: string) {
  const parsed = tripSchema.safeParse({
    name: str(fd, "name"),
    slug: str(fd, "slug").toLowerCase(),
    year: str(fd, "year"),
    destination: str(fd, "destination"),
    timezone: str(fd, "timezone") || "America/Los_Angeles",
    status: str(fd, "status") || "planning",
    max_participants: str(fd, "max_participants"),
    description: str(fd, "description"),
    venmo_handle: str(fd, "venmo_handle"),
    zelle_info: str(fd, "zelle_info"),
    payment_policy: str(fd, "payment_policy"),
  });
  if (!parsed.success) go(path, "error", parsed.error.issues[0]?.message ?? "Check the form.");
  const t = parsed.data;

  const feeRaw = str(fd, "trip_fee");
  const fee = feeRaw === "" ? null : parseDollarsToCents(feeRaw);
  if (feeRaw !== "" && (fee === null || fee < 0)) go(path, "error", "Trip cost must be a dollar amount.");

  const toUtc = (k: string) => {
    const v = str(fd, k);
    if (!v) return null;
    const iso = zonedLocalToUtcIso(v, t.timezone);
    if (!iso) go(path, "error", `Invalid date/time for ${k.replace(/_/g, " ")}.`);
    return iso;
  };
  const starts_at = toUtc("starts_at");
  const ends_at = toUtc("ends_at");
  const pairings_publish_at = toUtc("pairings_publish_at");
  const due = str(fd, "payment_due_date");

  return {
    ...t,
    max_participants: t.max_participants === "" ? null : t.max_participants,
    description: t.description || null,
    venmo_handle: t.venmo_handle || null,
    zelle_info: t.zelle_info || null,
    trip_fee_cents: fee,
    starts_at,
    ends_at,
    pairings_publish_at,
    payment_due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
  };
}

export async function createTrip(fd: FormData) {
  await requireAdmin();
  const trip = readTrip(fd, "/admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("trips").insert(trip).select("id").single();
  if (error) go("/admin", "error", error.code === "23505" ? "That slug is already used." : error.message);
  revalidatePath("/", "layout");
  go(`/admin/trips/${data.id}`, "msg", "Trip created.");
}

export async function updateTrip(fd: FormData) {
  await requireAdmin();
  const id = uuid.parse(fd.get("trip_id"));
  const path = `/admin/trips/${id}`;
  const trip = readTrip(fd, path);
  const supabase = await createClient();
  const { error } = await supabase.from("trips").update(trip).eq("id", id);
  if (error) go(path, "error", error.code === "23505" ? "That slug is already used." : error.message);
  revalidatePath("/", "layout");
  go(path, "msg", "Trip saved.");
}

export async function publishPairingsNow(fd: FormData) {
  await requireAdmin();
  const id = uuid.parse(fd.get("trip_id"));
  const unpublish = fd.get("unpublish") === "1";
  const supabase = await createClient();
  const { error } = await supabase
    .from("trips")
    .update({ pairings_publish_at: unpublish ? null : new Date().toISOString() })
    .eq("id", id);
  if (error) go(`/admin/trips/${id}`, "error", error.message);
  revalidatePath("/", "layout");
  go(`/admin/trips/${id}`, "msg", unpublish ? "Pairings hidden from members." : "Pairings and tee times are now visible to members.");
}

// ---------------------------------------------------------------------------
// Participants & payments
// ---------------------------------------------------------------------------
export async function addParticipant(fd: FormData) {
  await requireAdmin();
  const tripId = uuid.parse(fd.get("trip_id"));
  const profileId = uuid.safeParse(fd.get("profile_id"));
  const path = `/admin/trips/${tripId}`;
  if (!profileId.success) go(path, "error", "Pick a member.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("trip_participants")
    .insert({ trip_id: tripId, profile_id: profileId.data, status: "invited" });
  if (error) go(path, "error", error.code === "23505" ? "They’re already on this trip." : error.message);
  revalidatePath("/", "layout");
  go(path, "msg", "Added to the trip as Invited. They can commit from My Trips.");
}

export async function setParticipantStatus(fd: FormData) {
  await requireAdmin();
  const tripId = uuid.parse(fd.get("trip_id"));
  const pid = uuid.parse(fd.get("participant_id"));
  const status = z.enum(["invited", "withdrawn"]).parse(fd.get("status"));
  const supabase = await createClient();
  const { error } = await supabase.from("trip_participants").update({ status }).eq("id", pid).eq("trip_id", tripId);
  if (error) go(`/admin/trips/${tripId}`, "error", error.message);
  revalidatePath("/", "layout");
  go(`/admin/trips/${tripId}`, "msg", status === "withdrawn" ? "Marked as withdrawn." : "Restored as Invited.");
}

export async function setAmountDue(fd: FormData) {
  await requireAdmin();
  const tripId = uuid.parse(fd.get("trip_id"));
  const pid = uuid.parse(fd.get("participant_id"));
  const raw = str(fd, "amount_due");
  const cents = raw === "" ? null : parseDollarsToCents(raw);
  if (raw !== "" && (cents === null || cents < 0)) go(`/admin/trips/${tripId}`, "error", "Amount due must be a dollar amount.");
  const supabase = await createClient();
  const { error } = await supabase.from("trip_participants").update({ amount_due_cents: cents }).eq("id", pid).eq("trip_id", tripId);
  if (error) go(`/admin/trips/${tripId}`, "error", error.message);
  revalidatePath("/", "layout");
  go(`/admin/trips/${tripId}`, "msg", cents === null ? "Using the standard trip cost." : "Custom amount saved.");
}

export async function recordPayment(fd: FormData) {
  await requireAdmin();
  const tripId = uuid.parse(fd.get("trip_id"));
  const pid = uuid.parse(fd.get("participant_id"));
  const path = `/admin/trips/${tripId}`;
  const cents = parseDollarsToCents(str(fd, "amount"));
  const method = z.enum(["venmo", "zelle", "cash", "other"]).safeParse(fd.get("method"));
  if (cents === null || cents === 0 || !method.success) go(path, "error", "Enter an amount (use a minus sign for a refund).");
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", {
    p_participant_id: pid,
    p_amount_cents: cents,
    p_method: method.data,
    p_received_on: null,
    p_note: str(fd, "note").slice(0, 300) || null,
  });
  if (error) go(path, "error", error.message);
  revalidatePath("/", "layout");
  go(path, "msg", cents! < 0 ? "Refund recorded." : "Payment recorded.");
}

export async function reviewClaim(fd: FormData) {
  await requireAdmin();
  const tripId = uuid.parse(fd.get("trip_id"));
  const claimId = uuid.parse(fd.get("claim_id"));
  const accept = fd.get("decision") === "accept";
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_claim", { p_claim_id: claimId, p_accept: accept });
  if (error) go(`/admin/trips/${tripId}`, "error", error.message);
  revalidatePath("/", "layout");
  go(`/admin/trips/${tripId}`, "msg", accept ? "Marked as received." : "Claim rejected — they can submit again.");
}

// ---------------------------------------------------------------------------
// Rounds, groups, tee times
// ---------------------------------------------------------------------------
export async function createRound(fd: FormData) {
  await requireAdmin();
  const tripId = uuid.parse(fd.get("trip_id"));
  const path = `/admin/trips/${tripId}#pairings`;
  const name = str(fd, "name");
  if (!name) go(path, "error", "Give the round a name, like “Friday – Round 1”.");
  const date = str(fd, "play_date");
  const supabase = await createClient();
  const { error } = await supabase.from("rounds").insert({
    trip_id: tripId,
    name: name.slice(0, 80),
    course_name: str(fd, "course_name").slice(0, 120) || null,
    play_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
  });
  if (error) go(path, "error", error.message);
  go(path, "msg", "Round added.");
}

export async function deleteRound(fd: FormData) {
  await requireAdmin();
  const tripId = uuid.parse(fd.get("trip_id"));
  const roundId = uuid.parse(fd.get("round_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("rounds").delete().eq("id", roundId).eq("trip_id", tripId);
  if (error) go(`/admin/trips/${tripId}`, "error", error.message);
  revalidatePath("/", "layout");
  go(`/admin/trips/${tripId}#pairings`, "msg", "Round deleted.");
}

/**
 * Save one group: tee time, captain and up to three other players.
 * Replaces the group's members in one go so the form is the source of truth.
 */
export async function saveFoursome(fd: FormData) {
  await requireAdmin();
  const tripId = uuid.parse(fd.get("trip_id"));
  const roundId = uuid.parse(fd.get("round_id"));
  const timezone = str(fd, "timezone");
  const path = `/admin/trips/${tripId}#round-${roundId}`;
  const foursomeId = uuid.safeParse(fd.get("foursome_id"));

  const tee = str(fd, "tee_time");
  const teeIso = tee ? zonedLocalToUtcIso(tee, isValidTimeZone(timezone) ? timezone : "America/Los_Angeles") : null;
  if (tee && !teeIso) go(path, "error", "Invalid tee time.");

  const captain = str(fd, "captain");
  const players = ["p1", "p2", "p3"].map((k) => str(fd, k)).filter(Boolean);
  const all = [captain, ...players].filter(Boolean);
  if (new Set(all).size !== all.length) go(path, "error", "The same player is in this group twice.");
  if (!all.every((p) => uuid.safeParse(p).success)) go(path, "error", "Unknown player.");

  const supabase = await createClient();
  let id = foursomeId.success ? foursomeId.data : null;
  const label = str(fd, "label").slice(0, 60) || null;
  if (id) {
    const { error } = await supabase.from("foursomes").update({ tee_time: teeIso, label }).eq("id", id).eq("round_id", roundId);
    if (error) go(path, "error", error.message);
  } else {
    const { data, error } = await supabase.from("foursomes").insert({ round_id: roundId, tee_time: teeIso, label }).select("id").single();
    if (error) go(path, "error", error.message);
    id = data.id as string;
  }

  // Move anyone chosen here out of other groups in this round first.
  if (all.length) {
    const { error: moveErr } = await supabase
      .from("foursome_members")
      .delete()
      .eq("round_id", roundId)
      .in("participant_id", all);
    if (moveErr) go(path, "error", moveErr.message);
  }
  const { error: clearErr } = await supabase.from("foursome_members").delete().eq("foursome_id", id!);
  if (clearErr) go(path, "error", clearErr.message);

  if (all.length) {
    const rows = all.map((pid) => ({
      foursome_id: id!,
      round_id: roundId,
      participant_id: pid,
      is_captain: pid === captain,
    }));
    const { error } = await supabase.from("foursome_members").insert(rows);
    if (error) go(path, "error", error.message);
  }
  revalidatePath("/", "layout");
  go(path, "msg", "Group saved.");
}

export async function deleteFoursome(fd: FormData) {
  await requireAdmin();
  const tripId = uuid.parse(fd.get("trip_id"));
  const foursomeId = uuid.parse(fd.get("foursome_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("foursomes").delete().eq("id", foursomeId);
  if (error) go(`/admin/trips/${tripId}`, "error", error.message);
  revalidatePath("/", "layout");
  go(`/admin/trips/${tripId}#pairings`, "msg", "Group removed.");
}

// ---------------------------------------------------------------------------
// Members: invites & sign-in troubleshooting (uses Supabase Auth admin API)
// ---------------------------------------------------------------------------
const inviteSchema = z.object({
  email: z.email().max(254),
  first_name: z.string().max(60),
  last_name: z.string().max(60),
});

export async function inviteMember(fd: FormData) {
  await requireAdmin();
  const parsed = inviteSchema.safeParse({
    email: str(fd, "email").toLowerCase(),
    first_name: str(fd, "first_name"),
    last_name: str(fd, "last_name"),
  });
  if (!parsed.success) go("/admin/members", "error", "Enter a valid email.");
  const { email, first_name, last_name } = parsed.data;
  const tripId = uuid.safeParse(fd.get("trip_id"));

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { first_name, last_name },
    redirectTo: `${env.siteUrl}/set-password`,
  });
  if (error) {
    const exists = /already/i.test(error.message);
    go("/admin/members", "error", exists ? "That email is already a member. Use “Copy sign-in link” if they’re stuck." : `Invite failed: ${error.message}`);
  }

  if (tripId.success && data.user) {
    // Admin client is fine here: requireAdmin() passed above.
    await admin.from("trip_participants").insert({ trip_id: tripId.data, profile_id: data.user.id, status: "invited" });
  }
  revalidatePath("/admin/members");
  go("/admin/members", "msg", `Invite sent to ${email}. If it doesn’t arrive, use “Copy sign-in link”.`);
}

export async function resendInvite(fd: FormData) {
  await requireAdmin();
  const email = z.email().parse(str(fd, "email"));
  const admin = createAdminClient();
  // For people who never finished signing up, a password-reset email works as a fresh invite.
  const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${env.siteUrl}/set-password` });
  if (error) go("/admin/members", "error", `Couldn’t send: ${error.message}`);
  go("/admin/members", "msg", `Password-setup email sent to ${email}.`);
}

export type SignInLinkState = { link?: string; error?: string };

/**
 * Generates a one-time sign-in link without sending an email, so the organizer
 * can text it to someone whose emails aren't arriving. The link is returned to
 * the admin's browser directly (never put in a URL, so it can't end up in logs).
 */
export async function makeSignInLink(_prev: SignInLinkState, fd: FormData): Promise<SignInLinkState> {
  await requireAdmin();
  const email = z.email().safeParse(str(fd, "email"));
  if (!email.success) return { error: "Unknown email." };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: email.data });
  if (error || !data.properties?.hashed_token) {
    return { error: `Couldn’t create a link: ${error?.message ?? "unknown error"}` };
  }
  return {
    link: `${env.siteUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/set-password`,
  };
}

export async function setAccess(fd: FormData) {
  const me = await requireAdmin();
  const userId = uuid.parse(fd.get("user_id"));
  const disable = fd.get("disable") === "1";
  if (userId === me.id) go("/admin/members", "error", "You can’t disable your own account.");
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: disable ? "876000h" : "none" });
  if (error) go("/admin/members", "error", error.message);
  go("/admin/members", "msg", disable ? "Access disabled. Their history is kept." : "Access restored.");
}
