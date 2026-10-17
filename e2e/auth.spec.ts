import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import {
  admin,
  COLLEGE_DOMAIN,
  createStaffLogin,
  fillOnboarding,
  mailCount,
  readOtp,
  signInWithOtp,
  signUpStudent,
  staffSignIn,
  uniqueEmail,
} from "./helpers";

test.describe("student sign-in", () => {
  test("a non-college email shows a clear error before any code is sent", async ({ page }) => {
    const email = `someone-${randomUUID().slice(0, 6)}@gmail.com`;
    await page.goto("/login");
    await page.getByLabel("College email").fill(email);
    await page.getByRole("button", { name: "Send code" }).click();

    await expect(page.locator("main").getByRole("alert")).toContainText(`@${COLLEGE_DOMAIN}`);
    await expect(page).toHaveURL(/\/login/);
    expect(await mailCount(email)).toBe(0);
  });

  test("a new student verifies by code, completes onboarding and lands on the home page", async ({ page }) => {
    const email = uniqueEmail();
    await signInWithOtp(page, email);
    await expect(page).toHaveURL(/\/onboarding/);

    await fillOnboarding(page);

    await expect(page).toHaveURL(/\/$/);
  });

  test("a wrong code is refused", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/login");
    await page.getByLabel("College email").fill(email);
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page).toHaveURL(/\/verify/);

    await page.getByLabel("One-time code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page.locator("main").getByRole("alert")).toContainText("did not work");
    await expect(page).toHaveURL(/\/verify/);
  });

  test("phone must be a 10-digit Indian mobile number", async ({ page }) => {
    await signInWithOtp(page, uniqueEmail());
    await expect(page).toHaveURL(/\/onboarding/);

    await fillOnboarding(page, { phone: "12345" });

    await expect(page.locator("main").getByRole("alert")).toContainText("10-digit mobile number");
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("a duplicate registration number shows the REG_NO_TAKEN message", async ({ page }) => {
    const reg = `DUP${randomUUID().slice(0, 6).toUpperCase()}`;
    const { data: first } = await admin.auth.admin.createUser({
      email: `${randomUUID()}@staff.oac.local`,
      email_confirm: true,
      app_metadata: { provisioned: true },
    });
    await admin.from("profiles").insert({
      id: first.user!.id,
      full_name: "Earlier Student",
      phone: "9876543210",
      reg_no: reg,
    });

    await signInWithOtp(page, uniqueEmail());
    await fillOnboarding(page, { reg: reg.toLowerCase() });

    await expect(page.locator("main").getByRole("alert")).toContainText("REG_NO_TAKEN");
    await expect(page).toHaveURL(/\/onboarding/);
  });
});

test.describe("roles", () => {
  test("nobody can become staff by signing up with any metadata", async ({ page }) => {
    const email = uniqueEmail();
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
      { auth: { persistSession: false } },
    );

    // A staff-domain address cannot be self-registered at all.
    const staffAttempt = await anon.auth.signInWithOtp({ email: `${randomUUID()}@staff.oac.local` });
    expect(staffAttempt.error).not.toBeNull();

    // A college address that claims every privilege in its metadata is still just a student.
    await anon.auth.signInWithOtp({
      email,
      options: { data: { role: "admin", provisioned: true, is_defaulter: false } },
    });
    const { error } = await anon.auth.verifyOtp({ email, token: await readOtp(email), type: "email" });
    expect(error).toBeNull();
    const { data: profile, error: rpcError } = await anon.rpc("complete_profile", {
      p_full_name: "Sneaky Student",
      p_phone: "9876543210",
      p_reg_no: `S${randomUUID().slice(0, 8)}`,
    });
    expect(rpcError).toBeNull();
    expect((profile as { role: string }).role).toBe("student");

    const { data: user } = await anon.auth.getUser();
    expect(user.user?.app_metadata.provisioned).toBeUndefined();
    void page;
  });

  test("a student visiting /staff or /admin is redirected home", async ({ page }) => {
    await signUpStudent(page);

    await page.goto("/staff");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
  });

  test("a signed-out visitor is sent to login", async ({ page }) => {
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/login/);
  });

  test("staff sign in with a login ID and land on the counter", async ({ page }) => {
    const staff = await createStaffLogin();

    await staffSignIn(page, staff.loginId, staff.password);

    await expect(page).toHaveURL(/\/staff$/);
    await expect(page.getByRole("heading", { name: "Counter" })).toBeVisible();
  });

  test("a wrong staff password is refused", async ({ page }) => {
    const staff = await createStaffLogin();

    await staffSignIn(page, staff.loginId, "not-the-password");

    await expect(page.locator("main").getByRole("alert")).toContainText("not right");
    await expect(page).toHaveURL(/\/staff-login/);
  });

  test("a deactivated staff account is refused", async ({ page }) => {
    const staff = await createStaffLogin({ active: false });

    await staffSignIn(page, staff.loginId, staff.password);

    await expect(page.locator("main").getByRole("alert")).toContainText("deactivated");
    await expect(page).toHaveURL(/\/staff-login/);
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/login/);
  });

  test("staff cannot open /admin", async ({ page }) => {
    const staff = await createStaffLogin();
    await staffSignIn(page, staff.loginId, staff.password);
    await expect(page).toHaveURL(/\/staff$/);

    await page.goto("/admin");

    await expect(page).toHaveURL(/\/staff$/);
  });

  test("an admin can open /admin", async ({ page }) => {
    const boss = await createStaffLogin({ role: "admin" });

    await staffSignIn(page, boss.loginId, boss.password);
    await expect(page).toHaveURL(/\/staff$/);
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/admin$/);
  });

  test("staff with a temporary password are forced to change it first", async ({ page }) => {
    const staff = await createStaffLogin({ mustChangePassword: true });

    await staffSignIn(page, staff.loginId, staff.password);
    await expect(page).toHaveURL(/\/change-password/);
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/change-password/);

    await page.getByLabel("New password", { exact: true }).fill("a-better-password-1");
    await page.getByLabel("Confirm new password").fill("a-better-password-1");
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page).toHaveURL(/\/staff$/);
  });

  test("a deactivated student-facing session is signed out on the next request", async ({ page }) => {
    const staff = await createStaffLogin();
    await staffSignIn(page, staff.loginId, staff.password);
    await expect(page).toHaveURL(/\/staff$/);

    await admin.from("profiles").update({ is_active: false }).eq("id", staff.userId);
    await page.goto("/staff");

    await expect(page).toHaveURL(/\/login\?inactive=1/);
    await expect(page.locator("main").getByRole("alert")).toContainText("deactivated");
  });
});
