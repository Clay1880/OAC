import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuItem } from "@/lib/menu";

/** `usual`: how many times I ordered each item. `popular`: how many orders each item got on campus. Keyed by menu item id. */
export type Signals = { usual: Record<string, number>; popular: Record<string, number> };

export const emptySignals = (): Signals => ({ usual: {}, popular: {} });

type UsualRow = { menu_item_id: string; orders: { status: string; canteen_id: string } | { status: string; canteen_id: string }[] | null };

async function fetchUsual(supabase: SupabaseClient, canteenId: string): Promise<Record<string, number>> {
  // RLS already limits order_items to the signed-in student's own orders.
  const { data, error } = await supabase
    .from("order_items")
    .select("menu_item_id, orders!inner(status, canteen_id)")
    .eq("orders.canteen_id", canteenId)
    .not("orders.status", "in", "(cancelled,no_show)");
  if (error || !data) return {};
  const usual: Record<string, number> = {};
  for (const row of data as unknown as UsualRow[]) usual[row.menu_item_id] = (usual[row.menu_item_id] ?? 0) + 1;
  return usual;
}

async function fetchPopular(supabase: SupabaseClient, canteenId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("popular_items", { p_canteen_id: canteenId });
  if (error || !data) return {};
  const popular: Record<string, number> = {};
  for (const row of data as { menu_item_id: string; orders: number | string }[]) popular[row.menu_item_id] = Number(row.orders);
  return popular;
}

/** The student's usual orders and the campus favourites. Never throws: a failed half is empty. */
export async function fetchSignals(supabase: SupabaseClient, canteenId: string): Promise<Signals> {
  const [usual, popular] = await Promise.all([
    fetchUsual(supabase, canteenId).catch(() => ({})),
    fetchPopular(supabase, canteenId).catch(() => ({})),
  ]);
  return { usual, popular };
}

function top(counts: Record<string, number>, items: MenuItem[], n: number): MenuItem[] {
  return items
    .filter((i) => i.is_available && (counts[i.id] ?? 0) > 0)
    .sort((a, b) => counts[b.id] - counts[a.id] || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** Available items I order most, count desc then name. */
export function topUsual(signals: Signals, items: MenuItem[], n = 4): MenuItem[] {
  return top(signals.usual, items, n);
}

/** Available items the campus orders most, count desc then name. */
export function topPopular(signals: Signals, items: MenuItem[], n = 6): MenuItem[] {
  return top(signals.popular, items, n);
}

/** Plain flags for the model: the student's usual, or popular on campus. Never counts. */
export function badgesFor(id: string, signals: Signals): ("usual" | "popular")[] {
  const badges: ("usual" | "popular")[] = [];
  if ((signals.usual[id] ?? 0) > 0) badges.push("usual");
  if ((signals.popular[id] ?? 0) > 0) badges.push("popular");
  return badges;
}
