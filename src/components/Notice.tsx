type Props = { error?: string | string[]; message?: string | string[] };

/** Shows ?error= / ?msg= flash messages passed back from server actions. */
export function Notice({ error, message }: Props) {
  const err = Array.isArray(error) ? error[0] : error;
  const msg = Array.isArray(message) ? message[0] : message;
  if (!err && !msg) return null;
  return (
    <div
      role={err ? "alert" : "status"}
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
        err ? "border-danger/40 bg-danger/10 text-danger" : "border-brand/30 bg-brand-soft text-foreground"
      }`}
    >
      {err ?? msg}
    </div>
  );
}
