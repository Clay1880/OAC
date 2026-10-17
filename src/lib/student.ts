import { createClient } from "@/lib/supabase/server";

/** Whether the signed-in student is blocked from ordering until they pay at the counter. */
export async function isDefaulter(): Promise<boolean> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return false;
  const { data } = await supabase.from("profiles").select("is_defaulter").eq("id", userId).maybeSingle();
  return data?.is_defaulter ?? false;
}
