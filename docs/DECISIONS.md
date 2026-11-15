# Decisions

## 2026-11-15 — Milestone 1

- **Scope trimmed from the original "master prompt"** to what the owner actually wants: a private
  trip site (home/countdown, trips & polls, my trips, media, members map). League, AI assistant,
  scoring engines and email campaigns are out until asked for.
- **Versions pinned at scaffold:** Next.js 16.4.6, React 19.3.0, Tailwind 4.3.3, TypeScript 5.9,
  @supabase/supabase-js 2.119.0, @supabase/ssr 0.12.7, zod 4.6.7, vitest 5.1.0.
- **Invite-only:** public sign-up is disabled in Supabase; only the admin can invite (Supabase Auth admin API,
  server-side with the secret key after an admin check).
- **"Committed" vs "Confirmed":** members click "I'm in" (must agree the payment is non-refundable except for a
  serious life event) → *committed*. *Confirmed* is computed from verified payments ≥ amount due, so it can never
  drift out of sync with the money.
- **Payments are manual** (Venmo/Zelle/cash), integer cents, append-only. Mistakes and refunds are negative
  entries. Members can say "I sent it"; only the admin marks money received.
- **Members never see money** for anyone but themselves. The roster RPC returns names + status only.
- **Pairings per round** (foursomes can change day to day), hidden from members until `pairings_publish_at`.
- **Authorization lives in the database (RLS + column grants)**; the app re-checks on the server. Member emails and
  phones are not readable by other members at the database level.
- **Next.js Cache Components turned off:** every page is personalised and behind a login, so prerendering gives
  nothing and adds complexity.
- **Sign-in links for troubleshooting** are returned straight to the admin's browser, never put in URLs, so they
  can't land in server logs.
- **No waitlist** for now: if a trip is full, the member is told to contact the organizer.
