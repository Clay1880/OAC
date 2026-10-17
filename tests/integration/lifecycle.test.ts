import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { admin, createMenuItem, createSlot, createUser, type TestUser } from "./helpers";

type OrderRow = { id: string; status: string; collected_at: string | null; paid_at: string | null; flagged_at: string | null };

async function placeOrder(student: TestUser, slotId?: string) {
  const item = await createMenuItem({ price_paise: 1000 });
  const slot = slotId ? { id: slotId } : await createSlot(60, 5);
  const { data, error } = await student.client.rpc("place_order", {
    p_slot_id: slot.id,
    p_items: [{ menu_item_id: item.id, qty: 1 }],
    p_request_id: randomUUID(),
  });
  expect(error).toBeNull();
  return { slotId: slot.id, order: data as OrderRow };
}

/** The slot already started `minutesAgo` minutes ago (place_order refuses past slots, so move it afterwards). */
async function startedAgo(slotId: string, minutesAgo: number) {
  const startsAt = new Date(Date.now() - minutesAgo * 60_000 - Math.floor(Math.random() * 5_000));
  const { error } = await admin.from("slots").update({ starts_at: startsAt.toISOString() }).eq("id", slotId);
  expect(error).toBeNull();
}

async function isDefaulter(userId: string) {
  const { data, error } = await admin.from("profiles").select("is_defaulter").eq("id", userId).single();
  expect(error).toBeNull();
  return data!.is_defaulter as boolean;
}

async function readyOrder(staff: TestUser, student: TestUser, slotId?: string) {
  const placed = await placeOrder(student, slotId);
  expect((await staff.client.rpc("accept_order", { p_order_id: placed.order.id })).error).toBeNull();
  expect((await staff.client.rpc("mark_ready", { p_order_id: placed.order.id })).error).toBeNull();
  return placed;
}

describe("staff lifecycle", () => {
  it("walks placed → accepted → ready → collected, stamping times and payment", async () => {
    const staff = await createUser("staff");
    const student = await createUser();
    const { order } = await placeOrder(student);

    const accepted = await staff.client.rpc("accept_order", { p_order_id: order.id });
    const ready = await staff.client.rpc("mark_ready", { p_order_id: order.id });
    const collected = await staff.client.rpc("collect_order", { p_order_id: order.id });

    expect((accepted.data as OrderRow & { accepted_at: string }).status).toBe("accepted");
    expect((accepted.data as { accepted_at: string | null }).accepted_at).not.toBeNull();
    expect((ready.data as { status: string; ready_at: string | null }).status).toBe("ready");
    expect((ready.data as { ready_at: string | null }).ready_at).not.toBeNull();
    const done = collected.data as OrderRow;
    expect(done.status).toBe("collected");
    expect(done.collected_at).not.toBeNull();
    expect(done.paid_at).not.toBeNull();
  });

  it("student cannot call accept_order", async () => {
    const student = await createUser();
    const { order } = await placeOrder(student);

    const { error } = await student.client.rpc("accept_order", { p_order_id: order.id });

    expect(error?.message).toBe("FORBIDDEN");
    const { data } = await admin.from("orders").select("status").eq("id", order.id).single();
    expect(data?.status).toBe("placed");
  });

  it("deactivated staff cannot call accept_order", async () => {
    const staff = await createUser("staff");
    const student = await createUser();
    const { order } = await placeOrder(student);
    await admin.from("profiles").update({ is_active: false }).eq("id", staff.id);

    const { error } = await staff.client.rpc("accept_order", { p_order_id: order.id });

    expect(error?.message).toBe("FORBIDDEN");
  });

  it("illegal transitions rejected (placed→ready, collected→accepted)", async () => {
    const staff = await createUser("staff");
    const student = await createUser();
    const { order } = await placeOrder(student);

    const skipAhead = await staff.client.rpc("mark_ready", { p_order_id: order.id });
    expect(skipAhead.error?.message).toBe("ILLEGAL_TRANSITION");

    await staff.client.rpc("accept_order", { p_order_id: order.id });
    await staff.client.rpc("mark_ready", { p_order_id: order.id });
    await staff.client.rpc("collect_order", { p_order_id: order.id });

    const back = await staff.client.rpc("accept_order", { p_order_id: order.id });
    expect(back.error?.message).toBe("ILLEGAL_TRANSITION");
    const collectAgain = await staff.client.rpc("collect_order", { p_order_id: order.id });
    expect(collectAgain.error?.message).toBe("ILLEGAL_TRANSITION");
  });

  it("an unknown order id is ORDER_NOT_FOUND", async () => {
    const staff = await createUser("staff");

    const { error } = await staff.client.rpc("accept_order", { p_order_id: randomUUID() });

    expect(error?.message).toBe("ORDER_NOT_FOUND");
  });

  it("a cancelled order cannot be accepted", async () => {
    const staff = await createUser("staff");
    const student = await createUser();
    const { order } = await placeOrder(student);
    await student.client.rpc("cancel_order", { p_order_id: order.id });

    const { error } = await staff.client.rpc("accept_order", { p_order_id: order.id });

    expect(error?.message).toBe("ILLEGAL_TRANSITION");
  });
});

describe("no-show and defaulter rules", () => {
  it("flag_no_show before 15 minutes after slot start is rejected", async () => {
    const staff = await createUser("staff");
    const student = await createUser();
    const { slotId, order } = await readyOrder(staff, student);
    await startedAgo(slotId, 10);

    const { error } = await staff.client.rpc("flag_no_show", { p_order_id: order.id });

    expect(error?.message).toBe("HOLD_NOT_ELAPSED");
    expect(await isDefaulter(student.id)).toBe(false);
  });

  it("flag_no_show after 15 minutes sets is_defaulter", async () => {
    const staff = await createUser("staff");
    const student = await createUser();
    const { slotId, order } = await readyOrder(staff, student);
    await startedAgo(slotId, 20);

    const { data, error } = await staff.client.rpc("flag_no_show", { p_order_id: order.id });

    expect(error).toBeNull();
    expect((data as OrderRow).status).toBe("no_show");
    expect((data as OrderRow).flagged_at).not.toBeNull();
    expect(await isDefaulter(student.id)).toBe(true);
  });

  it("flag_no_show only applies to a ready order", async () => {
    const staff = await createUser("staff");
    const student = await createUser();
    const { slotId, order } = await placeOrder(student);
    await startedAgo(slotId, 20);

    const { error } = await staff.client.rpc("flag_no_show", { p_order_id: order.id });

    expect(error?.message).toBe("ILLEGAL_TRANSITION");
    expect(await isDefaulter(student.id)).toBe(false);
  });

  it("student cannot flag no-shows", async () => {
    const staff = await createUser("staff");
    const student = await createUser();
    const { slotId, order } = await readyOrder(staff, student);
    await startedAgo(slotId, 20);

    const { error } = await student.client.rpc("flag_no_show", { p_order_id: order.id });

    expect(error?.message).toBe("FORBIDDEN");
  });

  it("flagged student gets DEFAULTER from place_order", async () => {
    const staff = await createUser("staff");
    const student = await createUser();
    const { slotId, order } = await readyOrder(staff, student);
    await startedAgo(slotId, 20);
    await staff.client.rpc("flag_no_show", { p_order_id: order.id });

    const item = await createMenuItem();
    const next = await createSlot(60, 5);
    const { error } = await student.client.rpc("place_order", {
      p_slot_id: next.id,
      p_items: [{ menu_item_id: item.id, qty: 1 }],
      p_request_id: randomUUID(),
    });

    expect(error?.message).toBe("DEFAULTER");
  });

  it("collect_order on a no_show order clears is_defaulter when it was the only unpaid one", async () => {
    const staff = await createUser("staff");
    const student = await createUser();
    const { slotId, order } = await readyOrder(staff, student);
    await startedAgo(slotId, 20);
    await staff.client.rpc("flag_no_show", { p_order_id: order.id });
    expect(await isDefaulter(student.id)).toBe(true);

    const { data, error } = await staff.client.rpc("collect_order", { p_order_id: order.id });

    expect(error).toBeNull();
    expect((data as OrderRow).status).toBe("collected");
    expect((data as OrderRow).paid_at).not.toBeNull();
    expect(await isDefaulter(student.id)).toBe(false);
  });

  it("two unpaid no_shows: settling one leaves is_defaulter true", async () => {
    const staff = await createUser("staff");
    const boss = await createUser("admin");
    const student = await createUser();
    const first = await readyOrder(staff, student);
    const second = await readyOrder(staff, student);
    await startedAgo(first.slotId, 30);
    await startedAgo(second.slotId, 20);
    await staff.client.rpc("flag_no_show", { p_order_id: first.order.id });
    await staff.client.rpc("flag_no_show", { p_order_id: second.order.id });

    const settledFirst = await boss.client.rpc("settle_no_show", { p_order_id: first.order.id });
    expect(settledFirst.error).toBeNull();
    expect(await isDefaulter(student.id)).toBe(true);

    const settledSecond = await boss.client.rpc("settle_no_show", { p_order_id: second.order.id });
    expect(settledSecond.error).toBeNull();
    expect(await isDefaulter(student.id)).toBe(false);
  });

  it("concurrent settles of the last two unpaid no_shows still clear is_defaulter", async () => {
    const staff = await createUser("staff");
    const boss = await createUser("admin");
    const student = await createUser();
    const first = await readyOrder(staff, student);
    const second = await readyOrder(staff, student);
    await startedAgo(first.slotId, 30);
    await startedAgo(second.slotId, 20);
    await staff.client.rpc("flag_no_show", { p_order_id: first.order.id });
    await staff.client.rpc("flag_no_show", { p_order_id: second.order.id });

    const results = await Promise.all([
      boss.client.rpc("settle_no_show", { p_order_id: first.order.id }),
      boss.client.rpc("settle_no_show", { p_order_id: second.order.id }),
    ]);

    expect(results.every((r) => !r.error)).toBe(true);
    expect(await isDefaulter(student.id)).toBe(false);
  });

  it("settle_no_show by admin clears; by staff is rejected", async () => {
    const staff = await createUser("staff");
    const boss = await createUser("admin");
    const student = await createUser();
    const { slotId, order } = await readyOrder(staff, student);
    await startedAgo(slotId, 20);
    await staff.client.rpc("flag_no_show", { p_order_id: order.id });

    const byStaff = await staff.client.rpc("settle_no_show", { p_order_id: order.id });
    expect(byStaff.error?.message).toBe("FORBIDDEN");
    expect(await isDefaulter(student.id)).toBe(true);

    const byAdmin = await boss.client.rpc("settle_no_show", { p_order_id: order.id });
    expect(byAdmin.error).toBeNull();
    expect((byAdmin.data as OrderRow).paid_at).not.toBeNull();
    expect((byAdmin.data as OrderRow).status).toBe("no_show");
    expect(await isDefaulter(student.id)).toBe(false);

    const again = await boss.client.rpc("settle_no_show", { p_order_id: order.id });
    expect(again.error?.message).toBe("ILLEGAL_TRANSITION");
  });
});
