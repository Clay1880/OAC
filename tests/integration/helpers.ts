import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Local `supabase start` demo values (public, not secrets). Override via env for other stacks.
export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin: SupabaseClient = createClient(URL, SERVICE_KEY, clientOptions);

export type TestUser = { id: string; client: SupabaseClient };

const PASSWORD = "test-password-123";

/** Creates a provisioned auth user plus profile, and returns a client signed in as them. */
export async function createUser(role: "student" | "staff" | "admin" = "student"): Promise<TestUser> {
  const email = `t-${randomUUID()}@staff.oac.local`; // reserved domain: allowed through the insert guard, verified provisioned at commit
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { provisioned: true },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const id = data.user.id;

  const suffix = id.slice(0, 8);
  const { error: profileError } = await admin.from("profiles").insert({
    id,
    full_name: `Test ${suffix}`,
    role,
    phone: role === "student" ? "9876543210" : null,
    reg_no: role === "student" ? `REG-${suffix}` : null,
  });
  if (profileError) throw new Error(`profile: ${profileError.message}`);

  const client = createClient(URL, ANON_KEY, clientOptions);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return { id, client };
}

export async function createMenuItem(
  fields: { name?: string; price_paise?: number; is_available?: boolean } = {},
): Promise<{ id: string; price_paise: number; name: string }> {
  const row = {
    name: fields.name ?? `Item ${randomUUID().slice(0, 6)}`,
    price_paise: fields.price_paise ?? 1000,
    category: "Test",
    is_available: fields.is_available ?? true,
  };
  const { data, error } = await admin.from("menu_items").insert(row).select().single();
  if (error) throw new Error(`menu item: ${error.message}`);
  return data;
}

/**
 * Slot starting `minutesFromNow` minutes from now (test machine clock; the DB clock is what decides).
 * Students choose a pickup time on a clock, so two slots in the same minute would be ambiguous:
 * a start that is already taken moves on a minute at a time.
 */
export async function createSlot(minutesFromNow: number, capacity: number): Promise<{ id: string; starts_at: string }> {
  // Parallel workers all ask for "30 minutes from now", so far-off slots start a few minutes apart.
  // Near-term and past slots keep their exact offset: they exist to test the cutoff.
  const spread = minutesFromNow >= 20 ? Math.floor(Math.random() * 20) : 0;
  for (let attempt = spread; attempt < spread + 120; attempt += 1) {
    // Sub-5s jitter keeps starts_at (unique) distinct without moving a slot across the cutoff.
    const startsAt = new Date(Date.now() + (minutesFromNow + attempt) * 60_000 + Math.floor(Math.random() * 5_000));
    const minuteStart = new Date(Math.floor(startsAt.getTime() / 60_000) * 60_000);
    // Cutoff tests (near-term and past slots) need their exact offset, so only far-off slots dodge each other.
    const { count } = minutesFromNow < 20 ? { count: 0 } : await admin
      .from("slots")
      .select("id", { count: "exact", head: true })
      .gte("starts_at", minuteStart.toISOString())
      .lt("starts_at", new Date(minuteStart.getTime() + 60_000).toISOString());
    if (count) continue;

    const { data, error } = await admin
      .from("slots")
      .insert({ starts_at: startsAt.toISOString(), capacity })
      .select("id, starts_at")
      .single();
    if (error) throw new Error(`slot: ${error.message}`);
    return data;
  }
  throw new Error("slot: no free minute found");
}

export async function bookedCount(slotId: string): Promise<number> {
  const { data, error } = await admin.from("slots").select("booked_count").eq("id", slotId).single();
  if (error) throw new Error(error.message);
  return data.booked_count;
}

export async function orderCount(slotId: string): Promise<number> {
  const { count, error } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", slotId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** A signed-in client for an auth user that has no profile yet (a student mid-onboarding). */
export async function createUserWithoutProfile(): Promise<TestUser> {
  const email = `t-${randomUUID()}@staff.oac.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { provisioned: true },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const client = createClient(URL, ANON_KEY, clientOptions);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return { id: data.user.id, client };
}
