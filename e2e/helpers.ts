import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { campusClock } from "../src/lib/slots";
import { admin } from "../tests/integration/helpers";

export { admin };

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const COLLEGE_DOMAIN = process.env.NEXT_PUBLIC_COLLEGE_EMAIL_DOMAIN ?? "aitpune.edu.in";

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
  const reg = `R${randomUUID().slice(0, 8)}`;
  await signInWithOtp(page, email);
  await expect(page).toHaveURL(/\/onboarding/);
  await fillOnboarding(page, { reg });
  await expect(page).toHaveURL(/\/$/);
  const { data } = await admin.from("profiles").select("id").eq("reg_no", reg.toUpperCase()).single();
  return { email, reg, id: data!.id as string };
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

/** Sets the checkout clock to a slot's start time (campus time), as a student would: hour, minute, AM/PM. Exact labels: "Hour" is also inside "Pyaaz Kachouri". */
export async function chooseSlotTime(page: Page, slot: { starts_at: string }) {
  const [h, m] = campusClock(slot.starts_at).split(":").map(Number);
  await page.getByLabel("Hour", { exact: true }).selectOption(String(h % 12 || 12));
  await page.getByLabel("Minute", { exact: true }).selectOption(String(m).padStart(2, "0"));
  await page.getByLabel("AM or PM", { exact: true }).selectOption(h >= 12 ? "PM" : "AM");
}

/** Places a one-item order through the real UI and returns its code, id and the student. */
export async function placeTestOrder(
  page: Page,
  opts: { itemName?: string; pricePaise?: number; alreadySignedIn?: boolean } = {},
) {
  const { createMenuItem, createSlot } = await import("../tests/integration/helpers");
  const item = await createMenuItem({ name: opts.itemName ?? `Test Item ${randomUUID().slice(0, 6)}`, price_paise: opts.pricePaise ?? 4500 });
  const slot = await createSlot(30, 5);
  const student = opts.alreadySignedIn ? null : await signUpStudent(page);
  if (opts.alreadySignedIn) await page.goto("/");

  await page.locator(`[data-item-id="${item.id}"]`).getByRole("button", { name: `Add ${item.name}` }).click();
  await page.getByRole("button", { name: /View order/ }).click();
  await page.getByRole("link", { name: "Choose pickup time" }).click();
  await chooseSlotTime(page, slot);
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/orders\/OAC-/);

  const code = page.url().split("/").pop()!;
  const { data } = await admin.from("orders").select("id").eq("code", code).single();
  return { code, orderId: data!.id as string, item, slot, student };
}
