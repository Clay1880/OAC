import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { adminCallerId } from "../../src/lib/admin/guard";
import { generateTemporaryPassword, provisionStaff, resetStaffPassword, setStaffActive } from "../../src/lib/admin/staff";
import { admin, createMenuItem, createSlot, createUser } from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const newId = () => `cs${randomUUID().slice(0, 8)}`;

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

    const result = await provisionStaff(admin, { loginId, fullName: "Ravi Kumar" });

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

    const result = await provisionStaff(admin, { loginId: ` ${loginId.toUpperCase()} `, fullName: "Ravi" });

    expect(result.ok && result.loginId).toBe(loginId);
  });

  it("rejects a taken ID with ID_TAKEN and leaves the first account alone", async () => {
    const loginId = newId();
    const first = await provisionStaff(admin, { loginId, fullName: "First" });
    expect(first.ok).toBe(true);

    const second = await provisionStaff(admin, { loginId, fullName: "Second" });

    expect(second).toEqual({ ok: false, error: "ID_TAKEN" });
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("full_name", "Second");
    expect(count).toBe(0);
  });

  it.each(["ab", "has space", "bad@char", "-leading", "x".repeat(33), ""])("rejects the ID %j with INVALID_ID", async (loginId) => {
    expect(await provisionStaff(admin, { loginId, fullName: "Ravi" })).toEqual({ ok: false, error: "INVALID_ID" });
  });

  it("rejects an empty name", async () => {
    expect(await provisionStaff(admin, { loginId: newId(), fullName: "   " })).toEqual({ ok: false, error: "INVALID_NAME" });
  });
});

describe("resetStaffPassword", () => {
  it("issues a new temporary password, invalidates the old one and forces a change again", async () => {
    const loginId = newId();
    const created = await provisionStaff(admin, { loginId, fullName: "Ravi" });
    if (!created.ok) throw new Error("setup");
    await admin.from("profiles").update({ must_change_password: false }).eq("id", created.userId);

    const reset = await resetStaffPassword(admin, created.userId);

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

    expect(await resetStaffPassword(admin, student.id)).toEqual({ ok: false, error: "NOT_STAFF" });
    expect(await resetStaffPassword(admin, boss.id)).toEqual({ ok: false, error: "NOT_STAFF" });
  });
});

describe("setStaffActive", () => {
  it("deactivating cuts off a session that is already signed in, and reactivating restores it", async () => {
    const loginId = newId();
    const created = await provisionStaff(admin, { loginId, fullName: "Ravi" });
    if (!created.ok) throw new Error("setup");
    const { client } = await signIn(loginId, created.temporaryPassword);
    const student = await createUser();
    const item = await createMenuItem();
    const slot = await createSlot(60, 5);
    const placed = await student.client.rpc("place_order", { p_slot_id: slot.id, p_items: [{ menu_item_id: item.id, qty: 1 }], p_request_id: randomUUID() });
    const orderId = (placed.data as { id: string }).id;

    expect(await setStaffActive(admin, created.userId, false)).toEqual({ ok: true });
    const blocked = await client.rpc("accept_order", { p_order_id: orderId });
    expect(blocked.error?.message).toBe("FORBIDDEN");

    expect(await setStaffActive(admin, created.userId, true)).toEqual({ ok: true });
    const allowed = await client.rpc("accept_order", { p_order_id: orderId });
    expect(allowed.error).toBeNull();
  });

  it("only applies to staff accounts", async () => {
    const student = await createUser();
    const boss = await createUser("admin");

    expect(await setStaffActive(admin, student.id, false)).toEqual({ ok: false });
    expect(await setStaffActive(admin, boss.id, false)).toEqual({ ok: false });
    const { data } = await admin.from("profiles").select("is_active").in("id", [student.id, boss.id]);
    expect(data?.every((p) => p.is_active)).toBe(true);
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
