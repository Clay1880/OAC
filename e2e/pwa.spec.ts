import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { admin, placeTestOrder, signUpStudent } from "./helpers";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

test.describe("installable app", () => {
  test("the manifest is valid and linked, and its icons load", async ({ page, request }) => {
    await page.goto("/login");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();

    const res = await request.get(href!);
    expect(res.ok()).toBe(true);
    const manifest = await res.json();

    expect(manifest).toMatchObject({ display: "standalone", start_url: "/", scope: "/", lang: "en-IN" });
    expect(manifest.name).toContain("OAC");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);

    const icons = manifest.icons as { src: string; sizes: string; type: string; purpose?: string }[];
    expect(icons.some((i) => i.sizes === "192x192" && (i.purpose ?? "any") === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && (i.purpose ?? "any") === "any")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
    for (const icon of icons) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.ok(), icon.src).toBe(true);
      expect(iconRes.headers()["content-type"]).toContain("image/png");
    }
  });

  test("the service worker registers and takes control", async ({ page }) => {
    await page.goto("/login");

    // `ready` resolves once a worker is active, which can still be mid-activation.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state))
      .toBe("activated");
    expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller?.scriptURL ?? "http://x/").pathname)).toMatch(/sw\.js|\/$/);
  });

  test("the offline page is served, styled, when the network is down", async ({ page, context }) => {
    await page.goto("/login");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // from here on the worker controls this page
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    // The paper background only appears if the cached stylesheet loaded too.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(245, 239, 227)");
    await context.setOffline(false);
  });
});

test.describe("ready alerts", () => {
  // Playwright's browser reports notifications as denied; a real student has not decided yet.
  test.use({ permissions: ["notifications"] });

  test("the push prompt appears only after the first order is placed, never on first load", async ({ page }) => {
    await signUpStudent(page);
    const prompt = page.getByRole("button", { name: /ready alert/i });

    await expect(page.getByRole("heading", { name: "What are you having?" })).toBeVisible();
    await expect(prompt).toHaveCount(0);
    await page.goto("/orders");
    await expect(prompt).toHaveCount(0);

    await placeTestOrder(page, { alreadySignedIn: true });

    await expect(prompt).toBeVisible();
  });

  test.describe("on an iPhone in the browser", () => {
    test.use({ userAgent: IPHONE_UA });

    test("sees Add to Home Screen guidance instead of a broken permission button", async ({ page }) => {
      await placeTestOrder(page);

      await expect(page.getByText("Add to Home Screen to get ready alerts")).toBeVisible();
      await expect(page.getByRole("button", { name: /ready alert/i })).toHaveCount(0);
      // Without push, the page itself still shows the live status.
      await expect(page.getByRole("list", { name: "Order progress" })).toBeVisible();
    });
  });
});

test.describe("push subscription endpoint", () => {
  const subscription = () => ({
    endpoint: `https://push.example/${randomUUID()}`,
    expirationTime: null,
    keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
  });

  test("stores the signed-in student's subscription", async ({ page }) => {
    const student = await signUpStudent(page);
    const sub = subscription();

    const res = await page.request.post("/api/push/subscribe", { data: sub });

    expect(res.status()).toBe(200);
    const { data } = await admin.from("push_subscriptions").select("user_id, p256dh").eq("endpoint", sub.endpoint).single();
    expect(data).toMatchObject({ user_id: student.id, p256dh: sub.keys.p256dh });
  });

  test("rejects a malformed body", async ({ page }) => {
    await signUpStudent(page);

    expect((await page.request.post("/api/push/subscribe", { data: {} })).status()).toBe(400);
    expect((await page.request.post("/api/push/subscribe", { data: { endpoint: "javascript:alert(1)", keys: { p256dh: "a", auth: "b" } } })).status()).toBe(400);
  });

  test("rejects a signed-out caller", async ({ request }) => {
    const res = await request.post("/api/push/subscribe", { data: subscription() });

    expect(res.status()).toBe(401);
  });
});
