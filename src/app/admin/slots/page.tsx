import { redirect } from "next/navigation";
import { SlotsAdmin } from "@/components/admin/SlotsAdmin";
import { CAMPUS_TZ } from "@/lib/config";
import type { Slot } from "@/lib/slots";
import { createClient } from "@/lib/supabase/server";
import { consoleCanteen } from "@/lib/tenancy/current";

export const metadata = { title: "Slots" };

const SLOT_COLUMNS = "id, starts_at, capacity, booked_count";

export default async function AdminSlotsPage() {
  const supabase = await createClient();
  const canteen = await consoleCanteen(supabase);
  if (!canteen) redirect("/admin");
  const now = new Date();
  // From an hour ago, so a slot that just started is still visible while orders are being collected.
  const since = new Date(now.getTime() - 60 * 60_000).toISOString();
  const { data } = await supabase
    .from("slots")
    .select(SLOT_COLUMNS)
    .eq("canteen_id", canteen.id)
    .gte("starts_at", since)
    .order("starts_at")
    .limit(300);

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Slots</h1>
      <SlotsAdmin
        canteenId={canteen.id}
        initialSlots={(data ?? []) as Slot[]}
        // en-CA formats as YYYY-MM-DD, which is what a date input wants.
        today={new Intl.DateTimeFormat("en-CA", { timeZone: CAMPUS_TZ }).format(now)}
      />
    </>
  );
}
