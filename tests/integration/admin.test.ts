import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { admin, createSlot, createUser, defaultCanteen } from "./helpers";

/** A day nobody else's test uses: the slots table is shared and (canteen_id, starts_at) is unique. */
const farDay = () => {
  const year = 2100 + Math.floor(Math.random() * 400);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const owner = () => createUser("staff", { canteenRole: "owner" });

const generate = async (user: { client: { rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> } }, args: Partial<{ canteenId: string; day: string; from: string; to: string; minutes: number; capacity: number }> = {}) =>
  user.client.rpc("generate_slots", {
    p_canteen_id: args.canteenId ?? (await defaultCanteen()).id,
    p_day: args.day ?? farDay(),
    p_from: args.from ?? "13:00",
    p_to: args.to ?? "14:00",
    p_minutes: args.minutes ?? 10,
    p_capacity: args.capacity ?? 15,
  });

/** Start times (UTC HH:MM) of the default canteen's slots on `day` between 07:00 and 09:00 UTC. */
async function slotsOn(day: string) {
  const { data } = await admin
    .from("slots")
    .select("starts_at, capacity, booked_count")
    .eq("canteen_id", (await defaultCanteen()).id)
    .gte("starts_at", `${day}T07:00:00Z`)
    .lt("starts_at", `${day}T09:00:00Z`)
    .order("starts_at");
  return data ?? [];
}

describe("generate_slots", () => {
  it("creates 1:00–2:00 PM IST in 10-minute slots and is idempotent", async () => {
    const boss = await owner();
    const day = farDay();

    const first = await generate(boss, { day });
    const second = await generate(boss, { day });

    expect(first.error).toBeNull();
    expect(first.data).toBe(6);
    expect(second.error).toBeNull();
    expect(second.data).toBe(0);

    // 13:00 IST is 07:30 UTC; the last slot starts at 13:50 IST and the 2:00 PM end is exclusive.
    const slots = await slotsOn(day);
    expect(slots.map((s) => s.starts_at.slice(11, 16))).toEqual(["07:30", "07:40", "07:50", "08:00", "08:10", "08:20"]);
    expect(slots.every((s) => s.capacity === 15 && s.booked_count === 0)).toBe(true);
  });

  it("college admin can generate slots for a canteen in the college", async () => {
    const boss = await createUser("admin");
    const day = farDay();

    const { data, error } = await generate(boss, { day, from: "13:00", to: "13:30" });

    expect(error).toBeNull();
    expect(data).toBe(3);
    expect(await slotsOn(day)).toHaveLength(3);
  });

  it("only adds the missing slots when ranges overlap", async () => {
    const boss = await owner();
    const day = farDay();
    await generate(boss, { day, from: "13:00", to: "13:30" }); // 3 slots

    const { data } = await generate(boss, { day, from: "13:00", to: "14:00" });

    expect(data).toBe(3);
  });

  it("a range that is not a multiple of the length ends before the end time", async () => {
    const boss = await owner();

    const { data } = await generate(boss, { from: "13:00", to: "13:25", minutes: 10 });

    expect(data).toBe(3); // 13:00, 13:10, 13:20
  });

  it.each([
    ["zero minutes", { minutes: 0 }],
    ["zero capacity", { capacity: 0 }],
    ["end before start", { from: "14:00", to: "13:00" }],
    ["empty range", { from: "13:00", to: "13:00" }],
  ])("rejects %s with INVALID_RANGE", async (_name, args) => {
    const boss = await owner();

    const { error } = await generate(boss, args);

    expect(error?.message).toBe("INVALID_RANGE");
  });

  it("rejects students and non-owner staff", async () => {
    const student = await createUser();
    const staff = await createUser("staff");

    expect((await generate(student)).error?.message).toBe("FORBIDDEN");
    expect((await generate(staff)).error?.message).toBe("FORBIDDEN");
  });
});

describe("set_slot_capacity", () => {
  it("changes the capacity", async () => {
    const boss = await owner();
    const slot = await createSlot(300, 10);

    const { data, error } = await boss.client.rpc("set_slot_capacity", { p_slot_id: slot.id, p_capacity: 25 });

    expect(error).toBeNull();
    expect((data as { capacity: number }).capacity).toBe(25);
  });

  it("rejects a capacity below booked_count", async () => {
    const boss = await owner();
    const slot = await createSlot(300, 10);
    await admin.from("slots").update({ booked_count: 6 }).eq("id", slot.id);

    const below = await boss.client.rpc("set_slot_capacity", { p_slot_id: slot.id, p_capacity: 5 });
    const exact = await boss.client.rpc("set_slot_capacity", { p_slot_id: slot.id, p_capacity: 6 });

    expect(below.error?.message).toBe("BELOW_BOOKED");
    expect(exact.error).toBeNull();
  });

  it("rejects a capacity of zero or less and unknown slots", async () => {
    const boss = await owner();
    const slot = await createSlot(300, 10);

    expect((await boss.client.rpc("set_slot_capacity", { p_slot_id: slot.id, p_capacity: 0 })).error?.message).toBe("INVALID_RANGE");
    expect((await boss.client.rpc("set_slot_capacity", { p_slot_id: randomUUID(), p_capacity: 5 })).error?.message).toBe("SLOT_NOT_FOUND");
  });

  it("rejects students and non-owner staff", async () => {
    const student = await createUser();
    const staff = await createUser("staff");
    const slot = await createSlot(300, 10);

    expect((await student.client.rpc("set_slot_capacity", { p_slot_id: slot.id, p_capacity: 20 })).error?.message).toBe("FORBIDDEN");
    expect((await staff.client.rpc("set_slot_capacity", { p_slot_id: slot.id, p_capacity: 20 })).error?.message).toBe("FORBIDDEN");
    const { data } = await admin.from("slots").select("capacity").eq("id", slot.id).single();
    expect(data?.capacity).toBe(10);
  });
});

describe("menu administration through RLS", () => {
  it("an owner can add, reprice and mark an item sold out; staff and students cannot", async () => {
    const canteenId = (await defaultCanteen()).id;
    const boss = await owner();
    const staff = await createUser("staff");
    const student = await createUser();

    const added = await boss.client
      .from("menu_items")
      .insert({ canteen_id: canteenId, name: `Owner Item ${randomUUID().slice(0, 6)}`, price_paise: 1200, category: "Test" })
      .select()
      .single();
    expect(added.error).toBeNull();
    const id = added.data!.id;

    expect((await boss.client.from("menu_items").update({ price_paise: 1500, is_available: false }).eq("id", id)).error).toBeNull();
    const { data } = await admin.from("menu_items").select("price_paise, is_available").eq("id", id).single();
    expect(data).toEqual({ price_paise: 1500, is_available: false });

    for (const user of [staff, student]) {
      await user.client.from("menu_items").update({ price_paise: 1 }).eq("id", id);
      expect((await admin.from("menu_items").select("price_paise").eq("id", id).single()).data?.price_paise).toBe(1500);
      const insert = await user.client.from("menu_items").insert({ canteen_id: canteenId, name: "Nope", price_paise: 1, category: "Test" });
      expect(insert.error).not.toBeNull();
    }
  });
});
