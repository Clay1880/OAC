import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The signed-in user's id and college if, and only if, they are an active admin. Server actions that
 * use the service-role client must call this first and keep every lookup and write inside
 * `collegeId`: the service role bypasses every database rule, so this check is the only thing
 * standing between a student (or another college's admin) and a staff-management action.
 */
export async function adminCaller(supabase: SupabaseClient): Promise<{ id: string; collegeId: string } | null> {
  // getUser asks the auth server instead of trusting the cookie's contents.
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, college_id")
    .eq("id", data.user.id)
    .maybeSingle();

  return profile?.role === "admin" && profile.is_active && profile.college_id
    ? { id: data.user.id, collegeId: profile.college_id as string }
    : null;
}

/** The active admin's id, or null. For callers that only need the yes/no (e.g. the admin layout). */
export async function adminCallerId(supabase: SupabaseClient): Promise<string | null> {
  return (await adminCaller(supabase))?.id ?? null;
}
