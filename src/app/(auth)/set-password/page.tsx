import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth";
import { setPassword } from "../actions";

export const metadata = { title: "Set password" };

export default async function SetPasswordPage({ searchParams }: PageProps<"/set-password">) {
  const user = await requireUser();
  const { error } = await searchParams;
  return (
    <>
      <h1 className="h2 mb-1">Choose a password</h1>
      <p className="mb-4 text-sm text-muted">Signed in as {user.email}</p>
      <Notice error={error} />
      <form action={setPassword} className="space-y-4">
        <div>
          <label htmlFor="password" className="label">New password</label>
          <input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required className="field" />
        </div>
        <div>
          <label htmlFor="confirm" className="label">Confirm password</label>
          <input id="confirm" name="confirm" type="password" minLength={8} autoComplete="new-password" required className="field" />
        </div>
        <SubmitButton className="btn w-full">Save password</SubmitButton>
      </form>
    </>
  );
}
