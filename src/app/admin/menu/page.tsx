import { MenuAdmin } from "@/components/admin/MenuAdmin";
import { MENU_COLUMNS, type MenuItem } from "@/lib/menu";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Menu" };

export default async function AdminMenuPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("menu_items").select(MENU_COLUMNS).order("sort").order("name");
  return (
    <>
      <h1 className="mb-6 text-4xl font-semibold">Menu</h1>
      <MenuAdmin initialItems={(data ?? []) as MenuItem[]} />
    </>
  );
}
