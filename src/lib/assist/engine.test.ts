import { describe, expect, it } from "vitest";
import type { MenuItem } from "@/lib/menu";
import { rankCandidates } from "./engine";

let n = 0;
const item = (over: Partial<MenuItem> & { name: string }): MenuItem => ({
  id: `id-${++n}`,
  description: null,
  price_paise: 5000,
  category: "Test",
  is_available: true,
  sort: n,
  tags: ["veg"],
  meal_moments: [],
  ...over,
});

const ctx = { moment: "lunch" as const, moods: [], vegOnly: false };

describe("rankCandidates", () => {
  it("never returns an unavailable item", () => {
    const out = rankCandidates(
      [
        item({ name: "Gone", is_available: false, meal_moments: ["lunch"] }),
        item({ name: "Here", meal_moments: ["lunch"] }),
      ],
      ctx,
    );
    expect(out.map((c) => c.item.name)).toEqual(["Here"]);
  });

  it("drops anything not tagged veg when vegOnly", () => {
    const out = rankCandidates(
      [
        item({ name: "Biryani", tags: ["non-veg", "heavy"], meal_moments: ["lunch"] }),
        item({ name: "Omelette", tags: ["egg"], meal_moments: ["lunch"] }),
        item({ name: "Thali", tags: ["veg"], meal_moments: ["lunch"] }),
      ],
      { ...ctx, vegOnly: true },
    );
    expect(out.map((c) => c.item.name)).toEqual(["Thali"]);
  });

  it("ranks a filling lunch item above a light snack for lunch + starving", () => {
    const out = rankCandidates(
      [
        item({ name: "Dhokla", tags: ["veg", "light"], meal_moments: ["snack"] }),
        item({ name: "Thali", tags: ["veg", "filling", "meal"], meal_moments: ["lunch"] }),
      ],
      { ...ctx, moods: ["starving"] },
    );
    expect(out[0].item.name).toBe("Thali");
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it("gives every candidate at least one reason", () => {
    const out = rankCandidates(
      [
        item({ name: "A", tags: ["veg", "hot", "quick"], meal_moments: ["lunch"] }),
        item({ name: "B", tags: ["veg"], meal_moments: [] }),
        item({ name: "C", tags: ["veg", "light"], meal_moments: ["snack"] }),
      ],
      { ...ctx, moods: ["tired"] },
    );
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) {
      expect(c.reasons.length).toBeGreaterThanOrEqual(1);
      expect(c.reasons.length).toBeLessThanOrEqual(3);
    }
    expect(out.find((c) => c.item.name === "A")!.reasons).toContain("Good for lunch break");
  });

  it("returns at most 12, ties broken by sort", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      item({ name: `I${i}`, sort: 100 - i, meal_moments: ["lunch"] }),
    );
    const out = rankCandidates(items, ctx);
    expect(out).toHaveLength(12);
    expect(out[0].item.sort).toBeLessThan(out[11].item.sort);
    expect(out.map((c) => c.item.sort)).toEqual([...out.map((c) => c.item.sort)].sort((a, b) => a - b));
  });

  it("subtracts for avoided tags", () => {
    const out = rankCandidates(
      [
        item({ name: "Heavy", tags: ["veg", "heavy"], meal_moments: ["lunch"], sort: 1 }),
        item({ name: "Light", tags: ["veg", "light"], meal_moments: ["lunch"], sort: 2 }),
      ],
      { ...ctx, moods: ["light"] },
    );
    expect(out[0].item.name).toBe("Light");
    expect(out.find((c) => c.item.name === "Heavy")!.score).toBe(1);
  });

  describe("signals", () => {
    const a = item({ name: "Plain A", tags: ["veg", "hot"], meal_moments: ["lunch"], sort: 1 });
    const b = item({ name: "Plain B", tags: ["veg", "hot"], meal_moments: ["lunch"], sort: 2 });

    it("ranks an item had three times above an identical one, with the reason", () => {
      const out = rankCandidates([a, b], { ...ctx, signals: { usual: { [b.id]: 3 }, popular: {} } });
      expect(out[0].item.id).toBe(b.id);
      expect(out[0].reasons).toContain("You've had this before");
      expect(out[0].score - out[1].score).toBe(3);
      expect(out[1].reasons).not.toContain("You've had this before");
    });

    it("gives +2 for a single past order", () => {
      const out = rankCandidates([a, b], { ...ctx, signals: { usual: { [b.id]: 1 }, popular: {} } });
      expect(out[0].item.id).toBe(b.id);
      expect(out[0].score - out[1].score).toBe(2);
    });

    it("gives +1 and the reason to an item among the top five popular", () => {
      const out = rankCandidates([a, b], { ...ctx, signals: { usual: {}, popular: { [b.id]: 4 } } });
      expect(out[0].item.id).toBe(b.id);
      expect(out[0].reasons).toContain("Popular here");
      expect(out[0].score - out[1].score).toBe(1);

      // Sixth place in popularity earns nothing.
      const filler = Array.from({ length: 5 }, (_, i) => item({ name: `F${i}`, tags: ["veg"], sort: 10 + i }));
      const popular = { [b.id]: 4, ...Object.fromEntries(filler.map((f, i) => [f.id, 100 - i])) };
      const sixth = rankCandidates([a, b, ...filler], { ...ctx, signals: { usual: {}, popular } });
      expect(sixth.find((c) => c.item.id === b.id)!.reasons).not.toContain("Popular here");
    });

    it("keeps reasons at three or fewer", () => {
      const rich = item({ name: "Rich", tags: ["veg", "hot", "quick", "filling"], meal_moments: ["lunch"] });
      const out = rankCandidates([rich], {
        ...ctx,
        moods: ["starving"],
        signals: { usual: { [rich.id]: 5 }, popular: { [rich.id]: 9 } },
      });
      expect(out[0].reasons.length).toBeLessThanOrEqual(3);
      expect(out[0].reasons).toContain("You've had this before");
    });

    it("behaves as before without signals", () => {
      const out = rankCandidates([a, b], ctx);
      expect(out.map((c) => c.item.name)).toEqual(["Plain A", "Plain B"]);
    });
  });
});
