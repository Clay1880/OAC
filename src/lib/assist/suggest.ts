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

const RULES_PICKS = 3;

/** Up to three candidates, one per category first (in rank order), then the best of the rest; shown in rank order. */
function variedTop(candidates: Candidate[]): Candidate[] {
  const chosen = new Set<Candidate>();
  const categories = new Set<string>();
  for (const c of candidates) {
    if (chosen.size === RULES_PICKS) break;
    if (categories.has(c.item.category)) continue;
    categories.add(c.item.category);
    chosen.add(c);
  }
  for (const c of candidates) {
    if (chosen.size === RULES_PICKS) break;
    chosen.add(c);
  }
  return candidates.filter((c) => chosen.has(c));
}

/** The rules-engine answer: up to three candidates from different categories, each with its two strongest reasons. */
export function rulesSuggestion(
  input: Pick<SuggestInput, "moment">,
  candidates: Candidate[],
): SuggestResult & { source: "rules" } {
  return {
    source: "rules",
    headline: `${momentLabel(input.moment)} picks for you`,
    picks: variedTop(candidates).map((c) => ({ id: c.item.id, reason: [...new Set(c.reasons)].slice(0, 2).join(" · ") })),
  };
}
