# Backups

The **Database backup** GitHub job runs every Monday (and whenever you click **Run workflow**).
Each run saves one encrypted file, `dccw-golf-YYYY-MM-DD.tar.gz.gpg`, kept for 90 days.
The repo is public, so the file is encrypted with your `BACKUP_PASSPHRASE` — keep that passphrase
in your password manager. Without it the file can't be opened.

## Download a backup
GitHub repo → **Actions** → **Database backup** → pick a run → **Artifacts** → download.

## Open it (Mac/Linux terminal; on Windows use WSL or Git Bash)
```bash
unzip dccw-golf-backup-YYYY-MM-DD.zip
gpg --decrypt dccw-golf-YYYY-MM-DD.tar.gz.gpg > backup.tar.gz   # asks for the passphrase
tar -xzf backup.tar.gz
# backup/public.sql      → all app data (trips, players, payments, groups)
# backup/privileges.sql  → who-can-see-what rules (re-applied after restoring)
# backup/auth_users.sql  → login accounts
```
(`gpg` comes with GPG Suite on Mac or `sudo apt install gnupg` on Linux.)

## Restore into a fresh Supabase project
Only needed if the project is lost. Ask Claude to walk you through it; the outline is:
1. Create a new free Supabase project (SETUP.md step 1, but **skip** running the migrations).
2. Load logins first, then app data, using the new project's Session pooler connection string:
   ```bash
   psql "NEW_DB_URL" -f backup/auth_users.sql
   psql "NEW_DB_URL" -f backup/public.sql
   psql "NEW_DB_URL" -f backup/privileges.sql   # don't skip: restores the privacy rules
   ```
3. In the new project's SQL Editor, re-create the two login hooks (they live on Supabase's own
   `auth.users` table, so they aren't inside the app-data backup):
   ```sql
   create trigger on_auth_user_created after insert on auth.users
     for each row execute function public.handle_new_user();
   create trigger on_auth_user_email_changed after update of email on auth.users
     for each row execute function public.sync_profile_email();
   ```
4. Update the Vercel and GitHub secrets to the new project's URL and keys, and redo SETUP.md steps 1.3 and 3.
