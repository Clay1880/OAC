import { DefaultersAdmin } from "@/components/admin/DefaultersAdmin";
import { groupDefaulters, type UnpaidOrderRow } from "@/lib/admin/defaulters";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Defaulters" };

export default async function DefaultersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, total_paise, student_id, profiles(full_name, phone, reg_no)")
    .eq("status", "no_show")
    .is("paid_at", null);

  return (
    <>
      <h1 className="mb-2 text-4xl font-semibold">Defaulters</h1>
      <p className="mb-6 text-ink-soft">Students who did not collect an order. They cannot order again until they pay.</p>
      <DefaultersAdmin defaulters={groupDefaulters((data ?? []) as unknown as UnpaidOrderRow[])} />
    </>
  );
}
