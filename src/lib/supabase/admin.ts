import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Privileged client (bypasses RLS). Server-only, and only ever used AFTER
 * requireAdmin() has confirmed the caller is an admin. Used for Supabase Auth
 * admin operations (invites, sign-in links) and reading member emails.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("Missing SUPABASE_SECRET_KEY (server-only). See docs/SETUP.md.");
  }
  return createClient(env.supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
