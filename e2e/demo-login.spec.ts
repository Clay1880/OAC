import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { seededCollege } from "../tests/integration/helpers";
import { admin, createStaffLogin } from "./helpers";

// The presentation fallback: a student signs in with an ID and password instead of an emailed code.
async function createDemoStudent() {
  const loginId = `dm${randomUUID().slice(0, 8)}`;
  const password = "demo-pass-123";
  const { data, error } = await admin.auth.admin.createUser({
    email: `${loginId}@staff.oac.local`,
    password,
    email_confirm: true,
    app_metadata: { provisioned: true },
  });
  if (error || !data.user) throw new Error(`createDemoStudent: ${error?.message}`);
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    full_name: "Demo Student",
    phone: "9876543210",
    reg_no: `DEMO${randomUUID().slice(0, 8).toUpperCase()}`,
    role: "student",
    college_id: (await seededCollege()).id,
  });
  if (profileError) throw new Error(`createDemoStudent profile: ${profileError.message}`);
  return { loginId, password };
}

async function demoSignIn(page: import("@playwright/test").Page, loginId: string, password: string) {
  await page.goto("/demo-login");
  await page.waitForLoadState("networkidle"); // hydrate first so the click runs our handler
  await page.getByLabel("Login ID").fill(loginId);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("demo sign-in", () => {
  test("the login page links to it and the demo student lands on the menu", async ({ page }) => {
    const { loginId, password } = await createDemoStudent();
    await page.goto("/login");
    await page.getByRole("link", { name: "Use the demo account" }).click();
    await expect(page).toHaveURL(/\/demo-login/);

    await demoSignIn(page, loginId, password);

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "What are you having?" })).toBeVisible();
  });

  test("a wrong password is refused", async ({ page }) => {
    const { loginId } = await createDemoStudent();

    await demoSignIn(page, loginId, "not-the-password");

    await expect(page.getByText("That login ID or password is not right.")).toBeVisible();
    await expect(page).toHaveURL(/\/demo-login/);
  });

  test("staff cannot use it, so it opens no way into the counter or admin", async ({ page }) => {
    const staff = await createStaffLogin();

    await demoSignIn(page, staff.loginId, staff.password);

    await expect(page.getByText("That login ID or password is not right.")).toBeVisible();
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/login/);
  });
});
