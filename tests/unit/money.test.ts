import { describe, expect, it } from "vitest";
import { formatCents, parseDollarsToCents } from "@/lib/money";

describe("parseDollarsToCents", () => {
  it.each([
    ["450", 45000],
    ["450.5", 45050],
    ["$1,250.05", 125005],
    ["0.10", 10],
    ["-25.00", -2500],
    ["  99.99 ", 9999],
  ])("parses %s", (input, cents) => {
    expect(parseDollarsToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "1.234", "12..3", "1e3", "$", "--5"])("rejects %s", (input) => {
    expect(parseDollarsToCents(input)).toBeNull();
  });

  it("never introduces floating point error", () => {
    expect(parseDollarsToCents("0.29")).toBe(29); // 0.29 * 100 = 28.999… in floats
    expect(parseDollarsToCents("1.15")).toBe(115);
  });
});

describe("formatCents", () => {
  it("formats amounts", () => {
    expect(formatCents(45000)).toBe("$450.00");
    expect(formatCents(125005)).toBe("$1,250.05");
    expect(formatCents(-2500)).toBe("-$25.00");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(null)).toBe("TBD");
  });
});
