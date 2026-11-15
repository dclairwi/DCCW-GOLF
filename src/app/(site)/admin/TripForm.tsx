import { SubmitButton } from "@/components/SubmitButton";
import { utcIsoToZonedLocal } from "@/lib/time";
import { TRIP_STATUS_LABEL, type Trip, type TripStatus } from "@/lib/types";

const DEFAULT_POLICY =
  "Your payment is non-refundable except in the case of a serious life event, at the organizer's discretion. The organizer books tee times and lodging based on paid commitments.";

export function TripForm({
  action,
  trip,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  trip?: Trip;
  submitLabel: string;
}) {
  const tz = trip?.timezone ?? "America/Los_Angeles";
  const local = (iso: string | null | undefined) => utcIsoToZonedLocal(iso, tz);
  return (
    <form action={action} className="space-y-4">
      {trip && <input type="hidden" name="trip_id" value={trip.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Trip name" name="name" defaultValue={trip?.name} required placeholder="Palm Springs 2027" />
        <Field label="Short web name (slug)" name="slug" defaultValue={trip?.slug} required placeholder="palm-springs-2027" />
        <Field label="Year" name="year" type="number" defaultValue={trip?.year ?? new Date().getFullYear() + 1} required />
        <Field label="Destination" name="destination" defaultValue={trip?.destination} required placeholder="Palm Springs, CA" />
        <Field label="Timezone (IANA)" name="timezone" defaultValue={tz} required hint="Times below are entered in this timezone." />
        <div>
          <label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" defaultValue={trip?.status ?? "planning"} className="field">
            {(Object.keys(TRIP_STATUS_LABEL) as TripStatus[]).map((s) => (
              <option key={s} value={s}>{TRIP_STATUS_LABEL[s]}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Members can only click “I’m in” while sign-ups are open.</p>
        </div>
        <Field label="Trip starts (first tee / arrival)" name="starts_at" type="datetime-local" defaultValue={local(trip?.starts_at)} hint="The countdown counts down to this." />
        <Field label="Trip ends" name="ends_at" type="datetime-local" defaultValue={local(trip?.ends_at)} />
        <Field label="Trip cost per person ($)" name="trip_fee" inputMode="decimal" defaultValue={trip?.trip_fee_cents != null ? (trip.trip_fee_cents / 100).toFixed(2) : ""} placeholder="Leave blank until known" />
        <Field label="Payment due date" name="payment_due_date" type="date" defaultValue={trip?.payment_due_date ?? ""} />
        <Field label="Max players" name="max_participants" type="number" defaultValue={trip?.max_participants ?? 20} />
        <Field label="Show groups & tee times on" name="pairings_publish_at" type="datetime-local" defaultValue={local(trip?.pairings_publish_at)} hint="Usually one week before the trip. Blank = hidden." />
        <Field label="Your Venmo" name="venmo_handle" defaultValue={trip?.venmo_handle ?? ""} placeholder="@your-venmo" />
        <Field label="Your Zelle (phone or email)" name="zelle_info" defaultValue={trip?.zelle_info ?? ""} />
      </div>
      <div>
        <label htmlFor="payment_policy" className="label">Payment policy (members must agree to this)</label>
        <textarea id="payment_policy" name="payment_policy" rows={3} required defaultValue={trip?.payment_policy ?? DEFAULT_POLICY} className="field" />
      </div>
      <div>
        <label htmlFor="description" className="label">Trip overview (optional)</label>
        <textarea id="description" name="description" rows={3} defaultValue={trip?.description ?? ""} className="field" />
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}

function Field({
  label,
  name,
  hint,
  ...rest
}: { label: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} className="field" {...rest} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
