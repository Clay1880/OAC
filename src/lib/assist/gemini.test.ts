import { afterEach, describe, expect, it } from "vitest";
import { parsePicks, suggestWithGemini, type SuggestInput } from "./gemini";

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
