import { randomInt, randomUUID } from "node:crypto";
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

type College = { id: string; domain: string };
type Canteen = { id: string; college_id: string; code_prefix: string };

const PASSWORD = "test-password-123";

// ---------------------------------------------------------------------------
// Colleges and canteens
// ---------------------------------------------------------------------------

let seededCollegePromise: Promise<College> | undefined;
let seededCanteenPromise: Promise<{ id: string; code_prefix: string }> | undefined;
let defaultCanteenPromise: Promise<Canteen> | undefined;

/** The college the 0008 migration backfilled (slug `ait-pune`) and its seeded email domain. */
export function seededCollege(): Promise<College> {
  seededCollegePromise ??= (async () => {
    const { data: college, error } = await admin.from("colleges").select("id").eq("slug", "ait-pune").single();
    if (error) throw new Error(`seeded college: ${error.message}`);
    const { data: domain, error: domainError } = await admin
      .from("college_domains")
      .select("domain")
      .eq("college_id", college.id)
      .order("domain")
      .limit(1)
      .single();
    if (domainError) throw new Error(`seeded college domain: ${domainError.message}`);
    return { id: college.id, domain: domain.domain };
  })();
  return seededCollegePromise;
}

/** The backfilled Open Area Canteen (slug `oac`) of the seeded college. */
export function seededCanteen(): Promise<{ id: string; code_prefix: string }> {
  seededCanteenPromise ??= (async () => {
    const college = await seededCollege();
    const { data, error } = await admin
      .from("canteens")
      .select("id, code_prefix")
      .eq("college_id", college.id)
      .eq("slug", "oac")
      .single();
    if (error) throw new Error(`seeded canteen: ${error.message}`);
    return data;
  })();
  return seededCanteenPromise;
}

/** A new college with one email domain, `<slug>.test`. */
export async function createCollege(): Promise<College> {
  const slug = `c-${randomUUID().slice(0, 8)}`;
  const { data, error } = await admin
    .from("colleges")
    .insert({ name: `College ${slug}`, slug })
    .select("id")
    .single();
  if (error) throw new Error(`college: ${error.message}`);
  const domain = `${slug}.test`;
  const { error: domainError } = await admin.from("college_domains").insert({ domain, college_id: data.id });
  if (domainError) throw new Error(`college domain: ${domainError.message}`);
  return { id: data.id, domain };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A new canteen (approved unless told otherwise) in `collegeId`, default the seeded college. */
export async function createCanteen(
  fields: { collegeId?: string; status?: "pending" | "approved" | "suspended" } = {},
): Promise<Canteen> {
  const collegeId = fields.collegeId ?? (await seededCollege()).id;
  // Prefixes are unique per college and only 26^3 exist: on a collision, draw again.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = `k-${randomUUID().slice(0, 8)}`;
    const codePrefix = Array.from({ length: 3 }, () => LETTERS[randomInt(LETTERS.length)]).join("");
    const { data, error } = await admin
      .from("canteens")
      .insert({
        college_id: collegeId,
        name: `Canteen ${slug}`,
        slug,
        code_prefix: codePrefix,
        status: fields.status ?? "approved",
      })
      .select("id, college_id, code_prefix")
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw new Error(`canteen: ${error.message}`);
  }
  throw new Error("canteen: no free code prefix found");
}

/** One approved canteen per test file, created on first use: the default for every helper below. */
export function defaultCanteen(): Promise<Canteen> {
  defaultCanteenPromise ??= createCanteen();
  return defaultCanteenPromise;
}

async function collegeOfCanteen(canteenId: string): Promise<string> {
  const { data, error } = await admin.from("canteens").select("college_id").eq("id", canteenId).single();
  if (error) throw new Error(`canteen college: ${error.message}`);
  return data.college_id;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Creates a provisioned auth user plus profile, and returns a client signed in as them.
 * The profile's college is `opts.collegeId`, else the college of `opts.canteenId`, else the
 * default canteen's. A `staff` user also becomes a member of `opts.canteenId` (default: the
 * default canteen) with rank `opts.canteenRole` (default `staff`).
 */
export async function createUser(
  role: "student" | "staff" | "admin" = "student",
  opts: { canteenId?: string; canteenRole?: "staff" | "owner"; collegeId?: string } = {},
): Promise<TestUser> {
  const email = `t-${randomUUID()}@staff.oac.local`; // reserved domain: allowed through the insert guard, verified provisioned at commit
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { provisioned: true },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const id = data.user.id;

  const collegeId =
    opts.collegeId ??
    (opts.canteenId ? await collegeOfCanteen(opts.canteenId) : (await defaultCanteen()).college_id);

  const suffix = id.slice(0, 8);
  const { error: profileError } = await admin.from("profiles").insert({
    id,
    full_name: `Test ${suffix}`,
    role,
    college_id: collegeId,
    phone: role === "student" ? "9876543210" : null,
    reg_no: role === "student" ? `REG-${suffix}` : null,
  });
  if (profileError) throw new Error(`profile: ${profileError.message}`);

  if (role === "staff") {
    const { error: memberError } = await admin.from("canteen_members").insert({
      user_id: id,
      canteen_id: opts.canteenId ?? (await defaultCanteen()).id,
      role: opts.canteenRole ?? "staff",
    });
    if (memberError) throw new Error(`membership: ${memberError.message}`);
  }

  const client = createClient(URL, ANON_KEY, clientOptions);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return { id, client };
}

/** A signed-in client for an auth user that has no profile yet (a student mid-onboarding). */
export async function createUserWithoutProfile(): Promise<TestUser> {
  const email = `t-${randomUUID()}@${(await seededCollege()).domain}`;
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

// ---------------------------------------------------------------------------
// Menu, slots, counts
// ---------------------------------------------------------------------------

export async function createMenuItem(
  fields: { name?: string; price_paise?: number; is_available?: boolean; canteen_id?: string } = {},
): Promise<{ id: string; price_paise: number; name: string }> {
  const row = {
    canteen_id: fields.canteen_id ?? (await defaultCanteen()).id,
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
 * Slot in `canteenId` (default: the default canteen) starting `minutesFromNow` minutes from now
 * (test machine clock; the DB clock is what decides).
 * Students choose a pickup time on a clock, so two slots of one canteen in the same minute would be
 * ambiguous: a start that is already taken moves on a minute at a time.
 */
export async function createSlot(
  minutesFromNow: number,
  capacity: number,
  canteenId?: string,
): Promise<{ id: string; starts_at: string }> {
  const canteen = canteenId ?? (await defaultCanteen()).id;
  // Parallel workers all ask for "30 minutes from now", so far-off slots start a few minutes apart.
  // Near-term and past slots keep their exact offset: they exist to test the cutoff.
  const spread = minutesFromNow >= 20 ? Math.floor(Math.random() * 20) : 0;
  for (let attempt = spread; attempt < spread + 120; attempt += 1) {
    // Sub-5s jitter keeps (canteen_id, starts_at) distinct without moving a slot across the cutoff.
    const startsAt = new Date(Date.now() + (minutesFromNow + attempt) * 60_000 + Math.floor(Math.random() * 5_000));
    const minuteStart = new Date(Math.floor(startsAt.getTime() / 60_000) * 60_000);
    // Cutoff tests (near-term and past slots) need their exact offset, so only far-off slots dodge each other.
    const { count } = minutesFromNow < 20 ? { count: 0 } : await admin
      .from("slots")
      .select("id", { count: "exact", head: true })
      .eq("canteen_id", canteen)
      .gte("starts_at", minuteStart.toISOString())
      .lt("starts_at", new Date(minuteStart.getTime() + 60_000).toISOString());
    if (count) continue;

    const { data, error } = await admin
      .from("slots")
      .insert({ canteen_id: canteen, starts_at: startsAt.toISOString(), capacity })
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
