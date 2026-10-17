import { describe, expect, it } from "vitest";
import { prepSummary } from "./prep";

describe("prepSummary", () => {
  it("totals quantities per item across the orders still to cook, biggest first", () => {
    const orders = [
      { id: "1", status: "placed" as const },
      { id: "2", status: "accepted" as const },
      { id: "3", status: "ready" as const },
    ];
    const lines = [
      { order_id: "1", name: "Samosa", qty: 4 },
      { order_id: "2", name: "Samosa", qty: 8 },
      { order_id: "2", name: "Chai", qty: 3 },
      { order_id: "3", name: "Samosa", qty: 50 }, // already ready: not part of the cook list
      { order_id: "9", name: "Other slot", qty: 7 },
    ];

    expect(prepSummary(orders, lines)).toEqual([
      { name: "Samosa", qty: 12 },
      { name: "Chai", qty: 3 },
    ]);
  });

  it("is empty when nothing is left to cook", () => {
    expect(prepSummary([{ id: "1", status: "ready" as const }], [{ order_id: "1", name: "Samosa", qty: 2 }])).toEqual([]);
  });
});
