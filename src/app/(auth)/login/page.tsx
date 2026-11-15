import Link from "next/link";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { signIn } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, msg } = await searchParams;
  return (
    <>
      <h1 className="h2 mb-4">Sign in</h1>
      <Notice error={error} message={msg} />
      <form action={signIn} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="field" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
        </div>
        <SubmitButton className="btn w-full" pendingText="Signing in…">Sign in</SubmitButton>
      </form>
      <div className="mt-4 space-y-1 text-sm text-muted">
        <p>
          <Link href="/forgot-password" className="font-medium text-brand underline-offset-2 hover:underline">
            Forgot your password?
          </Link>
        </p>
        <p>New here? You need an invite from the organizer — check your email for the invite link.</p>
      </div>
    </>
  );
}
