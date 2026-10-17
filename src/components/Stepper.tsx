"use client";

import { MAX_QTY_PER_ITEM } from "@/lib/cart";

/** Minus / quantity / plus with 48px targets. `name` makes the buttons say which item they change. */
export function Stepper({
  name,
  qty,
  onAdd,
  onRemove,
}: {
  name: string;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const button =
    "inline-flex size-12 items-center justify-center rounded-chip text-2xl font-semibold leading-none transition-colors duration-150 disabled:text-ink-faint";
  return (
    <div role="group" aria-label={name} className="inline-flex items-center rounded-chip border-2 border-ink bg-surface">
      <button type="button" aria-label={`Remove one ${name}`} onClick={onRemove} className={`${button} hover:bg-sunken`}>
        <span aria-hidden="true">−</span>
      </button>
      <span className="num min-w-8 text-center text-lg font-semibold" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`Add one ${name}`}
        onClick={onAdd}
        disabled={qty >= MAX_QTY_PER_ITEM}
        className={`${button} hover:bg-sunken`}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
