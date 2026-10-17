import { describe, expect, it } from "vitest";
import type { MenuItem } from "@/lib/menu";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptySignals, fetchSignals, topPopular, topUsual, type Signals } from "./signals";

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

const a = item({ name: "Alpha" });
const b = item({ name: "Beta" });
const c = item({ name: "Cola" });
const gone = item({ name: "Gone", is_available: false });
const menu = [c, gone, b, a];

describe("topUsual", () => {
  it("orders by count then name and skips sold-out items", () => {
    const signals: Signals = {
      usual: { [a.id]: 2, [b.id]: 2, [c.id]: 5, [gone.id]: 9 },
      popular: {},
    };
    expect(topUsual(signals, menu).map((i) => i.name)).toEqual(["Cola", "Alpha", "Beta"]);
  });

  it("ignores items with no orders and respects n", () => {
    const signals: Signals = { usual: { [a.id]: 1, [b.id]: 3, [c.id]: 2 }, popular: {} };
    expect(topUsual(signals, menu, 2).map((i) => i.name)).toEqual(["Beta", "Cola"]);
    expect(topUsual(signals, [a, b]).map((i) => i.name)).toEqual(["Beta", "Alpha"]);
  });

  it("returns [] for empty signals", () => {
    expect(topUsual(emptySignals(), menu)).toEqual([]);
  });
});

describe("topPopular", () => {
  it("orders by count then name and skips sold-out items", () => {
    const signals: Signals = {
      usual: {},
      popular: { [a.id]: 7, [b.id]: 7, [c.id]: 9, [gone.id]: 20 },
    };
    expect(topPopular(signals, menu).map((i) => i.name)).toEqual(["Cola", "Alpha", "Beta"]);
  });

  it("defaults to six for popular and four for usual", () => {
    const many = Array.from({ length: 8 }, (_, i) => item({ name: `Dish ${i}` }));
    const counts = Object.fromEntries(many.map((m, i) => [m.id, 10 - i]));
    expect(topPopular({ usual: {}, popular: counts }, many)).toHaveLength(6);
    expect(topUsual({ usual: counts, popular: {} }, many)).toHaveLength(4);
  });

  it("returns [] for empty signals", () => {
    expect(topPopular(emptySignals(), menu)).toEqual([]);
  });
});

describe("fetchSignals", () => {
  it("never throws: a failed query gives the empty half", async () => {
    const failing = {
      from: () => {
        throw new Error("network down");
      },
      rpc: async () => ({ data: [{ menu_item_id: "x", orders: "4" }], error: null }),
    } as unknown as SupabaseClient;
    expect(await fetchSignals(failing, "canteen")).toEqual({ usual: {}, popular: { x: 4 } });

    const broken = {
      from: () => ({}),
      rpc: () => Promise.reject(new Error("boom")),
    } as unknown as SupabaseClient;
    expect(await fetchSignals(broken, "canteen")).toEqual(emptySignals());
  });
});
