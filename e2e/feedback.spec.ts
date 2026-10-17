import { expect, test } from "@playwright/test";
import { createUser, seededCanteen } from "../tests/integration/helpers";
import { createStaffLogin, placeTestOrder, staffSignIn } from "./helpers";

/** The counter hands the order over: accepted, ready, collected (a staff member of the order's canteen). */
async function collect(orderId: string) {
  const staff = await createUser("staff", { canteenId: (await seededCanteen()).id });
  for (const step of ["accept_order", "mark_ready", "collect_order"]) {
    const { error } = await staff.client.rpc(step, { p_order_id: orderId });
    expect(error).toBeNull();
  }
}

test.describe("star feedback after delivery", () => {
  test("the student rates a collected order and staff read it", async ({ page }) => {
    const { code, orderId } = await placeTestOrder(page);
    const rating = page.getByRole("radiogroup", { name: "Rating" });

    // Not delivered yet: no form.
    await expect(page.getByText("Waiting for the canteen to accept your order.")).toBeVisible();
    await expect(rating).toHaveCount(0);

    await collect(orderId);

    // The page follows the order live; the form appears once it is collected.
    await expect(rating).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Send feedback" })).toBeDisabled();

    await page.getByRole("radio", { name: "4 stars" }).click();
    await expect(page.getByRole("radio", { name: "4 stars" })).toHaveAttribute("aria-checked", "true");
    await page.getByLabel("Anything to add?").fill("Hot samosas, quick service <b>thanks</b>");
    await page.getByRole("button", { name: "Send feedback" }).click();

    await expect(page.getByText("Thanks! You rated it ★★★★☆")).toBeVisible();
    await expect(rating).toHaveCount(0);

    // Reloading still shows the read-only state, from the stored row.
    await page.reload();
    // `:visible`: right after a reload the page can briefly hold a hidden copy of this block (seen once as a strict-mode clash).
    await expect(page.locator("p:visible", { hasText: "Thanks! You rated it ★★★★☆" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send feedback" })).toHaveCount(0);

    // Staff of the canteen see it, with the order code and the rating.
    await page.context().clearCookies();
    const staff = await createStaffLogin();
    await staffSignIn(page, staff.loginId, staff.password);
    await expect(page).toHaveURL(/\/staff$/);
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(await fits()).toBe(true); // the header with the new link still fits a phone
    await page.getByRole("link", { name: "Feedback" }).click();
    await expect(page).toHaveURL(/\/staff\/feedback$/);

    const entry = page.locator(`[data-order-code="${code}"]`);
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("Hot samosas, quick service <b>thanks</b>");
    await expect(entry.getByRole("img", { name: "4 out of 5 stars" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Rating summary" })).toBeVisible();
    expect(await fits()).toBe(true);
  });
});
