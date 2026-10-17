import type { Candidate } from "./engine";
import { suggestWithGemini, type SuggestInput, type SuggestResult } from "./gemini";
import { momentLabel } from "./moment";

/** Gemini's picks when it answers with valid ones, otherwise the rules engine's top three. */
export async function suggest(
  input: SuggestInput,
  candidates: Candidate[],
  gemini: (input: SuggestInput) => Promise<SuggestResult | null> = suggestWithGemini,
): Promise<SuggestResult & { source: "gemini" | "rules" }> {
  const fromModel = await gemini(input);
  if (fromModel) return { ...fromModel, source: "gemini" };
  return rulesSuggestion(input, candidates);
}

/** The rules-engine answer: top three candidates, each with its strongest reason. */
export function rulesSuggestion(
  input: Pick<SuggestInput, "moment">,
  candidates: Candidate[],
): SuggestResult & { source: "rules" } {
  return {
    source: "rules",
    headline: `${momentLabel(input.moment)} picks for you`,
    picks: candidates.slice(0, 3).map((c) => ({ id: c.item.id, reason: c.reasons[0] })),
  };
}
