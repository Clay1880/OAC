import { expect, test, type Page } from "@playwright/test";
import { createMenuItem, createSlot } from "../tests/integration/helpers";
import { admin, chooseSlotTime, signUpStudent } from "./helpers";

async function addToCart(page: Page, itemId: string, name: string) {
  await page.locator(`[data-item-id="${itemId}"]`).getByRole("button", { name: `Add ${name}` }).click();
}

async function openCheckout(page: Page) {
  await page.getByRole("button", { name: /View order/ }).click();
  await page.getByRole("link", { name: "Choose pickup time" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
}

test.describe("student ordering", () => {
  test("shows the menu, and the clock only books times that are open with seats", async ({ page }) => {
    const item = await createMenuItem({ name: `Test Dosa ${Date.now()}`, price_paise: 6000 });
    const soldOut = await createMenuItem({ name: `Test Soldout ${Date.now()}`, is_available: false });
    const open = await createSlot(30, 5);
    const full = await createSlot(35, 2);
    await admin.from("slots").update({ booked_count: 2 }).eq("id", full.id);
    const closing = await createSlot(2, 5);
    const past = await createSlot(-10, 5);
    await createSlot(40, 5); // a free time after the full one

    await signUpStudent(page);
    await expect(page.locator(`[data-item-id="${soldOut.id}"]`)).toContainText("Sold out");
    await expect(page.locator(`[data-item-id="${soldOut.id}"]`).getByRole("button")).toHaveCount(0);

    await addToCart(page, item.id, item.name);
    await openCheckout(page);
    const place = page.getByRole("button", { name: /Place order/ });

    // It starts on a free time, so ordering is possible straight away.
    await expect(place).toBeEnabled();

    await chooseSlotTime(page, open);
    await expect(page.getByText(/5 seats left at/)).toBeVisible();
    await expect(place).toBeEnabled();

    // A full time is refused and the nearest free one is offered.
    await chooseSlotTime(page, full);
    await expect(page.getByText(/is not available\. \+\d+ minutes? will work/)).toBeVisible();
    await expect(place).toBeDisabled();
    await page.getByRole("button", { name: /^Use / }).click();
    await expect(place).toBeEnabled();
    await expect(page.getByText(/is not available/)).toHaveCount(0);

    // Times that are inside the cutoff, or already past, are not offered either.
    for (const unbookable of [closing, past]) {
      await chooseSlotTime(page, unbookable);
      await expect(page.getByText(/is not available/)).toBeVisible();
      await expect(place).toBeDisabled();
    }
  });

  test("places an order and lands on the tracking page", async ({ page }) => {
    const item = await createMenuItem({ name: `Test Samosa ${Date.now()}`, price_paise: 2500 });
    const slot = await createSlot(30, 5);
    const student = await signUpStudent(page);

    await addToCart(page, item.id, item.name);
    await page.locator(`[data-item-id="${item.id}"]`).getByRole("button", { name: `Add one ${item.name}` }).click();
    await openCheckout(page);
    await chooseSlotTime(page, slot);
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
    await chooseSlotTime(page, slot);
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
    await chooseSlotTime(page, slot);
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
