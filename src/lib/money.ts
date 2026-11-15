// Money is always integer cents. Never use floating point for amounts.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "TBD";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  // Build from integers, then format the whole-dollar part for separators.
  return `${sign}${usd.format(whole).replace(/\.00$/, "")}.${String(frac).padStart(2, "0")}`;
}

/**
 * Parse a user-typed dollar amount ("450", "$1,250.5", "-25.00") into cents
 * using string arithmetic only. Returns null for anything invalid.
 */
export function parseDollarsToCents(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  const match = /^(-)?(\d{1,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, neg, dollars, centsPart = ""] = match;
  const cents = Number(dollars) * 100 + Number(centsPart.padEnd(2, "0"));
  return neg ? -cents : cents;
}
