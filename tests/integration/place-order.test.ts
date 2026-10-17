import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  admin,
  bookedCount,
  createMenuItem,
  createSlot,
  createUser,
  defaultCanteen,
  orderCount,
  type TestUser,
} from "./helpers";

const place = async (user: TestUser, slotId: string, items: object[], requestId = randomUUID()) =>
  user.client.rpc("place_order", {
    p_canteen_id: (await defaultCanteen()).id,
    p_slot_id: slotId,
    p_items: items,
    p_request_id: requestId,
  });

describe("place_order", () => {
  it("places an order and computes total from DB prices", async () => {
    const student = await createUser();
    const a = await createMenuItem({ price_paise: 1000 });
    const b = await createMenuItem({ price_paise: 550 });
    const slot = await createSlot(60, 5);

    const { data, error } = await place(student, slot.id, [
      { menu_item_id: a.id, qty: 2, unit_price_paise: 1, price_paise: 1 }, // tampered prices must be ignored
      { menu_item_id: b.id, qty: 1, unit_price_paise: 1 },
    ]);

    expect(error).toBeNull();
    const order = data as { id: string; code: string; total_paise: number; status: string; student_id: string };
    expect(order.total_paise).toBe(2 * 1000 + 550);
    expect(order.status).toBe("placed");
    expect(order.student_id).toBe(student.id);
    const canteen = await defaultCanteen();
    expect(order.code).toMatch(new RegExp(`^${canteen.code_prefix}-[2-9A-HJ-NP-Z]{5}$`));

    const { data: lines } = await admin.from("order_items").select("*").eq("order_id", order.id);
    expect(lines).toHaveLength(2);
    expect(lines?.find((l) => l.menu_item_id === a.id)).toMatchObject({
      qty: 2,
      unit_price_paise: 1000,
      name: a.name,
    });
    expect(await bookedCount(slot.id)).toBe(1);
  });

  it("merges duplicate lines for the same item", async () => {
    const student = await createUser();
    const a = await createMenuItem({ price_paise: 300 });
    const slot = await createSlot(60, 5);

    const { data, error } = await place(student, slot.id, [
      { menu_item_id: a.id, qty: 1 },
      { menu_item_id: a.id, qty: 2 },
    ]);

    expect(error).toBeNull();
    const order = data as { id: string; total_paise: number };
    expect(order.total_paise).toBe(900);
    const { data: lines } = await admin.from("order_items").select("qty").eq("order_id", order.id);
    expect(lines).toEqual([{ qty: 3 }]);
  });

  it("last seat race: 25 parallel place_order calls on a capacity-5 slot yield exactly 5 successes and 20 SLOT_FULL", async () => {
    const item = await createMenuItem();
    const slot = await createSlot(60, 5);
    const students = await Promise.all(Array.from({ length: 25 }, () => createUser()));

    const results = await Promise.all(students.map((s) => place(s, slot.id, [{ menu_item_id: item.id, qty: 1 }])));

    const ok = results.filter((r) => !r.error);
    const full = results.filter((r) => r.error?.message === "SLOT_FULL");
    expect(ok).toHaveLength(5);
    expect(full).toHaveLength(20);
    expect(await bookedCount(slot.id)).toBe(5);
    expect(await orderCount(slot.id)).toBe(5);
  }, 60_000);

  it("same p_request_id twice returns the same order and books one seat", async () => {
    const student = await createUser();
    const item = await createMenuItem();
    const slot = await createSlot(60, 5);
    const requestId = randomUUID();

    const first = await place(student, slot.id, [{ menu_item_id: item.id, qty: 1 }], requestId);
    const second = await place(student, slot.id, [{ menu_item_id: item.id, qty: 1 }], requestId);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect((second.data as { id: string }).id).toBe((first.data as { id: string }).id);
    expect(await bookedCount(slot.id)).toBe(1);
    expect(await orderCount(slot.id)).toBe(1);
  });

  it("concurrent double-tap with one p_request_id creates one order", async () => {
    const student = await createUser();
    const item = await createMenuItem();
    const slot = await createSlot(60, 5);
    const requestId = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => place(student, slot.id, [{ menu_item_id: item.id, qty: 1 }], requestId)),
    );

    expect(results.every((r) => !r.error)).toBe(true);
    expect(new Set(results.map((r) => (r.data as { id: string }).id)).size).toBe(1);
    expect(await bookedCount(slot.id)).toBe(1);
    expect(await orderCount(slot.id)).toBe(1);
  });

  it("unavailable or deleted item returns ITEM_UNAVAILABLE and books no seat", async () => {
    const student = await createUser();
    const ok = await createMenuItem();
    const soldOut = await createMenuItem({ is_available: false });
    const slot = await createSlot(60, 5);

    const unavailable = await place(student, slot.id, [
      { menu_item_id: ok.id, qty: 1 },
      { menu_item_id: soldOut.id, qty: 1 },
    ]);
    const missing = await place(student, slot.id, [{ menu_item_id: randomUUID(), qty: 1 }]);

    expect(unavailable.error?.message).toBe("ITEM_UNAVAILABLE");
    expect(missing.error?.message).toBe("ITEM_UNAVAILABLE");
    expect(await bookedCount(slot.id)).toBe(0);
    expect(await orderCount(slot.id)).toBe(0);
  });

  it("item repriced after cart built uses the new price", async () => {
    const student = await createUser();
    const item = await createMenuItem({ price_paise: 1000 });
    const slot = await createSlot(60, 5);
    await admin.from("menu_items").update({ price_paise: 1500 }).eq("id", item.id);

    const { data, error } = await place(student, slot.id, [{ menu_item_id: item.id, qty: 2 }]);

    expect(error).toBeNull();
    expect((data as { total_paise: number }).total_paise).toBe(3000);
  });

  it("SLOT_CLOSED when starts_at - now() < order_cutoff_minutes", async () => {
    const student = await createUser();
    const item = await createMenuItem();
    const closing = await createSlot(2, 5); // cutoff is 5 minutes
    const started = await createSlot(-10, 5);
    const open = await createSlot(10, 5);

    const tooLate = await place(student, closing.id, [{ menu_item_id: item.id, qty: 1 }]);
    const past = await place(student, started.id, [{ menu_item_id: item.id, qty: 1 }]);
    const fine = await place(student, open.id, [{ menu_item_id: item.id, qty: 1 }]);

    expect(tooLate.error?.message).toBe("SLOT_CLOSED");
    expect(past.error?.message).toBe("SLOT_CLOSED");
    expect(fine.error).toBeNull();
    expect(await bookedCount(closing.id)).toBe(0);
    expect(await bookedCount(started.id)).toBe(0);
  });

  it("defaulter gets DEFAULTER", async () => {
    const student = await createUser();
    const item = await createMenuItem();
    const slot = await createSlot(60, 5);
    await admin.from("profiles").update({ is_defaulter: true }).eq("id", student.id);

    const { error } = await place(student, slot.id, [{ menu_item_id: item.id, qty: 1 }]);

    expect(error?.message).toBe("DEFAULTER");
    expect(await bookedCount(slot.id)).toBe(0);
  });

  it("empty items gets EMPTY_ORDER", async () => {
    const student = await createUser();
    const slot = await createSlot(60, 5);

    const { error } = await place(student, slot.id, []);

    expect(error?.message).toBe("EMPTY_ORDER");
    expect(await bookedCount(slot.id)).toBe(0);
  });

  it("qty <= 0 rejected", async () => {
    const student = await createUser();
    const item = await createMenuItem();
    const slot = await createSlot(60, 5);

    const zero = await place(student, slot.id, [{ menu_item_id: item.id, qty: 0 }]);
    const negative = await place(student, slot.id, [
      { menu_item_id: item.id, qty: 2 },
      { menu_item_id: item.id, qty: -2 },
    ]);

    expect(zero.error?.message).toBe("EMPTY_ORDER");
    expect(negative.error?.message).toBe("EMPTY_ORDER");
    expect(await bookedCount(slot.id)).toBe(0);
  });

  it("only students can place orders", async () => {
    const staff = await createUser("staff");
    const item = await createMenuItem();
    const slot = await createSlot(60, 5);

    const { error } = await place(staff, slot.id, [{ menu_item_id: item.id, qty: 1 }]);

    expect(error?.message).toBe("FORBIDDEN");
    expect(await bookedCount(slot.id)).toBe(0);
  });
});

describe("cancel_order", () => {
  async function placed() {
    const student = await createUser();
    const item = await createMenuItem();
    const slot = await createSlot(60, 5);
    const { data, error } = await place(student, slot.id, [{ menu_item_id: item.id, qty: 1 }]);
    expect(error).toBeNull();
    return { student, slot, order: data as { id: string } };
  }

  it("frees the seat and sets cancelled while placed", async () => {
    const { student, slot, order } = await placed();
    expect(await bookedCount(slot.id)).toBe(1);

    const { data, error } = await student.client.rpc("cancel_order", { p_order_id: order.id });

    expect(error).toBeNull();
    expect((data as { status: string }).status).toBe("cancelled");
    expect(await bookedCount(slot.id)).toBe(0);
  });

  it("returns NOT_CANCELLABLE once accepted", async () => {
    const { student, slot, order } = await placed();
    await admin.from("orders").update({ status: "accepted" }).eq("id", order.id);

    const { error } = await student.client.rpc("cancel_order", { p_order_id: order.id });

    expect(error?.message).toBe("NOT_CANCELLABLE");
    expect(await bookedCount(slot.id)).toBe(1);
  });

  it("returns NOT_CANCELLABLE when cancelled twice and frees the seat once", async () => {
    const { student, slot, order } = await placed();

    await student.client.rpc("cancel_order", { p_order_id: order.id });
    const again = await student.client.rpc("cancel_order", { p_order_id: order.id });

    expect(again.error?.message).toBe("NOT_CANCELLABLE");
    expect(await bookedCount(slot.id)).toBe(0);
  });

  it("other student cannot cancel", async () => {
    const { slot, order } = await placed();
    const other = await createUser();

    const { error } = await other.client.rpc("cancel_order", { p_order_id: order.id });

    expect(error?.message).toBe("NOT_CANCELLABLE");
    expect(await bookedCount(slot.id)).toBe(1);
  });
});
