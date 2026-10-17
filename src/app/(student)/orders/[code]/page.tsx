import { notFound } from "next/navigation";
import { OrderTracker, type OrderLine } from "@/components/OrderTracker";
import type { Order } from "@/lib/orders/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Your order" };

export default async function OrderPage({ params }: PageProps<"/orders/[code]">) {
  const { code } = await params;
  const supabase = await createClient();
  // RLS limits this to the signed-in student's own orders, so a guessed code finds nothing.
  const { data } = await supabase
    .from("orders")
    .select("*, order_items(name, unit_price_paise, qty), slots(starts_at)")
    .eq("code", code)
    .maybeSingle();
  if (!data) notFound();

  const { order_items, slots, ...order } = data;
  const slot = Array.isArray(slots) ? slots[0] : slots;

  return (
    <OrderTracker
      initialOrder={order as Order}
      lines={order_items as OrderLine[]}
      slotStartsAt={slot.starts_at}
    />
  );
}
