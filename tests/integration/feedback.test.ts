import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { admin, createCanteen, createMenuItem, createSlot, createUser, defaultCanteen, URL, type TestUser } from "./helpers";

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/** An order of `student` in `canteenId` (a fresh item and slot) at the given status. */
async function orderAt(
  student: TestUser,
  status: "placed" | "collected",
  opts: { canteenId?: string; itemName?: string; qty?: number } = {},
) {
  const canteenId = opts.canteenId ?? (await defaultCanteen()).id;
  const item = await createMenuItem({ canteen_id: canteenId, name: opts.itemName });
  const slot = await createSlot(60, 5, canteenId);
  const { data, error } = await student.client.rpc("place_order", {
    p_canteen_id: canteenId,
    p_slot_id: slot.id,
    p_items: [{ menu_item_id: item.id, qty: opts.qty ?? 1 }],
    p_request_id: randomUUID(),
  });
  expect(error).toBeNull();
  const order = data as { id: string; code: string };
  if (status === "collected") {
    const staff = await createUser("staff", { canteenId });
    expect((await staff.client.rpc("accept_order", { p_order_id: order.id })).error).toBeNull();
    expect((await staff.client.rpc("mark_ready", { p_order_id: order.id })).error).toBeNull();
    expect((await staff.client.rpc("collect_order", { p_order_id: order.id })).error).toBeNull();
  }
  return order;
}

const submit = (user: TestUser, orderId: string, rating: number | null, comment: string | null = null) =>
  user.client.rpc("submit_feedback", { p_order_id: orderId, p_rating: rating, p_comment: comment });

const feedbackCount = async (orderId: string) => {
  const { count } = await admin.from("order_feedback").select("order_id", { count: "exact", head: true }).eq("order_id", orderId);
  return count;
};

describe("submit_feedback", () => {
  it("stores the rating and comment on a collected order", async () => {
    const student = await createUser();
    const order = await orderAt(student, "collected");

    const { data, error } = await submit(student, order.id, 4, "  Hot and quick  ");

    expect(error).toBeNull();
    expect(data).toMatchObject({ order_id: order.id, student_id: student.id, rating: 4, comment: "Hot and quick" });
    const { data: row } = await admin.from("order_feedback").select("rating, comment, canteen_id").eq("order_id", order.id).single();
    expect(row).toMatchObject({ rating: 4, comment: "Hot and quick", canteen_id: (await defaultCanteen()).id });
  });

  it("stores an empty comment as null", async () => {
    const student = await createUser();
    const order = await orderAt(student, "collected");

    expect((await submit(student, order.id, 5, "   ")).error).toBeNull();

    const { data: row } = await admin.from("order_feedback").select("comment").eq("order_id", order.id).single();
    expect(row?.comment).toBeNull();
  });

  it("a second call raises ALREADY_SUBMITTED and keeps the first rating", async () => {
    const student = await createUser();
    const order = await orderAt(student, "collected");
    expect((await submit(student, order.id, 5, "first")).error).toBeNull();

    const second = await submit(student, order.id, 1, "second");

    expect(second.error?.message).toBe("ALREADY_SUBMITTED");
    const { data: row } = await admin.from("order_feedback").select("rating, comment").eq("order_id", order.id).single();
    expect(row).toEqual({ rating: 5, comment: "first" });
  });

  it("two concurrent calls give exactly one success and one ALREADY_SUBMITTED", async () => {
    const student = await createUser();
    const order = await orderAt(student, "collected");

    const results = await Promise.all([submit(student, order.id, 3), submit(student, order.id, 4)]);

    const messages = results.map((r) => r.error?.message ?? "ok").sort();
    expect(messages).toEqual(["ALREADY_SUBMITTED", "ok"]);
    expect(await feedbackCount(order.id)).toBe(1);
  });

  it("a placed order raises NOT_COLLECTED", async () => {
    const student = await createUser();
    const order = await orderAt(student, "placed");

    expect((await submit(student, order.id, 5)).error?.message).toBe("NOT_COLLECTED");
    expect(await feedbackCount(order.id)).toBe(0);
  });

  it("another student's order raises ORDER_NOT_FOUND", async () => {
    const owner = await createUser();
    const other = await createUser();
    const order = await orderAt(owner, "collected");

    expect((await submit(other, order.id, 5)).error?.message).toBe("ORDER_NOT_FOUND");
    expect(await feedbackCount(order.id)).toBe(0);
  });

  it("an unknown order raises ORDER_NOT_FOUND", async () => {
    const student = await createUser();
    expect((await submit(student, randomUUID(), 5)).error?.message).toBe("ORDER_NOT_FOUND");
  });

  it("staff cannot rate an order (ORDER_NOT_FOUND)", async () => {
    const student = await createUser();
    const order = await orderAt(student, "collected");
    const staff = await createUser("staff");

    expect((await submit(staff, order.id, 5)).error?.message).toBe("ORDER_NOT_FOUND");
  });

  it.each([0, 6, -1, null])("rating %s raises INVALID_RATING", async (rating) => {
    const student = await createUser();
    const order = await orderAt(student, "collected");

    expect((await submit(student, order.id, rating)).error?.message).toBe("INVALID_RATING");
  });

  it("a 501-character comment raises INVALID_COMMENT and 500 is accepted", async () => {
    const student = await createUser();
    const order = await orderAt(student, "collected");

    expect((await submit(student, order.id, 4, "x".repeat(501))).error?.message).toBe("INVALID_COMMENT");
    expect((await submit(student, order.id, 4, "x".repeat(500))).error).toBeNull();
  });

  it("a signed-out caller is refused", async () => {
    const student = await createUser();
    const order = await orderAt(student, "collected");
    const anon = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const { error } = await anon.rpc("submit_feedback", { p_order_id: order.id, p_rating: 5, p_comment: null });

    expect(error).not.toBeNull();
    expect(await feedbackCount(order.id)).toBe(0);
  });
});

describe("order_feedback access", () => {
  it("a student cannot insert into order_feedback directly (42501)", async () => {
    const student = await createUser();
    const order = await orderAt(student, "collected");

    const { error } = await student.client
      .from("order_feedback")
      .insert({ order_id: order.id, canteen_id: (await defaultCanteen()).id, student_id: student.id, rating: 5 });

    expect(error?.code).toBe("42501");
  });

  it("a student cannot update or delete feedback", async () => {
    const student = await createUser();
    const order = await orderAt(student, "collected");
    expect((await submit(student, order.id, 2)).error).toBeNull();

    const update = await student.client.from("order_feedback").update({ rating: 5 }).eq("order_id", order.id);
    const del = await student.client.from("order_feedback").delete().eq("order_id", order.id);

    expect(update.error?.code).toBe("42501");
    expect(del.error?.code).toBe("42501");
    const { data: row } = await admin.from("order_feedback").select("rating").eq("order_id", order.id).single();
    expect(row?.rating).toBe(2);
  });

  it("a student reads their own feedback and none of another student's", async () => {
    const a = await createUser();
    const b = await createUser();
    const orderA = await orderAt(a, "collected");
    expect((await submit(a, orderA.id, 5)).error).toBeNull();

    const own = await a.client.from("order_feedback").select("order_id").eq("order_id", orderA.id);
    const others = await b.client.from("order_feedback").select("order_id").eq("order_id", orderA.id);

    expect(own.data).toHaveLength(1);
    expect(others.error).toBeNull();
    expect(others.data).toHaveLength(0);
  });
});

describe("staff_feedback_v", () => {
  it("staff of the order's canteen read the row with order code, student name and items", async () => {
    const canteen = await createCanteen();
    const student = await createUser("student", { canteenId: canteen.id });
    const staff = await createUser("staff", { canteenId: canteen.id });
    const order = await orderAt(student, "collected", { canteenId: canteen.id, itemName: "Samosa", qty: 2 });
    expect((await submit(student, order.id, 4, "Crisp")).error).toBeNull();

    const { data, error } = await staff.client.from("staff_feedback_v").select("*").eq("order_id", order.id);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      order_id: order.id,
      canteen_id: canteen.id,
      rating: 4,
      comment: "Crisp",
      order_code: order.code,
      items: "2× Samosa",
    });
    expect(data![0].student_name).toMatch(/^Test /);
  });

  it("the canteen owner and the college admin read it too", async () => {
    const canteen = await createCanteen();
    const student = await createUser("student", { canteenId: canteen.id });
    const owner = await createUser("staff", { canteenId: canteen.id, canteenRole: "owner" });
    const collegeAdmin = await createUser("admin", { canteenId: canteen.id });
    const order = await orderAt(student, "collected", { canteenId: canteen.id });
    expect((await submit(student, order.id, 3)).error).toBeNull();

    for (const user of [owner, collegeAdmin]) {
      const { data } = await user.client.from("staff_feedback_v").select("order_id").eq("order_id", order.id);
      expect(data).toHaveLength(1);
    }
  });

  it("staff of another canteen read 0 rows", async () => {
    const canteen = await createCanteen();
    const other = await createCanteen();
    const student = await createUser("student", { canteenId: canteen.id });
    const outsider = await createUser("staff", { canteenId: other.id });
    const order = await orderAt(student, "collected", { canteenId: canteen.id });
    expect((await submit(student, order.id, 5)).error).toBeNull();

    const { data, error } = await outsider.client.from("staff_feedback_v").select("order_id").eq("order_id", order.id);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("a staff profile with no membership reads 0 rows", async () => {
    const canteen = await createCanteen();
    const student = await createUser("student", { canteenId: canteen.id });
    const order = await orderAt(student, "collected", { canteenId: canteen.id });
    expect((await submit(student, order.id, 5)).error).toBeNull();
    const lone = await createUser("staff", { canteenId: canteen.id });
    await admin.from("canteen_members").delete().eq("user_id", lone.id);

    const { data, error } = await lone.client.from("staff_feedback_v").select("order_id");

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("a student reads 0 rows from the staff view", async () => {
    const student = await createUser();
    const order = await orderAt(student, "collected");
    expect((await submit(student, order.id, 5)).error).toBeNull();

    const { data, error } = await student.client.from("staff_feedback_v").select("order_id");

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
