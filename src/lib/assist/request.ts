import { MOODS, type MoodId } from "./moods";

export type SuggestRequest = { canteenId: string; moods: MoodId[]; note: string; vegOnly: boolean };

const MAX_NOTE = 300;
const MOOD_IDS = new Set<string>(MOODS.map((m) => m.id));

const isMood = (value: unknown): value is MoodId => typeof value === "string" && MOOD_IDS.has(value);

/** Validates the suggest request body. Unknown mood ids or a note over 300 characters → null. */
export function parseSuggestRequest(body: unknown): SuggestRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { canteenId, moods = [], note = "", vegOnly = false } = body as Record<string, unknown>;
  if (typeof canteenId !== "string" || canteenId.trim() === "") return null;
  if (!Array.isArray(moods) || !moods.every(isMood)) return null;
  if (typeof note !== "string" || note.length > MAX_NOTE) return null;
  if (typeof vegOnly !== "boolean") return null;
  return { canteenId, moods: [...new Set(moods)], note, vegOnly };
}

export type ChatTurn = { role: "user" | "model"; text: string };
export type ChatRequest = { canteenId: string; turns: ChatTurn[] };

const MAX_TURNS = 10;
const MAX_TURN_TEXT = 300;

/** Validates the chat request body: 1..10 turns of at most 300 characters, the last one from the user. */
export function parseChatRequest(body: unknown): ChatRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { canteenId, turns } = body as Record<string, unknown>;
  if (typeof canteenId !== "string" || canteenId.trim() === "") return null;
  if (!Array.isArray(turns) || turns.length < 1 || turns.length > MAX_TURNS) return null;
  const clean: ChatTurn[] = [];
  for (const t of turns) {
    if (typeof t !== "object" || t === null) return null;
    const { role, text } = t as Record<string, unknown>;
    if (role !== "user" && role !== "model") return null;
    if (typeof text !== "string" || text.trim() === "" || text.length > MAX_TURN_TEXT) return null;
    clean.push({ role, text });
  }
  if (clean[clean.length - 1].role !== "user") return null;
  return { canteenId, turns: clean };
}
