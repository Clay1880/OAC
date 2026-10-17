import { CheckoutScreen } from "@/components/CheckoutScreen";
import { DuesBlock } from "@/components/DuesBlock";
import { MENU_COLUMNS, type MenuItem } from "@/lib/menu";
import { campusDayEnd, type Slot } from "@/lib/slots";
import { isDefaulter } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  if (await isDefaulter()) return <DuesBlock />;

  const supabase = await createClient();
  // The server clock decides what is still open; the phone's clock is never consulted.
  const now = new Date();
  const [menu, slots, settings] = await Promise.all([
    supabase.from("menu_items").select(MENU_COLUMNS).order("sort").order("name"),
    supabase
      .from("slots")
      .select("id, starts_at, capacity, booked_count")
      .gt("starts_at", now.toISOString())
      .lt("starts_at", new Date(campusDayEnd(now.getTime())).toISOString())
      .order("starts_at"),
    supabase.from("app_settings").select("order_cutoff_minutes").single(),
  ]);

  return (
    <>
      <h1 className="mb-6 text-4xl font-semibold">Checkout</h1>
      <CheckoutScreen
        initialMenu={(menu.data ?? []) as MenuItem[]}
        initialSlots={(slots.data ?? []) as Slot[]}
        serverNow={now.toISOString()}
        cutoffMinutes={settings.data?.order_cutoff_minutes ?? 5}
      />
    </>
  );
}
