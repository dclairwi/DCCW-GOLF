# Owner setup guide (all free)

Everything here uses free plans — no credit card needed. Do these once, in order.
**Never paste secret keys into chat, GitHub files, or anywhere except the Vercel
dashboard, GitHub "Secrets", and your own `.env.local`.**

| Service | What it does | Cost |
|---|---|---|
| GitHub | Stores the code, runs tests, keep-awake + backup jobs | Free |
| Supabase | Database and logins | Free plan |
| Vercel | Runs the website at `your-project.vercel.app` | Free Hobby plan (personal, non-commercial use) |
| Gmail | Sends invite and password-reset emails | Free |

Free plans can change their rules; if a provider ever asks for payment, stop and ask before upgrading.

---

## 1. Supabase (database + logins)

1. Go to <https://supabase.com>, sign up, and create a **New project**.
   - Name: `dccw-golf`. Region: a US West region. Save the database password in a password manager.
2. **Create the tables.** Open **SQL Editor → New query**. Paste the whole contents of each file in
   `supabase/migrations/`, oldest first, clicking **Run** after each:
   1. `20261115000000_core.sql`
   2. `20261116000000_keepalive.sql`

   Each should say "Success".
3. **Turn off public sign-ups** (invite-only):
   **Authentication → Sign In / Providers → Email**: keep Email enabled, turn
   **"Allow new users to sign up" OFF**, keep **"Confirm email" ON**.
4. **Keys:** **Project Settings → API Keys**. Note the Project URL, the
   **publishable** key, and the **secret** key (keep this one private).
5. **Database connection string** (for backups): click **Connect** at the top of the project, choose
   **Session pooler**, and copy the URI. Replace `[YOUR-PASSWORD]` with your database password.
   (Use the *session pooler* one — GitHub can't reach the "direct" one.)

You'll finish Supabase's email settings in step 3, once you know your site address.

---

## 2. Vercel (hosting)

1. Sign up at <https://vercel.com> **with your GitHub account** and choose the free **Hobby** plan.
2. **Add New → Project →** import `dclairwi/DCCW-GOLF`. It detects Next.js automatically.
3. Before deploying, add **Environment Variables**:
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
   | `SUPABASE_SECRET_KEY` | Supabase secret key (**server only**) |
   | `NEXT_PUBLIC_SITE_URL` | leave as `https://placeholder.vercel.app` for now |
   | `NEXT_PUBLIC_SITE_NAME` | `DCCW Golf` (or whatever you like) |
4. Click **Deploy**. Vercel gives you a free address like `https://dccw-golf.vercel.app`.
5. Go to **Settings → Environment Variables**, set `NEXT_PUBLIC_SITE_URL` to that address (no trailing
   slash), then **Deployments → ⋯ → Redeploy**.

From now on, every change pushed to GitHub redeploys the site automatically.

---

## 3. Email through Gmail (free) + link settings

Supabase's built-in email is for testing only (very limited, may only reach your own address), so
invites go out through a Gmail account instead.

1. **Make a Gmail app password.** In the Gmail account you want emails to come from
   (a new one like `dccwgolf@gmail.com` works well):
   - Google Account → **Security** → turn on **2-Step Verification**.
   - Then search the account settings for **App passwords**, create one named `Supabase`, and copy the 16-character password.
2. **Supabase → Authentication → Emails → SMTP Settings** → enable custom SMTP:
   | Field | Value |
   |---|---|
   | Sender email | the Gmail address |
   | Sender name | `DCCW Golf` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | the Gmail address |
   | Password | the 16-character app password |
3. **Authentication → URL Configuration**
   - Site URL: your Vercel address, e.g. `https://dccw-golf.vercel.app`
   - Redirect URLs: add `https://dccw-golf.vercel.app/**` and `http://localhost:3000/**`
4. **Authentication → Email Templates** (so links work on any phone/browser):
   - **Invite user** — make the link:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password`
   - **Reset password** — make the link:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password`

**Check it worked:** after step 4 below, use **Email setup link** on yourself in Admin → Members; the email should arrive from your Gmail address.

---

## 4. Make yourself the admin

1. Supabase **Authentication → Users → Add user → Create new user**: your email + a password, tick "Auto confirm".
2. **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set role = 'admin' where email = 'YOUR-EMAIL';
   ```
3. Sign in on your site — you'll see the **Admin** tab. Create the Palm Springs trip there.

---

## 5. Keep the site awake + weekly backups (GitHub, free)

Free Supabase projects **pause after about a week with no activity**, which would take the site down
between trips. Two automatic GitHub jobs prevent that and back up your data:

- **Keep database awake** — pings the database every 3 days.
- **Database backup** — every Monday, saves an **encrypted** copy of the database (kept 90 days).

Set them up:
1. Make up a long **backup passphrase** (at least 16 characters) and save it in your password manager.
   **Without it, backups can't be opened — not even by me.**
2. On GitHub: repo **Settings → Secrets and variables → Actions → New repository secret**. Add:
   | Secret | Value |
   |---|---|
   | `SUPABASE_URL` | Supabase Project URL |
   | `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
   | `SUPABASE_DB_URL` | the Session pooler connection string from step 1.5 |
   | `BACKUP_PASSPHRASE` | your backup passphrase |
3. Repo **Actions** tab → **Keep database awake** → **Run workflow**. Then do the same for **Database backup**.
   Both should get a green check.

If a job ever fails, GitHub emails you. If the site does go down, open Supabase and click **Restore project**.
How to open a backup: [BACKUPS.md](BACKUPS.md).

---

## Troubleshooting sign-ins (day to day)

On **Admin → Members & invites**:
- **Invited — hasn't joined yet:** they never clicked their invite. Click **Email setup link**.
- **Email never arrives:** check their spam folder, or click **Copy sign-in link** and text it to them. It works once and expires in about an hour.
- **Forgot password:** they can use "Forgot your password?" on the sign-in page, or you can do either of the above.
- **Someone shouldn't have access anymore:** **Disable** (nothing is deleted; you can restore it).

## Common setup problems
- **"Missing environment variable…"** on the site → a Vercel variable is missing or misspelled; fix it and redeploy.
- **Email links open localhost** → the Supabase Site URL (step 3.3) is wrong.
- **"Invite failed: Error sending invite email"** → the Gmail SMTP settings or app password are wrong (step 3.2).
- **Backup job: "connection refused/timed out"** → you used the direct connection string; use the **Session pooler** one.

## Optional later (not free)
A custom web address (e.g. `dccwgolf.com`) costs a yearly fee from any registrar. Nothing on the site needs it.
