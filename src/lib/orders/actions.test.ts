import { beforeEach, describe, expect, it, vi } from "vitest";

const order = { id: "o1", code: "OAC-ABCDE", student_id: "u1", status: "ready" };
const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/lib/push/send", () => ({ sendPushToUser: vi.fn() }));

import { sendPushToUser } from "@/lib/push/send";
import { markReady } from "./actions";

const push = vi.mocked(sendPushToUser);

beforeEach(() => {
  rpc.mockReset();
  push.mockReset();
});

describe("markReady", () => {
  it("notifies the student with the order ID and a link to the order", async () => {
    rpc.mockResolvedValue({ data: order, error: null });

    const result = await markReady("o1");

    expect(result).toEqual({ ok: true, order });
    expect(push).toHaveBeenCalledWith("u1", {
      title: "Your order is ready",
      body: "Your order OAC-ABCDE is ready — show this ID at the counter.",
      url: "/orders/OAC-ABCDE",
    });
  });

  it("still succeeds when the push throws", async () => {
    rpc.mockResolvedValue({ data: order, error: null });
    push.mockRejectedValue(new Error("push exploded"));

    await expect(markReady("o1")).resolves.toEqual({ ok: true, order });
  });

  it("sends no push when the order could not be marked ready", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "ILLEGAL_TRANSITION" } });

    expect(await markReady("o1")).toEqual({ ok: false, error: "ILLEGAL_TRANSITION" });
    expect(push).not.toHaveBeenCalled();
  });
});
