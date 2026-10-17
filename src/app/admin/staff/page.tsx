import { redirect } from "next/navigation";
import { StaffAdmin, type StaffRow } from "@/components/admin/StaffAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { consoleCanteen } from "@/lib/tenancy/current";

export const metadata = { title: "Staff" };

const STAFF_EMAIL_SUFFIX = "@staff.oac.local";

type MemberProfile = { id: string; full_name: string; role: string; is_active: boolean; must_change_password: boolean };

export default async function AdminStaffPage() {
  const canteen = await consoleCanteen(await createClient());
  if (!canteen) redirect("/admin");

  // Login IDs live in auth.users (the email's local part), which only the service role can read.
  // The admin layout has already verified the caller, so using it here is safe.
  const service = createAdminClient();
  const { data: members } = await service
    .from("canteen_members")
    .select("profiles(id, full_name, role, is_active, must_change_password)")
    .eq("canteen_id", canteen.id);
  const profiles = ((members ?? []) as unknown as { profiles: MemberProfile | null }[])
    .map((m) => m.profiles)
    .filter((p): p is MemberProfile => p !== null && p.role === "staff")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
  const loginIds = new Map(
    (users?.users ?? []).filter((u) => u.email?.endsWith(STAFF_EMAIL_SUFFIX)).map((u) => [u.id, u.email!.slice(0, -STAFF_EMAIL_SUFFIX.length)]),
  );

  const staff: StaffRow[] = profiles.map((p) => ({
    id: p.id,
    loginId: loginIds.get(p.id) ?? "unknown",
    fullName: p.full_name,
    isActive: p.is_active,
    mustChangePassword: p.must_change_password,
  }));

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">Staff</h1>
      <p className="mb-6 text-ink-soft">Counter logins. Give the temporary password to the staff member directly.</p>
      <StaffAdmin canteenId={canteen.id} initialStaff={staff} />
    </>
  );
}
