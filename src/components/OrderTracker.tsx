"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";
import { PushOptIn } from "@/components/PushOptIn";
import { formatPaise, formatSlotTime } from "@/lib/format";
import { cancelOrder } from "@/lib/orders/actions";
import type { Order, OrderStatus } from "@/lib/orders/types";
import { useOrderRealtime } from "@/lib/useOrderRealtime";

export type OrderLine = { name: string; unit_price_paise: number; qty: number };

const HEADLINE: Record<OrderStatus, string> = {
  placed: "Waiting for the canteen to accept your order.",
  accepted: "The canteen is preparing your order.",
  ready: "Ready! Show this ID at the counter.",
  collected: "Collected. Enjoy your meal!",
  cancelled: "This order was cancelled.",
  no_show: "Unpaid — pay at the counter.",
};

export function OrderTracker({
  initialOrder,
  lines,
  slotStartsAt,
}: {
  initialOrder: Order;
  lines: OrderLine[];
  slotStartsAt: string;
}) {
  const { order, refresh } = useOrderRealtime(initialOrder.id, initialOrder);
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);

  async function onCancel() {
    setCancelling(true);
    const result = await cancelOrder(order.id);
    if (!result.ok) {
      toast({ title: "This order can no longer be cancelled.", tone: "error" });
    }
    await refresh();
    setCancelling(false);
  }

  const ready = order.status === "ready";
  // Alerts only help while the order is still on its way to ready.
  const awaitingReady = order.status === "placed" || order.status === "accepted";
  const showCounterPayment = order.status !== "cancelled" && order.status !== "collected";

  return (
    <div className="flex flex-col gap-6">
      <Card
        variant="ticket"
        stub={
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-ink-soft">Pickup</p>
              <p className="num text-3xl font-semibold">{formatSlotTime(slotStartsAt)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-ink-soft">Total</p>
              <p className="num text-2xl font-semibold">{formatPaise(order.total_paise)}</p>
            </div>
          </div>
        }
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-ink-soft">Order ID</p>
          <Badge status={order.status} />
        </div>
        <h1 className="order-code mt-1 break-all text-5xl leading-none">{order.code}</h1>
        <p
          role="status"
          className={ready ? "mt-4 text-xl font-semibold text-status-ready-ink" : "mt-4 text-lg text-ink-soft"}
        >
          {HEADLINE[order.status]}
        </p>
        {showCounterPayment && (
          <p className="mt-1 text-sm text-ink-soft">Pay at the counter when you collect.</p>
        )}
      </Card>

      {awaitingReady && (
        <div className="flex flex-col gap-2">
          <PushOptIn />
          <InstallPrompt />
        </div>
      )}

      <section aria-labelledby="progress-heading">
        <h2 id="progress-heading" className="mb-1 text-2xl font-semibold">
          Progress
        </h2>
        <OrderStatusTimeline status={order.status} />
      </section>

      <section aria-labelledby="items-heading">
        <h2 id="items-heading" className="mb-2 text-2xl font-semibold">
          Items
        </h2>
        <ul className="divide-y divide-line">
          {lines.map((line) => (
            <li key={line.name} className="flex items-baseline justify-between gap-3 py-2.5">
              <span>
                {line.name} <span className="num text-ink-soft">× {line.qty}</span>
              </span>
              <span className="num">{formatPaise(line.unit_price_paise * line.qty)}</span>
            </li>
          ))}
        </ul>
      </section>

      {order.status === "placed" && (
        <Button variant="danger" fullWidth loading={cancelling} onClick={onCancel}>
          Cancel order
        </Button>
      )}
    </div>
  );
}
