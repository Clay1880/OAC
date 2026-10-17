"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { campusClock, formatClock, resolvePickup, seatsLeft, type Slot } from "@/lib/slots";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const selectClass =
  "num min-h-14 w-full rounded-chip border-2 bg-surface px-3 text-2xl font-semibold text-ink";

/** `HH:mm` (24-hour, what the matching logic speaks) -> the three clock faces. */
function toParts(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return { hour: h % 12 || 12, minute: String(m).padStart(2, "0"), pm: h >= 12 };
}

function fromParts(hour: number, minute: string, pm: boolean) {
  return `${String((hour % 12) + (pm ? 12 : 0)).padStart(2, "0")}:${minute}`;
}

/**
 * Pickup time as a clock instead of a wall of chips, always in AM/PM. It starts on the earliest
 * free time; if the student picks one that is full or closed, it says so and offers the nearest
 * free time. `onSelect` receives the chosen slot's id, or null while the chosen time cannot be booked.
 */
export function PickupTimePicker({
  slots,
  onSelect,
}: {
  slots: Slot[];
  onSelect: (slotId: string | null) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const messageId = useId();

  const earliest = slots.find((s) => seatsLeft(s) > 0);
  const value = typed ?? (earliest ? campusClock(earliest.starts_at) : "");
  const result = resolvePickup(slots, value);
  const chosenId = result.status === "ok" ? result.slot.id : null;

  useEffect(() => {
    onSelect(chosenId);
  }, [chosenId, onSelect]);

  if (!earliest) {
    return (
      <p role="alert" className="rounded-chip border-2 border-danger bg-danger-soft px-4 py-3 text-danger-deep">
        No pickup times are left today.
      </p>
    );
  }

  const { hour, minute, pm } = toParts(value);
  const pick = (next: { hour?: number; minute?: string; pm?: boolean }) =>
    setTyped(fromParts(next.hour ?? hour, next.minute ?? minute, next.pm ?? pm));

  let hint: string | undefined;
  let error: string | undefined;
  let suggestion: Slot | undefined;

  if (result.status === "ok") {
    const left = seatsLeft(result.slot);
    hint = `${left} ${left === 1 ? "seat" : "seats"} left at ${formatClock(value)}.`;
  } else if (result.status === "unavailable" && result.suggestion) {
    const { slot, minutes } = result.suggestion;
    suggestion = slot;
    const when = formatClock(campusClock(slot.starts_at));
    if (minutes > 0 && minutes < 60) {
      error = `${formatClock(value)} is not available. +${minutes} ${minutes === 1 ? "minute" : "minutes"} will work (${when}).`;
    } else if (minutes > 0) {
      error = `${formatClock(value)} is not available. The next time is ${when}.`;
    } else {
      error = `${formatClock(value)} is not available. The closest earlier time is ${when}.`;
    }
  }

  const edge = error ? "border-danger" : "border-line-strong";

  return (
    <div className="flex flex-col gap-3">
      <fieldset aria-describedby={messageId}>
        <legend className="mb-1.5 text-sm font-semibold text-ink">Collect at</legend>
        <div className="grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-2">
          <select
            aria-label="Hour"
            value={hour}
            onChange={(e) => pick({ hour: Number(e.target.value) })}
            className={cn(selectClass, edge)}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className="num text-2xl font-semibold">
            :
          </span>
          <select
            aria-label="Minute"
            value={minute}
            onChange={(e) => pick({ minute: e.target.value })}
            className={cn(selectClass, edge)}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            aria-label="AM or PM"
            value={pm ? "PM" : "AM"}
            onChange={(e) => pick({ pm: e.target.value === "PM" })}
            className={cn(selectClass, edge)}
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </fieldset>
      <div id={messageId}>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger-deep">
            {error}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">{hint}</p>
        )}
      </div>
      {suggestion && (
        <Button variant="secondary" onClick={() => setTyped(campusClock(suggestion.starts_at))}>
          Use {formatClock(campusClock(suggestion.starts_at))}
        </Button>
      )}
    </div>
  );
}
