import { createClient } from "@/lib/supabase/browser";

/** A row of `public.menu_items`. */
export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price_paise: number;
  category: string;
  is_available: boolean;
  sort: number;
  tags: string[];
  meal_moments: string[];
};

export const MENU_COLUMNS = "id, name, description, price_paise, category, is_available, sort, tags, meal_moments";

/** Fresh menu from the browser. Returns null when the request fails, so callers keep what they have. */
export async function fetchMenu(canteenId: string): Promise<MenuItem[] | null> {
  const { data, error } = await createClient()
    .from("menu_items")
    .select(MENU_COLUMNS)
    .eq("canteen_id", canteenId)
    .order("sort")
    .order("name");
  return error ? null : (data as MenuItem[]);
}

/** Menu grouped by category, categories in the order their first item appears. */
export function groupByCategory(items: MenuItem[]): { category: string; items: MenuItem[] }[] {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  return [...groups].map(([category, list]) => ({ category, items: list }));
}
