import { describe, expect, it } from "vitest";
import { campusClock, campusDayEnd, formatClock, isSlotOpen, offeredSlots, resolvePickup, seatsLeft } from "./slots";

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

describe("campusClock", () => {
  it("is the 24-hour campus time of a slot, whatever the machine timezone", () => {
    expect(campusClock("2026-10-19T07:45:00Z")).toBe("13:15");
    expect(campusClock("2026-10-19T18:29:00Z")).toBe("23:59");
    expect(campusClock("2026-10-19T18:30:00Z")).toBe("00:00");
  });
});

describe("resolvePickup", () => {
  // 13:15, 13:20, 13:25 and 13:35 IST on 2026-10-19; 13:20 is full.
  const at = (hhmm: string) => Date.parse(`2026-10-19T${hhmm}:00+05:30`);
  const slots = [
    slot("a", at("13:15")),
    slot("b", at("13:20"), 10, 10),
    slot("c", at("13:25")),
    slot("d", at("13:35"), 10, 7),
  ];

  it("picks the slot at exactly that time when it has seats", () => {
    expect(resolvePickup(slots, "13:25")).toEqual({ status: "ok", slot: slots[2] });
  });

  it("suggests the next free time when the chosen one is full, with how far away it is", () => {
    expect(resolvePickup(slots, "13:20")).toEqual({ status: "unavailable", suggestion: { slot: slots[2], minutes: 5 } });
  });

  it("suggests the next free time when no slot exists at that minute", () => {
    expect(resolvePickup(slots, "13:30")).toEqual({ status: "unavailable", suggestion: { slot: slots[3], minutes: 5 } });
  });

  it("suggests the earliest free time when the chosen one has already closed", () => {
    expect(resolvePickup(slots, "12:00")).toEqual({ status: "unavailable", suggestion: { slot: slots[0], minutes: 75 } });
  });

  it("falls back to the latest earlier time when nothing later is free", () => {
    expect(resolvePickup(slots, "15:00")).toEqual({ status: "unavailable", suggestion: { slot: slots[3], minutes: -85 } });
  });

  it("has no suggestion when every slot is full", () => {
    const full = [slot("x", at("13:15"), 10, 10)];
    expect(resolvePickup(full, "13:15")).toEqual({ status: "unavailable", suggestion: null });
    expect(resolvePickup([], "13:15")).toEqual({ status: "unavailable", suggestion: null });
  });

  it("treats a cleared field as nothing chosen", () => {
    expect(resolvePickup(slots, "")).toEqual({ status: "empty" });
  });
});

describe("formatClock", () => {
  it("writes HH:mm the way the rest of the app shows times", () => {
    expect(formatClock("13:05")).toBe("1:05 PM");
    expect(formatClock("00:00")).toBe("12:00 AM");
    expect(formatClock("12:30")).toBe("12:30 PM");
    expect(formatClock("09:15")).toBe("9:15 AM");
  });
});
