# Feature checklist

Statuses: **Not Started · In Progress · Implemented · Tested · Blocked · Deferred**.
"Tested" means automated tests cover it. Nothing has been tried against a live Supabase
project yet — that happens once the owner finishes docs/SETUP.md.

## Milestone 1 — core site

| Feature | Status | Notes |
|---|---|---|
| Invite-only login (no public sign-up) | Implemented | Requires "Allow new users to sign up" OFF in Supabase |
| Forgot / reset password | Implemented | |
| Admin sign-in troubleshooting (status, last sign-in, email setup link, copyable one-time link, disable/restore) | Implemented | |
| Everything behind login | Tested | Proxy redirect smoke-tested; DB denies signed-out access (rls_test) |
| Home countdown (to the day, trip timezone) | Tested | Countdown math + timezone conversion unit-tested |
| Who's going roster with status badges | Tested | |
| Paid/unpaid visible to admin only | Tested | `get_trip_ledger` rejects members |
| "I'm in" with non-refundable agreement | Tested | Capacity enforced under a row lock |
| Confirmed = committed + paid in full (derived, never stale) | Tested | |
| "I sent it" payment claims → admin marks received | Tested | One pending claim at a time |
| Admin manual payments & refunds (append-only ledger, integer cents) | Tested | |
| Per-player custom amount due | Implemented | |
| Rounds, foursomes (captain + 3), tee times | Tested | Max 4, one captain, same-trip players only |
| Pairings hidden until publish date (default: a week before) | Tested | |
| Audit log of sign-ups, payments, trip and role changes | Tested | |
| Profile (name, hometown, handicap, phone private, email opt-in) | Implemented | |
| Keep free database awake (GitHub job every 3 days) | Implemented | Needs repo secrets (SETUP.md step 5) |
| Weekly encrypted backups, 90-day retention | Tested | Backup → restore cycle verified locally; access rules identical after restore |

## Coming next

| Feature | Status |
|---|---|
| Trips page: itinerary + past trips archive dropdown + recap video | Not Started |
| Future-trip options (cards with dates, cost, courses, links) + poll, results hidden until closed | Not Started |
| Admin email reminder before a poll closes; announcement email to opted-in members | Not Started |
| Media page: upload, view, download all per trip; delete own uploads | Not Started |
| Members page: photos, hometowns, map | Not Started |
| Profile photos | Not Started |
| League, champions, most improved | Deferred |
