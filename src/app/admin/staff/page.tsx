import { StaffAdmin, type StaffRow } from "@/components/admin/StaffAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Staff" };

const STAFF_EMAIL_SUFFIX = "@staff.oac.local";

export default async function AdminStaffPage() {
  // Login IDs live in auth.users (the email's local part), which only the service role can read.
  // The admin layout has already verified the caller, so using it here is safe.
  const service = createAdminClient();
  const { data: profiles } = await (await createClient())
    .from("profiles")
    .select("id, full_name, is_active, must_change_password")
    .eq("role", "staff")
    .order("full_name");

  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
  const loginIds = new Map(
    (users?.users ?? []).filter((u) => u.email?.endsWith(STAFF_EMAIL_SUFFIX)).map((u) => [u.id, u.email!.slice(0, -STAFF_EMAIL_SUFFIX.length)]),
  );

  const staff: StaffRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    loginId: loginIds.get(p.id) ?? "unknown",
    fullName: p.full_name,
    isActive: p.is_active,
    mustChangePassword: p.must_change_password,
  }));

  return (
    <>
      <h1 className="mb-2 text-4xl font-semibold">Staff</h1>
      <p className="mb-6 text-ink-soft">Counter logins. Give the temporary password to the staff member directly.</p>
      <StaffAdmin initialStaff={staff} />
    </>
  );
}
