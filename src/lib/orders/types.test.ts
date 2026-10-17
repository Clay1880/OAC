import { describe, expect, it } from "vitest";
import { toPlaceOrderError } from "./types";

describe("toPlaceOrderError", () => {
  it.each(["SLOT_FULL", "SLOT_CLOSED", "DEFAULTER", "ITEM_UNAVAILABLE", "EMPTY_ORDER"] as const)(
    "maps %s through unchanged",
    (code) => {
      expect(toPlaceOrderError({ message: code })).toBe(code);
    },
  );

  it("falls back to UNKNOWN for anything else", () => {
    expect(toPlaceOrderError({ message: "permission denied for table orders" })).toBe("UNKNOWN");
    expect(toPlaceOrderError({ message: "NOT_CANCELLABLE" })).toBe("UNKNOWN");
  });
});
