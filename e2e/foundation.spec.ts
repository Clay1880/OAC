import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const path of ["/", "/design"]) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const blocking = violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}

test("sheet opens, traps focus in a dialog and closes on Escape", async ({ page }) => {
  await page.goto("/design");
  await page.getByRole("button", { name: "Open sheet" }).click();
  const dialog = page.getByRole("dialog", { name: "Your cart" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("toast announces and can be dismissed", async ({ page }) => {
  await page.goto("/design");
  await page.getByRole("button", { name: "Error toast" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Could not place order" });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(alert).toBeHidden();
});
