/** Milliseconds until staff may flag a no-show: the slot start plus the hold, floored at zero. */
export function holdRemainingMs(slotStartsAt: string, holdMinutes: number, nowMs: number): number {
  return Math.max(0, Date.parse(slotStartsAt) + holdMinutes * 60_000 - nowMs);
}

/** "12:30", or "1:15:05" past an hour. Partial seconds round up so it never shows 0:00 early. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
