import { expect, test, type Page } from "@playwright/test";
import { createUser, seededCanteen } from "../tests/integration/helpers";
import { admin, placeTestOrder } from "./helpers";

const currentStep = (page: Page) => page.getByRole("list", { name: "Order progress" }).locator('[aria-current="step"]');

async function staffAdvance(orderId: string, to: "accepted" | "ready") {
  const staff = await createUser("staff", { canteenId: (await seededCanteen()).id });
  const accept = await staff.client.rpc("accept_order", { p_order_id: orderId });
  expect(accept.error).toBeNull();
  if (to === "ready") {
    const ready = await staff.client.rpc("mark_ready", { p_order_id: orderId });
    expect(ready.error).toBeNull();
  }
}

test.describe("order tracking", () => {
  test("shows the order ID, slot time, items, total and a status timeline", async ({ page }) => {
    const { code } = await placeTestOrder(page, { itemName: "Test Thali", pricePaise: 4500 });

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(code);
    await expect(page.getByText("Test Thali")).toBeVisible();
    await expect(page.getByText("₹45.00").first()).toBeVisible();
    await expect(page.getByText(/pay at the counter/i).first()).toBeVisible();
    await expect(page.getByRole("list", { name: "Order progress" })).toBeVisible();
    await expect(currentStep(page)).toContainText("Placed");
  });

  test("staff marking the order ready updates the page without a reload", async ({ page }) => {
    const { orderId } = await placeTestOrder(page);
    await expect(page.getByText("Placed").first()).toBeVisible();

    await staffAdvance(orderId, "ready");

    await expect(currentStep(page)).toContainText("Ready", { timeout: 10_000 });
  });

  test("after a background/foreground cycle with Realtime disconnected, the page still shows Ready", async ({ page }) => {
    const { code, orderId } = await placeTestOrder(page);
    // Kill Realtime for every page load from here on, then reload so the socket never connects.
    await page.routeWebSocket(/realtime/, (ws) => ws.close());
    await page.goto(`/orders/${code}`);
    await expect(currentStep(page)).toContainText("Placed");

    await staffAdvance(orderId, "ready");
    // The phone comes back from the background.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await expect(currentStep(page)).toContainText("Ready", { timeout: 10_000 });
  });

  test("the student can cancel while placed", async ({ page }) => {
    const { orderId } = await placeTestOrder(page);

    await page.getByRole("button", { name: "Cancel order" }).click();

    await expect(page.getByText("This order was cancelled.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
    const { data } = await admin.from("orders").select("status").eq("id", orderId).single();
    expect(data?.status).toBe("cancelled");
  });

  test("the cancel button is gone once the order is accepted", async ({ page }) => {
    const { orderId } = await placeTestOrder(page);
    await expect(page.getByRole("button", { name: "Cancel order" })).toBeVisible();

    await staffAdvance(orderId, "accepted");

    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0, { timeout: 10_000 });
  });

  test("a no-show order says it is unpaid and to pay at the counter", async ({ page }) => {
    const { orderId, code } = await placeTestOrder(page);
    await admin.from("orders").update({ status: "no_show", flagged_at: new Date().toISOString() }).eq("id", orderId);

    await page.goto(`/orders/${code}`);

    await expect(page.getByText(/unpaid/i).first()).toBeVisible();
    await expect(page.getByText(/pay at the counter/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
  });

  test("my orders lists the order and links to it", async ({ page }) => {
    const { code } = await placeTestOrder(page);

    await page.goto("/orders");
    await page.getByRole("link", { name: new RegExp(code) }).click();

    await expect(page).toHaveURL(new RegExp(`/orders/${code}$`));
  });
});
