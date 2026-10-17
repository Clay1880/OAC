import { CheckoutScreen } from "@/components/CheckoutScreen";
import { DuesBlock } from "@/components/DuesBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { MENU_COLUMNS, type MenuItem } from "@/lib/menu";
import { campusDayEnd, type Slot } from "@/lib/slots";
import { isDefaulter } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { studentCanteen } from "@/lib/tenancy/current";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  if (await isDefaulter()) return <DuesBlock />;

  const supabase = await createClient();
  const canteen = await studentCanteen(supabase);
  if (!canteen) {
    return <EmptyState title="No canteen is open yet" description="Check back in a little while." />;
  }

  // The server clock decides what is still open; the phone's clock is never consulted.
  const now = new Date();
  const [menu, slots] = await Promise.all([
    supabase.from("menu_items").select(MENU_COLUMNS).eq("canteen_id", canteen.id).order("sort").order("name"),
    supabase
      .from("slots")
      .select("id, starts_at, capacity, booked_count")
      .eq("canteen_id", canteen.id)
      .gt("starts_at", now.toISOString())
      .lt("starts_at", new Date(campusDayEnd(now.getTime())).toISOString())
      .order("starts_at"),
  ]);

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Checkout</h1>
      <CheckoutScreen
        canteen={canteen}
        initialMenu={(menu.data ?? []) as MenuItem[]}
        initialSlots={(slots.data ?? []) as Slot[]}
        serverNow={now.toISOString()}
        cutoffMinutes={canteen.order_cutoff_minutes}
      />
    </>
  );
}
