import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffOrder, StaffOrderLine } from "./types";

/** Orders of one canteen that still need the counter, plus their lines. Works with the server and browser clients. */
export async function fetchStaffData(
  supabase: SupabaseClient,
  canteenId: string,
): Promise<{ orders: StaffOrder[]; lines: StaffOrderLine[] } | null> {
  const active = "(collected,cancelled)";
  const [orders, withItems] = await Promise.all([
    supabase.from("staff_orders_v").select("*").eq("canteen_id", canteenId).not("status", "in", active),
    supabase.from("orders").select("id, order_items(name, qty)").eq("canteen_id", canteenId).not("status", "in", active),
  ]);
  if (orders.error || withItems.error) return null;

  const lines = (withItems.data as { id: string; order_items: { name: string; qty: number }[] }[]).flatMap((o) =>
    o.order_items.map((i) => ({ order_id: o.id, name: i.name, qty: i.qty })),
  );
  return { orders: orders.data as StaffOrder[], lines };
}
