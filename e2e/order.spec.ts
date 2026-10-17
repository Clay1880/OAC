import { expect, test, type Page } from "@playwright/test";
import { createMenuItem, createSlot } from "../tests/integration/helpers";
import { admin, signUpStudent } from "./helpers";

async function addToCart(page: Page, itemId: string, name: string) {
  await page.locator(`[data-item-id="${itemId}"]`).getByRole("button", { name: `Add ${name}` }).click();
}

async function openCheckout(page: Page) {
  await page.getByRole("button", { name: /View order/ }).click();
  await page.getByRole("link", { name: "Choose pickup time" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
}

test.describe("student ordering", () => {
  test("shows the menu, only open slots with seats, and Full slots disabled", async ({ page }) => {
    const item = await createMenuItem({ name: `Test Dosa ${Date.now()}`, price_paise: 6000 });
    const soldOut = await createMenuItem({ name: `Test Soldout ${Date.now()}`, is_available: false });
    const open = await createSlot(30, 5);
    const full = await createSlot(35, 2);
    await admin.from("slots").update({ booked_count: 2 }).eq("id", full.id);
    const closing = await createSlot(2, 5);
    const past = await createSlot(-10, 5);

    await signUpStudent(page);
    await expect(page.locator(`[data-item-id="${soldOut.id}"]`)).toContainText("Sold out");
    await expect(page.locator(`[data-item-id="${soldOut.id}"]`).getByRole("button")).toHaveCount(0);

    await addToCart(page, item.id, item.name);
    await openCheckout(page);

    await expect(page.locator(`[data-slot-id="${open.id}"]`)).toContainText("5 seats left");
    const fullChip = page.locator(`[data-slot-id="${full.id}"]`);
    await expect(fullChip).toContainText("Full");
    await expect(fullChip).toHaveAttribute("aria-disabled", "true");
    await fullChip.click({ force: true }); // aria-disabled: Playwright would otherwise wait forever
    await expect(fullChip).toHaveAttribute("aria-checked", "false");
    await expect(page.locator(`[data-slot-id="${closing.id}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-slot-id="${past.id}"]`)).toHaveCount(0);
  });

  test("places an order and lands on the tracking page", async ({ page }) => {
    const item = await createMenuItem({ name: `Test Samosa ${Date.now()}`, price_paise: 2500 });
    const slot = await createSlot(30, 5);
    const student = await signUpStudent(page);

    await addToCart(page, item.id, item.name);
    await page.locator(`[data-item-id="${item.id}"]`).getByRole("button", { name: `Add one ${item.name}` }).click();
    await openCheckout(page);
    await expect(page.getByRole("button", { name: /Place order/ })).toBeDisabled();
    await page.locator(`[data-slot-id="${slot.id}"]`).click();
    await page.getByRole("button", { name: /Place order/ }).click();

    await expect(page).toHaveURL(/\/orders\/OAC-[2-9A-HJ-NP-Z]{5}$/);
    const { data: orders } = await admin.from("orders").select("total_paise, slot_id").eq("student_id", student.id);
    expect(orders).toEqual([{ total_paise: 5000, slot_id: slot.id }]);
  });

  test("double-tapping Place order creates one order", async ({ page }) => {
    const item = await createMenuItem({ name: `Test Tea ${Date.now()}` });
    const slot = await createSlot(30, 5);
    const student = await signUpStudent(page);

    await addToCart(page, item.id, item.name);
    await openCheckout(page);
    await page.locator(`[data-slot-id="${slot.id}"]`).click();
    await page.getByRole("button", { name: /Place order/ }).dblclick();

    await expect(page).toHaveURL(/\/orders\/OAC-/);
    const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("student_id", student.id);
    expect(count).toBe(1);
    const { data } = await admin.from("slots").select("booked_count").eq("id", slot.id).single();
    expect(data?.booked_count).toBe(1);
  });

  test("a sold-out item is highlighted and the order is not placed", async ({ page }) => {
    const item = await createMenuItem({ name: `Test Puff ${Date.now()}` });
    const slot = await createSlot(30, 5);
    const student = await signUpStudent(page);

    await addToCart(page, item.id, item.name);
    await openCheckout(page);
    await page.locator(`[data-slot-id="${slot.id}"]`).click();
    await admin.from("menu_items").update({ is_available: false }).eq("id", item.id);
    await page.getByRole("button", { name: /Place order/ }).click();

    await expect(page.locator("li[data-flagged]")).toContainText("Sold out");
    await expect(page.getByRole("button", { name: /Place order/ })).toBeDisabled();
    await expect(page).toHaveURL(/\/checkout$/);
    const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("student_id", student.id);
    expect(count).toBe(0);
  });

  test("the cart survives a reload", async ({ page }) => {
    const item = await createMenuItem({ name: `Test Roll ${Date.now()}` });
    await signUpStudent(page);

    await addToCart(page, item.id, item.name);
    await page.reload();

    await expect(page.getByRole("button", { name: /View order/ })).toContainText("1 item");
  });

  test("a defaulter sees a blocking screen with no checkout", async ({ page }) => {
    const student = await signUpStudent(page);
    await admin.from("profiles").update({ is_defaulter: true }).eq("id", student.id);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Clear your dues at the counter" })).toBeVisible();
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Clear your dues at the counter" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Place order/ })).toHaveCount(0);
  });
});
