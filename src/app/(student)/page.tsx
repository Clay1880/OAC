import { DuesBlock } from "@/components/DuesBlock";
import { HomeHero } from "@/components/HomeHero";
import { MenuScreen } from "@/components/MenuScreen";
import { EmptyState } from "@/components/ui/EmptyState";
import { mealMoment } from "@/lib/assist/moment";
import { MENU_COLUMNS, type MenuItem } from "@/lib/menu";
import { fetchSignals } from "@/lib/signals";
import { isDefaulter } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { studentCanteen } from "@/lib/tenancy/current";

export const metadata = { title: "Menu" };

/** Read per request on the server; a function so the render-purity lint (aimed at client renders) stays quiet. */
const currentMoment = () => mealMoment(Date.now());

export default async function MenuPage() {
  const supabase = await createClient();
  const canteen = await studentCanteen(supabase);

  if (await isDefaulter()) {
    return (
      <>
        <h1 className="sr-only">Ordering is paused</h1>
        <HomeHero canteenName={canteen?.name ?? "Your canteen"} />
        <div className="-mt-16 rounded-card bg-surface shadow-lift">
          <DuesBlock />
        </div>
      </>
    );
  }

  if (!canteen) {
    return <EmptyState title="No canteen is open yet" description="Check back in a little while." />;
  }

  const [{ data }, signals] = await Promise.all([
    supabase.from("menu_items").select(MENU_COLUMNS).eq("canteen_id", canteen.id).order("sort").order("name"),
    fetchSignals(supabase, canteen.id),
  ]);

  return (
    <>
      <h1 className="sr-only">What are you having?</h1>
      <MenuScreen
        canteen={canteen}
        initialItems={(data ?? []) as MenuItem[]}
        moment={currentMoment()}
        signals={signals}
      />
    </>
  );
}
