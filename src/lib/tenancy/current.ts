import type { SupabaseClient } from "@supabase/supabase-js";
import { CANTEEN_COLUMNS, type Canteen } from "./types";

function byCreatedAt(a: Canteen, b: Canteen): number {
  return Date.parse(a.created_at) - Date.parse(b.created_at);
}

/** The approved canteen created first, or null when none is approved. */
export function pickDefaultCanteen(canteens: Canteen[]): Canteen | null {
  return canteens.filter((c) => c.status === "approved").sort(byCreatedAt)[0] ?? null;
}

/** The canteen a student orders from. RLS already limits students to approved canteens in their college. */
export async function studentCanteen(supabase: SupabaseClient): Promise<Canteen | null> {
  const { data } = await supabase.from("canteens").select(CANTEEN_COLUMNS);
  return pickDefaultCanteen((data ?? []) as Canteen[]);
}

/**
 * The canteen the signed-in staff member or admin works on: their oldest membership, or for a
 * college admin without memberships, the oldest canteen they can see whatever its status.
 */
export async function consoleCanteen(supabase: SupabaseClient): Promise<Canteen | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: members } = await supabase
    .from("canteen_members")
    .select(`canteens(${CANTEEN_COLUMNS})`)
    .eq("user_id", user.id);
  const owned = ((members ?? []) as unknown as { canteens: Canteen | null }[])
    .map((m) => m.canteens)
    .filter((c): c is Canteen => c !== null)
    .sort(byCreatedAt);
  if (owned.length > 0) return owned[0];

  const { data } = await supabase.from("canteens").select(CANTEEN_COLUMNS);
  return ((data ?? []) as Canteen[]).sort(byCreatedAt)[0] ?? null;
}
