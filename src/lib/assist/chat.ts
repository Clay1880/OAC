import "server-only";
import { GoogleGenAI } from "@google/genai";
import { candidateLine, type SuggestInput } from "./gemini";
import { momentLabel, type MealMoment } from "./moment";
import type { ChatTurn } from "./request";

export type { ChatTurn };

/** What the model may talk about: the canteen, the moment, the next pickup times and the menu. Nothing about the student. */
export type ChatGrounding = {
  canteenName: string;
  moment: MealMoment;
  items: SuggestInput["candidates"];
  /** Display strings for the next open pickup times, soonest first. */
  slots: string[];
};

export type ChatLine = { id: string; qty: number };
export type ChatReply = { reply: string; add: ChatLine[] };
export type ChatContent = { role: "user" | "model"; parts: { text: string }[] };

export const CHAT_FALLBACK_REPLY = "The assistant is taking a break. Try the mood picker above.";

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_LINES = 5;
const MAX_QTY = 5;
const MAX_REPLY = 400;

export const CHAT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    add: {
      type: "array",
      maxItems: MAX_LINES,
      items: {
        type: "object",
        properties: { id: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: MAX_QTY } },
        required: ["id", "qty"],
      },
    },
  },
  required: ["reply", "add"],
};

export const CHAT_SYSTEM = [
  "You are the canteen's assistant for this campus. Talk only about food, the menu, prices and pickup timing.",
  "The first message lists today's menu with ids, and the next open pickup times. Use only that list.",
  "Reply in the language the student writes in, in at most two sentences.",
  "When the student asks for food, propose items in `add` using only ids from the menu list, with a quantity.",
  "Never say an order was placed or paid: the student places the order themselves at checkout.",
  "If asked about anything else, politely say you can only help with the canteen, and leave `add` empty.",
].join("\n");

/** Plain-text grounding block: canteen, moment, next pickup times, then one line per available item. */
export function groundingText(g: ChatGrounding): string {
  return [
    `Canteen: ${g.canteenName}`,
    `Meal moment: ${momentLabel(g.moment)}`,
    g.slots.length > 0 ? `Next pickup times today: ${g.slots.join(", ")}` : "No pickup times are open today.",
    "Menu (id | name | price | tags | badges, when any):",
    ...g.items.map(candidateLine),
  ].join("\n");
}

/**
 * Contents for a stateless `generateContent` call: the grounding block is the first user part, then
 * the turns. A leading user turn shares the first content so roles keep alternating.
 */
export function buildChatContents(turns: ChatTurn[], grounding: ChatGrounding): ChatContent[] {
  const block = { text: groundingText(grounding) };
  const [first, ...rest] = turns;
  if (first?.role === "user") {
    return [{ role: "user", parts: [block, { text: first.text }] }, ...rest.map(toContent)];
  }
  return [{ role: "user", parts: [block] }, ...turns.map(toContent)];
}

const toContent = (t: ChatTurn): ChatContent => ({ role: t.role, parts: [{ text: t.text }] });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Validates model output: `{ reply, add: [{ id, qty }] }`. Drops ids that are not on the menu list
 * and repeats, clamps qty to 1..5, keeps at most five lines. Null when the shape is wrong or the reply is empty.
 */
export function parseChatReply(raw: unknown, allowedIds: Set<string>): ChatReply | null {
  if (!isRecord(raw) || typeof raw.reply !== "string" || !Array.isArray(raw.add)) return null;
  const reply = raw.reply.trim().slice(0, MAX_REPLY).trim();
  if (reply === "") return null;
  const add: ChatLine[] = [];
  const seen = new Set<string>();
  for (const line of raw.add) {
    if (!isRecord(line) || typeof line.id !== "string") continue;
    if (!allowedIds.has(line.id) || seen.has(line.id)) continue;
    seen.add(line.id);
    const qty = typeof line.qty === "number" && Number.isFinite(line.qty) ? Math.floor(line.qty) : 1;
    add.push({ id: line.id, qty: Math.min(MAX_QTY, Math.max(1, qty)) });
    if (add.length === MAX_LINES) break;
  }
  return { reply, add };
}

/**
 * Asks Gemini to answer the conversation. Returns null when no key is configured, on any error, on
 * timeout, or when the output does not validate, so the caller falls back.
 */
export async function chatWithGemini(
  input: { turns: ChatTurn[]; grounding: ChatGrounding },
  opts: { timeoutMs?: number } = {},
): Promise<ChatReply | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const call = ai.models.generateContent({
      model,
      contents: buildChatContents(input.turns, input.grounding),
      config: {
        systemInstruction: CHAT_SYSTEM,
        responseMimeType: "application/json",
        responseJsonSchema: CHAT_SCHEMA,
      },
    });
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    });
    const response = await Promise.race([call, timeout]);
    if (!response?.text) return null;
    return parseChatReply(JSON.parse(response.text), new Set(input.grounding.items.map((i) => i.id)));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type ChatResult = {
  reply: string;
  add: { id: string; name: string; qty: number }[];
  source: "gemini" | "rules";
};

/** The answer when the assistant cannot give one: no key, an error, a timeout, bad JSON or the rate limit. */
export const chatFallback = (): ChatResult => ({ reply: CHAT_FALLBACK_REPLY, add: [], source: "rules" });

/** Gemini's reply with item names taken from the menu list, or the fixed fallback. Never throws. */
export async function chat(
  input: { turns: ChatTurn[]; grounding: ChatGrounding },
  gemini: (input: { turns: ChatTurn[]; grounding: ChatGrounding }) => Promise<ChatReply | null> = chatWithGemini,
): Promise<ChatResult> {
  let fromModel: ChatReply | null = null;
  try {
    fromModel = await gemini(input);
  } catch {
    return chatFallback();
  }
  if (!fromModel) return chatFallback();
  const names = new Map(input.grounding.items.map((i) => [i.id, i.name]));
  const add = fromModel.add.flatMap((l) => {
    const name = names.get(l.id);
    return name ? [{ id: l.id, name, qty: l.qty }] : [];
  });
  return { reply: fromModel.reply, add, source: "gemini" };
}
