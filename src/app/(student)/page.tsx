import { DuesBlock } from "@/components/DuesBlock";
import { HomeHero } from "@/components/HomeHero";
import { MenuScreen } from "@/components/MenuScreen";
import { MENU_COLUMNS, type MenuItem } from "@/lib/menu";
import { isDefaulter } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Menu" };

export default async function MenuPage() {
  if (await isDefaulter()) {
    return (
      <>
        <h1 className="sr-only">Ordering is paused</h1>
        <HomeHero />
        <div className="-mt-16 rounded-card bg-surface shadow-lift">
          <DuesBlock />
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.from("menu_items").select(MENU_COLUMNS).order("sort").order("name");

  return (
    <>
      <h1 className="sr-only">What are you having?</h1>
      <MenuScreen initialItems={(data ?? []) as MenuItem[]} />
    </>
  );
}
