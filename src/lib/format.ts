import { CAMPUS_TZ } from "./config";

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const slotClock = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Integer paise -> display rupees, e.g. 12050 -> "₹120.50". */
export function formatPaise(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new RangeError(`formatPaise expects integer paise, got ${paise}`);
  }
  return rupees.format(paise / 100);
}

/** ISO instant -> campus wall-clock time, e.g. "2026-10-19T07:45:00Z" -> "1:15 PM". */
export function formatSlotTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`formatSlotTime got an invalid date: ${iso}`);
  }
  // Assemble from parts: newer ICU versions put a narrow no-break space before AM/PM.
  const parts = Object.fromEntries(
    slotClock.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`;
}

const slotDay = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** ISO instant -> campus calendar day, e.g. "2026-10-19T07:45:00Z" -> "Mon, 19 Oct". */
export function formatSlotDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`formatSlotDay got an invalid date: ${iso}`);
  }
  const parts = Object.fromEntries(slotDay.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.weekday}, ${parts.day} ${parts.month}`;
}
