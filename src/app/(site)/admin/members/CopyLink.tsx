"use client";

import { useActionState, useState } from "react";
import { makeSignInLink, type SignInLinkState } from "../actions";

/** "Copy sign-in link" button: generates a one-time link and shows it inline. */
export function SignInLinkButton({ email }: { email: string }) {
  const [state, action, pending] = useActionState<SignInLinkState, FormData>(makeSignInLink, {});
  const [copied, setCopied] = useState(false);
  return (
    <div className="w-full">
      <form action={action}>
        <input type="hidden" name="email" value={email} />
        <button type="submit" className="btn-secondary" disabled={pending}>
          {pending ? "…" : "Copy sign-in link"}
        </button>
      </form>
      {state.error && <p role="alert" className="mt-2 text-xs text-danger">{state.error}</p>}
      {state.link && (
        <div className="mt-2 space-y-1">
          <div className="flex gap-2">
            <input
              readOnly
              value={state.link}
              className="field font-mono text-xs"
              aria-label={`Sign-in link for ${email}`}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="btn shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-muted">Text it to them. Works once, expires in about an hour.</p>
        </div>
      )}
    </div>
  );
}
