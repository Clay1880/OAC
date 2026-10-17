import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { formatPaise, formatSlotTime } from "@/lib/format";
import type { OrderStatus } from "@/lib/orders/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Your order" };

// Minimal view so a placed order has somewhere to land. Task 7 replaces this with live tracking.
export default async function OrderPage({ params }: PageProps<"/orders/[code]">) {
  const { code } = await params;
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("code, status, total_paise, slots(starts_at)")
    .eq("code", code)
    .maybeSingle();
  if (!order) notFound();

  const slot = Array.isArray(order.slots) ? order.slots[0] : order.slots;
  return (
    <>
      <p className="text-ink-soft">Order ID</p>
      <h1 className="order-code text-5xl">{order.code}</h1>
      <div className="mt-4 flex items-center gap-3">
        <Badge status={order.status as OrderStatus} />
        {slot && <span className="num font-semibold">{formatSlotTime(slot.starts_at)}</span>}
      </div>
      <p className="mt-4 text-ink-soft">
        Pay <span className="num font-semibold text-ink">{formatPaise(order.total_paise)}</span> at the counter.
      </p>
    </>
  );
}
