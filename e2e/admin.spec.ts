import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createMenuItem, createSlot, createUser, defaultCanteen, seededCanteen } from "../tests/integration/helpers";
import { admin, createStaffLogin, signUpStudent, staffSignIn } from "./helpers";

async function signInAdmin(page: Page) {
  const boss = await createStaffLogin({ role: "admin" });
  await staffSignIn(page, boss.loginId, boss.password);
  await expect(page).toHaveURL(/\/staff$/); // admins land on the counter view first
  return boss;
}

test.describe("admin: menu", () => {
  test("adds an item and toggles it sold out, and the student menu follows live", async ({ page, browser }) => {
    const name = `Test Kulfi ${randomUUID().slice(0, 6)}`;
    const studentContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const studentPage = await studentContext.newPage();
    await signUpStudent(studentPage);

    await signInAdmin(page);
    await page.goto("/admin/menu");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Add item" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Category").fill("Desserts");
    await page.getByLabel("Price (₹)").fill("35.50");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Item added")).toBeVisible();

    const { data } = await admin.from("menu_items").select("id, price_paise, is_available").eq("name", name).single();
    expect(data).toMatchObject({ price_paise: 3550, is_available: true });
    const row = studentPage.locator(`[data-item-id="${data!.id}"]`);
    await expect(row).toContainText(name, { timeout: 10_000 });
    await expect(row.getByRole("button", { name: `Add ${name}` })).toBeVisible();

    await page.getByRole("switch", { name: `${name} available` }).click();

    await expect(page.getByRole("switch", { name: `${name} available` })).toHaveAttribute("aria-checked", "false");
    await expect(row).toContainText("Sold out", { timeout: 10_000 });
    await expect(row.getByRole("button")).toHaveCount(0);
    await studentContext.close();
  });

  test("edits a price", async ({ page }) => {
    // The admin console shows the college's first canteen (oac), so the item must live there.
    const item = await createMenuItem({
      name: `Test Edit ${randomUUID().slice(0, 6)}`,
      price_paise: 1000,
      canteen_id: (await seededCanteen()).id,
    });
    await signInAdmin(page);
    await page.goto("/admin/menu");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: `Edit ${item.name}` }).click();
    await page.getByLabel("Price (₹)").fill("12.50");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Item saved")).toBeVisible();
    await expect.poll(async () => (await admin.from("menu_items").select("price_paise").eq("id", item.id).single()).data?.price_paise).toBe(1250);
  });

  test("rejects an invalid price inline", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin/menu");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Add item" }).click();
    await page.getByLabel("Name").fill("Whatever");
    await page.getByLabel("Category").fill("Snacks");
    await page.getByLabel("Price (₹)").fill("12.345");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Enter a price like 45 or 45.50.")).toBeVisible();
  });
});

test.describe("admin: slots", () => {
  test("creates a block of slots", async ({ page }) => {
    const day = `${2100 + Math.floor(Math.random() * 400)}-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}`;
    await signInAdmin(page);
    await page.goto("/admin/slots");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Day").fill(day);
    await page.getByLabel("From").fill("13:00");
    await page.getByLabel("Until").fill("14:00");
    await page.getByLabel("Minutes per slot").fill("10");
    await page.getByLabel("Orders per slot").fill("15");
    await page.getByRole("button", { name: "Create slots" }).click();

    await expect(page.getByText("Created 6 slots")).toBeVisible();
    const { count } = await admin
      .from("slots")
      .select("id", { count: "exact", head: true })
      .gte("starts_at", `${day}T07:00:00Z`)
      .lt("starts_at", `${day}T09:00:00Z`);
    expect(count).toBe(6);

    await page.getByRole("button", { name: "Create slots" }).click();
    await expect(page.getByText("Those slots already exist")).toBeVisible();
  });

  test("changes a slot's capacity but not below what is booked", async ({ page }) => {
    const slot = await createSlot(-40, 10, (await seededCanteen()).id); // started 40 minutes ago: listed near the top
    await admin.from("slots").update({ booked_count: 6 }).eq("id", slot.id);
    await signInAdmin(page);
    await page.goto("/admin/slots");
    await page.waitForLoadState("networkidle");
    const row = page.locator(`[data-slot-id="${slot.id}"]`);
    const input = row.getByRole("textbox");

    await input.fill("5");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/fewer than the orders already placed/)).toBeVisible();

    await input.fill("8");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Capacity saved")).toBeVisible();
    await expect.poll(async () => (await admin.from("slots").select("capacity").eq("id", slot.id).single()).data?.capacity).toBe(8);
  });
});

test.describe("admin: defaulters", () => {
  test("lists a defaulter's details, and Mark paid lets them order again", async ({ page }) => {
    // A student who took a seat and never came: ready, hold over, flagged.
    const student = await createUser();
    const staff = await createUser("staff");
    const item = await createMenuItem({ price_paise: 4500 });
    const slot = await createSlot(30, 5);
    const placed = await student.client.rpc("place_order", {
      p_canteen_id: (await defaultCanteen()).id,
      p_slot_id: slot.id,
      p_items: [{ menu_item_id: item.id, qty: 2 }],
      p_request_id: randomUUID(),
    });
    const orderId = (placed.data as { id: string }).id;
    await staff.client.rpc("accept_order", { p_order_id: orderId });
    await staff.client.rpc("mark_ready", { p_order_id: orderId });
    await admin.from("slots").update({ starts_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq("id", slot.id);
    expect((await staff.client.rpc("flag_no_show", { p_order_id: orderId })).error).toBeNull();
    const { data: profile } = await admin.from("profiles").select("full_name, phone, reg_no").eq("id", student.id).single();

    await signInAdmin(page);
    await page.goto("/admin/defaulters");
    const card = page.locator(`[data-student-id="${student.id}"]`);

    await expect(card).toContainText(profile!.full_name);
    await expect(card).toContainText(profile!.phone!);
    await expect(card).toContainText(profile!.reg_no!);
    await expect(card).toContainText("₹90.00");

    await page.waitForLoadState("networkidle");
    await card.getByRole("button", { name: "Mark paid" }).click();

    await expect(card).toHaveCount(0);
    const { data: after } = await admin.from("profiles").select("is_defaulter").eq("id", student.id).single();
    expect(after?.is_defaulter).toBe(false);
    const again = await student.client.rpc("place_order", {
      p_canteen_id: (await defaultCanteen()).id,
      p_slot_id: (await createSlot(60, 5)).id,
      p_items: [{ menu_item_id: item.id, qty: 1 }],
      p_request_id: randomUUID(),
    });
    expect(again.error).toBeNull();
  });
});

test.describe("admin: staff accounts", () => {
  test("creates a login shown once, which the staff member must change; reset and deactivate work", async ({ page, browser }) => {
    const loginId = `st${randomUUID().slice(0, 8)}`;
    const staffName = `Ravi ${randomUUID().slice(0, 6)}`;
    await signInAdmin(page);
    await page.goto("/admin/staff");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Full name").fill(staffName);
    await page.getByLabel("Login ID").fill(loginId);
    await page.getByRole("button", { name: "Create login" }).click();

    const notice = page.getByRole("status", { name: "Temporary password" });
    await expect(notice).toContainText(loginId);
    const firstPassword = (await notice.locator(".order-code").innerText()).trim();
    expect(firstPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    await notice.getByRole("button", { name: "I have noted it down" }).click();
    await expect(page.getByRole("status", { name: "Temporary password" })).toHaveCount(0);
    await expect(page.locator(`[data-login-id="${loginId}"]`)).toContainText(staffName);

    // The staff member signs in with it and must choose a new password.
    const staffContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const staffPage = await staffContext.newPage();
    await staffSignIn(staffPage, loginId, firstPassword);
    await expect(staffPage).toHaveURL(/\/change-password/);
    await staffPage.getByLabel("New password", { exact: true }).fill("a-better-password-1");
    await staffPage.getByLabel("Confirm new password").fill("a-better-password-1");
    await staffPage.getByRole("button", { name: "Save and continue" }).click();
    await expect(staffPage).toHaveURL(/\/staff$/);

    // A reset gives a different temporary password.
    await page.getByRole("button", { name: `Reset password for ${staffName}` }).click();
    const resetNotice = page.getByRole("status", { name: "Temporary password" });
    await expect(resetNotice).toContainText("Password reset");
    expect((await resetNotice.locator(".order-code").innerText()).trim()).not.toBe(firstPassword);

    // Deactivating blocks the staff member's next request.
    await page.getByRole("button", { name: `Deactivate ${staffName}` }).click();
    await expect(page.getByText(`${staffName} is deactivated`)).toBeVisible();
    await staffPage.goto("/staff");
    await expect(staffPage).toHaveURL(/\/login\?inactive=1/);
    await staffContext.close();
  });

  test("a duplicate or invalid login ID is explained", async ({ page }) => {
    const existing = await createStaffLogin();
    await signInAdmin(page);
    await page.goto("/admin/staff");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Full name").fill("Someone");
    await page.getByLabel("Login ID").fill(existing.loginId);
    await page.getByRole("button", { name: "Create login" }).click();
    await expect(page.getByText("That login ID is already used.")).toBeVisible();

    await page.getByLabel("Login ID").fill("no spaces allowed");
    await page.getByRole("button", { name: "Create login" }).click();
    await expect(page.getByText(/Use 3 to 32 letters/)).toBeVisible();
  });

  test("a staff member cannot open any admin page", async ({ page }) => {
    const staff = await createStaffLogin();
    await staffSignIn(page, staff.loginId, staff.password);
    await expect(page).toHaveURL(/\/staff$/);

    for (const path of ["/admin", "/admin/staff", "/admin/menu", "/admin/defaulters", "/admin/slots"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/staff$/);
    }
  });
});
