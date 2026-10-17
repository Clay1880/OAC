import { GoogleGenAI } from "@google/genai";
import { momentLabel, type MealMoment } from "./moment";
import { MOODS, type MoodId } from "./moods";

export type SuggestInput = {
  canteenName: string;
  moment: MealMoment;
  moods: MoodId[];
  note: string;
  candidates: {
    id: string;
    name: string;
    price_paise: number;
    tags: string[];
    category: string;
    /** Derived flags only: the student's usual, or popular on campus. Never counts, dates or order contents. */
    badges?: ("usual" | "popular")[];
  }[];
};
export type Pick = { id: string; reason: string };
export type SuggestResult = { headline: string; picks: Pick[] };

const DEFAULT_TIMEOUT_MS = 4000;
const MAX_PICKS = 3;

export const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    picks: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: { id: { type: "string" }, reason: { type: "string" } },
        required: ["id", "reason"],
      },
    },
  },
  required: ["headline", "picks"],
};

export const SUGGEST_SYSTEM = [
  "You are the canteen's assistant, helping a college student choose what to eat right now.",
  "Pick up to 3 items, using only ids from the candidate list. Never invent an id or an item.",
  "Give one short reason for each pick, in the user's language.",
  "Write a headline of at most 60 characters.",
].join("\n");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Validates model output: `{ headline, picks: [{ id, reason }] }`. Drops picks whose id is not a
 * candidate, keeps the model's order, and returns null when the shape is wrong or nothing survives.
 */
export function parsePicks(raw: unknown, allowedIds: Set<string>): SuggestResult | null {
  if (!isRecord(raw) || typeof raw.headline !== "string" || !Array.isArray(raw.picks)) return null;
  const picks: Pick[] = [];
  const seen = new Set<string>();
  for (const p of raw.picks) {
    if (!isRecord(p) || typeof p.id !== "string" || typeof p.reason !== "string") continue;
    if (!allowedIds.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    picks.push({ id: p.id, reason: p.reason });
    if (picks.length === MAX_PICKS) break;
  }
  const headline = raw.headline.trim();
  if (picks.length === 0 || headline === "") return null;
  return { headline, picks };
}

/** Compact prompt: the canteen, the moment, the moods, the note and the candidates. Nothing about the student beyond plain badge tags. */
export function promptFor(input: SuggestInput): string {
  const moods = MOODS.filter((m) => input.moods.includes(m.id)).map((m) => m.label);
  const lines = input.candidates.map(
    (c) =>
      `${c.id} | ${c.name} | ₹${(c.price_paise / 100).toFixed(2)} | ${c.tags.join(", ")}` +
      (c.badges?.length ? ` | ${c.badges.join(", ")}` : ""),
  );
  return [
    `Canteen: ${input.canteenName}`,
    `Meal moment: ${momentLabel(input.moment)}`,
    `Moods: ${moods.length > 0 ? moods.join(", ") : "none given"}`,
    `Note: ${input.note.trim() || "none"}`,
    "Candidates (id | name | price | tags | badges, when any):",
    ...lines,
  ].join("\n");
}

/**
 * Asks Gemini to pick from the candidates. Returns null when no key is configured, on any error,
 * on timeout, or when the output does not validate, so the caller falls back to the rules engine.
 */
export async function suggestWithGemini(
  input: SuggestInput,
  opts: { timeoutMs?: number } = {},
): Promise<SuggestResult | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || input.candidates.length === 0) return null;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const call = ai.models.generateContent({
      model,
      contents: promptFor(input),
      config: {
        systemInstruction: SUGGEST_SYSTEM,
        responseMimeType: "application/json",
        responseJsonSchema: SUGGEST_SCHEMA,
      },
    });
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    });
    const response = await Promise.race([call, timeout]);
    if (!response?.text) return null;
    return parsePicks(JSON.parse(response.text), new Set(input.candidates.map((c) => c.id)));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
