import { expect, test } from "@playwright/test";
import { signUpStudent } from "./helpers";

test.describe("mood assistant", () => {
  test("suggests picks for a mood and adds one to the cart", async ({ page }) => {
    await signUpStudent(page);

    await page.getByRole("button", { name: "Ask the assistant" }).click();
    const sheet = page.getByRole("dialog", { name: "What are you in the mood for?" });
    await expect(sheet).toBeVisible();

    const tired = sheet.getByRole("button", { name: "Tired" });
    await tired.click();
    await expect(tired).toHaveAttribute("aria-pressed", "true");
    await sheet.getByRole("button", { name: "Suggest" }).click();

    // The seeded menu has far more than three available dishes, so the route always fills three.
    const rows = sheet.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    for (const row of await rows.all()) {
      await expect(row.getByRole("button", { name: /^Add / })).toBeVisible();
    }

    await rows.first().getByRole("button", { name: /^Add / }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /View order/ })).toContainText("1 item");
  });
});
