"use server";

import { createClient } from "@/lib/supabase/server";
import { toPlaceOrderError, type Order, type PlaceOrderError } from "./types";

export async function placeOrder(input: {
  slotId: string;
  items: { menuItemId: string; qty: number }[];
  requestId: string;
}): Promise<{ ok: true; order: Order } | { ok: false; error: PlaceOrderError }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_order", {
    p_slot_id: input.slotId,
    // Only ids and quantities leave the client; prices and totals are computed in the database.
    p_items: input.items.map((i) => ({ menu_item_id: i.menuItemId, qty: i.qty })),
    p_request_id: input.requestId,
  });
  if (error) return { ok: false, error: toPlaceOrderError(error) };
  return { ok: true, order: data as Order };
}

export async function cancelOrder(orderId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId });
  return { ok: !error };
}
