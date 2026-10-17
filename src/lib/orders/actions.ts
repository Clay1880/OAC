"use server";

import { sendPushToUser } from "@/lib/push/send";
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

type LifecycleResult = { ok: true; order: Order } | { ok: false; error: string };

async function runLifecycle(
  fn: "accept_order" | "mark_ready" | "collect_order" | "flag_no_show",
  orderId: string,
): Promise<LifecycleResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, order: data as Order };
}

export async function acceptOrder(orderId: string): Promise<LifecycleResult> {
  return runLifecycle("accept_order", orderId);
}

export async function markReady(orderId: string): Promise<LifecycleResult> {
  const result = await runLifecycle("mark_ready", orderId);
  if (result.ok) {
    try {
      await sendPushToUser(result.order.student_id, {
        title: "Your order is ready",
        body: `Your order ${result.order.code} is ready — show this ID at the counter.`,
        url: `/orders/${result.order.code}`,
      });
    } catch {
      // sendPushToUser never throws, but a notification must never fail marking an order ready.
    }
  }
  return result;
}

export async function collectOrder(orderId: string): Promise<LifecycleResult> {
  return runLifecycle("collect_order", orderId);
}

export async function flagNoShow(orderId: string): Promise<LifecycleResult> {
  return runLifecycle("flag_no_show", orderId);
}
