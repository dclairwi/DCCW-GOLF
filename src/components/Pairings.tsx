import { Avatar, fullName } from "@/components/StatusBadge";
import { formatTime } from "@/lib/time";
import type { Foursome, FoursomeMember, RosterRow } from "@/lib/types";

type Props = {
  foursomes: Foursome[];
  members: FoursomeMember[];
  roster: Map<string, RosterRow>;
  timezone: string;
  extra?: (participantId: string) => React.ReactNode;
};

/** Foursomes: captain on top, the other players indented underneath. */
export function FoursomeGrid({ foursomes, members, roster, timezone, extra }: Props) {
  if (foursomes.length === 0) {
    return <p className="text-sm text-muted">No groups set for this round yet.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {foursomes.map((f, i) => {
        const group = members
          .filter((m) => m.foursome_id === f.id)
          .sort((a, b) => Number(b.is_captain) - Number(a.is_captain));
        const captain = group.find((m) => m.is_captain);
        const others = group.filter((m) => !m.is_captain);
        const name = (pid: string) => {
          const r = roster.get(pid);
          return r ? fullName(r.first_name, r.last_name) : "Player";
        };
        return (
          <section key={f.id} className="card" aria-label={f.label ?? `Group ${i + 1}`}>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="font-semibold">{f.label ?? `Group ${i + 1}`}</h3>
              <span className="text-sm font-medium text-brand">
                {f.tee_time ? `Tee time ${formatTime(f.tee_time, timezone)}` : "Tee time TBD"}
              </span>
            </div>
            {captain ? (
              <div className="flex items-center gap-3">
                <Avatar first={roster.get(captain.participant_id)?.first_name ?? ""} last={roster.get(captain.participant_id)?.last_name ?? ""} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{name(captain.participant_id)}</p>
                  <p className="text-xs uppercase tracking-wide text-accent">Captain</p>
                </div>
                {extra?.(captain.participant_id)}
              </div>
            ) : (
              <p className="text-sm text-muted">Captain not picked yet</p>
            )}
            <ul className="mt-3 ml-4 space-y-2 border-l-2 border-brand-soft pl-4">
              {others.map((m) => (
                <li key={m.participant_id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">{name(m.participant_id)}</span>
                  {extra?.(m.participant_id)}
                </li>
              ))}
              {Array.from({ length: Math.max(0, 3 - others.length) }).map((_, k) => (
                <li key={`open-${k}`} className="text-sm italic text-muted">Open spot</li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
