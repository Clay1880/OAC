import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * The presentation accounts and today's pickup slots. Shared by scripts/seed-demo.ts (run by hand)
 * and the demo sign-in (which creates them on first use when the host sets DEMO_PASSWORD).
 * Every function takes the service-role client: callers decide whether that is allowed.
 */

export type DemoAccount = {
  loginId: string;
  role: "student" | "staff" | "admin";
  fullName: string;
  phone: string | null;
  regNo: string | null;
};

/** Login IDs map to `<id>@staff.oac.local`, the reserved domain the sign-up guard lets provisioned users through. */
export const DEMO_LOGIN_DOMAIN = "staff.oac.local";

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { loginId: "demo.student", role: "student", fullName: "Demo Student", phone: "9876543210", regNo: "DEMO0001" },
  { loginId: "demo.staff", role: "staff", fullName: "Demo Counter Staff", phone: null, regNo: null },
  { loginId: "demo.admin", role: "admin", fullName: "Demo Admin", phone: null, regNo: null },
];

export type DemoTenant = { collegeId: string; canteenId: string };

const SLOT_CAPACITY = 10;
const SLOT_STEP_MIN = 5;
const MIN_LEAD_MIN = 15;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function findUserByEmail(service: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}

/** The backfilled college (ait-pune) and its canteen (oac). */
export async function findDemoTenant(service: SupabaseClient): Promise<DemoTenant> {
  const { data: college, error } = await service.from("colleges").select("id").eq("slug", "ait-pune").single();
  if (error || !college) throw new Error("College ait-pune not found. Run the database migrations first.");
  const { data: canteen, error: canteenError } = await service
    .from("canteens")
    .select("id")
    .eq("college_id", college.id)
    .eq("slug", "oac")
    .single();
  if (canteenError || !canteen) throw new Error("Canteen oac not found. Run the database migrations first.");
  return { collegeId: college.id, canteenId: canteen.id };
}

/** Creates the account, or resets its password and re-asserts its profile. Safe to repeat. */
export async function upsertDemoAccount(
  service: SupabaseClient,
  account: DemoAccount,
  tenant: DemoTenant,
  password: string,
): Promise<void> {
  const email = `${account.loginId}@${DEMO_LOGIN_DOMAIN}`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { provisioned: true }, // lets it past the college-email guard
  });
  let user = created.data.user;
  if (!user) {
    const existing = await findUserByEmail(service, email);
    if (!existing) throw created.error ?? new Error(`Could not create ${email}`);
    const updated = await service.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      app_metadata: { ...existing.app_metadata, provisioned: true },
    });
    if (updated.error || !updated.data.user) throw updated.error ?? new Error(`Could not update ${email}`);
    user = updated.data.user;
  }

  const { error } = await service.from("profiles").upsert(
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
    const { error: memberError } = await service
      .from("canteen_members")
      .upsert({ user_id: user.id, canteen_id: tenant.canteenId, role: "staff" }, { onConflict: "user_id,canteen_id" });
    if (memberError) throw memberError;
  }
}

/** Slots every 5 minutes from now until campus midnight; a rerun reuses the same rows. Returns rows offered. */
export async function openTodaySlots(service: SupabaseClient, canteenId: string, nowMs = Date.now()): Promise<number> {
  const dayEnd = Math.floor((nowMs + IST_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS - IST_OFFSET_MS;
  const step = SLOT_STEP_MIN * 60_000;
  const rows: { canteen_id: string; starts_at: string; capacity: number }[] = [];
  for (let t = Math.ceil((nowMs + MIN_LEAD_MIN * 60_000) / step) * step; t < dayEnd; t += step) {
    rows.push({ canteen_id: canteenId, starts_at: new Date(t).toISOString(), capacity: SLOT_CAPACITY });
  }
  if (rows.length === 0) return 0;
  const { error } = await service.from("slots").upsert(rows, { onConflict: "canteen_id,starts_at", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

/** Creates or resets the demo accounts (admin only when asked) and opens today's slots. */
export async function provisionDemo(
  service: SupabaseClient,
  options: { password: string; withAdmin: boolean },
): Promise<{ accounts: string[]; slots: number }> {
  const tenant = await findDemoTenant(service);
  const accounts = DEMO_ACCOUNTS.filter((a) => a.role !== "admin" || options.withAdmin);
  for (const account of accounts) await upsertDemoAccount(service, account, tenant, options.password);
  const slots = await openTodaySlots(service, tenant.canteenId);
  return { accounts: accounts.map((a) => a.loginId), slots };
}
