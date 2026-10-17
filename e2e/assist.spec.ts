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

test.describe("chat assistant", () => {
  test("answers a starter question without an error", async ({ page }) => {
    await signUpStudent(page);

    await page.getByRole("region", { name: "Canteen assistant" }).getByRole("button", { name: "Chat" }).click();
    const sheet = page.getByRole("dialog", { name: "Chat with the assistant" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("Message the assistant")).toHaveAttribute("maxlength", "300");

    await sheet.getByRole("button", { name: "Hot and quick" }).click();

    // No key in the test environment: the fixed fallback reply. With a key, any model reply lands here too.
    const log = sheet.getByRole("log");
    await expect(log).toContainText("Hot and quick");
    await expect(log).toContainText(/\S+/);
    await expect(sheet.getByText("Thinking…")).toBeHidden();
    await expect(log.getByText("Assistant:")).toHaveCount(1);
    await expect(page.getByText("Check your connection")).toHaveCount(0);
  });
});
