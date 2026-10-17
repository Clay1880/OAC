"use client";

import { useCallback, useEffect, useState } from "react";
import type { Order } from "@/lib/orders/types";
import { createClient } from "@/lib/supabase/browser";

/**
 * Live copy of one order. Realtime pushes changes, but a phone in a pocket drops its socket, so the
 * order is also re-read whenever the app returns to the foreground or the network comes back:
 * "Ready" must show even if no push and no Realtime message ever arrived.
 */
export function useOrderRealtime(orderId: string, initial: Order) {
  const [order, setOrder] = useState(initial);

  const refresh = useCallback(async () => {
    const { data } = await createClient().from("orders").select("*").eq("id", orderId).maybeSingle();
    if (data) setOrder(data as Order);
  }, [orderId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload) => setOrder(payload.new as Order),
      )
      .subscribe((status) => {
        // A (re)connect may have missed changes made while the socket was down.
        if (status === "SUBSCRIBED") void refresh();
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [orderId, refresh]);

  return { order, refresh };
}
