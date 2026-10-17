import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { admin, createCollege, createUser, createUserWithoutProfile, seededCollege, URL } from "./helpers";

const regNo = () => `R${randomUUID().slice(0, 8).toUpperCase()}`;

const complete = (user: { client: { rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> } }, args: { name?: string; phone?: string; reg?: string }) =>
  user.client.rpc("complete_profile", {
    p_full_name: args.name ?? "Asha Rao",
    p_phone: args.phone ?? "9876543210",
    p_reg_no: args.reg ?? regNo(),
  });

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/**
 * A signed-in, profile-less auth user whose email is on `domain`. The sign-up guard only lets a
 * non-college domain in on the reserved staff domain (provisioned is set after the insert), so the
 * user is created there and then moved to `domain`, which the guard allows for a provisioned user.
 */
async function userOnDomain(domain: string) {
  const email = `t-${randomUUID()}@${domain}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: `t-${randomUUID()}@staff.oac.local`,
    password: "test-password-123",
    email_confirm: true,
    app_metadata: { provisioned: true },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const { error: moveError } = await admin.auth.admin.updateUserById(data.user.id, { email, email_confirm: true });
  if (moveError) throw new Error(`move email: ${moveError.message}`);
  const client = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: "test-password-123" });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return { id: data.user.id, client };
}

describe("complete_profile", () => {
  it("creates a student profile for the caller, normalising the fields", async () => {
    const user = await createUserWithoutProfile();
    const reg = regNo().toLowerCase();

    const { data, error } = await complete(user, { name: "  Asha   Rao ", phone: "98765 43210", reg: ` ${reg} ` });

    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: user.id,
      full_name: "Asha Rao",
      phone: "9876543210",
      reg_no: reg.toUpperCase(),
      role: "student",
      is_defaulter: false,
      is_active: true,
      must_change_password: false,
    });
  });

  it("always creates role student, whatever the sign-up metadata claims", async () => {
    const user = await createUserWithoutProfile();
    await admin.auth.admin.updateUserById(user.id, { user_metadata: { role: "admin", role_hint: "staff" } });

    const { data, error } = await complete(user, {});

    expect(error).toBeNull();
    expect((data as { role: string }).role).toBe("student");
  });

  it("rejects a duplicate registration number with REG_NO_TAKEN, ignoring case", async () => {
    const first = await createUserWithoutProfile();
    const second = await createUserWithoutProfile();
    const reg = regNo();
    expect((await complete(first, { reg })).error).toBeNull();

    const { error } = await complete(second, { reg: reg.toLowerCase() });

    expect(error?.message).toBe("REG_NO_TAKEN");
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("id", second.id);
    expect(count).toBe(0);
  });

  it("rejects callers that already have a profile with PROFILE_EXISTS", async () => {
    const student = await createUser();

    const { error } = await complete(student, {});

    expect(error?.message).toBe("PROFILE_EXISTS");
  });

  it.each([
    ["INVALID_PHONE", { phone: "12345" }],
    ["INVALID_PHONE", { phone: "5876543210" }], // Indian mobiles start 6-9
    ["INVALID_PHONE", { phone: "98765432101" }],
    ["INVALID_NAME", { name: "   " }],
    ["INVALID_REG_NO", { reg: "  " }],
  ] as const)("rejects bad input with %s", async (code, args) => {
    const user = await createUserWithoutProfile();

    const { error } = await complete(user, args);

    expect(error?.message).toBe(code);
  });

  it("accepts a +91 prefix on the phone number", async () => {
    const user = await createUserWithoutProfile();

    const { data, error } = await complete(user, { phone: "+91 98765-43210" });

    expect(error).toBeNull();
    expect((data as { phone: string }).phone).toBe("9876543210");
  });

  it("sets college_id from the email domain", async () => {
    const user = await createUserWithoutProfile();

    const { data, error } = await complete(user, {});

    expect(error).toBeNull();
    expect((data as { college_id: string }).college_id).toBe((await seededCollege()).id);
  });

  it("a user on the second college's domain lands in that college", async () => {
    const college = await createCollege();
    const user = await userOnDomain(college.domain);

    const { data, error } = await complete(user, {});

    expect(error).toBeNull();
    expect((data as { college_id: string }).college_id).toBe(college.id);
    const { data: stored } = await admin.from("profiles").select("college_id").eq("id", user.id).single();
    expect(stored?.college_id).toBe(college.id);
  });

  it("NO_COLLEGE when the email domain matches no college", async () => {
    const user = await userOnDomain("nowhere.test");

    const { error } = await complete(user, {});

    expect(error?.message).toBe("NO_COLLEGE");
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("id", user.id);
    expect(count).toBe(0);
  });

  it("is not callable when signed out", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient("http://127.0.0.1:54321", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0");

    const { error } = await anon.rpc("complete_profile", { p_full_name: "X", p_phone: "9876543210", p_reg_no: regNo() });

    expect(error?.message).toMatch(/permission denied/i);
  });
});
