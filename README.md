# DCCW Golf

Private, invite-only website for our annual golf trip: countdown, who's going,
foursomes and tee times, sign-ups and Venmo/Zelle payment tracking.

- **Owner setup (start here):** [docs/SETUP.md](docs/SETUP.md)
- **What's built and what's next:** [docs/FEATURES.md](docs/FEATURES.md)
- **Why things are built this way:** [docs/DECISIONS.md](docs/DECISIONS.md)

## Stack
Next.js 16 (App Router, TypeScript strict) · Tailwind CSS 4 · Supabase (Postgres, Auth, Row Level Security) · Vercel.

## Local development
```bash
npm install
cp .env.example .env.local   # fill in your dev Supabase project's values
npm run dev                  # http://localhost:3000
```

## Checks
```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # unit tests (money, timezones, countdown)
npm run test:db     # database security tests — needs a local PostgreSQL
                    #   e.g. PGHOST=localhost PGUSER=postgres npm run test:db
```
CI runs all of these on every push and pull request.

## Project layout
```
src/app/(auth)/         sign in, forgot password, set password
src/app/(site)/         home, my-trips, profile, admin/*
src/app/auth/           email-link handler, sign out
src/lib/                supabase clients, auth guard, money & time helpers
src/proxy.ts            sends signed-out visitors to /login
supabase/migrations/    database schema + security policies
supabase/tests/         authorization tests run against the real schema
```

## Database changes
Add a new timestamped file to `supabase/migrations/` — never edit one that has already been run
in production. Back up (Supabase → Database → Backups) before applying anything destructive.
