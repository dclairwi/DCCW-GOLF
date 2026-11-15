import type { DisplayStatus } from "@/lib/types";

const STYLES: Record<DisplayStatus, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-brand text-white" },
  committed: { label: "Going — not confirmed yet", cls: "bg-accent/15 text-foreground ring-1 ring-accent/50" },
  invited: { label: "Invited", cls: "bg-border/60 text-muted" },
  withdrawn: { label: "Withdrawn", cls: "bg-danger/10 text-danger" },
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function Avatar({ first, last }: { first: string; last: string }) {
  const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
    >
      {initials}
    </span>
  );
}

export function fullName(first: string, last: string) {
  return `${first} ${last}`.trim() || "New member";
}
