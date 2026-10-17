import type { SupabaseClient } from "@supabase/supabase-js";

/** True when the signed-in caller's own profile has the student role. False on any error or no profile. */
export async function isStudent(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    return !error && data?.role === "student";
  } catch {
    return false;
  }
}
