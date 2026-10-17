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
