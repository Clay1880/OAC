import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, createUser, SERVICE_KEY, URL } from "./helpers";

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

import webpush from "web-push";
import { sendPushToUser } from "../../src/lib/push/send";

const send = vi.mocked(webpush.sendNotification);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@college.edu");
  send.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const payload = { title: "Ready", body: "Your order OAC-ABCDE is ready", url: "/orders/OAC-ABCDE" };

async function subscribe(userId: string, endpoint = `https://push.example/${randomUUID()}`) {
  const { error } = await admin.from("push_subscriptions").insert({ user_id: userId, endpoint, p256dh: "p256", auth: "auth" });
  expect(error).toBeNull();
  return endpoint;
}
const endpointsOf = async (userId: string) =>
  ((await admin.from("push_subscriptions").select("endpoint").eq("user_id", userId)).data ?? []).map((r) => r.endpoint);

describe("sendPushToUser", () => {
  it("sends the payload to every subscription of that user only", async () => {
    const user = await createUser();
    const other = await createUser();
    const a = await subscribe(user.id);
    const b = await subscribe(user.id);
    await subscribe(other.id);
    send.mockResolvedValue({} as never);

    await sendPushToUser(user.id, payload);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map((c) => (c[0] as { endpoint: string }).endpoint).sort()).toEqual([a, b].sort());
    expect(send.mock.calls[0][0]).toMatchObject({ keys: { p256dh: "p256", auth: "auth" } });
    expect(JSON.parse(send.mock.calls[0][1] as string)).toEqual(payload);
  });

  it.each([404, 410])("deletes a subscription the push service reports gone (%i), keeps the others", async (statusCode) => {
    const user = await createUser();
    const dead = await subscribe(user.id);
    const alive = await subscribe(user.id);
    send.mockImplementation(async (sub) => {
      if ((sub as { endpoint: string }).endpoint === dead) throw Object.assign(new Error("gone"), { statusCode });
      return {} as never;
    });

    await expect(sendPushToUser(user.id, payload)).resolves.toBeUndefined();

    expect(await endpointsOf(user.id)).toEqual([alive]);
  });

  it("swallows other errors and keeps the subscription", async () => {
    const user = await createUser();
    const endpoint = await subscribe(user.id);
    send.mockRejectedValue(Object.assign(new Error("push service down"), { statusCode: 503 }));

    await expect(sendPushToUser(user.id, payload)).resolves.toBeUndefined();
    send.mockRejectedValue(new Error("socket hang up"));
    await expect(sendPushToUser(user.id, payload)).resolves.toBeUndefined();

    expect(await endpointsOf(user.id)).toEqual([endpoint]);
  });

  it("does nothing for a user with no subscriptions", async () => {
    const user = await createUser();

    await expect(sendPushToUser(user.id, payload)).resolves.toBeUndefined();

    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing, without throwing, when VAPID keys are not configured", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const user = await createUser();
    await subscribe(user.id);

    await expect(sendPushToUser(user.id, payload)).resolves.toBeUndefined();

    expect(send).not.toHaveBeenCalled();
  });

  it("does not throw when the database is unreachable", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");

    await expect(sendPushToUser(randomUUID(), payload)).resolves.toBeUndefined();
  }, 20_000);
});

describe("upsert_push_subscription", () => {
  const args = (endpoint: string) => ({ p_endpoint: endpoint, p_p256dh: "key", p_auth: "secret" });

  it("stores the caller's subscription and updates it on a repeat", async () => {
    const user = await createUser();
    const endpoint = `https://push.example/${randomUUID()}`;

    expect((await user.client.rpc("upsert_push_subscription", args(endpoint))).error).toBeNull();
    expect((await user.client.rpc("upsert_push_subscription", { ...args(endpoint), p_auth: "rotated" })).error).toBeNull();

    const { data } = await admin.from("push_subscriptions").select("user_id, auth").eq("endpoint", endpoint);
    expect(data).toEqual([{ user_id: user.id, auth: "rotated" }]);
  });

  it("moves an endpoint to whoever signs in on that browser now (shared phone)", async () => {
    const first = await createUser();
    const second = await createUser();
    const endpoint = `https://push.example/${randomUUID()}`;
    await first.client.rpc("upsert_push_subscription", args(endpoint));

    expect((await second.client.rpc("upsert_push_subscription", args(endpoint))).error).toBeNull();

    expect(await endpointsOf(first.id)).toEqual([]);
    expect(await endpointsOf(second.id)).toEqual([endpoint]);
  });

  it("rejects empty values and signed-out callers", async () => {
    const user = await createUser();
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "x", { auth: { persistSession: false } });

    expect((await user.client.rpc("upsert_push_subscription", { p_endpoint: "", p_p256dh: "k", p_auth: "a" })).error?.message).toBe("INVALID_SUBSCRIPTION");
    expect((await anon.rpc("upsert_push_subscription", args("https://push.example/x"))).error).not.toBeNull();
  });
});
