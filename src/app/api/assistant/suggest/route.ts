import { NextResponse } from "next/server";
import { rankCandidates } from "@/lib/assist/engine";
import type { SuggestInput } from "@/lib/assist/gemini";
import { mealMoment } from "@/lib/assist/moment";
import { rateLimit } from "@/lib/assist/rateLimit";
import { parseSuggestRequest } from "@/lib/assist/request";
import { rulesSuggestion, suggest } from "@/lib/assist/suggest";
import { MENU_COLUMNS, type MenuItem } from "@/lib/menu";
import { createClient } from "@/lib/supabase/server";
import { studentCanteen } from "@/lib/tenancy/current";

/**
 * Suggests up to three menu items for the signed-in student's mood and meal moment. Gemini picks
 * from the rules engine's candidates; without a key, on failure, or over the rate limit the rules
 * engine answers on its own.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That is not a suggestion request." }, { status: 400 });
  }
  const req = parseSuggestRequest(body);
  if (!req) return NextResponse.json({ error: "That is not a suggestion request." }, { status: 400 });

  const canteen = await studentCanteen(supabase);
  if (!canteen || canteen.id !== req.canteenId) {
    return NextResponse.json({ error: "That is not your canteen." }, { status: 400 });
  }

  const { data: rows, error } = await supabase
    .from("menu_items")
    .select(MENU_COLUMNS)
    .eq("canteen_id", canteen.id)
    .order("sort");
  if (error) return NextResponse.json({ error: "Could not load the menu." }, { status: 500 });
  const items = (rows ?? []) as MenuItem[];

  const moment = mealMoment(Date.now());
  const candidates = rankCandidates(items, { moment, moods: req.moods, vegOnly: req.vegOnly });
  const input: SuggestInput = {
    canteenName: canteen.name,
    moment,
    moods: req.moods,
    note: req.note,
    candidates: candidates.map(({ item }) => ({
      id: item.id,
      name: item.name,
      price_paise: item.price_paise,
      tags: item.tags,
      category: item.category,
    })),
  };

  const result = rateLimit(userId) ? await suggest(input, candidates) : rulesSuggestion(input, candidates);

  const byId = new Map(candidates.map((c) => [c.item.id, c.item]));
  const picks = result.picks.flatMap((p) => {
    const item = byId.get(p.id);
    return item ? [{ id: item.id, name: item.name, price_paise: item.price_paise, reason: p.reason }] : [];
  });

  return NextResponse.json({ moment, headline: result.headline, picks, source: result.source });
}
