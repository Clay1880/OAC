/**
 * Prepare the app for a presentation.
 *
 *   npx tsx scripts/seed-demo.ts
 *
 * Creates (or resets) a demo student, staff and admin account with a known password, and opens
 * pickup slots (every 5 minutes) for the rest of today, so the whole flow can be shown without the OTP email.
 * Safe to run repeatedly; run it again right before presenting to get fresh slots. Local use only:
 * it uses the service-role key, and the demo student sign-in is off unless DEMO_LOGIN=true.
 *
 * Sign-in:  student at /demo-login, staff at /staff-login, admin at /staff-login.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const PASSWORD = "oac-demo-123";
const SLOT_CAPACITY = 10;
const SLOT_STEP_MIN = 5;
const MIN_LEAD_MIN = 15;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Account = {
  loginId: string;
  domain: string;
  role: "student" | "staff" | "admin";
  fullName: string;
  phone: string | null;
  regNo: string | null;
};

const ACCOUNTS: Account[] = [
  { loginId: "demo.student", domain: "staff.oac.local", role: "student", fullName: "Demo Student", phone: "9876543210", regNo: "DEMO0001" },
  { loginId: "demo.staff", domain: "staff.oac.local", role: "staff", fullName: "Demo Counter Staff", phone: null, regNo: null },
  { loginId: "demo.admin", domain: "staff.oac.local", role: "admin", fullName: "Demo Admin", phone: null, regNo: null },
];

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}

type Tenant = { collegeId: string; canteenId: string };

/** The backfilled college (ait-pune) and its canteen (oac). */
async function findTenant(admin: SupabaseClient): Promise<Tenant> {
  const { data: college, error } = await admin.from("colleges").select("id").eq("slug", "ait-pune").single();
  if (error || !college) throw new Error("College ait-pune not found. Run the database migrations first.");
  const { data: canteen, error: canteenError } = await admin
    .from("canteens")
    .select("id")
    .eq("college_id", college.id)
    .eq("slug", "oac")
    .single();
  if (canteenError || !canteen) throw new Error("Canteen oac not found. Run the database migrations first.");
  return { collegeId: college.id, canteenId: canteen.id };
}

async function upsertAccount(admin: SupabaseClient, account: Account, tenant: Tenant) {
  const email = `${account.loginId}@${account.domain}`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { provisioned: true }, // lets it past the college-email guard
  });
  let user = created.data.user;
  if (!user) {
    const existing = await findUserByEmail(admin, email);
    if (!existing) throw created.error ?? new Error(`Could not create ${email}`);
    const updated = await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { ...existing.app_metadata, provisioned: true },
    });
    if (updated.error || !updated.data.user) throw updated.error ?? new Error(`Could not update ${email}`);
    user = updated.data.user;
  }

  const { error } = await admin.from("profiles").upsert(
    {
      id: user.id,
      full_name: account.fullName,
      phone: account.phone,
      reg_no: account.regNo,
      role: account.role,
      is_active: true,
      is_defaulter: false,
      must_change_password: false,
      college_id: tenant.collegeId,
    },
    { onConflict: "id" },
  );
  if (error) throw error;

  if (account.role === "staff") {
    const { error: memberError } = await admin
      .from("canteen_members")
      .upsert({ user_id: user.id, canteen_id: tenant.canteenId, role: "staff" }, { onConflict: "user_id,canteen_id" });
    if (memberError) throw memberError;
  }
}

/** Slots every 5 minutes from now until campus midnight, so a rerun reuses the same rows. */
async function openSlots(admin: SupabaseClient, canteenId: string) {
  const now = Date.now();
  const dayEnd = Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS - IST_OFFSET_MS;
  const step = SLOT_STEP_MIN * 60_000;
  const rows: { canteen_id: string; starts_at: string; capacity: number }[] = [];
  for (let t = Math.ceil((now + MIN_LEAD_MIN * 60_000) / step) * step; t < dayEnd; t += step) {
    rows.push({ canteen_id: canteenId, starts_at: new Date(t).toISOString(), capacity: SLOT_CAPACITY });
  }
  if (rows.length === 0) return 0;
  const { error } = await admin.from("slots").upsert(rows, { onConflict: "canteen_id,starts_at", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: rely on the real environment.
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (environment or .env.local).");
    process.exit(1);
  }
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const tenant = await findTenant(admin);
  for (const account of ACCOUNTS) await upsertAccount(admin, account, tenant);
  const slots = await openSlots(admin, tenant.canteenId);

  console.log("Demo accounts ready (password for all: " + PASSWORD + ")");
  console.log("  Student  /demo-login   ID: demo.student");
  console.log("  Staff    /staff-login  ID: demo.staff");
  console.log("  Admin    /staff-login  ID: demo.admin");
  console.log(slots === 0 ? "No slots added: it is too late in the day. Add some in the admin console." : `Slots open for the rest of today: ${slots}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
