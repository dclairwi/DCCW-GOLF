import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { StatusBadge, fullName } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAdmin } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, utcIsoToZonedLocal } from "@/lib/time";
import { getPairings, pairingsPublished } from "@/lib/trips";
import { METHOD_LABEL, PAYMENT_METHODS, type LedgerRow, type Trip } from "@/lib/types";
import {
  addParticipant,
  createRound,
  deleteFoursome,
  deleteRound,
  publishPairingsNow,
  recordPayment,
  reviewClaim,
  saveFoursome,
  setAmountDue,
  setParticipantStatus,
  updateTrip,
} from "../../actions";
import { TripForm } from "../../TripForm";

export const metadata = { title: "Manage trip" };

export default async function AdminTripPage({ params, searchParams }: PageProps<"/admin/trips/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { error, msg } = await searchParams;
  const supabase = await createClient();

  const { data: tripData } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const [{ data: ledgerData }, { data: allProfiles }, pairings] = await Promise.all([
    supabase.rpc("get_trip_ledger", { p_trip_id: id }),
    supabase.from("profiles").select("id, first_name, last_name").order("last_name"),
    getPairings(id),
  ]);
  const ledger = (ledgerData ?? []) as LedgerRow[];
  const onTrip = new Set(ledger.map((l) => l.profile_id));
  const notOnTrip = (allProfiles ?? []).filter((p) => !onTrip.has(p.id as string));
  const active = ledger.filter((l) => l.status !== "withdrawn");
  const committedPlayers = ledger.filter((l) => l.status === "committed" || l.status === "confirmed");

  const totals = active.reduce(
    (acc, l) => {
      if (l.status === "committed" || l.status === "confirmed") {
        acc.expected += l.due_cents ?? 0;
        acc.paid += l.paid_cents;
        if (l.status === "confirmed") acc.fullyPaid += 1;
        acc.committed += 1;
      }
      return acc;
    },
    { expected: 0, paid: 0, fullyPaid: 0, committed: 0 },
  );
  const published = pairingsPublished(trip);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin" className="text-sm text-brand hover:underline">← All trips</Link>
        <h1 className="h1 mt-1">{trip.name}</h1>
      </div>
      <Notice error={error} message={msg} />

      {/* ------------------------------------------------ Players & money */}
      <section aria-labelledby="players">
        <h2 id="players" className="h2 mb-1">Players & payments</h2>
        <p className="mb-3 text-sm text-muted">Only you can see this section.</p>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Committed" value={String(totals.committed)} />
          <Stat label="Paid in full" value={`${totals.fullyPaid} of ${totals.committed}`} />
          <Stat label="Collected" value={formatCents(totals.paid)} />
          <Stat label="Still owed" value={formatCents(Math.max(0, totals.expected - totals.paid))} />
        </div>

        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">Player</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Paid / due</th>
                <th className="px-4 py-2">Waiting to check</th>
                <th className="px-4 py-2">Record payment</th>
                <th className="px-4 py-2">More</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border align-top">
              {ledger.map((l) => (
                <tr key={l.participant_id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{fullName(l.first_name, l.last_name)}</p>
                    <p className="text-xs text-muted">{l.email}</p>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatCents(l.paid_cents)} / {formatCents(l.due_cents)}
                  </td>
                  <td className="px-4 py-3">
                    {l.pending_claim_id ? (
                      <div className="space-y-2">
                        <p>
                          Says they sent <strong>{formatCents(l.pending_claim_cents)}</strong> by{" "}
                          {l.pending_claim_method ? METHOD_LABEL[l.pending_claim_method] : "?"}
                        </p>
                        {l.pending_claim_note && <p className="text-xs text-muted">“{l.pending_claim_note}”</p>}
                        <div className="flex gap-2">
                          <form action={reviewClaim}>
                            <input type="hidden" name="trip_id" value={id} />
                            <input type="hidden" name="claim_id" value={l.pending_claim_id} />
                            <input type="hidden" name="decision" value="accept" />
                            <SubmitButton className="btn-secondary" pendingText="…">Received ✓</SubmitButton>
                          </form>
                          <form action={reviewClaim}>
                            <input type="hidden" name="trip_id" value={id} />
                            <input type="hidden" name="claim_id" value={l.pending_claim_id} />
                            <input type="hidden" name="decision" value="reject" />
                            <SubmitButton className="btn-danger" pendingText="…" confirm="Reject this payment claim? They'll be able to submit again.">Not received</SubmitButton>
                          </form>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <form action={recordPayment} className="flex flex-wrap gap-1">
                      <input type="hidden" name="trip_id" value={id} />
                      <input type="hidden" name="participant_id" value={l.participant_id} />
                      <input name="amount" inputMode="decimal" required aria-label="Amount" placeholder="$" className="field w-20 px-2 py-1 text-sm" />
                      <select name="method" aria-label="Method" className="field w-24 px-2 py-1 text-sm">
                        {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                      </select>
                      <SubmitButton className="btn-secondary" pendingText="…">Add</SubmitButton>
                    </form>
                    <p className="mt-1 text-[11px] text-muted">Use a minus amount for a refund.</p>
                  </td>
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer text-brand">Options</summary>
                      <div className="mt-2 space-y-2">
                        <form action={setAmountDue} className="flex gap-1">
                          <input type="hidden" name="trip_id" value={id} />
                          <input type="hidden" name="participant_id" value={l.participant_id} />
                          <input name="amount_due" inputMode="decimal" aria-label="Custom amount due" placeholder="Custom $ due" className="field w-28 px-2 py-1 text-sm" />
                          <SubmitButton className="btn-secondary" pendingText="…">Set</SubmitButton>
                        </form>
                        <form action={setParticipantStatus}>
                          <input type="hidden" name="trip_id" value={id} />
                          <input type="hidden" name="participant_id" value={l.participant_id} />
                          <input type="hidden" name="status" value={l.status === "withdrawn" ? "invited" : "withdrawn"} />
                          <SubmitButton
                            className={l.status === "withdrawn" ? "btn-secondary" : "btn-danger"}
                            confirm={l.status === "withdrawn" ? undefined : "Mark this player as withdrawn? Payments stay on record."}
                          >
                            {l.status === "withdrawn" ? "Restore" : "Withdraw"}
                          </SubmitButton>
                        </form>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
              {ledger.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-4 text-muted">No one on this trip yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {notOnTrip.length > 0 && (
          <form action={addParticipant} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="trip_id" value={id} />
            <div>
              <label htmlFor="profile_id" className="label">Add an existing member to this trip</label>
              <select id="profile_id" name="profile_id" className="field">
                {notOnTrip.map((p) => (
                  <option key={p.id} value={p.id}>{fullName(p.first_name as string, p.last_name as string)}</option>
                ))}
              </select>
            </div>
            <SubmitButton className="btn-secondary">Add</SubmitButton>
          </form>
        )}
      </section>

      {/* ------------------------------------------------ Pairings */}
      <section id="pairings" aria-labelledby="pairings-h" className="scroll-mt-20">
        <h2 id="pairings-h" className="h2 mb-1">Groups & tee times</h2>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          {published ? (
            <span className="rounded bg-brand-soft px-2 py-1 font-medium text-brand">Visible to members</span>
          ) : trip.pairings_publish_at ? (
            <span className="rounded bg-accent/15 px-2 py-1">Goes live {formatDateTime(trip.pairings_publish_at, trip.timezone)}</span>
          ) : (
            <span className="rounded bg-accent/15 px-2 py-1">Hidden from members</span>
          )}
          <form action={publishPairingsNow}>
            <input type="hidden" name="trip_id" value={id} />
            <input type="hidden" name="unpublish" value={published ? "1" : "0"} />
            <SubmitButton className="btn-secondary" confirm={published ? undefined : "Show all groups and tee times to members now?"}>
              {published ? "Hide again" : "Publish now"}
            </SubmitButton>
          </form>
          <span className="text-muted">Only committed players can be placed in groups.</span>
        </div>

        <div className="space-y-6">
          {pairings.rounds.map((round) => {
            const groups = pairings.foursomes.filter((f) => f.round_id === round.id);
            const assigned = new Set(pairings.members.filter((m) => m.round_id === round.id).map((m) => m.participant_id));
            const unassigned = committedPlayers.filter((p) => !assigned.has(p.participant_id));
            return (
              <div key={round.id} id={`round-${round.id}`} className="card scroll-mt-20 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{round.name}</h3>
                    <p className="text-sm text-muted">
                      {round.course_name ?? "Course TBD"}{round.play_date ? ` · ${round.play_date}` : ""}
                    </p>
                  </div>
                  <form action={deleteRound}>
                    <input type="hidden" name="trip_id" value={id} />
                    <input type="hidden" name="round_id" value={round.id} />
                    <SubmitButton className="btn-danger" confirm={`Delete ${round.name} and all its groups?`}>Delete round</SubmitButton>
                  </form>
                </div>
                {unassigned.length > 0 && (
                  <p className="text-sm">
                    <span className="text-muted">Not in a group yet: </span>
                    {unassigned.map((u) => fullName(u.first_name, u.last_name)).join(", ")}
                  </p>
                )}
                <div className="grid gap-4 lg:grid-cols-2">
                  {groups.map((g, i) => (
                    <GroupForm
                      key={g.id}
                      tripId={id}
                      timezone={trip.timezone}
                      roundId={round.id}
                      foursomeId={g.id}
                      label={g.label ?? `Group ${i + 1}`}
                      teeTime={utcIsoToZonedLocal(g.tee_time, trip.timezone)}
                      members={pairings.members.filter((m) => m.foursome_id === g.id)}
                      players={committedPlayers}
                    />
                  ))}
                  <GroupForm
                    tripId={id}
                    timezone={trip.timezone}
                    roundId={round.id}
                    label={`Group ${groups.length + 1}`}
                    teeTime={round.play_date ? `${round.play_date}T08:00` : ""}
                    members={[]}
                    players={committedPlayers}
                    isNew
                  />
                </div>
              </div>
            );
          })}
        </div>

        <form action={createRound} className="card mt-6 grid gap-3 sm:grid-cols-4 sm:items-end">
          <input type="hidden" name="trip_id" value={id} />
          <p className="font-semibold sm:col-span-4">Add a round</p>
          <div>
            <label htmlFor="round-name" className="label">Name</label>
            <input id="round-name" name="name" required placeholder="Friday – Round 1" className="field" />
          </div>
          <div>
            <label htmlFor="round-course" className="label">Course</label>
            <input id="round-course" name="course_name" className="field" />
          </div>
          <div>
            <label htmlFor="round-date" className="label">Date</label>
            <input id="round-date" name="play_date" type="date" className="field" />
          </div>
          <SubmitButton>Add round</SubmitButton>
        </form>
      </section>

      {/* ------------------------------------------------ Trip settings */}
      <section aria-labelledby="settings">
        <h2 id="settings" className="h2 mb-3">Trip details</h2>
        <div className="card">
          <TripForm action={updateTrip} trip={trip} submitLabel="Save trip" />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function GroupForm({
  tripId,
  timezone,
  roundId,
  foursomeId,
  label,
  teeTime,
  members,
  players,
  isNew,
}: {
  tripId: string;
  timezone: string;
  roundId: string;
  foursomeId?: string;
  label: string;
  teeTime: string;
  members: { participant_id: string; is_captain: boolean }[];
  players: LedgerRow[];
  isNew?: boolean;
}) {
  const captain = members.find((m) => m.is_captain)?.participant_id ?? "";
  const others = members.filter((m) => !m.is_captain).map((m) => m.participant_id);
  const options = (
    <>
      <option value="">—</option>
      {players.map((p) => (
        <option key={p.participant_id} value={p.participant_id}>{fullName(p.first_name, p.last_name)}</option>
      ))}
    </>
  );
  const fid = foursomeId ?? `new-${roundId}`;
  return (
    <div className={`rounded-xl border p-4 ${isNew ? "border-dashed border-border" : "border-border bg-background/50"}`}>
      <form action={saveFoursome} className="space-y-2">
        <input type="hidden" name="trip_id" value={tripId} />
        <input type="hidden" name="round_id" value={roundId} />
        <input type="hidden" name="timezone" value={timezone} />
        {foursomeId && <input type="hidden" name="foursome_id" value={foursomeId} />}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`label-${fid}`} className="label">{isNew ? "New group" : "Group"}</label>
            <input id={`label-${fid}`} name="label" defaultValue={label} className="field" />
          </div>
          <div>
            <label htmlFor={`tee-${fid}`} className="label">Tee time</label>
            <input id={`tee-${fid}`} name="tee_time" type="datetime-local" defaultValue={teeTime} className="field" />
          </div>
        </div>
        <div>
          <label htmlFor={`cap-${fid}`} className="label">Captain</label>
          <select id={`cap-${fid}`} name="captain" defaultValue={captain} className="field">{options}</select>
        </div>
        <div className="ml-4 space-y-2 border-l-2 border-brand-soft pl-3">
          {[0, 1, 2].map((i) => (
            <select key={i} name={`p${i + 1}`} aria-label={`Player ${i + 2}`} defaultValue={others[i] ?? ""} className="field">
              {options}
            </select>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <SubmitButton className="btn-secondary">{isNew ? "Create group" : "Save group"}</SubmitButton>
        </div>
      </form>
      {foursomeId && (
        <form action={deleteFoursome} className="mt-2">
          <input type="hidden" name="trip_id" value={tripId} />
          <input type="hidden" name="foursome_id" value={foursomeId} />
          <SubmitButton className="btn-danger" confirm="Remove this group?">Remove group</SubmitButton>
        </form>
      )}
    </div>
  );
}
