"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { adminCallerId } from "./guard";
import * as staff from "./staff";

/** Every action here uses the service-role client, so each one first proves the caller is an admin. */
async function requireAdmin(): Promise<boolean> {
  return (await adminCallerId(await createClient())) !== null;
}

export type CreateStaffResult =
  | { ok: true; loginId: string; temporaryPassword: string }
  | { ok: false; error: "ID_TAKEN" | "INVALID_ID" | "INVALID_NAME" | "FORBIDDEN" | "FAILED" };

export async function createStaff(input: { loginId: string; fullName: string }): Promise<CreateStaffResult> {
  if (!(await requireAdmin())) return { ok: false, error: "FORBIDDEN" };
  const result = await staff.provisionStaff(createAdminClient(), input);
  return result.ok ? { ok: true, loginId: result.loginId, temporaryPassword: result.temporaryPassword } : result;
}

export async function resetStaffPassword(
  staffId: string,
): Promise<{ ok: true; temporaryPassword: string } | { ok: false; error: "NOT_STAFF" | "FORBIDDEN" | "FAILED" }> {
  if (!(await requireAdmin())) return { ok: false, error: "FORBIDDEN" };
  return staff.resetStaffPassword(createAdminClient(), staffId);
}

export async function setStaffActive(staffId: string, active: boolean): Promise<{ ok: boolean }> {
  if (!(await requireAdmin())) return { ok: false };
  return staff.setStaffActive(createAdminClient(), staffId, active);
}
