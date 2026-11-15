import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { FoursomeGrid } from "@/components/Pairings";
import { Avatar, StatusBadge, fullName } from "@/components/StatusBadge";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";
import { getPairings, getUpcomingTrip, pairingsPublished } from "@/lib/trips";
import type { LedgerRow, RosterRow } from "@/lib/types";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const trip = await getUpcomingTrip();
  const { round: roundParam } = await searchParams;

  if (!trip) {
    return (
      <div className="card text-center">
        <h1 className="h1 mb-2">No trip on the calendar yet</h1>
        <p className="text-muted">The organizer will post the next trip soon.</p>
        {user.isAdmin && (
          <Link href="/admin" className="btn mt-4">Create the trip</Link>
        )}
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: rosterData }, ledgerRes, pairings] = await Promise.all([
    supabase.rpc("get_trip_roster", { p_trip_id: trip.id }),
    user.isAdmin ? supabase.rpc("get_trip_ledger", { p_trip_id: trip.id }) : Promise.resolve({ data: null }),
    getPairings(trip.id),
  ]);
  const roster = (rosterData ?? []) as RosterRow[];
  const ledger = new Map(((ledgerRes.data ?? []) as LedgerRow[]).map((l) => [l.participant_id, l]));
  const rosterMap = new Map(roster.map((r) => [r.participant_id, r]));

  const confirmed = roster.filter((r) => r.status === "confirmed").length;
  const going = roster.filter((r) => r.status === "committed").length;

  // Pick the round to show: ?round= or the next one that hasn't happened yet.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: trip.timezone }).format(new Date());
  const showPairings = pairingsPublished(trip) || user.isAdmin;
  const rounds = showPairings ? pairings.rounds : [];
  const activeRound =
    rounds.find((r) => r.id === roundParam) ??
    rounds.find((r) => !r.play_date || r.play_date >= today) ??
    rounds[0];

  const paidBadge = (pid: string) => {
    if (!user.isAdmin) return null;
    const l = ledger.get(pid);
    if (!l) return null;
    const full = l.due_cents !== null && l.paid_cents >= l.due_cents;
    return (
      <span
        className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${
          full ? "bg-brand-soft text-brand" : l.paid_cents > 0 ? "bg-accent/15" : "bg-danger/10 text-danger"
        }`}
        title="Only you (admin) can see this"
      >
        {full ? "Paid" : l.paid_cents > 0 ? `Paid ${formatCents(l.paid_cents)}` : "Unpaid"}
        {l.pending_claim_id ? " · claim" : ""}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-brand px-5 py-8 text-white shadow-lg sm:px-10 sm:py-12">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">{trip.year} · {trip.destination}</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-5xl">{trip.name}</h1>
        <p className="mt-2 text-white/80">
          {trip.starts_at
            ? `${formatDate(trip.starts_at, trip.timezone)} – ${formatDate(trip.ends_at, trip.timezone)}`
            : "Dates coming soon"}
        </p>
        <div className="mt-8">
          {trip.starts_at ? (
            <Countdown target={trip.starts_at} />
          ) : (
            <p className="rounded-xl bg-white/10 px-4 py-6 text-center text-lg">
              The countdown starts as soon as dates are locked in.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="whos-going">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="whos-going" className="h2">Who’s going</h2>
            <p className="text-sm text-muted">
              {confirmed} confirmed · {going} going, not confirmed yet
              {trip.max_participants ? ` · ${trip.max_participants} spots` : ""}
            </p>
          </div>
          <Link href="/my-trips" className="btn-secondary">My status</Link>
        </div>

        {activeRound ? (
          <>
            {rounds.length > 1 && (
              <nav aria-label="Rounds" className="mb-4 flex flex-wrap gap-2">
                {rounds.map((r) => (
                  <Link
                    key={r.id}
                    href={`/?round=${r.id}`}
                    aria-current={r.id === activeRound.id ? "page" : undefined}
                    className={r.id === activeRound.id ? "btn" : "btn-secondary"}
                  >
                    {r.name}
                  </Link>
                ))}
              </nav>
            )}
            <p className="mb-3 text-sm text-muted">
              <span className="font-medium text-foreground">{activeRound.name}</span>
              {activeRound.course_name ? ` · ${activeRound.course_name}` : ""}
              {activeRound.play_date ? ` · ${formatDate(`${activeRound.play_date}T12:00:00Z`, "UTC")}` : ""}
              {user.isAdmin && !pairingsPublished(trip) && (
                <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-xs">Not published — only you can see this</span>
              )}
            </p>
            <FoursomeGrid
              foursomes={pairings.foursomes.filter((f) => f.round_id === activeRound.id)}
              members={pairings.members.filter((m) => m.round_id === activeRound.id)}
              roster={rosterMap}
              timezone={trip.timezone}
              extra={(pid) => (
                <span className="flex items-center gap-1.5">
                  <StatusBadge status={rosterMap.get(pid)?.status ?? "invited"} />
                  {paidBadge(pid)}
                </span>
              )}
            />
          </>
        ) : null}

        <div className={activeRound ? "mt-6" : ""}>
          {activeRound && <h3 className="mb-2 font-semibold">Full roster</h3>}
          {roster.length === 0 ? (
            <p className="card text-sm text-muted">Nobody has signed up yet.</p>
          ) : (
            <ul className="card divide-y divide-border p-0">
              {roster.map((r) => (
                <li key={r.participant_id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar first={r.first_name} last={r.last_name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{fullName(r.first_name, r.last_name)}</p>
                    {r.hometown && <p className="truncate text-xs text-muted">{r.hometown}</p>}
                  </div>
                  <StatusBadge status={r.status} />
                  {paidBadge(r.participant_id)}
                </li>
              ))}
            </ul>
          )}
          {!showPairings && (
            <p className="mt-3 text-sm text-muted">Groups and tee times will show up here about a week before the trip.</p>
          )}
        </div>
      </section>
    </div>
  );
}
