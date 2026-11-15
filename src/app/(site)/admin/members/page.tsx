import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUpcomingTrip } from "@/lib/trips";
import { inviteMember, resendInvite, setAccess } from "../actions";
import { SignInLinkButton } from "./CopyLink";

export const metadata = { title: "Members" };

const isBanned = (until?: string | null) => !!until && new Date(until).getTime() > Date.now();

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) : "—";

export default async function MembersAdminPage({ searchParams }: PageProps<"/admin/members">) {
  const me = await requireAdmin();
  const { error, msg } = await searchParams;
  const admin = createAdminClient();
  const [{ data: usersData, error: listErr }, { data: profiles }, trip] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, first_name, last_name, phone, role"),
    getUpcomingTrip(),
  ]);
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  const users = (usersData?.users ?? []).sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));

  return (
    <div className="space-y-8">
      <h1 className="h1">Members & invites</h1>
      <Notice error={error ?? listErr?.message} message={msg} />

      <section className="card">
        <h2 className="h2 mb-3">Invite someone</h2>
        <form action={inviteMember} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <div className="sm:col-span-2">
            <label htmlFor="email" className="label">Email</label>
            <input id="email" name="email" type="email" required className="field" />
          </div>
          <div>
            <label htmlFor="first_name" className="label">First name</label>
            <input id="first_name" name="first_name" className="field" />
          </div>
          <div>
            <label htmlFor="last_name" className="label">Last name</label>
            <input id="last_name" name="last_name" className="field" />
          </div>
          {trip && (
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input type="checkbox" name="trip_id" value={trip.id} defaultChecked className="h-4 w-4 accent-[var(--brand)]" />
              Also add them to {trip.name}
            </label>
          )}
          <SubmitButton pendingText="Sending…">Send invite</SubmitButton>
        </form>
        <p className="mt-3 text-xs text-muted">
          Only people you invite can get in — there’s no public sign-up.
        </p>
      </section>

      <section>
        <h2 className="h2 mb-1">Everyone ({users.length})</h2>
        <p className="mb-3 text-sm text-muted">
          Someone can’t get in? Use <strong>Email setup link</strong> first. If emails aren’t reaching them,
          use <strong>Copy sign-in link</strong> and text it to them.
        </p>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">Member</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Last sign-in</th>
                <th className="px-4 py-2">Help them sign in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => {
                const p = byId.get(u.id);
                const banned = isBanned(u.banned_until);
                const status = banned ? "Disabled" : u.last_sign_in_at ? "Active" : "Invited — hasn’t joined yet";
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{`${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—"}{p?.role === "admin" ? " · admin" : ""}</p>
                      <p className="text-muted">{u.email}{p?.phone ? ` · ${p.phone}` : ""}</p>
                    </td>
                    <td className="px-4 py-3">{status}</td>
                    <td className="px-4 py-3 text-muted">{when(u.last_sign_in_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <form action={resendInvite}>
                          <input type="hidden" name="email" value={u.email ?? ""} />
                          <SubmitButton className="btn-secondary" pendingText="Sending…">Email setup link</SubmitButton>
                        </form>
                        {u.id !== me.id && (
                          <form action={setAccess}>
                            <input type="hidden" name="user_id" value={u.id} />
                            <input type="hidden" name="disable" value={banned ? "0" : "1"} />
                            <SubmitButton
                              className={banned ? "btn-secondary" : "btn-danger"}
                              confirm={banned ? undefined : `Disable ${u.email}? They won't be able to sign in. Nothing is deleted.`}
                            >
                              {banned ? "Restore access" : "Disable"}
                            </SubmitButton>
                          </form>
                        )}
                        <SignInLinkButton email={u.email ?? ""} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
