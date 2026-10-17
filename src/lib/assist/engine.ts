import type { MenuItem } from "@/lib/menu";
import { topPopularIds, type Signals } from "@/lib/signals";
import { MOODS, type MoodId } from "./moods";
import { momentLabel, type MealMoment } from "./moment";

export type Candidate = { item: MenuItem; score: number; reasons: string[] };

const MAX_CANDIDATES = 12;
const MAX_REASONS = 3;

const TAG_REASONS: Record<string, string> = {
  hot: "Served warm",
  quick: "Ready fast",
  light: "Light on the stomach",
  filling: "Fills you up",
  sweet: "A little sweet",
  drink: "Something to sip",
  cold: "Nice and cold",
  spicy: "Has a kick",
  meal: "A proper meal",
  snack: "An easy snack",
  heavy: "Hearty",
};

/**
 * Rules-engine ranking. Drops unavailable items (and non-veg when `vegOnly`), then scores
 * 3 per moment match + 2 per wanted tag - 2 per avoided tag. With `signals`: +2 for an item the
 * student has ordered before (+1 more from three orders) and +1 for a top-5 campus favourite.
 * Best first, ties by menu order. Keeps the top 12, or `limit` when given.
 */
export function rankCandidates(
  items: MenuItem[],
  ctx: { moment: MealMoment; moods: MoodId[]; vegOnly: boolean; signals?: Signals; limit?: number },
): Candidate[] {
  const picked = MOODS.filter((m) => ctx.moods.includes(m.id));
  const wants = new Set(picked.flatMap((m) => m.wants));
  const avoids = new Set(picked.flatMap((m) => m.avoids));

  const topPopular = new Set(ctx.signals ? topPopularIds(ctx.signals) : []);

  const ranked: Candidate[] = [];
  for (const item of items) {
    if (!item.is_available) continue;
    if (ctx.vegOnly && !item.tags.includes("veg")) continue;

    let score = 0;
    const reasons: string[] = [];
    if (item.meal_moments.includes(ctx.moment)) {
      score += 3;
      reasons.push(`Good for ${momentLabel(ctx.moment).toLowerCase()}`);
    }
    for (const tag of item.tags) {
      if (wants.has(tag)) {
        score += 2;
        const phrase = TAG_REASONS[tag];
        if (phrase) reasons.push(phrase);
      }
      if (avoids.has(tag)) score -= 2;
    }
    // Personal and campus signals lead, so they survive the three-reason cap.
    const lead: string[] = [];
    const had = ctx.signals?.usual[item.id] ?? 0;
    if (had > 0) {
      score += had >= 3 ? 3 : 2;
      lead.push("You've had this before");
    }
    if (topPopular.has(item.id)) {
      score += 1;
      lead.push("Popular here");
    }
    reasons.unshift(...lead);
    if (reasons.length === 0) reasons.push("On the menu right now");
    ranked.push({ item, score, reasons: reasons.slice(0, MAX_REASONS) });
  }

  ranked.sort((a, b) => b.score - a.score || a.item.sort - b.item.sort);
  return ranked.slice(0, ctx.limit ?? MAX_CANDIDATES);
}
