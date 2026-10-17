import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fetchStaffData } from "../../src/lib/staff/queries";
import { admin, createCanteen, createMenuItem, createSlot, createUser, type TestUser } from "./helpers";

async function placeOrder(student: TestUser, canteenId: string, itemId: string) {
  const slot = await createSlot(60, 20, canteenId);
  const { data, error } = await student.client.rpc("place_order", {
    p_canteen_id: canteenId,
    p_slot_id: slot.id,
    p_items: [{ menu_item_id: itemId, qty: 2 }],
    p_request_id: randomUUID(),
  });
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

describe("fetchStaffData", () => {
  it("returns only the asked canteen's orders and lines for a staff member of two canteens", async () => {
    const a = await createCanteen();
    const b = await createCanteen();
    const staff = await createUser("staff", { canteenId: a.id });
    await admin.from("canteen_members").insert({ user_id: staff.id, canteen_id: b.id, role: "staff" });
    const itemA = await createMenuItem({ canteen_id: a.id, name: "Only A" });
    const itemB = await createMenuItem({ canteen_id: b.id, name: "Only B" });
    const student = await createUser("student", { canteenId: a.id });
    const orderA = await placeOrder(student, a.id, itemA.id);
    const orderB = await placeOrder(student, b.id, itemB.id);

    const forA = await fetchStaffData(staff.client, a.id);
    expect(forA?.orders.map((o) => o.id)).toEqual([orderA]);
    expect(forA?.lines.map((l) => l.name)).toEqual(["Only A"]);

    const forB = await fetchStaffData(staff.client, b.id);
    expect(forB?.orders.map((o) => o.id)).toEqual([orderB]);
    expect(forB?.lines.map((l) => l.order_id)).toEqual([orderB]);
  });
});
