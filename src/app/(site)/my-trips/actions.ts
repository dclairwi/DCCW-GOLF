"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseDollarsToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const back = (q: string) => redirect(`/my-trips?${q}`);

export async function joinTrip(formData: FormData) {
  await requireUser();
  const tripId = z.uuid().safeParse(formData.get("trip_id"));
  const agreed = formData.get("agree") === "on";
  if (!tripId.success) back("error=" + encodeURIComponent("Unknown trip."));
  if (!agreed) back("error=" + encodeURIComponent("Please check the box to agree to the payment policy."));

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_trip", { p_trip_id: tripId.data, p_agree_policy: true });
  if (error) back("error=" + encodeURIComponent(error.message));
  revalidatePath("/");
  back("msg=" + encodeURIComponent("You’re in! Send your payment to lock in your spot."));
}

const claimSchema = z.object({
  participant_id: z.uuid(),
  method: z.enum(["venmo", "zelle", "cash", "other"]),
  note: z.string().trim().max(300).optional(),
});

export async function submitPaymentClaim(formData: FormData) {
  await requireUser();
  const parsed = claimSchema.safeParse({
    participant_id: formData.get("participant_id"),
    method: formData.get("method"),
    note: (formData.get("note") as string | null) || undefined,
  });
  const cents = parseDollarsToCents(formData.get("amount") as string | null);
  if (!parsed.success || cents === null || cents <= 0) {
    back("error=" + encodeURIComponent("Enter the amount you sent, like 250 or 250.00."));
  }

  const supabase = await createClient();
  // RLS guarantees you can only claim against your own registration.
  const { error } = await supabase.from("payment_claims").insert({
    participant_id: parsed.data!.participant_id,
    amount_cents: cents,
    method: parsed.data!.method,
    note: parsed.data!.note ?? null,
  });
  if (error) {
    const msg = error.code === "23505"
      ? "You already have a payment waiting for the organizer to check."
      : "Couldn’t save that. Try again.";
    back("error=" + encodeURIComponent(msg));
  }
  back("msg=" + encodeURIComponent("Thanks! The organizer will mark it paid once it shows up."));
}
