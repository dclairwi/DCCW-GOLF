import { describe, expect, it } from "vitest";
import { countdownParts, utcIsoToZonedLocal, zonedLocalToUtcIso } from "@/lib/time";

describe("countdownParts", () => {
  it("splits a duration", () => {
    const now = Date.UTC(2027, 0, 1, 0, 0, 0);
    const target = now + (((2 * 24 + 3) * 60 + 4) * 60 + 5) * 1000;
    expect(countdownParts(target, now)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5, done: false });
  });
  it("stops at zero", () => {
    expect(countdownParts(1000, 5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });
});

describe("timezone conversion", () => {
  it("treats form times as destination wall-clock time (PST)", () => {
    expect(zonedLocalToUtcIso("2027-03-18T07:30", "America/Los_Angeles")).toBe("2027-03-18T14:30:00.000Z");
  });
  it("handles daylight time (PDT)", () => {
    expect(zonedLocalToUtcIso("2027-07-01T07:30", "America/Los_Angeles")).toBe("2027-07-01T14:30:00.000Z");
    expect(zonedLocalToUtcIso("2027-01-10T07:30", "America/Los_Angeles")).toBe("2027-01-10T15:30:00.000Z");
  });
  it("Arizona has no DST", () => {
    expect(zonedLocalToUtcIso("2027-07-01T07:30", "America/Phoenix")).toBe("2027-07-01T14:30:00.000Z");
  });
  it("round-trips", () => {
    const iso = zonedLocalToUtcIso("2027-11-05T16:45", "America/Los_Angeles")!;
    expect(utcIsoToZonedLocal(iso, "America/Los_Angeles")).toBe("2027-11-05T16:45");
  });
  it("rejects garbage", () => {
    expect(zonedLocalToUtcIso("tomorrow", "America/Los_Angeles")).toBeNull();
  });
});
