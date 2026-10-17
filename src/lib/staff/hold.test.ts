import { describe, expect, it } from "vitest";
import { formatCountdown, holdRemainingMs } from "./hold";

const MIN = 60_000;
const start = Date.parse("2026-10-19T07:45:00Z");

describe("holdRemainingMs", () => {
  it("counts down to the slot start plus the hold, and never goes below zero", () => {
    expect(holdRemainingMs("2026-10-19T07:45:00Z", 15, start - 10 * MIN)).toBe(25 * MIN);
    expect(holdRemainingMs("2026-10-19T07:45:00Z", 15, start + 15 * MIN)).toBe(0);
    expect(holdRemainingMs("2026-10-19T07:45:00Z", 15, start + 40 * MIN)).toBe(0);
  });
});

describe("formatCountdown", () => {
  it("shows minutes and seconds, rounding partial seconds up", () => {
    expect(formatCountdown(12 * MIN + 30_000)).toBe("12:30");
    expect(formatCountdown(61_001)).toBe("1:02");
    expect(formatCountdown(9_000)).toBe("0:09");
    expect(formatCountdown(0)).toBe("0:00");
  });
  it("adds hours past 60 minutes", () => {
    expect(formatCountdown(75 * MIN + 5_000)).toBe("1:15:05");
  });
});
