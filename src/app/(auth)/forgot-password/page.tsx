import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { requestPasswordReset } from "../actions";

export const metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const { sent } = await searchParams;
  return (
    <>
      <h1 className="h2 mb-2">Reset your password</h1>
      {sent ? (
        <div className="space-y-3 text-sm" role="status">
          <p>If that email belongs to a member, a reset link is on its way. It can take a few minutes — check spam too.</p>
          <p className="text-muted">
            Still nothing? Text the organizer — they can send you a sign-in link directly.
          </p>
        </div>
      ) : (
        <form action={requestPasswordReset} className="space-y-4">
          <p className="text-sm text-muted">Enter the email your invite was sent to and we’ll email you a reset link.</p>
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required className="field" />
          </div>
          <SubmitButton className="btn w-full" pendingText="Sending…">Send reset link</SubmitButton>
        </form>
      )}
      <p className="mt-4 text-sm">
        <Link href="/login" className="font-medium text-brand underline-offset-2 hover:underline">Back to sign in</Link>
      </p>
    </>
  );
}
