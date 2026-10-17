import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The signed-in user's id if, and only if, they are an active admin. Server actions that use the
 * service-role client must call this first: the service role bypasses every database rule, so this
 * check is the only thing standing between a student and a staff-management action.
 */
export async function adminCallerId(supabase: SupabaseClient): Promise<string | null> {
  // getUser asks the auth server instead of trusting the cookie's contents.
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  return profile?.role === "admin" && profile.is_active ? data.user.id : null;
}
