import { NextResponse } from "next/server";
import { chat, chatFallback, type ChatGrounding } from "@/lib/assist/chat";
import { rankCandidates } from "@/lib/assist/engine";
import { mealMoment } from "@/lib/assist/moment";
import { rateLimit } from "@/lib/assist/rateLimit";
import { parseChatRequest } from "@/lib/assist/request";
import { formatSlotTime } from "@/lib/format";
import { MENU_COLUMNS, type MenuItem } from "@/lib/menu";
import { badgesFor, fetchSignals } from "@/lib/signals";
import { campusDayEnd, offeredSlots, seatsLeft, type Slot } from "@/lib/slots";
import { createClient } from "@/lib/supabase/server";
import { studentCanteen } from "@/lib/tenancy/current";

const MAX_ITEMS = 40;
const MAX_SLOTS = 6;

/**
 * Answers a student's message about food, prices and pickup times, and may propose items to add to
 * the cart. Gemini sees only the canteen's menu and open times; without a key, on failure or over
 * the rate limit the student gets a fixed "taking a break" reply, never an error.
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
    return NextResponse.json({ error: "That is not a chat request." }, { status: 400 });
  }
  const req = parseChatRequest(body);
  if (!req) return NextResponse.json({ error: "That is not a chat request." }, { status: 400 });

  const canteen = await studentCanteen(supabase);
  if (!canteen || canteen.id !== req.canteenId) {
    return NextResponse.json({ error: "That is not your canteen." }, { status: 400 });
  }

  // Over the limit: skip the menu and slot queries, there is nothing to ground.
  if (!rateLimit(userId)) return NextResponse.json(chatFallback());

  const now = new Date();
  const [menu, slotRows] = await Promise.all([
    supabase.from("menu_items").select(MENU_COLUMNS).eq("canteen_id", canteen.id).order("sort"),
    supabase
      .from("slots")
      .select("id, starts_at, capacity, booked_count")
      .eq("canteen_id", canteen.id)
      .gt("starts_at", now.toISOString())
      .lt("starts_at", new Date(campusDayEnd(now.getTime())).toISOString())
      .order("starts_at"),
  ]);
  if (menu.error) return NextResponse.json({ error: "Could not load the menu." }, { status: 500 });

  const moment = mealMoment(now.getTime());
  const signals = await fetchSignals(supabase, canteen.id);
  const ranked = rankCandidates((menu.data ?? []) as MenuItem[], {
    moment,
    moods: [],
    vegOnly: false,
    signals,
    limit: MAX_ITEMS,
  });
  const slots = offeredSlots((slotRows.data ?? []) as Slot[], now.getTime(), canteen.order_cutoff_minutes)
    .filter((s) => seatsLeft(s) > 0)
    .slice(0, MAX_SLOTS)
    .map((s) => formatSlotTime(s.starts_at));

  const grounding: ChatGrounding = {
    canteenName: canteen.name,
    moment,
    slots,
    items: ranked.map(({ item }) => ({
      id: item.id,
      name: item.name,
      price_paise: item.price_paise,
      tags: item.tags,
      category: item.category,
      badges: badgesFor(item.id, signals),
    })),
  };

  return NextResponse.json(await chat({ turns: req.turns, grounding }));
}
