import type { OrderStatus } from "@/lib/orders/types";
import type { StaffOrderLine } from "./types";

const TO_COOK = new Set<OrderStatus>(["placed", "accepted"]);

/** "12 × Samosa" lines for the orders in a slot that are not yet ready, biggest quantity first. */
export function prepSummary(
  orders: { id: string; status: OrderStatus }[],
  lines: StaffOrderLine[],
): { name: string; qty: number }[] {
  const cooking = new Set(orders.filter((o) => TO_COOK.has(o.status)).map((o) => o.id));
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (cooking.has(line.order_id)) totals.set(line.name, (totals.get(line.name) ?? 0) + line.qty);
  }
  return [...totals].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}
