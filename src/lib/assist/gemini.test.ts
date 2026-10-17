import { afterEach, describe, expect, it } from "vitest";
import { parsePicks, promptFor, suggestWithGemini, type SuggestInput } from "./gemini";

const allowed = new Set(["a", "b", "c"]);

describe("parsePicks", () => {
  it("drops a pick whose id is not in the candidate list", () => {
    const out = parsePicks(
      {
        headline: "Lunch picks",
        picks: [
          { id: "a", reason: "Warm" },
          { id: "evil", reason: "Not on the menu" },
        ],
      },
      allowed,
    );
    expect(out).toEqual({ headline: "Lunch picks", picks: [{ id: "a", reason: "Warm" }] });
  });

  it("returns null for a string body", () => {
    expect(parsePicks("not json", allowed)).toBeNull();
  });

  it("returns null when no pick survives", () => {
    expect(parsePicks({ headline: "h", picks: [{ id: "x", reason: "r" }] }, allowed)).toBeNull();
  });

  it("keeps the order the model gave", () => {
    const out = parsePicks(
      {
        headline: "h",
        picks: [
          { id: "c", reason: "3" },
          { id: "a", reason: "1" },
          { id: "b", reason: "2" },
        ],
      },
      allowed,
    );
    expect(out?.picks.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
});

describe("parsePicks caps", () => {
  it("trims a reason and cuts it to 200 characters, and the headline to 80", () => {
    const out = parsePicks(
      { headline: `  ${"h".repeat(100)}  `, picks: [{ id: "a", reason: `  ${"r".repeat(300)} ` }] },
      allowed,
    );
    expect(out?.headline).toBe("h".repeat(80));
    expect(out?.picks[0].reason).toBe("r".repeat(200));
  });

  it("drops a pick whose reason is empty after trimming", () => {
    const out = parsePicks(
      {
        headline: "h",
        picks: [
          { id: "a", reason: "   " },
          { id: "b", reason: "Warm" },
        ],
      },
      allowed,
    );
    expect(out?.picks).toEqual([{ id: "b", reason: "Warm" }]);
    expect(parsePicks({ headline: "h", picks: [{ id: "a", reason: " " }] }, allowed)).toBeNull();
  });
});

describe("suggestWithGemini", () => {
  const saved = process.env.GEMINI_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  });

  it("returns null without calling out when no key is set", async () => {
    process.env.GEMINI_API_KEY = "";
    const input: SuggestInput = {
      canteenName: "Main Canteen",
      moment: "lunch",
      moods: ["tired"],
      note: "",
      candidates: [{ id: "a", name: "Chai", price_paise: 1500, tags: ["hot", "drink"], category: "Drinks" }],
    };
    expect(await suggestWithGemini(input)).toBeNull();
  });
});

describe("promptFor", () => {
  const input: SuggestInput = {
    canteenName: "Main Canteen",
    moment: "lunch",
    moods: [],
    note: "",
    candidates: [
      { id: "a", name: "Chai", price_paise: 1500, tags: ["hot", "drink"], category: "Drinks", badges: ["usual", "popular"] },
      { id: "b", name: "Dosa", price_paise: 4000, tags: ["veg"], category: "Meals" },
    ],
  };

  it("writes badges as plain tags after the tags", () => {
    const lines = promptFor(input).split("\n");
    expect(lines.find((l) => l.startsWith("a |"))).toBe("a | Chai | ₹15.00 | hot, drink | usual, popular");
    expect(lines.find((l) => l.startsWith("b |"))).toBe("b | Dosa | ₹40.00 | veg");
  });

  it("carries no counts or dates", () => {
    expect(promptFor(input)).not.toMatch(/\d+ times|ordered|\d{4}-\d{2}-\d{2}/i);
  });
});
