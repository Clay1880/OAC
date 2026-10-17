import { redirect } from "next/navigation";
import { MenuAdmin } from "@/components/admin/MenuAdmin";
import { MENU_COLUMNS, type MenuItem } from "@/lib/menu";
import { createClient } from "@/lib/supabase/server";
import { consoleCanteen } from "@/lib/tenancy/current";

export const metadata = { title: "Menu" };

export default async function AdminMenuPage() {
  const supabase = await createClient();
  const canteen = await consoleCanteen(supabase);
  if (!canteen) redirect("/admin");
  const { data } = await supabase
    .from("menu_items")
    .select(MENU_COLUMNS)
    .eq("canteen_id", canteen.id)
    .order("sort")
    .order("name");
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Menu</h1>
      <MenuAdmin canteenId={canteen.id} initialItems={(data ?? []) as MenuItem[]} />
    </>
  );
}
