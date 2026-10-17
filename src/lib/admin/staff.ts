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
  | { ok: false; error: "ID_TAKEN" | "INVALID_ID" | "INVALID_NAME" | "CANTEEN_NOT_FOUND" | "FAILED" };

/*
 * Every function here takes the service-role client, which bypasses every database rule. Callers
 * must have verified the admin first (see `adminCaller`) and pass that admin's college: each lookup
 * and write is limited to `callerCollegeId`, so one college's admin can never touch another's staff.
 */

/**
 * Creates a staff login at a canteen of the caller's college. The auth user is marked `provisioned`
 * (only the service role can set that), which is what lets a `@staff.oac.local` address past the
 * sign-up guard. A canteen that does not exist and one in another college look the same:
 * CANTEEN_NOT_FOUND.
 */
export async function provisionStaff(
  service: SupabaseClient,
  input: { loginId: string; fullName: string; canteenId: string; callerCollegeId: string },
): Promise<ProvisionStaffResult> {
  const loginId = input.loginId.trim().toLowerCase();
  const fullName = input.fullName.replace(/\s+/g, " ").trim();
  if (!LOGIN_ID_PATTERN.test(loginId)) return { ok: false, error: "INVALID_ID" };
  if (fullName === "" || fullName.length > 100) return { ok: false, error: "INVALID_NAME" };

  const { data: canteen, error: canteenError } = await service
    .from("canteens")
    .select("college_id")
    .eq("id", input.canteenId)
    .eq("college_id", input.callerCollegeId)
    .maybeSingle();
  if (canteenError && canteenError.code !== "22P02") return { ok: false, error: "FAILED" }; // 22P02: not a uuid
  if (!canteen || canteen.college_id !== input.callerCollegeId) return { ok: false, error: "CANTEEN_NOT_FOUND" };

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
    college_id: canteen.college_id,
  });
  const { error: memberError } = profileError
    ? { error: profileError }
    : await service.from("canteen_members").insert({ user_id: data.user.id, canteen_id: input.canteenId, role: "staff" });
  if (profileError || memberError) {
    await service.auth.admin.deleteUser(data.user.id); // no login without a profile
    return { ok: false, error: "FAILED" };
  }
  return { ok: true, userId: data.user.id, loginId, temporaryPassword };
}

/** True only for a staff profile in `collegeId`; another college's staff count as "not staff". */
async function isStaffOf(service: SupabaseClient, userId: string, collegeId: string): Promise<boolean> {
  const { data } = await service
    .from("profiles")
    .select("role, college_id")
    .eq("id", userId)
    .eq("college_id", collegeId)
    .maybeSingle();
  return data?.role === "staff" && data.college_id === collegeId;
}

export async function resetStaffPassword(
  service: SupabaseClient,
  staffId: string,
  callerCollegeId: string,
): Promise<{ ok: true; temporaryPassword: string } | { ok: false; error: "NOT_STAFF" | "FAILED" }> {
  if (!(await isStaffOf(service, staffId, callerCollegeId))) return { ok: false, error: "NOT_STAFF" };

  const temporaryPassword = generateTemporaryPassword();
  const { error } = await service.auth.admin.updateUserById(staffId, { password: temporaryPassword });
  if (error) return { ok: false, error: "FAILED" };

  const { error: flagError } = await service
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", staffId)
    .eq("role", "staff")
    .eq("college_id", callerCollegeId);
  return flagError ? { ok: false, error: "FAILED" } : { ok: true, temporaryPassword };
}

/**
 * Deactivated staff are cut off at once: every staff RPC and policy checks `current_role()`, which
 * is null for an inactive profile, and the proxy signs them out on their next page request.
 */
export async function setStaffActive(
  service: SupabaseClient,
  staffId: string,
  active: boolean,
  callerCollegeId: string,
): Promise<{ ok: boolean }> {
  const { data, error } = await service
    .from("profiles")
    .update({ is_active: active })
    .eq("id", staffId)
    .eq("role", "staff")
    .eq("college_id", callerCollegeId)
    .select("id");
  return { ok: !error && (data?.length ?? 0) === 1 };
}
