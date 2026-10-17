import type { MenuItem } from "@/lib/menu";
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
 * 3 per moment match + 2 per wanted tag - 2 per avoided tag. Best first, ties by menu order.
 */
export function rankCandidates(
  items: MenuItem[],
  ctx: { moment: MealMoment; moods: MoodId[]; vegOnly: boolean },
): Candidate[] {
  const picked = MOODS.filter((m) => ctx.moods.includes(m.id));
  const wants = new Set(picked.flatMap((m) => m.wants));
  const avoids = new Set(picked.flatMap((m) => m.avoids));

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
    if (reasons.length === 0) reasons.push("On the menu right now");
    ranked.push({ item, score, reasons: reasons.slice(0, MAX_REASONS) });
  }

  ranked.sort((a, b) => b.score - a.score || a.item.sort - b.item.sort);
  return ranked.slice(0, MAX_CANDIDATES);
}
