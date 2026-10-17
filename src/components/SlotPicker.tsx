"use client";

import { formatSlotTime } from "@/lib/format";
import { seatsLeft, type Slot } from "@/lib/slots";
import { cn } from "@/lib/cn";

/** Pickup times as big tappable chips. Full slots stay visible but cannot be chosen. */
export function SlotPicker({
  slots,
  selectedId,
  onSelect,
}: {
  slots: Slot[];
  selectedId: string | null;
  onSelect: (slotId: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Pickup time" className="grid grid-cols-2 gap-3">
      {slots.map((slot) => {
        const left = seatsLeft(slot);
        const full = left === 0;
        const selected = slot.id === selectedId;
        return (
          <button
            key={slot.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={full || undefined}
            data-slot-id={slot.id}
            onClick={() => {
              if (!full) onSelect(slot.id);
            }}
            className={cn(
              "flex min-h-16 flex-col items-start justify-center rounded-chip border-2 px-4 py-2 text-left transition-colors duration-150",
              selected && "border-chili bg-chili-soft",
              !selected && !full && "border-line-strong bg-surface hover:bg-sunken",
              full && "cursor-not-allowed border-dashed border-line bg-sunken/50 text-ink-faint",
            )}
          >
            <span className="num text-xl font-semibold">{formatSlotTime(slot.starts_at)}</span>
            <span className={cn("text-sm", full ? "font-semibold" : "text-ink-soft")}>
              {full ? "Full" : `${left} ${left === 1 ? "seat" : "seats"} left`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
