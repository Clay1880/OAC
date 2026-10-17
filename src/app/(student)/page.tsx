import { DuesBlock } from "@/components/DuesBlock";
import { MenuScreen } from "@/components/MenuScreen";
import { MENU_COLUMNS, type MenuItem } from "@/lib/menu";
import { isDefaulter } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Menu" };

export default async function MenuPage() {
  if (await isDefaulter()) return <DuesBlock />;

  const supabase = await createClient();
  const { data } = await supabase.from("menu_items").select(MENU_COLUMNS).order("sort").order("name");

  return (
    <>
      <h1 className="text-4xl font-semibold">What are you having?</h1>
      <p className="mb-6 mt-2 text-ink-soft">Order now, pick a time, and pay at the counter.</p>
      <MenuScreen initialItems={(data ?? []) as MenuItem[]} />
    </>
  );
}
