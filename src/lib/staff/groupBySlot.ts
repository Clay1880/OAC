import type { StaffOrder } from "./types";

const FINISHED = new Set(["collected", "cancelled"]);

/**
 * Orders still needing the counter, grouped by pickup slot: slots in time order, orders within a
 * slot in the order they were placed. No-shows stay (a late student can still collect and pay).
 */
export function groupBySlot(orders: StaffOrder[]): { slotStart: string; orders: StaffOrder[] }[] {
  const groups = new Map<string, StaffOrder[]>();
  for (const o of orders) {
    if (FINISHED.has(o.status)) continue;
    groups.set(o.slot_starts_at, [...(groups.get(o.slot_starts_at) ?? []), o]);
  }
  return [...groups]
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .map(([slotStart, list]) => ({
      slotStart,
      orders: [...list].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
    }));
}
