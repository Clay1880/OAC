import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPaise, formatSlotTime } from "@/lib/format";
import type { OrderStatus } from "@/lib/orders/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My orders" };

// Minimal list so the nav link works. Task 7 replaces this with the full history.
export default async function OrdersPage() {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("code, status, total_paise, created_at, slots(starts_at)")
    .order("created_at", { ascending: false });

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">My orders</h1>
      {!orders?.length ? (
        <EmptyState
          title="No orders yet"
          description="Your orders will show up here."
          action={
            <Link href="/" className={buttonStyles()}>
              Browse the menu
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface px-4 shadow-edge">
          {orders.map((o) => {
            const slot = Array.isArray(o.slots) ? o.slots[0] : o.slots;
            return (
              <li key={o.code}>
                <Link href={`/orders/${o.code}`} className="flex min-h-16 items-center justify-between gap-3 py-3">
                  <span>
                    <span className="order-code block text-xl">{o.code}</span>
                    <span className="num text-sm text-ink-soft">
                      {slot ? formatSlotTime(slot.starts_at) : ""} · {formatPaise(o.total_paise)}
                    </span>
                  </span>
                  <Badge status={o.status as OrderStatus} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
