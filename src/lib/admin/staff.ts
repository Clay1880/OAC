import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const STAFF_EMAIL_DOMAIN = "staff.oac.local";
const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

// No 0/O, 1/I/l: the admin reads this out or writes it down for the staff member.
const PASSWORD_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function generateTemporaryPassword(): string {
  return Array.from({ length: 12 }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join("");
}

export type ProvisionStaffResult =
  | { ok: true; userId: string; loginId: string; temporaryPassword: string }
  | { ok: false; error: "ID_TAKEN" | "INVALID_ID" | "INVALID_NAME" | "FAILED" };

/**
 * Creates a staff login. Takes the service-role client: callers must have verified the admin first
 * (see `adminCallerId`). The auth user is marked `provisioned` (only the service role can set that),
 * which is what lets a `@staff.oac.local` address past the sign-up guard.
 */
export async function provisionStaff(
  service: SupabaseClient,
  input: { loginId: string; fullName: string },
): Promise<ProvisionStaffResult> {
  const loginId = input.loginId.trim().toLowerCase();
  const fullName = input.fullName.replace(/\s+/g, " ").trim();
  if (!LOGIN_ID_PATTERN.test(loginId)) return { ok: false, error: "INVALID_ID" };
  if (fullName === "" || fullName.length > 100) return { ok: false, error: "INVALID_NAME" };

  const temporaryPassword = generateTemporaryPassword();
  const { data, error } = await service.auth.admin.createUser({
    email: `${loginId}@${STAFF_EMAIL_DOMAIN}`,
    password: temporaryPassword,
    email_confirm: true,
    app_metadata: { provisioned: true },
  });
  if (error || !data.user) {
    return { ok: false, error: error?.code === "email_exists" || error?.status === 422 ? "ID_TAKEN" : "FAILED" };
  }

  const { error: profileError } = await service.from("profiles").insert({
    id: data.user.id,
    full_name: fullName,
    role: "staff",
    must_change_password: true,
  });
  if (profileError) {
    await service.auth.admin.deleteUser(data.user.id); // no login without a profile
    return { ok: false, error: "FAILED" };
  }
  return { ok: true, userId: data.user.id, loginId, temporaryPassword };
}

async function isStaff(service: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await service.from("profiles").select("role").eq("id", userId).maybeSingle();
  return data?.role === "staff";
}

export async function resetStaffPassword(
  service: SupabaseClient,
  staffId: string,
): Promise<{ ok: true; temporaryPassword: string } | { ok: false; error: "NOT_STAFF" | "FAILED" }> {
  if (!(await isStaff(service, staffId))) return { ok: false, error: "NOT_STAFF" };

  const temporaryPassword = generateTemporaryPassword();
  const { error } = await service.auth.admin.updateUserById(staffId, { password: temporaryPassword });
  if (error) return { ok: false, error: "FAILED" };

  const { error: flagError } = await service.from("profiles").update({ must_change_password: true }).eq("id", staffId);
  return flagError ? { ok: false, error: "FAILED" } : { ok: true, temporaryPassword };
}

/**
 * Deactivated staff are cut off at once: every staff RPC and policy checks `current_role()`, which
 * is null for an inactive profile, and the proxy signs them out on their next page request.
 */
export async function setStaffActive(service: SupabaseClient, staffId: string, active: boolean): Promise<{ ok: boolean }> {
  const { data, error } = await service
    .from("profiles")
    .update({ is_active: active })
    .eq("id", staffId)
    .eq("role", "staff")
    .select("id");
  return { ok: !error && (data?.length ?? 0) === 1 };
}
