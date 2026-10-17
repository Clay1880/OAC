import { describe, expect, it } from "vitest";
import type { MenuItem } from "@/lib/menu";
import { applyMenuView, isFlatView, PRICE_CAPS, type MenuView } from "./menuFilter";

let n = 0;
const item = (over: Partial<MenuItem> & { name: string }): MenuItem => ({
  id: `id-${++n}`,
  description: null,
  price_paise: 5000,
  category: "Meals",
  is_available: true,
  sort: n,
  tags: [],
  meal_moments: [],
  ...over,
});

const view = (over: Partial<MenuView> = {}): MenuView => ({
  query: "",
  category: null,
  maxPaise: null,
  sort: "default",
  ...over,
});

const names = (items: MenuItem[]) => items.map((i) => i.name);

describe("applyMenuView", () => {
  const items = [
    item({ name: "Thali", price_paise: 8000 }),
    item({ name: "Chai", price_paise: 1200, category: "Drinks" }),
    item({ name: "Sandwich", price_paise: 3500, category: "Snacks" }),
  ];

  it("keeps the incoming order by default", () => {
    expect(names(applyMenuView(items, view()))).toEqual(["Thali", "Chai", "Sandwich"]);
  });

  it("sorts price-asc: 12 before 35 before 80", () => {
    expect(names(applyMenuView(items, view({ sort: "price-asc" })))).toEqual(["Chai", "Sandwich", "Thali"]);
  });

  it("sorts price-desc: 80 before 35 before 12", () => {
    expect(names(applyMenuView(items, view({ sort: "price-desc" })))).toEqual(["Thali", "Sandwich", "Chai"]);
  });

  it("breaks price ties by name in both directions", () => {
    const tied = [item({ name: "Beta", price_paise: 2000 }), item({ name: "Alpha", price_paise: 2000 })];
    expect(names(applyMenuView(tied, view({ sort: "price-asc" })))).toEqual(["Alpha", "Beta"]);
    expect(names(applyMenuView(tied, view({ sort: "price-desc" })))).toEqual(["Alpha", "Beta"]);
  });

  it("does not mutate the input", () => {
    const copy = [...items];
    applyMenuView(items, view({ sort: "price-asc" }));
    expect(items).toEqual(copy);
  });

  it("treats the price cap as strictly less than", () => {
    const capped = [
      item({ name: "Exactly fifty", price_paise: 5000 }),
      item({ name: "Just under", price_paise: 4999 }),
    ];
    expect(names(applyMenuView(capped, view({ maxPaise: 5000 })))).toEqual(["Just under"]);
  });

  it("composes category, query and cap", () => {
    const all = [
      item({ name: "Masala Chai", price_paise: 1500, category: "Drinks" }),
      item({ name: "Masala Dosa", price_paise: 4000, category: "Meals" }),
      item({ name: "Masala Soda", price_paise: 6000, category: "Drinks" }),
      item({ name: "Cold Coffee", price_paise: 2500, category: "Drinks" }),
    ];
    const out = applyMenuView(all, view({ category: "Drinks", query: "  MASALA ", maxPaise: 5000 }));
    expect(names(out)).toEqual(["Masala Chai"]);
  });

  it("defines the three price caps", () => {
    expect(PRICE_CAPS).toEqual([
      { paise: 3000, label: "Under ₹30" },
      { paise: 5000, label: "Under ₹50" },
      { paise: 10000, label: "Under ₹100" },
    ]);
  });
});

describe("isFlatView", () => {
  it("is true only for price sorts", () => {
    expect(isFlatView(view())).toBe(false);
    expect(isFlatView(view({ category: "Drinks", maxPaise: 3000, query: "x" }))).toBe(false);
    expect(isFlatView(view({ sort: "price-asc" }))).toBe(true);
    expect(isFlatView(view({ sort: "price-desc" }))).toBe(true);
  });
});
