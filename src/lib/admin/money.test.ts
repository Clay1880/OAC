import { describe, expect, it } from "vitest";
import { parseRupees } from "./money";

describe("parseRupees", () => {
  it("turns what an admin types into integer paise", () => {
    expect(parseRupees("45")).toBe(4500);
    expect(parseRupees("45.5")).toBe(4550);
    expect(parseRupees("45.50")).toBe(4550);
    expect(parseRupees(" ₹120.05 ")).toBe(12005);
    expect(parseRupees("0")).toBe(0);
    expect(parseRupees("1,250")).toBe(125000);
  });
  it("is not fooled by floating point", () => {
    expect(parseRupees("0.29")).toBe(29);
    expect(parseRupees("1.15")).toBe(115);
  });
  it("rejects anything that is not a non-negative amount with at most two decimals", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1..2", "12.", ".5x", "1e3"]) {
      expect(parseRupees(bad)).toBeNull();
    }
  });
});
