import { CAMPUS_TZ } from "./config";

/** A slot as the student UI sees it: a row of `public.slots`. */
export type Slot = { id: string; starts_at: string; capacity: number; booked_count: number };

// India has no daylight saving: campus midnight is always 18:30 UTC.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch ms of the next midnight in campus time after `nowMs`. */
export function campusDayEnd(nowMs: number): number {
  return Math.floor((nowMs + IST_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS - IST_OFFSET_MS;
}

export function seatsLeft(slot: Pick<Slot, "capacity" | "booked_count">): number {
  return Math.max(0, slot.capacity - slot.booked_count);
}

/** Same rule as `place_order`: orders close `cutoffMinutes` before the slot starts. */
export function isSlotOpen(slot: Pick<Slot, "starts_at">, nowMs: number, cutoffMinutes: number): boolean {
  return Date.parse(slot.starts_at) > nowMs + cutoffMinutes * 60_000;
}

/** Today's slots a student can still pick (full ones included, shown as Full), soonest first. */
export function offeredSlots(slots: Slot[], nowMs: number, cutoffMinutes: number): Slot[] {
  const dayEnd = campusDayEnd(nowMs);
  return slots
    .filter((s) => isSlotOpen(s, nowMs, cutoffMinutes) && Date.parse(s.starts_at) < dayEnd)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

const clock24 = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO instant -> campus wall-clock time as `HH:mm`, the value a time input uses. */
export function campusClock(iso: string): string {
  const parts = Object.fromEntries(clock24.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.hour}:${parts.minute}`;
}

const minuteOfDay = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export type PickupResolution =
  | { status: "empty" }
  | { status: "ok"; slot: Slot }
  /** `minutes` is how far the suggestion is from the chosen time: positive = later, negative = earlier. */
  | { status: "unavailable"; suggestion: { slot: Slot; minutes: number } | null };

/**
 * Turns a time typed on the clock (`HH:mm`, campus time) into a slot. Slots are today's open ones,
 * so a time that already closed, was never offered, or is full comes back unavailable together with
 * the nearest free time: the next one later if there is one, otherwise the closest earlier one.
 */
export function resolvePickup(slots: Slot[], hhmm: string): PickupResolution {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return { status: "empty" };
  const wanted = minuteOfDay(hhmm);
  const free = slots
    .filter((s) => seatsLeft(s) > 0)
    .map((slot) => ({ slot, minute: minuteOfDay(campusClock(slot.starts_at)) }))
    .sort((a, b) => a.minute - b.minute);

  const exact = free.find((f) => f.minute === wanted);
  if (exact) return { status: "ok", slot: exact.slot };

  const later = free.find((f) => f.minute > wanted);
  if (later) return { status: "unavailable", suggestion: { slot: later.slot, minutes: later.minute - wanted } };
  const earlier = free.findLast((f) => f.minute < wanted);
  if (earlier) return { status: "unavailable", suggestion: { slot: earlier.slot, minutes: earlier.minute - wanted } };
  return { status: "unavailable", suggestion: null };
}

/** `HH:mm` -> the 12-hour form used everywhere else, e.g. "13:05" -> "1:05 PM". */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
