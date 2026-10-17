import { applyMenuView } from "@/lib/menuFilter";
import type { MenuItem } from "@/lib/menu";
import type { Signals } from "@/lib/signals";
import { rankCandidates } from "./engine";
import { momentLabel, type MealMoment } from "./moment";
import type { MoodId } from "./moods";

export type RuleChatContext = { moment: MealMoment; items: MenuItem[]; signals?: Signals };
export type RuleChatResult = { reply: string; add: { id: string; qty: number }[] };

const PICKS = 3;
const CHEAP_RUPEES = 40;
export const RULE_CHAT_HELP = "Tell me a mood, a budget or what you feel like, for example “something light under ₹50”.";

/** Keyword → mood and the word the reply uses for it. A mood stays once however many keywords hit. */
const MOOD_WORDS: { re: RegExp; mood: MoodId; word: string }[] = [
  { re: /\btired\b/, mood: "tired", word: "pick-me-up" },
  { re: /\bstress/, mood: "stressed", word: "comforting" },
  { re: /\b(hungry|starving)\b/, mood: "starving", word: "filling" },
  { re: /\blight\b/, mood: "light", word: "light" },
  { re: /\b(hot|warm)\b/, mood: "tired", word: "warm" },
  { re: /\b(quick|fast|hurry)\b/, mood: "quick", word: "quick" },
  { re: /\b(cold|chilly)\b/, mood: "cold", word: "warming" },
  { re: /\b(treat|sweet)/, mood: "treat", word: "sweet" },
];

const MEAL_WORDS: { re: RegExp; moment: MealMoment }[] = [
  { re: /\bbreakfast\b/, moment: "breakfast" },
  { re: /\blunch\b/, moment: "lunch" },
  { re: /\bsnacks?\b/, moment: "snack" },
  { re: /\bdinner\b/, moment: "dinner" },
];

const CAP = /(?:under|below|less than|within|<)\s*(?:₹|rs\.?|inr)?\s*(\d+)/;

/**
 * Answers a chat message without a model: reads a price cap, a diet, moods and a meal word out of
 * the text, ranks the available menu with the rules engine and proposes up to three items.
 * Text with none of those gets the help reply and no items. Pure.
 */
export function ruleChat(text: string, ctx: RuleChatContext): RuleChatResult {
  const t = text.toLowerCase();

  const capMatch = CAP.exec(t);
  const capRupees = capMatch ? Number(capMatch[1]) : /\bcheap\b/.test(t) ? CHEAP_RUPEES : null;
  const nonVeg = /\bnon[\s-]?veg\b/.test(t);
  const vegOnly = !nonVeg && /\b(veg|vegetarian)\b/.test(t);
  const moods: MoodId[] = [];
  const words: string[] = [];
  for (const m of MOOD_WORDS) {
    if (!m.re.test(t)) continue;
    if (!moods.includes(m.mood)) moods.push(m.mood);
    if (!words.includes(m.word)) words.push(m.word);
  }
  const meal = MEAL_WORDS.find((m) => m.re.test(t));

  if (capRupees === null && !nonVeg && !vegOnly && moods.length === 0 && !meal) {
    return { reply: RULE_CHAT_HELP, add: [] };
  }

  const capLabel = capRupees === null ? "" : ` under ₹${capRupees}`;
  const available = ctx.items.filter((i) => i.is_available);
  const inRange = applyMenuView(available, {
    query: "",
    category: null,
    maxPaise: capRupees === null ? null : capRupees * 100,
    sort: "default",
  });
  if (capRupees !== null && inRange.length === 0) {
    return { reply: `Nothing on the menu is under ₹${capRupees} right now.`, add: [] };
  }

  const pool = nonVeg ? inRange.filter((i) => !i.tags.includes("veg")) : inRange;
  const moment = meal?.moment ?? ctx.moment;
  const ranked = rankCandidates(pool, { moment, moods, vegOnly, signals: ctx.signals, limit: PICKS });
  if (ranked.length === 0) {
    return { reply: `I could not find a match${capLabel} right now. Try a different mood or budget.`, add: [] };
  }

  const kind = [vegOnly ? "veg" : nonVeg ? "non-veg" : "", ...words].filter(Boolean).join(", ");
  const noun = ranked.length === 1 ? "pick" : "picks";
  const when = meal ? ` for ${momentLabel(moment).toLowerCase()}` : "";
  const count = ranked.length === 1 ? "one" : String(ranked.length);
  return {
    reply: `Here ${ranked.length === 1 ? "is" : "are"} ${count} ${kind ? `${kind} ` : ""}${noun}${when}${capLabel}.`,
    add: ranked.map(({ item }) => ({ id: item.id, qty: 1 })),
  };
}
