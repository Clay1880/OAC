/**
 * Provision (or reset) an admin account.
 *
 *   npx tsx scripts/create-admin.ts <login-id> <password> <full-name>
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, read from the
 * environment or from .env.local. Uses the service-role key, so run it only from
 * a trusted machine.
 *
 * The login ID maps to the email `<login-id>@staff.oac.local`. The auth user is
 * created with `app_metadata.provisioned = true`, which is what lets it past the
 * college-email guard (sign-up data cannot set app_metadata). Re-running with an
 * existing ID resets the password and re-asserts the admin profile.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const STAFF_EMAIL_DOMAIN = "staff.oac.local";
const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const MIN_PASSWORD_LENGTH = 8;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: rely on the real environment.
  }

  const [rawLoginId, password, ...nameParts] = process.argv.slice(2);
  const fullName = nameParts.join(" ").trim();
  if (!rawLoginId || !password || !fullName) {
    fail("Usage: npx tsx scripts/create-admin.ts <login-id> <password> <full-name>");
  }

  const loginId = rawLoginId.trim().toLowerCase();
  if (!LOGIN_ID_PATTERN.test(loginId)) {
    fail("Login ID must be 3-32 characters: letters, digits, '.', '_' or '-', starting with a letter or digit.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (environment or .env.local).");
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `${loginId}@${STAFF_EMAIL_DOMAIN}`;
  const { data: college } = await admin.from("colleges").select("id").eq("slug", "ait-pune").maybeSingle();
  if (!college) fail("College ait-pune not found. Run the database migrations first.");

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { provisioned: true },
  });

  let user: User;
  let action: "Created" | "Updated";
  if (created.data.user) {
    user = created.data.user;
    action = "Created";
  } else {
    const existing = await findUserByEmail(admin, email);
    if (!existing) throw created.error ?? new Error("Could not create or find the auth user.");
    const updated = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      app_metadata: { ...existing.app_metadata, provisioned: true },
    });
    if (updated.error || !updated.data.user) throw updated.error ?? new Error("Could not update the auth user.");
    user = updated.data.user;
    action = "Updated";
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: user.id,
      full_name: fullName,
      phone: null,
      reg_no: null,
      role: "admin",
      is_active: true,
      must_change_password: false,
      college_id: college.id,
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  console.log(`${action} admin "${fullName}". Sign in with login ID "${loginId}".`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
