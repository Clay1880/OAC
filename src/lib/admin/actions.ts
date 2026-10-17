"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { adminCaller } from "./guard";
import * as staff from "./staff";

/**
 * Every action here uses the service-role client, so each one first proves the caller is an active
 * admin and then passes that admin's college down: nothing outside it can be read or changed.
 */
async function requireAdmin(): Promise<{ id: string; collegeId: string } | null> {
  return adminCaller(await createClient());
}

export type CreateStaffResult =
  | { ok: true; loginId: string; temporaryPassword: string }
  | {
      ok: false;
      error: "ID_TAKEN" | "INVALID_ID" | "INVALID_NAME" | "CANTEEN_NOT_FOUND" | "FORBIDDEN" | "FAILED";
    };

export async function createStaff(input: {
  loginId: string;
  fullName: string;
  canteenId: string;
}): Promise<CreateStaffResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, error: "FORBIDDEN" };
  const result = await staff.provisionStaff(createAdminClient(), {
    loginId: input.loginId,
    fullName: input.fullName,
    canteenId: input.canteenId,
    callerCollegeId: caller.collegeId,
  });
  return result.ok ? { ok: true, loginId: result.loginId, temporaryPassword: result.temporaryPassword } : result;
}

export async function resetStaffPassword(
  staffId: string,
): Promise<{ ok: true; temporaryPassword: string } | { ok: false; error: "NOT_STAFF" | "FORBIDDEN" | "FAILED" }> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, error: "FORBIDDEN" };
  return staff.resetStaffPassword(createAdminClient(), staffId, caller.collegeId);
}

export async function setStaffActive(staffId: string, active: boolean): Promise<{ ok: boolean }> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false };
  return staff.setStaffActive(createAdminClient(), staffId, active, caller.collegeId);
}
