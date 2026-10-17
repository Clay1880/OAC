import { afterEach, describe, expect, it } from "vitest";
import {
  buildChatContents,
  chat,
  CHAT_FALLBACK_REPLY,
  CHAT_SYSTEM,
  groundingText,
  parseChatReply,
  type ChatGrounding,
} from "./chat";
import { parseChatRequest } from "./request";
import { RULE_CHAT_HELP } from "./ruleChat";
import type { MenuItem } from "@/lib/menu";

const menuItem = (id: string, name: string, price_paise: number, tags: string[]): MenuItem => ({
  id,
  name,
  description: null,
  price_paise,
  category: "Test",
  is_available: true,
  sort: 0,
  tags,
  meal_moments: [],
});

const canteenId = "11111111-1111-1111-1111-111111111111";
const user = (text: string) => ({ role: "user" as const, text });
const model = (text: string) => ({ role: "model" as const, text });

const grounding: ChatGrounding = {
  canteenName: "Main Canteen",
  moment: "lunch",
  slots: ["1:15 PM", "1:30 PM"],
  items: [
    { id: "a", name: "Chai", price_paise: 1500, tags: ["hot", "drink"], category: "Drinks", badges: ["usual"] },
    { id: "b", name: "Dosa", price_paise: 4000, tags: ["veg"], category: "Meals" },
  ],
};

describe("parseChatRequest", () => {
  it("rejects 11 turns", () => {
    const turns = Array.from({ length: 11 }, (_, i) => (i % 2 === 0 ? user("hi") : model("hello")));
    turns[10] = user("last");
    expect(parseChatRequest({ canteenId, turns })).toBeNull();
  });

  it("rejects a last turn from the model", () => {
    expect(parseChatRequest({ canteenId, turns: [user("hi"), model("hello")] })).toBeNull();
  });

  it("rejects no turns, a long turn, a bad role and a missing canteen", () => {
    expect(parseChatRequest({ canteenId, turns: [] })).toBeNull();
    expect(parseChatRequest({ canteenId, turns: [user("x".repeat(301))] })).toBeNull();
    expect(parseChatRequest({ canteenId, turns: [{ role: "system", text: "hi" }] })).toBeNull();
    expect(parseChatRequest({ turns: [user("hi")] })).toBeNull();
  });

  it("accepts a valid body and keeps only role and text", () => {
    expect(parseChatRequest({ canteenId, turns: [{ ...user("hi"), extra: 1 }] })).toEqual({
      canteenId,
      turns: [user("hi")],
    });
  });
});

describe("parseChatReply", () => {
  const allowed = new Set(["a", "b"]);

  it("clamps qty 9 to 5", () => {
    expect(parseChatReply({ reply: "Here", add: [{ id: "a", qty: 9 }] }, allowed)).toEqual({
      reply: "Here",
      add: [{ id: "a", qty: 5 }],
    });
  });

  it("drops a foreign id", () => {
    const out = parseChatReply({ reply: "Here", add: [{ id: "evil", qty: 1 }, { id: "b", qty: 2 }] }, allowed);
    expect(out?.add).toEqual([{ id: "b", qty: 2 }]);
  });

  it("floors fractions, lifts qty below 1, defaults a non-number to 1 and keeps the first of a repeated id", () => {
    const out = parseChatReply(
      { reply: "r", add: [{ id: "a", qty: 0 }, { id: "a", qty: 2.9 }, { id: "b", qty: "3" }] },
      allowed,
    );
    expect(out?.add).toEqual([{ id: "a", qty: 1 }, { id: "b", qty: 1 }]);
  });

  it("proposes at most five lines", () => {
    const ids = new Set(["1", "2", "3", "4", "5", "6", "7"]);
    const add = [...ids].map((id) => ({ id, qty: 1 }));
    expect(parseChatReply({ reply: "r", add }, ids)?.add).toHaveLength(5);
  });

  it("accepts a reply with nothing to add", () => {
    expect(parseChatReply({ reply: "Only food here.", add: [] }, allowed)).toEqual({
      reply: "Only food here.",
      add: [],
    });
  });

  it("returns null for the wrong shape or an empty reply", () => {
    expect(parseChatReply("nope", allowed)).toBeNull();
    expect(parseChatReply({ reply: "  ", add: [] }, allowed)).toBeNull();
    expect(parseChatReply({ reply: "ok" }, allowed)).toBeNull();
    expect(parseChatReply({ reply: "ok", add: "a" }, allowed)).toBeNull();
  });
});

describe("parseChatReply caps", () => {
  const ids = new Set(["a"]);

  it("cuts the reply to 400 characters after trimming", () => {
    const out = parseChatReply({ reply: `  ${"x".repeat(500)}  `, add: [] }, ids);
    expect(out?.reply).toBe("x".repeat(400));
  });

  it("keeps a short reply whole", () => {
    expect(parseChatReply({ reply: "Hi there", add: [] }, ids)?.reply).toBe("Hi there");
  });

  it("treats a blank reply as missing", () => {
    expect(parseChatReply({ reply: "   ", add: [] }, ids)).toBeNull();
  });
});

describe("buildChatContents", () => {
  it("starts with the grounding block and ends with the last user turn", () => {
    const contents = buildChatContents([user("hi"), model("Hello"), user("Something light")], grounding);
    expect(contents[0].role).toBe("user");
    expect(contents[0].parts[0].text).toBe(groundingText(grounding));
    const last = contents[contents.length - 1];
    expect(last).toEqual({ role: "user", parts: [{ text: "Something light" }] });
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("keeps roles alternating when the history starts with a model turn", () => {
    const contents = buildChatContents([model("Hello"), user("Tea?")], grounding);
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(contents[0].parts).toEqual([{ text: groundingText(grounding) }]);
  });
});

describe("groundingText", () => {
  const text = groundingText(grounding);

  it("lists the canteen, the moment, the pickup times and the items", () => {
    expect(text).toContain("Canteen: Main Canteen");
    expect(text).toContain("Meal moment: Lunch break");
    expect(text).toContain("1:15 PM, 1:30 PM");
    const lines = text.split("\n");
    expect(lines.find((l) => l.startsWith("a |"))).toBe("a | Chai | ₹15.00 | hot, drink | usual");
    expect(lines.find((l) => l.startsWith("b |"))).toBe("b | Dosa | ₹40.00 | veg");
  });

  it("says so when no pickup time is left", () => {
    expect(groundingText({ ...grounding, slots: [] })).toMatch(/no pickup times/i);
  });

  it("carries no counts or dates", () => {
    expect(text).not.toMatch(/\d+ times|ordered|\d{4}-\d{2}-\d{2}/i);
  });
});

describe("CHAT_SYSTEM", () => {
  it("keeps the assistant on food and away from claiming an order", () => {
    expect(CHAT_SYSTEM).toMatch(/only about food/i);
    expect(CHAT_SYSTEM).toMatch(/never say an order was placed/i);
  });
});

describe("chat", () => {
  const saved = process.env.GEMINI_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  });
  const input = { turns: [user("Hot and quick")], grounding };

  it("answers by the menu rules, naming the items, when no key is set", async () => {
    process.env.GEMINI_API_KEY = "";
    const out = await chat(input);
    expect(out.source).toBe("rules");
    expect(out.reply).toMatch(/^Here (is|are) /);
    expect(out.add.length).toBeGreaterThan(0);
    for (const line of out.add) expect(line.name).toBe(grounding.items.find((i) => i.id === line.id)?.name);
  });

  it("uses the full menu and signals when the caller passes them", async () => {
    const menu = [{ ...menuItem("m1", "Samosa", 3000, ["veg", "quick"]) }, { ...menuItem("m2", "Thali", 6000, ["veg"]) }];
    const out = await chat({ ...input, turns: [user("under ₹40")], menu }, async () => null);
    expect(out.add).toEqual([{ id: "m1", name: "Samosa", qty: 1 }]);
  });

  it("falls back to the rules when the model call returns nothing valid", async () => {
    const out = await chat(input, async () => null);
    expect(out.source).toBe("rules");
    expect(out.add.length).toBeGreaterThan(0);
  });

  it("falls back to the rules when the model call throws", async () => {
    const out = await chat(input, async () => {
      throw new Error("boom");
    });
    expect(out.source).toBe("rules");
    expect(out.add.length).toBeGreaterThan(0);
  });

  it("gives off-topic text the help reply and nothing to add", async () => {
    const out = await chat({ ...input, turns: [user("write my assignment")] }, async () => null);
    expect(out).toEqual({ reply: RULE_CHAT_HELP, add: [], source: "rules" });
  });

  it("keeps the fixed sentence only as the last resort, when the rules themselves throw", async () => {
    const out = await chat(
      input,
      async () => null,
      () => {
        throw new Error("rules broke");
      },
    );
    expect(out).toEqual({ reply: CHAT_FALLBACK_REPLY, add: [], source: "rules" });
    expect(CHAT_FALLBACK_REPLY).toBe("The assistant is taking a break. Try the mood picker above.");
  });

  it("names added items from the menu, never from the model", async () => {
    const out = await chat(input, async () => ({ reply: "Try this.", add: [{ id: "a", qty: 2 }] }));
    expect(out).toEqual({ reply: "Try this.", add: [{ id: "a", name: "Chai", qty: 2 }], source: "gemini" });
  });
});
