import { describe, expect, it } from "vitest";
import { groupBySlot } from "./groupBySlot";
import type { StaffOrder } from "./types";

const order = (over: Partial<StaffOrder> & { id: string }): StaffOrder => ({
  code: `OAC-${over.id}`,
  status: "placed",
  total_paise: 1000,
  created_at: "2026-10-19T07:00:00Z",
  accepted_at: null,
  ready_at: null,
  collected_at: null,
  flagged_at: null,
  paid_at: null,
  slot_id: "s1",
  slot_starts_at: "2026-10-19T07:45:00Z",
  student_id: "u1",
  student_name: "Asha Rao",
  reg_no: "R1",
  phone: "9876543210",
  canteen_id: "k1",
  canteen_name: "Open Area Canteen",
  ...over,
});

describe("groupBySlot", () => {
  it("groups by slot, slots in time order, orders by creation time", () => {
    const groups = groupBySlot([
      order({ id: "c", slot_id: "s2", slot_starts_at: "2026-10-19T08:00:00Z", created_at: "2026-10-19T07:05:00Z" }),
      order({ id: "b", created_at: "2026-10-19T07:20:00Z" }),
      order({ id: "a", created_at: "2026-10-19T07:10:00Z" }),
    ]);

    expect(groups.map((g) => g.slotStart)).toEqual(["2026-10-19T07:45:00Z", "2026-10-19T08:00:00Z"]);
    expect(groups[0].orders.map((o) => o.id)).toEqual(["a", "b"]);
    expect(groups[1].orders.map((o) => o.id)).toEqual(["c"]);
  });

  it("drops collected and cancelled orders but keeps no-shows, which can still be collected late", () => {
    const groups = groupBySlot([
      order({ id: "1", status: "collected" }),
      order({ id: "2", status: "cancelled" }),
      order({ id: "3", status: "no_show" }),
      order({ id: "4", status: "ready" }),
    ]);

    expect(groups[0].orders.map((o) => o.id)).toEqual(["3", "4"]);
  });

  it("returns no groups when everything is finished", () => {
    expect(groupBySlot([order({ id: "1", status: "collected" })])).toEqual([]);
    expect(groupBySlot([])).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [order({ id: "b", created_at: "2026-10-19T07:20:00Z" }), order({ id: "a", created_at: "2026-10-19T07:10:00Z" })];
    groupBySlot(input);
    expect(input.map((o) => o.id)).toEqual(["b", "a"]);
  });
});
