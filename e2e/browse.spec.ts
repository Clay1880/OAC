import { expect, test } from "@playwright/test";
import { admin, placeTestOrder, signUpStudent } from "./helpers";
import { seededCanteen } from "../tests/integration/helpers";

const rupees = (text: string | null) => Number((text ?? "").replace(/[^\d.]/g, ""));

test.describe("browsing the menu", () => {
  test("sorting by price shows one grid, cheapest first, without category headings", async ({ page }) => {
    await signUpStudent(page);
    const grid = page.getByRole("region", { name: "Menu" });
    await expect(page.locator("h2[id^='cat-']").first()).toBeVisible();

    const low = page.getByRole("button", { name: "Price: low to high" });
    await low.click();
    await expect(low).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("h2[id^='cat-']")).toHaveCount(0);

    const { data } = await admin
      .from("menu_items")
      .select("price_paise")
      .eq("canteen_id", (await seededCanteen()).id)
      .eq("is_available", true)
      .order("price_paise")
      .limit(1)
      .single();
    const cards = grid.getByRole("listitem");
    await expect(cards.first().locator(".num")).toHaveText(new RegExp(`${(data!.price_paise / 100).toFixed(2)}$`));

    const prices = (await grid.locator("li .num").allTextContents()).map(rupees);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    await page.getByRole("button", { name: "Price: high to low" }).click();
    const desc = (await grid.locator("li .num").allTextContents()).map(rupees);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));

    // Tapping the active sort returns to the grouped menu.
    await page.getByRole("button", { name: "Price: high to low" }).click();
    await expect(page.locator("h2[id^='cat-']").first()).toBeVisible();
  });

  test("Under ₹30 leaves only cheaper dishes, and tapping it again clears the cap", async ({ page }) => {
    await signUpStudent(page);
    const grid = page.locator("section[aria-labelledby^='cat-']");

    const cap = page.getByRole("button", { name: "Under ₹30" });
    await cap.click();
    await expect(cap).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Under ₹50" })).toHaveAttribute("aria-pressed", "false");

    const prices = (await grid.locator("li .num").allTextContents()).map(rupees);
    expect(prices.length).toBeGreaterThan(0);
    for (const p of prices) expect(p).toBeLessThan(30);

    await cap.click();
    await expect(cap).toHaveAttribute("aria-pressed", "false");
    // The menu can change under us (other tests add dishes), so compare with the capped list, not a snapshot.
    await expect.poll(() => grid.locator("li .num").count()).toBeGreaterThan(prices.length);
  });

  test("Order again is empty for a new student and fills after an order", async ({ page }) => {
    await signUpStudent(page);
    await expect(page.getByRole("heading", { name: "Order again" })).toHaveCount(0);

    const { item } = await placeTestOrder(page, { alreadySignedIn: true });
    await page.goto("/");

    const row = page.getByRole("region", { name: "Order again" });
    await expect(row).toBeVisible();
    await expect(row).toContainText(item.name);
    await expect(row.getByRole("button", { name: `Add ${item.name}` })).toBeVisible();
  });
});
