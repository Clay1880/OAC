import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { adminCaller, adminCallerId } from "../../src/lib/admin/guard";
import { generateTemporaryPassword, provisionStaff, resetStaffPassword, setStaffActive } from "../../src/lib/admin/staff";
import {
  admin,
  createCanteen,
  createCollege,
  createMenuItem,
  createSlot,
  createUser,
  defaultCanteen,
} from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const newId = () => `cs${randomUUID().slice(0, 8)}`;

/** The college of the default canteen: the caller's college in the same-college cases. */
const homeCollege = async () => (await defaultCanteen()).college_id;

async function signIn(loginId: string, password: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: `${loginId}@staff.oac.local`, password });
  return { client, error };
}

describe("generateTemporaryPassword", () => {
  it("is long, readable (no look-alike characters) and different each time", () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();

    expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe("provisionStaff", () => {
  it("creates a staff login that signs in with the temporary password and must change it", async () => {
    const loginId = newId();

    const result = await provisionStaff(admin, { loginId, fullName: "Ravi Kumar", canteenId: (await defaultCanteen()).id, callerCollegeId: await homeCollege() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loginId).toBe(loginId);
    const { client, error } = await signIn(loginId, result.temporaryPassword);
    expect(error).toBeNull();
    const { data: profile } = await client.from("profiles").select("role, must_change_password, is_active, full_name, phone, reg_no").single();
    expect(profile).toEqual({ role: "staff", must_change_password: true, is_active: true, full_name: "Ravi Kumar", phone: null, reg_no: null });
    const { data: user } = await admin.auth.admin.getUserById(result.userId);
    expect(user.user?.app_metadata.provisioned).toBe(true);
  });

  it("normalises the login ID to lower case", async () => {
    const loginId = newId();

    const result = await provisionStaff(admin, { loginId: ` ${loginId.toUpperCase()} `, fullName: "Ravi", canteenId: (await defaultCanteen()).id, callerCollegeId: await homeCollege() });

    expect(result.ok && result.loginId).toBe(loginId);
  });

  it("rejects a taken ID with ID_TAKEN and leaves the first account alone", async () => {
    const loginId = newId();
    const first = await provisionStaff(admin, { loginId, fullName: "First", canteenId: (await defaultCanteen()).id, callerCollegeId: await homeCollege() });
    expect(first.ok).toBe(true);

    const second = await provisionStaff(admin, { loginId, fullName: "Second", canteenId: (await defaultCanteen()).id, callerCollegeId: await homeCollege() });

    expect(second).toEqual({ ok: false, error: "ID_TAKEN" });
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("full_name", "Second");
    expect(count).toBe(0);
  });

  it.each(["ab", "has space", "bad@char", "-leading", "x".repeat(33), ""])("rejects the ID %j with INVALID_ID", async (loginId) => {
    expect(await provisionStaff(admin, { loginId, fullName: "Ravi", canteenId: (await defaultCanteen()).id, callerCollegeId: await homeCollege() })).toEqual({ ok: false, error: "INVALID_ID" });
  });

  it("rejects an empty name", async () => {
    expect(await provisionStaff(admin, { loginId: newId(), fullName: "   ", canteenId: (await defaultCanteen()).id, callerCollegeId: await homeCollege() })).toEqual({ ok: false, error: "INVALID_NAME" });
  });
});

describe("resetStaffPassword", () => {
  it("issues a new temporary password, invalidates the old one and forces a change again", async () => {
    const loginId = newId();
    const created = await provisionStaff(admin, { loginId, fullName: "Ravi", canteenId: (await defaultCanteen()).id, callerCollegeId: await homeCollege() });
    if (!created.ok) throw new Error("setup");
    await admin.from("profiles").update({ must_change_password: false }).eq("id", created.userId);

    const reset = await resetStaffPassword(admin, created.userId, await homeCollege());

    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.temporaryPassword).not.toBe(created.temporaryPassword);
    expect((await signIn(loginId, created.temporaryPassword)).error).not.toBeNull();
    expect((await signIn(loginId, reset.temporaryPassword)).error).toBeNull();
    const { data } = await admin.from("profiles").select("must_change_password").eq("id", created.userId).single();
    expect(data?.must_change_password).toBe(true);
  });

  it("refuses to reset students and admins", async () => {
    const student = await createUser();
    const boss = await createUser("admin");

    expect(await resetStaffPassword(admin, student.id, await homeCollege())).toEqual({ ok: false, error: "NOT_STAFF" });
    expect(await resetStaffPassword(admin, boss.id, await homeCollege())).toEqual({ ok: false, error: "NOT_STAFF" });
  });
});

describe("setStaffActive", () => {
  it("deactivating cuts off a session that is already signed in, and reactivating restores it", async () => {
    const loginId = newId();
    const created = await provisionStaff(admin, { loginId, fullName: "Ravi", canteenId: (await defaultCanteen()).id, callerCollegeId: await homeCollege() });
    if (!created.ok) throw new Error("setup");
    const { client } = await signIn(loginId, created.temporaryPassword);
    const student = await createUser();
    const item = await createMenuItem();
    const slot = await createSlot(60, 5);
    const placed = await student.client.rpc("place_order", {
      p_canteen_id: (await defaultCanteen()).id,
      p_slot_id: slot.id,
      p_items: [{ menu_item_id: item.id, qty: 1 }],
      p_request_id: randomUUID(),
    });
    const orderId = (placed.data as { id: string }).id;

    expect(await setStaffActive(admin, created.userId, false, await homeCollege())).toEqual({ ok: true });
    const blocked = await client.rpc("accept_order", { p_order_id: orderId });
    expect(blocked.error?.message).toBe("FORBIDDEN");

    expect(await setStaffActive(admin, created.userId, true, await homeCollege())).toEqual({ ok: true });
    const allowed = await client.rpc("accept_order", { p_order_id: orderId });
    expect(allowed.error).toBeNull();
  });

  it("only applies to staff accounts", async () => {
    const student = await createUser();
    const boss = await createUser("admin");

    expect(await setStaffActive(admin, student.id, false, await homeCollege())).toEqual({ ok: false });
    expect(await setStaffActive(admin, boss.id, false, await homeCollege())).toEqual({ ok: false });
    const { data } = await admin.from("profiles").select("is_active").in("id", [student.id, boss.id]);
    expect(data?.every((p) => p.is_active)).toBe(true);
  });
});

describe("the caller's college is the boundary", () => {
  /** College A (the default canteen's) with a fresh canteen, and an unrelated college B. */
  async function twoColleges() {
    const canteenA = await createCanteen({ collegeId: await homeCollege() });
    const collegeB = await createCollege();
    return { canteenA, collegeA: canteenA.college_id, collegeB: collegeB.id };
  }

  async function membersOf(canteenId: string) {
    const { count } = await admin
      .from("canteen_members")
      .select("user_id", { count: "exact", head: true })
      .eq("canteen_id", canteenId);
    return count;
  }

  it("an admin of college B cannot create a staff login in college A's canteen", async () => {
    const { canteenA, collegeA, collegeB } = await twoColleges();
    const loginId = newId();
    const fullName = `Cross ${loginId}`;

    const result = await provisionStaff(admin, { loginId, fullName, canteenId: canteenA.id, callerCollegeId: collegeB });

    expect(result).toEqual({ ok: false, error: "CANTEEN_NOT_FOUND" });
    const { count: profiles } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("full_name", fullName);
    expect(profiles).toBe(0);
    expect(await membersOf(canteenA.id)).toBe(0);
    // No auth user either: the same login ID is still free for college A's own admin.
    const own = await provisionStaff(admin, { loginId, fullName, canteenId: canteenA.id, callerCollegeId: collegeA });
    expect(own.ok).toBe(true);
    expect(await membersOf(canteenA.id)).toBe(1);
  });

  it("a canteen that does not exist is CANTEEN_NOT_FOUND too", async () => {
    expect(
      await provisionStaff(admin, {
        loginId: newId(),
        fullName: "Nobody",
        canteenId: randomUUID(),
        callerCollegeId: await homeCollege(),
      }),
    ).toEqual({ ok: false, error: "CANTEEN_NOT_FOUND" });
  });

  it("an admin of college B cannot reset the password of college A's staff", async () => {
    const { canteenA, collegeA, collegeB } = await twoColleges();
    const loginId = newId();
    const created = await provisionStaff(admin, { loginId, fullName: "Ravi", canteenId: canteenA.id, callerCollegeId: collegeA });
    if (!created.ok) throw new Error("setup");
    await admin.from("profiles").update({ must_change_password: false }).eq("id", created.userId);

    expect(await resetStaffPassword(admin, created.userId, collegeB)).toEqual({ ok: false, error: "NOT_STAFF" });

    expect((await signIn(loginId, created.temporaryPassword)).error).toBeNull();
    const { data } = await admin.from("profiles").select("must_change_password").eq("id", created.userId).single();
    expect(data?.must_change_password).toBe(false);

    const own = await resetStaffPassword(admin, created.userId, collegeA);
    expect(own.ok).toBe(true);
  });

  it("an admin of college B cannot deactivate college A's staff", async () => {
    const { canteenA, collegeA, collegeB } = await twoColleges();
    const created = await provisionStaff(admin, { loginId: newId(), fullName: "Ravi", canteenId: canteenA.id, callerCollegeId: collegeA });
    if (!created.ok) throw new Error("setup");

    expect(await setStaffActive(admin, created.userId, false, collegeB)).toEqual({ ok: false });
    const { data: still } = await admin.from("profiles").select("is_active").eq("id", created.userId).single();
    expect(still?.is_active).toBe(true);

    expect(await setStaffActive(admin, created.userId, false, collegeA)).toEqual({ ok: true });
    const { data: after } = await admin.from("profiles").select("is_active").eq("id", created.userId).single();
    expect(after?.is_active).toBe(false);
  });
});

describe("adminCaller", () => {
  it("returns the active admin's id and college", async () => {
    const college = await createCollege();
    const boss = await createUser("admin", { collegeId: college.id });

    expect(await adminCaller(boss.client)).toEqual({ id: boss.id, collegeId: college.id });
  });

  it("is null for staff, students, signed-out and deactivated admins", async () => {
    const staff = await createUser("staff");
    const student = await createUser();
    const gone = await createUser("admin");
    await admin.from("profiles").update({ is_active: false }).eq("id", gone.id);
    const signedOut = createClient(URL, ANON, { auth: { persistSession: false } });

    expect(await adminCaller(staff.client)).toBeNull();
    expect(await adminCaller(student.client)).toBeNull();
    expect(await adminCaller(gone.client)).toBeNull();
    expect(await adminCaller(signedOut)).toBeNull();
  });
});

describe("adminCallerId", () => {
  it("identifies an active admin and nobody else", async () => {
    const boss = await createUser("admin");
    const staff = await createUser("staff");
    const student = await createUser();
    const signedOut = createClient(URL, ANON, { auth: { persistSession: false } });

    expect(await adminCallerId(boss.client)).toBe(boss.id);
    expect(await adminCallerId(staff.client)).toBeNull();
    expect(await adminCallerId(student.client)).toBeNull();
    expect(await adminCallerId(signedOut)).toBeNull();
  });

  it("does not trust a deactivated admin", async () => {
    const boss = await createUser("admin");
    await admin.from("profiles").update({ is_active: false }).eq("id", boss.id);

    expect(await adminCallerId(boss.client)).toBeNull();
  });
});
