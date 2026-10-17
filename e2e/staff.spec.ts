import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createMenuItem, createSlot, createUser } from "../tests/integration/helpers";
import { admin, createStaffLogin, staffSignIn } from "./helpers";

type Slot = { id: string };
type Item = { id: string; name: string };

/** A student (via the database, not the UI) places a one-item order. */
async function placeOrder(opts: { slot?: Slot; item?: Item; qty?: number } = {}) {
  const student = await createUser();
  const item = opts.item ?? (await createMenuItem({ name: `Test Item ${randomUUID().slice(0, 6)}` }));
  const slot = opts.slot ?? (await createSlot(30, 10));
  const { data, error } = await student.client.rpc("place_order", {
    p_slot_id: slot.id,
    p_items: [{ menu_item_id: item.id, qty: opts.qty ?? 1 }],
    p_request_id: randomUUID(),
  });
  expect(error).toBeNull();
  return { order: data as { id: string; code: string }, item, slot, student };
}

async function signInStaff(page: Page) {
  const staff = await createStaffLogin();
  await staffSignIn(page, staff.loginId, staff.password);
  await expect(page).toHaveURL(/\/staff$/);
  return staff;
}

const card = (page: Page, code: string) => page.locator(`[data-order-code="${code}"]`);
const statusOf = async (orderId: string) =>
  (await admin.from("orders").select("status").eq("id", orderId).single()).data?.status;

test.describe("staff counter console", () => {
  test("a new order appears live with a vibration and a short sound", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __vibrations: number; __beeps: number };
      w.__vibrations = 0;
      w.__beeps = 0;
      navigator.vibrate = () => {
        w.__vibrations += 1;
        return true;
      };
      class FakeAudio {
        state = "running";
        currentTime = 0;
        destination = {};
        resume() {
          return Promise.resolve();
        }
        createGain() {
          return { gain: { value: 0 }, connect() {} };
        }
        createOscillator() {
          w.__beeps += 1;
          return { type: "", frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
        }
      }
      (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudio;
    });
    await signInStaff(page);
    await page.getByLabel("Find by order ID").click(); // a tap, which is what unlocks sound

    const { order } = await placeOrder();

    await expect(card(page, order.code)).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __vibrations: number }).__vibrations)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __beeps: number }).__beeps)).toBeGreaterThan(0);
  });

  test("one tap each: Accept, Mark ready, Collected", async ({ page }) => {
    const { order } = await placeOrder();
    await signInStaff(page);
    const c = card(page, order.code);

    await c.getByRole("button", { name: "Accept" }).click();
    await expect(c.getByRole("button", { name: "Mark ready" })).toBeVisible();
    await expect.poll(() => statusOf(order.id)).toBe("accepted");

    await c.getByRole("button", { name: "Mark ready" }).click();
    await expect(c.getByRole("button", { name: /Collected/ })).toBeVisible();
    await expect.poll(() => statusOf(order.id)).toBe("ready");

    await c.getByRole("button", { name: /Collected/ }).click();
    await expect(c).toHaveCount(0);
    await expect.poll(() => statusOf(order.id)).toBe("collected");
  });

  test("the action buttons are phone-sized: at least 48px tall", async ({ page }) => {
    const { order } = await placeOrder();
    await signInStaff(page);

    const box = await card(page, order.code).getByRole("button", { name: "Accept" }).boundingBox();

    expect(box!.height).toBeGreaterThanOrEqual(48);
  });

  test("lookup finds an order by the last characters of its ID, ignoring case", async ({ page }) => {
    const { order } = await placeOrder();
    const other = await placeOrder();
    await signInStaff(page);
    await expect(card(page, other.order.code)).toBeVisible();

    await page.getByLabel("Find by order ID").fill(order.code.slice(-4).toLowerCase());

    await expect(card(page, order.code)).toBeVisible();
    await expect(card(page, other.order.code)).toHaveCount(0);

    await page.getByLabel("Find by order ID").fill("K0O1");
    await expect(page.getByText(/never contain 0, 1, I or O/)).toBeVisible();
  });

  test("a slot group shows a prep summary of what to cook", async ({ page }) => {
    const item = await createMenuItem({ name: `Test Samosa ${randomUUID().slice(0, 6)}` });
    const slot = await createSlot(30, 10);
    const first = await placeOrder({ item, slot, qty: 1 });
    await placeOrder({ item, slot, qty: 2 });
    await signInStaff(page);

    const group = page.locator("section[data-slot-start]", { has: card(page, first.order.code) });

    await expect(group.getByLabel("To cook")).toContainText(`3 × ${item.name}`);
  });

  test("Flag no-show is disabled with a countdown until 15 minutes after the slot starts", async ({ page }) => {
    const { order, slot } = await placeOrder();
    const staff = await createUser("staff");
    await staff.client.rpc("accept_order", { p_order_id: order.id });
    await staff.client.rpc("mark_ready", { p_order_id: order.id });
    await signInStaff(page);
    const flag = card(page, order.code).getByRole("button", { name: /Flag no-show/ });

    await expect(flag).toBeDisabled();
    await expect(flag).toContainText(/\d+:\d\d/);

    // The slot started 20 minutes ago.
    await admin.from("slots").update({ starts_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq("id", slot.id);
    await page.reload();

    await expect(flag).toBeEnabled();
    await flag.click();
    await expect(card(page, order.code).getByRole("button", { name: /Paid · collected/ })).toBeVisible();
    await expect.poll(() => statusOf(order.id)).toBe("no_show");
  });

  test("an action the server refuses is rolled back with a message", async ({ page }) => {
    const { order } = await placeOrder();
    await signInStaff(page);
    const c = card(page, order.code);
    await expect(c.getByRole("button", { name: "Accept" })).toBeVisible();

    // Someone else accepts it first: this screen is now stale.
    const other = await createUser("staff");
    await other.client.rpc("accept_order", { p_order_id: order.id });
    await c.getByRole("button", { name: "Accept" }).click();

    await expect(page.getByText(/already changed that order/)).toBeVisible();
    await expect(c).toHaveAttribute("data-status", "accepted");
  });

  test("shows an offline banner and clears it when the connection returns", async ({ page, context }) => {
    await signInStaff(page);

    await context.setOffline(true);
    await expect(page.getByText(/You are offline/)).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText(/You are offline/)).toHaveCount(0);
  });
});
