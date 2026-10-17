import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  admin,
  bookedCount,
  createCanteen,
  createCollege,
  createMenuItem,
  createSlot,
  createUser,
  defaultCanteen,
  orderCount,
  type TestUser,
} from "./helpers";

type OrderRow = { id: string; code: string; status: string; canteen_id: string; paid_at: string | null };

const place = (user: TestUser, canteenId: string, slotId: string, itemId: string) =>
  user.client.rpc("place_order", {
    p_canteen_id: canteenId,
    p_slot_id: slotId,
    p_items: [{ menu_item_id: itemId, qty: 1 }],
    p_request_id: randomUUID(),
  });

/** A placed order in `canteenId`, with its own item and slot there. */
async function placeIn(student: TestUser, canteenId: string) {
  const item = await createMenuItem({ canteen_id: canteenId });
  const slot = await createSlot(60, 5, canteenId);
  const { data, error } = await place(student, canteenId, slot.id, item.id);
  expect(error).toBeNull();
  return { slotId: slot.id, order: data as OrderRow };
}

/** The slot already started `minutesAgo` minutes ago (place_order refuses past slots, so move it afterwards). */
async function startedAgo(slotId: string, minutesAgo: number) {
  const startsAt = new Date(Date.now() - minutesAgo * 60_000 - Math.floor(Math.random() * 5_000));
  const { error } = await admin.from("slots").update({ starts_at: startsAt.toISOString() }).eq("id", slotId);
  expect(error).toBeNull();
}

async function statusOf(orderId: string) {
  const { data, error } = await admin.from("orders").select("status, paid_at").eq("id", orderId).single();
  expect(error).toBeNull();
  return data as { status: string; paid_at: string | null };
}

/** An order of `canteenId` flagged no_show by that canteen's staff. */
async function noShowIn(canteenId: string) {
  const staff = await createUser("staff", { canteenId });
  const student = await createUser("student", { canteenId });
  const { slotId, order } = await placeIn(student, canteenId);
  expect((await staff.client.rpc("accept_order", { p_order_id: order.id })).error).toBeNull();
  expect((await staff.client.rpc("mark_ready", { p_order_id: order.id })).error).toBeNull();
  await startedAgo(slotId, 20);
  expect((await staff.client.rpc("flag_no_show", { p_order_id: order.id })).error).toBeNull();
  return order;
}

describe("place_order across canteens", () => {
  it.each(["pending", "suspended"] as const)("place_order refuses a %s canteen with CANTEEN_UNAVAILABLE", async (status) => {
    const canteen = await createCanteen({ status });
    const item = await createMenuItem({ canteen_id: canteen.id });
    const slot = await createSlot(60, 5, canteen.id);
    const student = await createUser();

    const { error } = await place(student, canteen.id, slot.id, item.id);

    expect(error?.message).toBe("CANTEEN_UNAVAILABLE");
    expect(await bookedCount(slot.id)).toBe(0);
    expect(await orderCount(slot.id)).toBe(0);
  });

  it("place_order refuses a canteen in another college with CANTEEN_UNAVAILABLE", async () => {
    const canteen = await defaultCanteen();
    const item = await createMenuItem();
    const slot = await createSlot(60, 5);
    const outsider = await createUser("student", { collegeId: (await createCollege()).id });

    const { error } = await place(outsider, canteen.id, slot.id, item.id);

    expect(error?.message).toBe("CANTEEN_UNAVAILABLE");
    expect(await bookedCount(slot.id)).toBe(0);
  });

  it("a slot from another canteen raises SLOT_CLOSED and books no seat", async () => {
    const canteenA = await defaultCanteen();
    const canteenB = await createCanteen();
    const itemA = await createMenuItem();
    const slotA = await createSlot(60, 5);
    const slotB = await createSlot(60, 5, canteenB.id);
    const student = await createUser();

    const { error } = await place(student, canteenA.id, slotB.id, itemA.id);

    expect(error?.message).toBe("SLOT_CLOSED");
    expect(await bookedCount(slotA.id)).toBe(0);
    expect(await bookedCount(slotB.id)).toBe(0);
    expect(await orderCount(slotB.id)).toBe(0);
  });

  it("an item from another canteen raises ITEM_UNAVAILABLE", async () => {
    const canteenA = await defaultCanteen();
    const canteenB = await createCanteen();
    const itemB = await createMenuItem({ canteen_id: canteenB.id });
    const slotA = await createSlot(60, 5);
    const student = await createUser();

    const { error } = await place(student, canteenA.id, slotA.id, itemB.id);

    expect(error?.message).toBe("ITEM_UNAVAILABLE");
    expect(await bookedCount(slotA.id)).toBe(0);
  });

  it("order code uses the canteen prefix", async () => {
    const canteen = await createCanteen();
    const student = await createUser();

    const { order } = await placeIn(student, canteen.id);

    expect(order.code).toMatch(new RegExp(`^${canteen.code_prefix}-[2-9A-HJ-NP-Z]{5}$`));
    expect(order.canteen_id).toBe(canteen.id);
  });
});

describe("lifecycle across canteens", () => {
  it("staff of canteen A get FORBIDDEN on canteen B's order and the status is unchanged", async () => {
    const staffA = await createUser("staff");
    const canteenB = await createCanteen();
    const student = await createUser();
    const { order } = await placeIn(student, canteenB.id);

    const { error } = await staffA.client.rpc("accept_order", { p_order_id: order.id });

    expect(error?.message).toBe("FORBIDDEN");
    expect((await statusOf(order.id)).status).toBe("placed");
  });

  it("an owner cannot settle another canteen's no-show", async () => {
    const ownerA = await createUser("staff", { canteenRole: "owner" });
    const canteenB = await createCanteen();
    const order = await noShowIn(canteenB.id);

    const { error } = await ownerA.client.rpc("settle_no_show", { p_order_id: order.id });

    expect(error?.message).toBe("FORBIDDEN");
    expect(await statusOf(order.id)).toEqual({ status: "no_show", paid_at: null });

    const ownerB = await createUser("staff", { canteenId: canteenB.id, canteenRole: "owner" });
    expect((await ownerB.client.rpc("settle_no_show", { p_order_id: order.id })).error).toBeNull();
    expect((await statusOf(order.id)).paid_at).not.toBeNull();
  });

  it("a college admin can settle any canteen's no-show in the college", async () => {
    const boss = await createUser("admin");
    const canteenB = await createCanteen();
    const order = await noShowIn(canteenB.id);

    const { data, error } = await boss.client.rpc("settle_no_show", { p_order_id: order.id });

    expect(error).toBeNull();
    expect((data as OrderRow).paid_at).not.toBeNull();
    expect((await statusOf(order.id)).paid_at).not.toBeNull();
  });

  it("a staff profile with no membership reads 0 rows from staff_orders_v and gets FORBIDDEN from accept_order", async () => {
    const canteen = await defaultCanteen();
    const staff = await createUser("staff", { canteenId: canteen.id });
    const { error: deleteError } = await admin.from("canteen_members").delete().eq("user_id", staff.id);
    expect(deleteError).toBeNull();
    const student = await createUser();
    const { order } = await placeIn(student, canteen.id);

    const { data: rows, error: readError } = await staff.client.from("staff_orders_v").select("id");
    const { error } = await staff.client.rpc("accept_order", { p_order_id: order.id });

    expect(readError).toBeNull();
    expect(rows).toEqual([]);
    expect(error?.message).toBe("FORBIDDEN");
    expect((await statusOf(order.id)).status).toBe("placed");
  });

  it("orders on a canteen that is later suspended can still be accepted, readied and collected", async () => {
    const canteen = await createCanteen();
    const staff = await createUser("staff", { canteenId: canteen.id });
    const student = await createUser();
    const { order } = await placeIn(student, canteen.id);
    await admin.from("canteens").update({ status: "suspended" }).eq("id", canteen.id);

    const accepted = await staff.client.rpc("accept_order", { p_order_id: order.id });
    const ready = await staff.client.rpc("mark_ready", { p_order_id: order.id });
    const collected = await staff.client.rpc("collect_order", { p_order_id: order.id });

    expect(accepted.error).toBeNull();
    expect(ready.error).toBeNull();
    expect(collected.error).toBeNull();
    expect((await statusOf(order.id)).status).toBe("collected");
  });

  it("flag_no_show uses the canteen's own hold minutes", async () => {
    const quick = await createCanteen();
    const slow = await createCanteen();
    await admin.from("canteens").update({ no_show_hold_minutes: 1 }).eq("id", quick.id);
    await admin.from("canteens").update({ no_show_hold_minutes: 15 }).eq("id", slow.id);
    const readied = await Promise.all(
      [quick.id, slow.id].map(async (canteenId) => {
        const staff = await createUser("staff", { canteenId });
        const student = await createUser();
        const { slotId, order } = await placeIn(student, canteenId);
        expect((await staff.client.rpc("accept_order", { p_order_id: order.id })).error).toBeNull();
        expect((await staff.client.rpc("mark_ready", { p_order_id: order.id })).error).toBeNull();
        await startedAgo(slotId, 2);
        return { staff, order };
      }),
    );

    const [quickResult, slowResult] = await Promise.all(
      readied.map(({ staff, order }) => staff.client.rpc("flag_no_show", { p_order_id: order.id })),
    );

    expect(quickResult.error).toBeNull();
    expect((quickResult.data as OrderRow).status).toBe("no_show");
    expect(slowResult.error?.message).toBe("HOLD_NOT_ELAPSED");
    expect((await statusOf(readied[1].order.id)).status).toBe("ready");
  });
});

describe("slot administration across canteens", () => {
  it("generate_slots is FORBIDDEN for a staff (non-owner) member", async () => {
    const canteen = await createCanteen();
    const staff = await createUser("staff", { canteenId: canteen.id });

    const { error } = await staff.client.rpc("generate_slots", {
      p_canteen_id: canteen.id,
      p_day: "2150-01-01",
      p_from: "13:00",
      p_to: "14:00",
      p_minutes: 10,
      p_capacity: 15,
    });

    expect(error?.message).toBe("FORBIDDEN");
    const { count } = await admin.from("slots").select("id", { count: "exact", head: true }).eq("canteen_id", canteen.id);
    expect(count).toBe(0);
  });

  it("an owner cannot generate slots or change capacity in another canteen", async () => {
    const ownerA = await createUser("staff", { canteenRole: "owner" });
    const canteenB = await createCanteen();
    const slotB = await createSlot(300, 10, canteenB.id);

    const generated = await ownerA.client.rpc("generate_slots", {
      p_canteen_id: canteenB.id,
      p_day: "2150-01-01",
      p_from: "13:00",
      p_to: "14:00",
      p_minutes: 10,
      p_capacity: 15,
    });
    const resized = await ownerA.client.rpc("set_slot_capacity", { p_slot_id: slotB.id, p_capacity: 20 });

    expect(generated.error?.message).toBe("FORBIDDEN");
    expect(resized.error?.message).toBe("FORBIDDEN");
    const { data } = await admin.from("slots").select("id, capacity").eq("canteen_id", canteenB.id);
    expect(data).toEqual([{ id: slotB.id, capacity: 10 }]);
  });
});
