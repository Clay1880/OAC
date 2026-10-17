import { describe, expect, it, vi } from "vitest";
import type { MenuItem } from "@/lib/menu";
import type { Candidate } from "./engine";
import type { SuggestInput } from "./gemini";
import { rulesSuggestion, suggest } from "./suggest";

const item = (id: string, name: string): MenuItem => ({
  id,
  name,
  description: null,
  price_paise: 4000,
  category: "Meals",
  is_available: true,
  sort: 0,
  tags: ["veg"],
  meal_moments: ["lunch"],
});

const candidates: Candidate[] = [
  { item: item("a", "Thali"), score: 7, reasons: ["Good for lunch break", "Fills you up"] },
  { item: item("b", "Chai"), score: 5, reasons: ["Served warm"] },
  { item: item("c", "Samosa"), score: 3, reasons: ["An easy snack"] },
  { item: item("d", "Lassi"), score: 1, reasons: ["On the menu right now"] },
];

const input: SuggestInput = {
  canteenName: "Main Canteen",
  moment: "lunch",
  moods: ["starving"],
  note: "",
  candidates: candidates.map(({ item: i }) => ({
    id: i.id,
    name: i.name,
    price_paise: i.price_paise,
    tags: i.tags,
    category: i.category,
  })),
};

describe("suggest", () => {
  it("falls back to the top three rules picks when Gemini gives nothing", async () => {
    const gemini = vi.fn().mockResolvedValue(null);
    const out = await suggest(input, candidates, gemini);
    expect(gemini).toHaveBeenCalledWith(input);
    expect(out).toEqual({
      source: "rules",
      headline: "Lunch break picks for you",
      picks: [
        { id: "a", reason: "Good for lunch break · Fills you up" },
        { id: "b", reason: "Served warm" },
        { id: "c", reason: "An easy snack" },
      ],
    });
  });

  it("uses the Gemini picks when there are some", async () => {
    const gemini = vi.fn().mockResolvedValue({
      headline: "Fuel up for the afternoon",
      picks: [{ id: "d", reason: "Cool and filling" }],
    });
    const out = await suggest(input, candidates, gemini);
    expect(out).toEqual({
      source: "gemini",
      headline: "Fuel up for the afternoon",
      picks: [{ id: "d", reason: "Cool and filling" }],
    });
  });
});

describe("rulesSuggestion", () => {
  const cand = (id: string, category: string, reasons: string[]): Candidate => ({
    item: { ...item(id, id), category },
    score: 1,
    reasons,
  });
  const ids = (cs: Candidate[]) => rulesSuggestion({ moment: "dinner" }, cs).picks.map((p) => p.id);

  it("prefers distinct categories, walking the ranked list", () => {
    const ranked = [cand("A", "X", ["r"]), cand("B", "X", ["r"]), cand("C", "Y", ["r"]), cand("D", "Z", ["r"])];
    expect(ids(ranked)).toEqual(["A", "C", "D"]);
  });

  it("fills the rest by rank when there are fewer than three categories", () => {
    const one = [cand("A", "X", ["r"]), cand("B", "X", ["r"]), cand("C", "X", ["r"]), cand("D", "X", ["r"])];
    expect(ids(one)).toEqual(["A", "B", "C"]);
    const two = [cand("A", "X", ["r"]), cand("B", "X", ["r"]), cand("C", "Y", ["r"]), cand("D", "X", ["r"])];
    expect(ids(two)).toEqual(["A", "B", "C"]);
  });

  it("shows the first two distinct reasons, or just the one", () => {
    const out = rulesSuggestion({ moment: "dinner" }, [
      cand("A", "X", ["Good for dinner", "Ready fast", "Served warm"]),
      cand("B", "Y", ["Good for dinner"]),
      cand("C", "Z", ["Served warm", "Served warm", "Ready fast"]),
    ]);
    expect(out.picks).toEqual([
      { id: "A", reason: "Good for dinner · Ready fast" },
      { id: "B", reason: "Good for dinner" },
      { id: "C", reason: "Served warm · Ready fast" },
    ]);
  });
});
