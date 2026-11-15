# Owner setup guide

Do these once, in order. Nothing here needs code. **Never paste secret keys into
chat, GitHub, or anywhere except the Vercel dashboard and your own `.env.local`.**

Pricing and free-tier limits change, so check each provider's current pricing
page before relying on a free plan.

---

## 1. Supabase (database + logins) — required

**Why:** stores members, trips, payments and pairings, and handles sign-in.

1. Go to <https://supabase.com>, sign up, and create a **New project**.
   - Name: `dccw-golf`. Region: a US West region. Save the database password in a password manager.
2. **Create the tables.** Open **SQL Editor → New query**, paste the whole contents of
   `supabase/migrations/20261115000000_core.sql`, and click **Run**. You should see "Success".
3. **Turn off public sign-ups** (invite-only):
   **Authentication → Sign In / Providers → Email**: keep Email enabled, turn
   **"Allow new users to sign up" OFF**, keep **"Confirm email" ON**.
4. **Site address:** **Authentication → URL Configuration**
   - Site URL: your real site address (e.g. `https://dccwgolf.com`), or the Vercel URL until you have a domain.
   - Redirect URLs: add `https://YOUR-SITE/**` and `http://localhost:3000/**`.
5. **Email templates** (so links work on any phone/browser): **Authentication → Email Templates**
   - **Invite user** — replace the link with:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password`
   - **Reset password** — replace the link with:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password`
6. **Email sending (important):** Supabase's built-in email is for testing only — it is
   heavily rate-limited and may only deliver to your own team's addresses. Before inviting
   the group, set up custom SMTP (step 4 below, Resend) under
   **Authentication → Emails → SMTP Settings**. Until then, use **"Copy sign-in link"** on the
   Members page and text links to people.
7. **Keys:** **Project Settings → API Keys**. You'll need the Project URL, the
   **publishable** key, and the **secret** key (keep this one private).

### Make yourself the admin
1. **Authentication → Users → Add user → Create new user**: your email + a password, tick "Auto confirm".
2. **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set role = 'admin' where email = 'YOUR-EMAIL';
   ```
3. Sign in on the site — you'll see the **Admin** tab.

**Check it worked:** in Table Editor → `profiles`, your row shows `role = admin`.

---

## 2. Vercel (hosting) — required

**Why:** runs the website and redeploys automatically when code is pushed to GitHub.

1. Sign up at <https://vercel.com> with your GitHub account.
2. **Add New → Project →** import `dclairwi/DCCW-GOLF`. Framework is detected as Next.js.
3. Before deploying, add **Environment Variables** (from `.env.example`):
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
   | `SUPABASE_SECRET_KEY` | Supabase secret key (**server only**) |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-site` (no trailing slash) |
   | `NEXT_PUBLIC_SITE_NAME` | `DCCW Golf` (or whatever you like) |
4. Deploy. Then put the final URL into Supabase **Site URL** (step 1.4) and `NEXT_PUBLIC_SITE_URL`, and redeploy.

**Check it worked:** visiting the site sends you to the sign-in page; signing in shows the home page.

**Troubleshooting:** "Missing environment variable…" → a variable is missing or misspelled in Vercel; add it and redeploy.
Links in emails go to localhost → Supabase Site URL is wrong.

---

## 3. Domain — optional but recommended

Buy a domain from any registrar, then in Vercel **Project → Settings → Domains** add it and follow
the DNS instructions. Update the Supabase Site URL and `NEXT_PUBLIC_SITE_URL` afterwards.
A domain is also needed to send email from your own address (step 4).

---

## 4. Resend (email delivery) — required before inviting the group

**Why:** reliable invite and password-reset emails (and, later, trip announcements and poll reminders).

1. Sign up at <https://resend.com>, **Domains → Add domain**, and add the DNS records it shows at your registrar. Wait until it says Verified.
2. **API Keys → Create** (sending access).
3. In Supabase **Authentication → Emails → SMTP Settings**, enable custom SMTP with the host,
   port, username and password from Resend's SMTP instructions, and a sender like `golf@your-domain`.

**Check it worked:** on the Members page, use **Email setup link** on yourself and confirm it arrives.

---

## Troubleshooting sign-ins (day to day)

On **Admin → Members & invites**:
- **Invited — hasn't joined yet:** they never clicked their invite. Click **Email setup link**.
- **Email never arrives:** click **Copy sign-in link** and text it to them. It works once and expires in about an hour.
- **Forgot password:** they can use "Forgot your password?" on the sign-in page, or you can do either of the above.
- **Someone shouldn't have access anymore:** **Disable** (nothing is deleted; you can restore it).
