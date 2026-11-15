export type TripStatus = "planning" | "open" | "closed" | "in_progress" | "completed" | "cancelled";
export type DisplayStatus = "invited" | "committed" | "confirmed" | "withdrawn";
export type PaymentMethod = "venmo" | "zelle" | "cash" | "other";

export type Trip = {
  id: string;
  slug: string;
  name: string;
  year: number;
  destination: string;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  status: TripStatus;
  max_participants: number | null;
  trip_fee_cents: number | null;
  payment_due_date: string | null;
  venmo_handle: string | null;
  zelle_info: string | null;
  payment_policy: string;
  description: string | null;
  pairings_publish_at: string | null;
};

export type RosterRow = {
  participant_id: string;
  profile_id: string;
  first_name: string;
  last_name: string;
  photo_path: string | null;
  hometown: string | null;
  status: DisplayStatus;
};

export type LedgerRow = {
  participant_id: string;
  profile_id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: DisplayStatus;
  due_cents: number | null;
  paid_cents: number;
  pending_claim_id: string | null;
  pending_claim_cents: number | null;
  pending_claim_method: PaymentMethod | null;
  pending_claim_note: string | null;
};

export type Round = {
  id: string;
  trip_id: string;
  name: string;
  course_name: string | null;
  play_date: string | null;
  notes: string | null;
  sort: number;
};

export type Foursome = {
  id: string;
  round_id: string;
  label: string | null;
  tee_time: string | null;
  sort: number;
};

export type FoursomeMember = {
  foursome_id: string;
  round_id: string;
  participant_id: string;
  is_captain: boolean;
};

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  planning: "Planning",
  open: "Sign-ups open",
  closed: "Sign-ups closed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PAYMENT_METHODS: PaymentMethod[] = ["venmo", "zelle", "cash", "other"];
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  venmo: "Venmo",
  zelle: "Zelle",
  cash: "Cash",
  other: "Other",
};
