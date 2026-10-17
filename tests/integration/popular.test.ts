import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { admin, createCanteen, createCollege, createMenuItem, createSlot, createUser, type TestUser } from "./helpers";

type Row = { menu_item_id: string; orders: number | string };

/** Places an order of `qty` of one item in `canteenId` and returns its id. */
async function order(student: TestUser, canteenId: string, itemId: string, qty = 1) {
  const slot = await createSlot(60, 50, canteenId);
  const { data, error } = await student.client.rpc("place_order", {
    p_canteen_id: canteenId,
    p_slot_id: slot.id,
    p_items: [{ menu_item_id: itemId, qty }],
    p_request_id: randomUUID(),
  });
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

async function popular(user: TestUser, canteenId: string, extra: { p_days?: number; p_limit?: number } = {}) {
  const { data, error } = await user.client.rpc("popular_items", { p_canteen_id: canteenId, ...extra });
  expect(error).toBeNull();
  return (data ?? []) as Row[];
}

const countOf = (rows: Row[], itemId: string) => {
  const row = rows.find((r) => r.menu_item_id === itemId);
  return row ? Number(row.orders) : 0;
};

describe("popular_items", () => {
  it("counts distinct orders: one order with qty 5 counts once", async () => {
    const canteen = await createCanteen();
    const item = await createMenuItem({ canteen_id: canteen.id });
    const a = await createUser("student", { canteenId: canteen.id });
    const b = await createUser("student", { canteenId: canteen.id });
    await order(a, canteen.id, item.id, 5);
    await order(b, canteen.id, item.id, 1);

    const rows = await popular(a, canteen.id);
    expect(countOf(rows, item.id)).toBe(2);
  });

  it("returns exactly the columns menu_item_id and orders, and no student id", async () => {
    const canteen = await createCanteen();
    const item = await createMenuItem({ canteen_id: canteen.id });
    const student = await createUser("student", { canteenId: canteen.id });
    await order(student, canteen.id, item.id);

    const rows = await popular(student, canteen.id);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["menu_item_id", "orders"]);
    expect(JSON.stringify(rows)).not.toContain(student.id);
  });

  it("ranks by count and excludes cancelled and no_show orders", async () => {
    const canteen = await createCanteen();
    const hit = await createMenuItem({ canteen_id: canteen.id, name: "Hit" });
    const cancelled = await createMenuItem({ canteen_id: canteen.id, name: "Cancelled" });
    const absent = await createMenuItem({ canteen_id: canteen.id, name: "Absent" });
    const student = await createUser("student", { canteenId: canteen.id });

    await order(student, canteen.id, hit.id);
    await order(student, canteen.id, hit.id);
    const c = await order(student, canteen.id, cancelled.id);
    const n = await order(student, canteen.id, absent.id);
    await admin.from("orders").update({ status: "cancelled" }).eq("id", c);
    await admin.from("orders").update({ status: "no_show" }).eq("id", n);

    const rows = await popular(student, canteen.id);
    expect(rows.map((r) => r.menu_item_id)).toEqual([hit.id]);
    expect(Number(rows[0].orders)).toBe(2);
  });

  it("skips items that are sold out and orders older than p_days", async () => {
    const canteen = await createCanteen();
    const soldOut = await createMenuItem({ canteen_id: canteen.id });
    const old = await createMenuItem({ canteen_id: canteen.id });
    const fresh = await createMenuItem({ canteen_id: canteen.id });
    const student = await createUser("student", { canteenId: canteen.id });

    await order(student, canteen.id, soldOut.id);
    const oldId = await order(student, canteen.id, old.id);
    await order(student, canteen.id, fresh.id);
    await admin.from("menu_items").update({ is_available: false }).eq("id", soldOut.id);
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await admin.from("orders").update({ created_at: tenDaysAgo }).eq("id", oldId);

    expect((await popular(student, canteen.id)).map((r) => r.menu_item_id).sort()).toEqual([fresh.id, old.id].sort());
    expect((await popular(student, canteen.id, { p_days: 7 })).map((r) => r.menu_item_id)).toEqual([fresh.id]);
  });

  it("excludes another canteen's items", async () => {
    const mine = await createCanteen();
    const other = await createCanteen();
    const theirs = await createMenuItem({ canteen_id: other.id });
    const student = await createUser("student", { canteenId: mine.id });
    const otherStudent = await createUser("student", { canteenId: other.id });
    await order(otherStudent, other.id, theirs.id);

    expect(await popular(student, mine.id)).toEqual([]);
    expect(countOf(await popular(student, other.id), theirs.id)).toBe(1); // same college: allowed
  });

  it("gives a student of another college zero rows", async () => {
    const canteen = await createCanteen();
    const item = await createMenuItem({ canteen_id: canteen.id });
    const insider = await createUser("student", { canteenId: canteen.id });
    await order(insider, canteen.id, item.id);

    const college = await createCollege();
    const outsider = await createUser("student", { collegeId: college.id });
    expect(await popular(outsider, canteen.id)).toEqual([]);
  });

  it("gives a signed-out caller zero rows or a permission error", async () => {
    const canteen = await createCanteen();
    const item = await createMenuItem({ canteen_id: canteen.id });
    const student = await createUser("student", { canteenId: canteen.id });
    await order(student, canteen.id, item.id);

    const anon = await createUser("student", { canteenId: canteen.id });
    await anon.client.auth.signOut();
    const { data, error } = await anon.client.rpc("popular_items", { p_canteen_id: canteen.id });
    expect(error?.code === "42501" || (data ?? []).length === 0).toBe(true);
    expect(data ?? []).toEqual([]);
  });

  it("caps p_limit at 20", async () => {
    const canteen = await createCanteen();
    const student = await createUser("student", { canteenId: canteen.id });
    const items = await Promise.all(Array.from({ length: 22 }, () => createMenuItem({ canteen_id: canteen.id })));
    for (const item of items) await order(student, canteen.id, item.id);

    expect(await popular(student, canteen.id, { p_limit: 500 })).toHaveLength(20);
    expect(await popular(student, canteen.id, { p_limit: 3 })).toHaveLength(3);
  });
});
