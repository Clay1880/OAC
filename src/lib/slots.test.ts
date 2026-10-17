import { describe, expect, it } from "vitest";
import { campusDayEnd, isSlotOpen, offeredSlots, seatsLeft } from "./slots";

const MIN = 60_000;
const slot = (id: string, startsAtMs: number, capacity = 10, booked = 0) => ({
  id,
  starts_at: new Date(startsAtMs).toISOString(),
  capacity,
  booked_count: booked,
});

describe("campusDayEnd", () => {
  it("is the next midnight in India, whatever the machine timezone", () => {
    // 2026-10-19 13:15 IST -> midnight ending that day = 2026-10-19 18:30 UTC
    expect(campusDayEnd(Date.parse("2026-10-19T07:45:00Z"))).toBe(Date.parse("2026-10-19T18:30:00Z"));
    // 23:59 IST is still the same campus day; 00:00 IST rolls over.
    expect(campusDayEnd(Date.parse("2026-10-19T18:29:00Z"))).toBe(Date.parse("2026-10-19T18:30:00Z"));
    expect(campusDayEnd(Date.parse("2026-10-19T18:30:00Z"))).toBe(Date.parse("2026-10-20T18:30:00Z"));
  });
});

describe("seatsLeft", () => {
  it("is capacity minus booked and never negative", () => {
    expect(seatsLeft(slot("a", 0, 10, 4))).toBe(6);
    expect(seatsLeft(slot("a", 0, 10, 10))).toBe(0);
    expect(seatsLeft(slot("a", 0, 10, 12))).toBe(0);
  });
});

describe("isSlotOpen", () => {
  const now = Date.parse("2026-10-19T07:00:00Z");

  it("is open until the cutoff before the start", () => {
    expect(isSlotOpen(slot("a", now + 10 * MIN), now, 5)).toBe(true);
    expect(isSlotOpen(slot("a", now + 5 * MIN + 1), now, 5)).toBe(true);
  });

  it("is closed at or inside the cutoff and once started", () => {
    expect(isSlotOpen(slot("a", now + 5 * MIN), now, 5)).toBe(false);
    expect(isSlotOpen(slot("a", now + 2 * MIN), now, 5)).toBe(false);
    expect(isSlotOpen(slot("a", now - MIN), now, 5)).toBe(false);
  });
});

describe("offeredSlots", () => {
  const now = Date.parse("2026-10-19T07:00:00Z"); // 12:30 PM IST

  it("keeps open slots, drops closed and past ones, sorted by start, including full ones", () => {
    const slots = [
      slot("late", now + 60 * MIN),
      slot("past", now - 20 * MIN),
      slot("closing", now + 3 * MIN),
      slot("full", now + 30 * MIN, 5, 5),
      slot("soon", now + 15 * MIN),
    ];

    expect(offeredSlots(slots, now, 5).map((s) => s.id)).toEqual(["soon", "full", "late"]);
  });

  it("drops slots after the campus day ends", () => {
    const tomorrow = campusDayEnd(now) + 30 * MIN;

    expect(offeredSlots([slot("tomorrow", tomorrow), slot("today", now + 20 * MIN)], now, 5).map((s) => s.id)).toEqual([
      "today",
    ]);
  });
});
