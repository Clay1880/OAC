import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { DEMO_LOGIN_DOMAIN, findDemoTenant, openTodaySlots, provisionDemo } from "../../src/lib/demo/accounts";
import { LOCAL_DEMO_PASSWORD } from "../../src/lib/demoSeedConfig";
import { admin, URL } from "./helpers";

const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const TEST_PASSWORD = "demo-provision-test-pw";

async function canSignIn(loginId: string, password: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: `${loginId}@${DEMO_LOGIN_DOMAIN}`, password });
  if (data.session) await client.auth.signOut();
  return !error && !!data.user;
}

describe("provisionDemo", () => {
  // The demo accounts are shared with the local dev server: put them back the way seed-demo leaves them.
  afterAll(async () => {
    await provisionDemo(admin, { password: LOCAL_DEMO_PASSWORD, withAdmin: true });
  });

  it("creates demo.student and demo.staff with the given password, a staff membership, and today's slots; repeats are safe", async () => {
    const first = await provisionDemo(admin, { password: TEST_PASSWORD, withAdmin: false });
    expect(first.accounts).toEqual(["demo.student", "demo.staff"]);

    expect(await canSignIn("demo.student", TEST_PASSWORD)).toBe(true);
    expect(await canSignIn("demo.staff", TEST_PASSWORD)).toBe(true);
    expect(await canSignIn("demo.student", "not-the-password")).toBe(false);

    const tenant = await findDemoTenant(admin);
    const { data: staffProfile } = await admin.from("profiles").select("id, role, college_id").eq("full_name", "Demo Counter Staff").single();
    expect(staffProfile).toMatchObject({ role: "staff", college_id: tenant.collegeId });
    const { data: membership } = await admin
      .from("canteen_members")
      .select("role")
      .eq("user_id", staffProfile!.id)
      .eq("canteen_id", tenant.canteenId)
      .single();
    expect(membership).toEqual({ role: "staff" });

    const slotsBefore = await admin.from("slots").select("id", { count: "exact", head: true }).eq("canteen_id", tenant.canteenId);
    const second = await provisionDemo(admin, { password: TEST_PASSWORD, withAdmin: false });
    const slotsAfter = await admin.from("slots").select("id", { count: "exact", head: true }).eq("canteen_id", tenant.canteenId);
    expect(second.accounts).toEqual(first.accounts);
    expect(slotsAfter.count).toBe(slotsBefore.count); // same rows reused, none duplicated
  }, 60_000);

  it("opens slots every 5 minutes from 15 minutes ahead until campus midnight, and none when the day is over", async () => {
    const tenant = await findDemoTenant(admin);
    // 10:00 IST on a day far in the future, so nothing else in the suite has touched those slots.
    const morning = Date.UTC(2099, 0, 5, 4, 30);
    const offered = await openTodaySlots(admin, tenant.canteenId, morning);
    expect(offered).toBe(((24 - 10) * 60 - 15) / 5);
    expect(await openTodaySlots(admin, tenant.canteenId, morning)).toBe(offered); // idempotent: same rows

    const { count } = await admin
      .from("slots")
      .select("id", { count: "exact", head: true })
      .eq("canteen_id", tenant.canteenId)
      .gte("starts_at", new Date(morning).toISOString())
      .lt("starts_at", new Date(Date.UTC(2099, 0, 5, 18, 30)).toISOString());
    expect(count).toBe(offered);

    const lateNight = Date.UTC(2099, 0, 6, 18, 20); // 23:50 IST: less than 15 minutes left
    expect(await openTodaySlots(admin, tenant.canteenId, lateNight)).toBe(0);
  }, 60_000);
});
