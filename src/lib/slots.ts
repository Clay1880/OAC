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
