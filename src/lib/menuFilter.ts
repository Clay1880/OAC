import type { MenuItem } from "@/lib/menu";

export type MenuSort = "default" | "price-asc" | "price-desc";

/** What the menu screen shows: look only, never what is on the menu or in the cart. */
export type MenuView = { query: string; category: string | null; maxPaise: number | null; sort: MenuSort };

/** "Under ₹N" means strictly less than N. */
export const PRICE_CAPS: readonly { paise: number; label: string }[] = [
  { paise: 3000, label: "Under ₹30" },
  { paise: 5000, label: "Under ₹50" },
  { paise: 10000, label: "Under ₹100" },
];

/** Category, name search and price cap, then the sort. Price sorts break ties by name; `default` keeps the incoming order. */
export function applyMenuView(items: MenuItem[], view: MenuView): MenuItem[] {
  const needle = view.query.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      (view.category === null || i.category === view.category) &&
      (needle === "" || i.name.toLowerCase().includes(needle)) &&
      (view.maxPaise === null || i.price_paise < view.maxPaise),
  );
  if (view.sort === "default") return shown;
  const dir = view.sort === "price-asc" ? 1 : -1;
  return shown.sort((a, b) => dir * (a.price_paise - b.price_paise) || a.name.localeCompare(b.name));
}

/** A price sort shows one grid without category headings, since the headings would break the order. */
export function isFlatView(view: MenuView): boolean {
  return view.sort !== "default";
}
