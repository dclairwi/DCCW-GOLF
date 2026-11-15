import { Notice } from "@/components/Notice";
import { StatusBadge, fullName } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/time";
import { getPairings, pairingsPublished } from "@/lib/trips";
import { METHOD_LABEL, PAYMENT_METHODS, TRIP_STATUS_LABEL, type DisplayStatus, type RosterRow, type Trip } from "@/lib/types";
import { joinTrip, submitPaymentClaim } from "./actions";

export const metadata = { title: "My Trips" };

type MyRow = {
  id: string;
  status: "invited" | "committed" | "withdrawn";
  amount_due_cents: number | null;
  trips: Trip;
};

export default async function MyTripsPage({ searchParams }: PageProps<"/my-trips">) {
  const user = await requireUser();
  const { error, msg } = await searchParams;
  const supabase = await createClient();

  const [{ data: trips }, { data: mine }] = await Promise.all([
    supabase.from("trips").select("*").in("status", ["planning", "open", "closed", "in_progress"]).order("starts_at", { nullsFirst: false }),
    supabase.from("trip_participants").select("id, status, amount_due_cents, trips(*)").eq("profile_id", user.id),
  ]);
  const myRows = (mine ?? []) as unknown as MyRow[];
  const myByTrip = new Map(myRows.map((r) => [r.trips.id, r]));
  const past = myRows.filter((r) => r.trips.status === "completed");

  return (
    <div className="space-y-6">
      <h1 className="h1">My Trips</h1>
      <Notice error={error} message={msg} />
      {(trips ?? []).length === 0 && <p className="card text-muted">No upcoming trips yet.</p>}
      {((trips ?? []) as Trip[]).map((trip) => (
        <TripCard key={trip.id} trip={trip} mine={myByTrip.get(trip.id)} />
      ))}

      {past.length > 0 && (
        <section>
          <h2 className="h2 mb-3">Past trips</h2>
          <ul className="card divide-y divide-border p-0">
            {past.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <span className="font-medium">{r.trips.name}</span>{" "}
                <span className="text-sm text-muted">· {r.trips.destination} · {r.trips.year}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

async function TripCard({ trip, mine }: { trip: Trip; mine?: MyRow }) {
  const supabase = await createClient();
  const committed = mine?.status === "committed";

  let paid = 0;
  type Claim = { amount_cents: number; method: keyof typeof METHOD_LABEL };
  let pendingClaim: Claim | null = null;
  let display: DisplayStatus = mine?.status === "withdrawn" ? "withdrawn" : committed ? "committed" : "invited";
  if (mine && committed) {
    const [{ data: payments }, { data: claims }] = await Promise.all([
      supabase.from("payments").select("amount_cents").eq("participant_id", mine.id),
      supabase.from("payment_claims").select("amount_cents, method").eq("participant_id", mine.id).eq("status", "pending"),
    ]);
    paid = (payments ?? []).reduce((s, p) => s + (p.amount_cents as number), 0);
    pendingClaim = (claims?.[0] as Claim | undefined) ?? null;
  }
  const due = mine?.amount_due_cents ?? trip.trip_fee_cents;
  if (committed && due !== null && paid >= due) display = "confirmed";
  const balance = due === null ? null : Math.max(0, due - paid);

  return (
    <section className="card space-y-5" aria-labelledby={`trip-${trip.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`trip-${trip.id}`} className="h2">{trip.name}</h2>
          <p className="text-sm text-muted">
            {trip.destination} ·{" "}
            {trip.starts_at ? `${formatDate(trip.starts_at, trip.timezone)} – ${formatDate(trip.ends_at, trip.timezone)}` : "Dates TBD"} ·{" "}
            {TRIP_STATUS_LABEL[trip.status]}
          </p>
        </div>
        {mine && <StatusBadge status={display} />}
      </div>

      {!committed && mine?.status !== "withdrawn" && (
        trip.status === "open" ? (
          <form action={joinTrip} className="space-y-3 rounded-xl bg-brand-soft p-4">
            <input type="hidden" name="trip_id" value={trip.id} />
            <p className="font-semibold">Are you in?</p>
            <p className="text-sm">
              Trip cost: <strong>{formatCents(trip.trip_fee_cents)}</strong>
              {trip.payment_due_date ? ` · due ${formatDate(`${trip.payment_due_date}T12:00:00Z`, "UTC")}` : ""}
            </p>
            <p className="text-sm text-muted">{trip.payment_policy}</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="agree" required className="mt-1 h-4 w-4 accent-[var(--brand)]" />
              <span>I’m committing to this trip and I understand my payment is non-refundable except for a serious life event.</span>
            </label>
            <SubmitButton pendingText="Saving…">I’m in</SubmitButton>
          </form>
        ) : (
          <p className="text-sm text-muted">Sign-ups aren’t open yet. You’ll be able to commit here once they are.</p>
        )
      )}

      {committed && mine && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-brand-soft p-4">
            <p className="text-sm text-muted">Your balance</p>
            <p className="font-serif text-3xl font-semibold">{balance === null ? "TBD" : formatCents(balance)}</p>
            <p className="mt-1 text-sm">
              Paid {formatCents(paid)} of {formatCents(due)}
            </p>
            {display === "confirmed" && <p className="mt-2 text-sm font-semibold text-brand">You’re fully confirmed. See you there!</p>}
            {pendingClaim && (
              <p className="mt-2 text-sm">
                Waiting on the organizer to confirm your {METHOD_LABEL[pendingClaim.method]} payment of{" "}
                {formatCents(pendingClaim.amount_cents)}.
              </p>
            )}
          </div>

          {balance !== null && balance > 0 && !pendingClaim && (
            <form action={submitPaymentClaim} className="space-y-3">
              <input type="hidden" name="participant_id" value={mine.id} />
              <p className="font-semibold">How to pay</p>
              <ul className="text-sm">
                {trip.venmo_handle && <li>Venmo: <strong>{trip.venmo_handle}</strong></li>}
                {trip.zelle_info && <li>Zelle: <strong>{trip.zelle_info}</strong></li>}
                {!trip.venmo_handle && !trip.zelle_info && <li className="text-muted">The organizer will post payment details soon.</li>}
              </ul>
              <p className="text-sm text-muted">After you send it, let the organizer know here:</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`amount-${mine.id}`} className="label">Amount sent ($)</label>
                  <input id={`amount-${mine.id}`} name="amount" inputMode="decimal" required className="field" placeholder={(balance / 100).toFixed(2)} />
                </div>
                <div>
                  <label htmlFor={`method-${mine.id}`} className="label">Paid with</label>
                  <select id={`method-${mine.id}`} name="method" className="field">
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor={`note-${mine.id}`} className="label">Note (optional)</label>
                <input id={`note-${mine.id}`} name="note" maxLength={300} className="field" placeholder="e.g. sent from my wife’s Venmo" />
              </div>
              <SubmitButton pendingText="Sending…">I sent it</SubmitButton>
            </form>
          )}
        </div>
      )}

      {committed && mine && <MyTeeTimes trip={trip} participantId={mine.id} />}
    </section>
  );
}

async function MyTeeTimes({ trip, participantId }: { trip: Trip; participantId: string }) {
  if (!pairingsPublished(trip)) {
    return <p className="text-sm text-muted">Your groups and tee times will be posted about a week before the trip.</p>;
  }
  const supabase = await createClient();
  const [pairings, { data: rosterData }] = await Promise.all([
    getPairings(trip.id),
    supabase.rpc("get_trip_roster", { p_trip_id: trip.id }),
  ]);
  const roster = new Map(((rosterData ?? []) as RosterRow[]).map((r) => [r.participant_id, r]));
  if (pairings.rounds.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 font-semibold">Your tee times</h3>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {pairings.rounds.map((round) => {
          const mine = pairings.members.find((m) => m.round_id === round.id && m.participant_id === participantId);
          const group = mine ? pairings.foursomes.find((f) => f.id === mine.foursome_id) : undefined;
          const mates = mine
            ? pairings.members.filter((m) => m.foursome_id === mine.foursome_id && m.participant_id !== participantId)
            : [];
          return (
            <li key={round.id} className="px-4 py-3 text-sm">
              <p className="font-medium">
                {round.name}
                {round.course_name ? ` · ${round.course_name}` : ""}
                {round.play_date ? ` · ${formatDate(`${round.play_date}T12:00:00Z`, "UTC")}` : ""}
              </p>
              {group ? (
                <p className="text-muted">
                  Tee time <strong className="text-foreground">{formatTime(group.tee_time, trip.timezone)}</strong>
                  {mine?.is_captain ? " · you’re captain" : ""} · with{" "}
                  {mates.map((m) => {
                    const r = roster.get(m.participant_id);
                    return r ? fullName(r.first_name, r.last_name) + (m.is_captain ? " (captain)" : "") : "TBD";
                  }).join(", ") || "TBD"}
                </p>
              ) : (
                <p className="text-muted">Not assigned yet</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
