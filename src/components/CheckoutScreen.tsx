"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CartLines } from "@/components/CartLines";
import { useCart } from "@/components/CartProvider";
import { PickupTimePicker } from "@/components/PickupTimePicker";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { placeOrder } from "@/lib/orders/actions";
import { cartTotalPaise } from "@/lib/cart";
import { formatPaise } from "@/lib/format";
import { fetchMenu, type MenuItem } from "@/lib/menu";
import type { Slot } from "@/lib/slots";
import type { Canteen } from "@/lib/tenancy/types";
import { useSlots } from "@/lib/useSlots";

const ERROR_COPY = {
  SLOT_FULL: "That pickup time just filled up. Pick another one.",
  SLOT_CLOSED: "Ordering for that time has closed. Pick a later one.",
  ITEM_UNAVAILABLE: "Something in your order just sold out.",
  EMPTY_ORDER: "Your order is empty.",
  DEFAULTER: "Ordering is paused until you clear your dues at the counter.",
  CANTEEN_UNAVAILABLE: "This canteen is not taking orders right now.",
  UNKNOWN: "We could not place your order. Check your connection and try again.",
} as const;

export function CheckoutScreen({
  canteen,
  initialMenu,
  initialSlots,
  serverNow,
  cutoffMinutes,
}: {
  canteen: Canteen;
  initialMenu: MenuItem[];
  initialSlots: Slot[];
  serverNow: string;
  cutoffMinutes: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { cart, ready, clear } = useCart();
  const { slots, failed, refresh } = useSlots(initialSlots, serverNow, cutoffMinutes, canteen.id);
  const [menu, setMenu] = useState(initialMenu);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);
  const [placing, setPlacing] = useState(false);

  // One id per checkout attempt: a double-tap or a retry after a dropped connection reuses it,
  // and the database turns repeats into the same order.
  const requestId = useRef<string>("");
  useEffect(() => {
    requestId.current = crypto.randomUUID();
  }, []);
  const inFlight = useRef(false);

  // A slot that filled or closed while it was selected is no longer a valid choice.
  const selected = slots.find((s) => s.id === slotId && s.capacity > s.booked_count) ?? null;

  if (!ready) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your order">
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <EmptyState
        title="Your order is empty"
        description="Add something from the menu, then come back to pick a time."
        action={
          <Link href="/" className={buttonStyles()}>
            Browse the menu
          </Link>
        }
      />
    );
  }

  async function onPlace() {
    if (inFlight.current || !selected) return;
    inFlight.current = true;
    setPlacing(true);

    let result;
    try {
      result = await placeOrder({
        canteenId: canteen.id,
        slotId: selected.id,
        items: cart.map((l) => ({ menuItemId: l.itemId, qty: l.qty })),
        requestId: requestId.current,
      });
    } catch {
      result = { ok: false as const, error: "UNKNOWN" as const };
    }

    if (result.ok) {
      clear();
      router.push(`/orders/${result.order.code}`);
      return; // keep the button locked while we navigate
    }

    inFlight.current = false;
    setPlacing(false);
    toast({ title: ERROR_COPY[result.error], tone: "error" });

    if (result.error === "ITEM_UNAVAILABLE") {
      const fresh = await fetchMenu(canteen.id);
      if (fresh) {
        setMenu(fresh);
        const open = new Set(fresh.filter((m) => m.is_available).map((m) => m.id));
        setFlaggedIds(cart.filter((l) => !open.has(l.itemId)).map((l) => l.itemId));
      }
    } else if (result.error === "SLOT_FULL" || result.error === "SLOT_CLOSED") {
      void refresh();
    } else if (result.error === "DEFAULTER") {
      router.refresh();
    }
  }

  const hasFlagged = cart.some((l) => {
    const item = menu.find((m) => m.id === l.itemId);
    return !item || !item.is_available;
  });
  const total = cartTotalPaise(cart, menu.filter((m) => m.is_available));

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="order-heading">
        <h2 id="order-heading" className="mb-3 text-[1.0625rem] font-bold">
          Your order
        </h2>
        <Card className="p-4">
          <CartLines menu={menu} flaggedIds={flaggedIds} />
        </Card>
      </section>

      <section aria-labelledby="slot-heading">
        <h2 id="slot-heading" className="mb-3 text-[1.0625rem] font-bold">
          Pickup time
        </h2>
        {failed && (
          <p role="alert" className="mb-3 rounded-chip border-2 border-danger bg-danger-soft px-4 py-3 text-danger-deep">
            Could not refresh pickup times.{" "}
            <button type="button" onClick={() => void refresh()} className="font-semibold underline underline-offset-2">
              Try again
            </button>
          </p>
        )}
        {slots.length === 0 ? (
          <EmptyState title="No slots left today" description="Pickup times are all taken or closed. Try again tomorrow." className="py-6" />
        ) : (
          <Card className="p-4">
            <PickupTimePicker slots={slots} onSelect={setSlotId} />
          </Card>
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <Button
          size="lg"
          fullWidth
          loading={placing}
          disabled={!selected || hasFlagged}
          onClick={onPlace}
        >
          Place order · {formatPaise(total)}
        </Button>
        <p className="mt-2 text-center text-sm text-ink-soft">
          {hasFlagged
            ? "Remove the sold-out item to continue."
            : selected
              ? "You pay at the counter when you collect."
              : "Choose a pickup time to continue."}
        </p>
      </div>
    </div>
  );
}
