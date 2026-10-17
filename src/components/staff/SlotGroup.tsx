import type { ReactNode } from "react";
import { formatSlotTime } from "@/lib/format";
import { prepSummary } from "@/lib/staff/prep";
import type { StaffOrder, StaffOrderLine } from "@/lib/staff/types";

/** A pickup slot: its time, how many orders it holds, and what to cook for the ones not yet ready. */
export function SlotGroup({
  slotStart,
  orders,
  lines,
  children,
}: {
  slotStart: string;
  orders: StaffOrder[];
  lines: StaffOrderLine[];
  children: ReactNode;
}) {
  const prep = prepSummary(orders, lines);
  const headingId = `slot-${slotStart}`;
  return (
    <section aria-labelledby={headingId} data-slot-start={slotStart} className="flex flex-col gap-3">
      <header className="sticky top-0 z-10 -mx-4 border-b-2 border-ink bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={headingId} className="num text-3xl font-semibold">
            {formatSlotTime(slotStart)}
          </h2>
          <p className="text-sm text-ink-soft">
            <span className="num font-semibold text-ink">{orders.length}</span> {orders.length === 1 ? "order" : "orders"}
          </p>
        </div>
        {prep.length > 0 && (
          <p className="mt-1 text-base" aria-label="To cook">
            <span className="text-ink-soft">Cook: </span>
            {prep.map((p, i) => (
              <span key={p.name}>
                {i > 0 && ", "}
                <span className="num font-semibold">{p.qty} ×</span> {p.name}
              </span>
            ))}
          </p>
        )}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
