import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";
import { TRIP_STATUS_LABEL, type Trip } from "@/lib/types";
import { createTrip } from "./actions";
import { TripForm } from "./TripForm";

export const metadata = { title: "Admin" };

type AuditRow = { id: number; action: string; entity: string; created_at: string; actor_id: string | null };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const { error, msg } = await searchParams;
  const supabase = await createClient();
  const [{ data: trips }, { data: audit }, { count: pendingClaims }] = await Promise.all([
    supabase.from("trips").select("*").order("year", { ascending: false }),
    supabase.from("audit_log").select("id, action, entity, created_at, actor_id").order("created_at", { ascending: false }).limit(15),
    supabase.from("payment_claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Organizer</h1>
        <Link href="/admin/members" className="btn">Members & invites</Link>
      </div>
      <Notice error={error} message={msg} />

      {!!pendingClaims && (
        <p className="rounded-lg border border-accent/50 bg-accent/10 px-4 py-3 text-sm">
          <strong>{pendingClaims}</strong> payment{pendingClaims === 1 ? "" : "s"} waiting for you to check — open the trip below.
        </p>
      )}

      <section>
        <h2 className="h2 mb-3">Trips</h2>
        {(trips ?? []).length === 0 ? (
          <p className="card text-sm text-muted">No trips yet — create the first one below.</p>
        ) : (
          <ul className="card divide-y divide-border p-0">
            {((trips ?? []) as Trip[]).map((t) => (
              <li key={t.id}>
                <Link href={`/admin/trips/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-brand-soft">
                  <span>
                    <span className="font-medium">{t.name}</span>
                    <span className="text-sm text-muted"> · {t.destination} · {t.starts_at ? formatDate(t.starts_at, t.timezone) : "dates TBD"}</span>
                  </span>
                  <span className="text-xs font-medium text-muted">{TRIP_STATUS_LABEL[t.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card">
        <summary className="cursor-pointer font-semibold">Create a new trip</summary>
        <div className="mt-4">
          <TripForm action={createTrip} submitLabel="Create trip" />
        </div>
      </details>

      <section>
        <h2 className="h2 mb-3">Recent activity</h2>
        <ul className="card divide-y divide-border p-0 text-sm">
          {((audit ?? []) as AuditRow[]).map((a) => (
            <li key={a.id} className="flex justify-between gap-2 px-4 py-2">
              <span>{a.action} · {a.entity.replace(/_/g, " ")}</span>
              <time className="text-muted">{new Date(a.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</time>
            </li>
          ))}
          {(audit ?? []).length === 0 && <li className="px-4 py-2 text-muted">Nothing yet.</li>}
        </ul>
      </section>
    </div>
  );
}
