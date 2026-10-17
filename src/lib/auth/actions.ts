"use server";

import { isDemoLoginEnabled } from "@/lib/config";
import { findDemoTenant, openTodaySlots, provisionDemo } from "@/lib/demo/accounts";
import { selfProvisionPlan } from "@/lib/demoSeedConfig";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const STAFF_EMAIL_DOMAIN = "staff.oac.local";
const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const MIN_PASSWORD_LENGTH = 8;

export type StaffLoginResult = { ok: true } | { ok: false; error: "INVALID" | "INACTIVE" };

/** Staff and admin sign in with a login ID; internally it is the local part of a synthetic email. */
export async function staffLogin(loginId: string, password: string): Promise<StaffLoginResult> {
  const id = loginId.trim().toLowerCase();
  if (!LOGIN_ID_PATTERN.test(id) || password === "") return { ok: false, error: "INVALID" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${id}@${STAFF_EMAIL_DOMAIN}`,
    password,
  });
  if (error || !data.user) return { ok: false, error: "INVALID" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role === "student") {
    await supabase.auth.signOut();
    return { ok: false, error: "INVALID" };
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { ok: false, error: "INACTIVE" };
  }
  return { ok: true };
}

/** Demo-student sign-in for presentations. Refuses outright unless DEMO_LOGIN=true, and only ever signs in students. */
export async function demoLogin(loginId: string, password: string): Promise<StaffLoginResult> {
  if (!isDemoLoginEnabled()) return { ok: false, error: "INVALID" };
  const id = loginId.trim().toLowerCase();
  if (!LOGIN_ID_PATTERN.test(id) || password === "") return { ok: false, error: "INVALID" };

  const supabase = await createClient();
  const credentials = { email: `${id}@${STAFF_EMAIL_DOMAIN}`, password };
  let { data, error } = await supabase.auth.signInWithPassword(credentials);

  // A fresh hosted project has no demo accounts yet. When the host set DEMO_PASSWORD and the visitor
  // typed exactly it, the first demo.student sign-in creates the accounts and today's slots itself.
  if ((error || !data.user) && id === "demo.student") {
    const plan = selfProvisionPlan(password, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", {
      DEMO_PASSWORD: process.env.DEMO_PASSWORD,
      DEMO_WITH_ADMIN: process.env.DEMO_WITH_ADMIN,
    });
    if (!plan) return { ok: false, error: "INVALID" };
    try {
      await provisionDemo(createAdminClient(), { password: plan.password, withAdmin: plan.withAdmin });
    } catch {
      return { ok: false, error: "INVALID" }; // the database is not set up yet; nothing to sign in to
    }
    ({ data, error } = await supabase.auth.signInWithPassword(credentials));
  }
  if (error || !data.user) return { ok: false, error: "INVALID" };

  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.role !== "student" || !profile.is_active) {
    await supabase.auth.signOut();
    return { ok: false, error: "INVALID" };
  }

  // Demo mode: keep today's pickup slots open so the presentation can always place an order.
  if (id === "demo.student" && process.env.DEMO_PASSWORD?.trim()) {
    try {
      const service = createAdminClient();
      await openTodaySlots(service, (await findDemoTenant(service)).canteenId);
    } catch {
      // Slots are a convenience; the sign-in itself succeeded.
    }
  }
  return { ok: true };
}

export type ChangePasswordResult = { ok: true } | { ok: false; error: "TOO_SHORT" | "FAILED" };

export async function changePassword(newPassword: string): Promise<ChangePasswordResult> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "TOO_SHORT" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "FAILED" };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: "FAILED" };

  // Profiles are not writable from the client; clear the flag with the service role for this caller only.
  const { error: clearError } = await createAdminClient()
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", userData.user.id);
  return clearError ? { ok: false, error: "FAILED" } : { ok: true };
}

export type CompleteProfileError =
  | "INVALID_NAME"
  | "INVALID_PHONE"
  | "INVALID_REG_NO"
  | "REG_NO_TAKEN"
  | "PROFILE_EXISTS"
  /** The email domain belongs to no college on the platform. */
  | "NO_COLLEGE"
  /** The account behind this session no longer exists (e.g. the database was reset). */
  | "SESSION_EXPIRED"
  | "UNKNOWN";

export async function completeProfile(input: {
  fullName: string;
  phone: string;
  regNo: string;
}): Promise<{ ok: true } | { ok: false; error: CompleteProfileError }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_profile", {
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_reg_no: input.regNo,
  });
  if (!error) return { ok: true };
  // 23503: the profile points at an auth user that is gone. The session is stale, so end it.
  if (error.code === "23503") {
    await supabase.auth.signOut();
    return { ok: false, error: "SESSION_EXPIRED" };
  }
  const known = [
    "INVALID_NAME",
    "INVALID_PHONE",
    "INVALID_REG_NO",
    "REG_NO_TAKEN",
    "PROFILE_EXISTS",
    "NO_COLLEGE",
  ] as const;
  const match = known.find((code) => code === error.message);
  return { ok: false, error: match ?? "UNKNOWN" };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
