export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
};

export function countdownParts(targetMs: number, nowMs: number): CountdownParts {
  const diff = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    done: diff === 0,
  };
}

/** Format an instant in the trip's own timezone, e.g. "Thu, Mar 18, 2027". */
export function formatDate(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function formatTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Convert a wall-clock "YYYY-MM-DDTHH:mm" in an IANA timezone to a UTC ISO string.
 * Used by admin forms so "7:30 AM" means 7:30 AM at the destination,
 * regardless of where the organizer's browser is.
 */
export function zonedLocalToUtcIso(local: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Find the zone's offset at that instant (iterate twice to settle DST edges).
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    guess = asUtc - tzOffsetMs(guess, timeZone);
  }
  return new Date(guess).toISOString();
}

/** Inverse of zonedLocalToUtcIso, for pre-filling <input type="datetime-local">. */
export function utcIsoToZonedLocal(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  const local = new Date(ms + tzOffsetMs(ms, timeZone));
  return local.toISOString().slice(0, 16);
}

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(utcMs / 1000) * 1000;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
