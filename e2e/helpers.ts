import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { admin } from "../tests/integration/helpers";

export { admin };

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const COLLEGE_DOMAIN = process.env.NEXT_PUBLIC_COLLEGE_EMAIL_DOMAIN ?? "college.edu";

export const uniqueEmail = () => `s${randomUUID().slice(0, 8)}@${COLLEGE_DOMAIN}`;

type MailpitMessage = { ID: string };

/** Messages sent to `email` so far. */
export async function mailCount(email: string): Promise<number> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  const body = (await res.json()) as { messages?: MailpitMessage[] };
  return body.messages?.length ?? 0;
}

/** Waits for the newest email to `email` and returns the one-time code in it. */
export async function readOtp(email: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const body = (await res.json()) as { messages?: MailpitMessage[] };
    const newest = body.messages?.[0];
    if (newest) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`)).json()) as { Text: string };
      const match = message.Text.match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`No OTP email arrived for ${email}`);
}

/** Types the email on /login, reads the code from the local inbox and verifies it. */
export async function signInWithOtp(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // let React hydrate so the click runs our handler, not a native form submit
  await page.getByLabel("College email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page).toHaveURL(/\/verify/);
  await page.getByLabel("One-time code").fill(await readOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

export async function fillOnboarding(page: Page, fields: { name?: string; phone?: string; reg?: string } = {}) {
  await page.getByLabel("Full name").fill(fields.name ?? "Asha Rao");
  await page.getByLabel("Mobile number").fill(fields.phone ?? "9876543210");
  await page.getByLabel("Registration number").fill(fields.reg ?? `R${randomUUID().slice(0, 8)}`);
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Brand-new student: OTP sign-in plus onboarding, ending on the student home. */
export async function signUpStudent(page: Page, email = uniqueEmail()) {
  await signInWithOtp(page, email);
  await expect(page).toHaveURL(/\/onboarding/);
  await fillOnboarding(page);
  await expect(page).toHaveURL(/\/$/);
  return email;
}

/** Staff or admin account with a known login ID, created the way the admin console will. */
export async function createStaffLogin(options: {
  role?: "staff" | "admin";
  password?: string;
  active?: boolean;
  mustChangePassword?: boolean;
} = {}) {
  const loginId = `st${randomUUID().slice(0, 8)}`;
  const password = options.password ?? "temp-pass-123";
  const { data, error } = await admin.auth.admin.createUser({
    email: `${loginId}@staff.oac.local`,
    password,
    email_confirm: true,
    app_metadata: { provisioned: true },
  });
  if (error || !data.user) throw new Error(`createStaffLogin: ${error?.message}`);
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    full_name: "Counter Staff",
    role: options.role ?? "staff",
    is_active: options.active ?? true,
    must_change_password: options.mustChangePassword ?? false,
  });
  if (profileError) throw new Error(`createStaffLogin profile: ${profileError.message}`);
  return { loginId, password, userId: data.user.id };
}

export async function staffSignIn(page: Page, loginId: string, password: string) {
  await page.goto("/staff-login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Login ID").fill(loginId);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
