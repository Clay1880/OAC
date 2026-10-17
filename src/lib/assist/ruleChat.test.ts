import { describe, expect, it } from "vitest";
import type { MenuItem } from "@/lib/menu";
import { ruleChat } from "./ruleChat";

let n = 0;
const item = (name: string, price: number, tags: string[], moments: string[] = [], over: Partial<MenuItem> = {}): MenuItem => ({
  id: `id-${++n}`,
  name,
  description: null,
  price_paise: price * 100,
  category: "Test",
  is_available: true,
  sort: n,
  tags,
  meal_moments: moments,
  ...over,
});

// Seeded names and prices.
const tea = item("Tea", 12, ["veg", "hot", "drink", "quick"], ["snack"]);
const samosa = item("Samosa", 30, ["veg", "hot", "quick", "snack"], ["snack"]);
const dhokla = item("Dhokla", 20, ["veg", "light", "snack"], ["lunch"]);
const pavBhaji = item("Pav Bhaji", 50, ["veg", "hot", "filling", "meal"], ["lunch"]);
const thali = item("Daily Lunch Thali", 60, ["veg", "hot", "filling", "meal"], ["lunch"]);
const chickenRoll = item("Chicken Roll", 60, ["non-veg", "quick", "filling"], ["lunch"]);
const coldCoffee = item("Cold Coffee", 30, ["veg", "cold", "drink", "sweet"], []);
const halwa = item("Gajar ka Halwa", 35, ["veg", "sweet", "hot"], ["lunch"]);
const gone = item("Chicken Burger", 80, ["non-veg", "hot"], ["lunch"], { is_available: false });
const items = [tea, samosa, dhokla, pavBhaji, thali, chickenRoll, coldCoffee, halwa, gone];
const byId = new Map(items.map((i) => [i.id, i]));
const picked = (out: { add: { id: string }[] }) => out.add.map((l) => byId.get(l.id)!);

const ctx = { moment: "lunch" as const, items };
const HELP = "Tell me a mood, a budget or what you feel like, for example “something light under ₹50”.";

describe("ruleChat price caps", () => {
  it("answers 'What's under ₹50?' with items strictly under ₹50, one of each, quantity 1", () => {
    const out = ruleChat("What's under ₹50?", ctx);
    expect(out.add.length).toBeGreaterThan(0);
    expect(out.add.length).toBeLessThanOrEqual(3);
    for (const p of picked(out)) expect(p.price_paise).toBeLessThan(5000);
    expect(out.add.every((l) => l.qty === 1)).toBe(true);
    expect(out.reply).toContain("under ₹50");
  });

  it.each(["below Rs 50", "less than 50", "<50", "within ₹ 50", "under rs.50"])("reads the cap in %s", (text) => {
    const out = ruleChat(`snacks ${text}`, ctx);
    expect(out.add.length).toBeGreaterThan(0);
    for (const p of picked(out)) expect(p.price_paise).toBeLessThan(5000);
  });

  it("treats 'cheap' as under ₹40", () => {
    const out = ruleChat("something cheap", ctx);
    expect(out.add.length).toBeGreaterThan(0);
    for (const p of picked(out)) expect(p.price_paise).toBeLessThan(4000);
    expect(out.reply).toContain("under ₹40");
  });

  it("says so plainly when nothing is under the cap", () => {
    expect(ruleChat("anything under ₹5", ctx)).toEqual({
      reply: "Nothing on the menu is under ₹5 right now.",
      add: [],
    });
  });

  it("never offers a sold-out item", () => {
    const out = ruleChat("hot under ₹100", ctx);
    expect(out.add.map((l) => l.id)).not.toContain(gone.id);
  });
});

describe("ruleChat moods and diet", () => {
  it("answers 'Hot and quick' with items tagged hot or quick", () => {
    const out = ruleChat("Hot and quick", ctx);
    expect(out.add).toHaveLength(3);
    for (const p of picked(out)) expect(p.tags.some((t) => t === "hot" || t === "quick")).toBe(true);
    expect(out.reply).toMatch(/quick/);
  });

  it("reads moods by keyword", () => {
    expect(picked(ruleChat("I feel light today", ctx))[0].name).toBe("Dhokla");
    expect(picked(ruleChat("treat me, something sweet", ctx))[0].tags).toContain("sweet");
    expect(picked(ruleChat("starving!", ctx))[0].tags).toContain("filling");
  });

  it("keeps veg lunch under ₹40 veg, cheap and in the lunch moment", () => {
    const out = ruleChat("veg lunch under ₹40", { ...ctx, moment: "dinner" });
    expect(out.add.length).toBeGreaterThan(0);
    for (const p of picked(out)) {
      expect(p.tags).toContain("veg");
      expect(p.price_paise).toBeLessThan(4000);
    }
    expect(picked(out)[0].name).toBe("Dhokla"); // the only lunch item in range: the meal word beat ctx.moment
    expect(out.reply).toContain("lunch");
  });

  it("does not treat 'non veg' as veg only", () => {
    const out = ruleChat("non veg please", ctx);
    expect(picked(out).map((p) => p.name)).toEqual(["Chicken Roll"]);
    const nonVeg = ruleChat("non-veg lunch", ctx);
    for (const p of picked(nonVeg)) expect(p.tags).not.toContain("veg");
  });
});

describe("ruleChat when it understands nothing", () => {
  it("gives the help reply and no items for off-topic text", () => {
    expect(ruleChat("write my assignment", ctx)).toEqual({ reply: HELP, add: [] });
    expect(ruleChat("", ctx)).toEqual({ reply: HELP, add: [] });
  });

  it("never says an order was placed", () => {
    for (const text of ["hot and quick", "under ₹50", "write my assignment", "under ₹5"]) {
      expect(ruleChat(text, ctx).reply).not.toMatch(/placed|ordered|paid/i);
    }
  });
});
