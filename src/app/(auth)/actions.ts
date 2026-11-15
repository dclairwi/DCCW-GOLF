"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.email().max(254);

export async function signIn(formData: FormData) {
  const email = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  const password = String(formData.get("password") ?? "");
  if (!email.success || !password) {
    redirect("/login?error=" + encodeURIComponent("Enter your email and password."));
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password });
  if (error) {
    // Same message whether the email exists or not.
    redirect(
      "/login?error=" +
        encodeURIComponent("That email and password didn’t match. Try again or reset your password."),
    );
  }
  redirect("/");
}

export async function requestPasswordReset(formData: FormData) {
  const email = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (email.success) {
    const supabase = await createClient();
    // Supabase only emails existing users; we never reveal whether an account exists.
    await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${env.siteUrl}/set-password`,
    });
  }
  redirect(
    "/forgot-password?sent=1",
  );
}

export async function setPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) {
    redirect("/set-password?error=" + encodeURIComponent("Use at least 8 characters."));
  }
  if (password !== confirm) {
    redirect("/set-password?error=" + encodeURIComponent("Passwords don’t match."));
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    redirect("/login?error=" + encodeURIComponent("Your link expired. Request a new one."));
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect("/set-password?error=" + encodeURIComponent(error.message));
  }
  redirect("/profile?welcome=1");
}
