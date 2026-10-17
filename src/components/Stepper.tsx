"use client";

import { MAX_QTY_PER_ITEM } from "@/lib/cart";

/** Minus / quantity / plus. The circles are 32px to match the design; the buttons around them keep a 48px target. `name` makes the buttons say which item they change. */
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
  const button = "inline-flex size-12 items-center justify-center text-xl font-semibold leading-none text-ink disabled:text-ink-faint";
  const circle = "inline-flex size-8 items-center justify-center rounded-full border transition-colors duration-150";
  return (
    <div role="group" aria-label={name} className="inline-flex items-center">
      <button type="button" aria-label={`Remove one ${name}`} onClick={onRemove} className={button}>
        <span aria-hidden="true" className={`${circle} border-line-strong bg-surface hover:bg-sunken`}>
          −
        </span>
      </button>
      <span className="num min-w-6 text-center text-base font-semibold" aria-live="polite">
        {qty}
      </span>
      <button type="button" aria-label={`Add one ${name}`} onClick={onAdd} disabled={qty >= MAX_QTY_PER_ITEM} className={button}>
        <span aria-hidden="true" className={`${circle} border-brand bg-brand text-on-brand`}>
          +
        </span>
      </button>
    </div>
  );
}
