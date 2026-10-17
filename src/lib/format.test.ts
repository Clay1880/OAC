import { describe, expect, it } from "vitest";
import { formatPaise, formatSlotDay, formatSlotTime } from "./format";

describe("formatPaise", () => {
  it("formats integer paise as rupees with two decimals", () => {
    expect(formatPaise(12050)).toBe("₹120.50");
  });

  it("formats zero", () => {
    expect(formatPaise(0)).toBe("₹0.00");
  });
});

describe("formatSlotTime", () => {
  it("renders the instant in campus time (IST), not machine time", () => {
    // 07:45 UTC is 13:15 IST
    expect(formatSlotTime("2026-10-19T07:45:00Z")).toBe("1:15 PM");
  });
});

describe("formatSlotDay", () => {
  it("shows the campus calendar day, not the machine's", () => {
    // 2026-10-19 20:00 UTC is already 20 October in India.
    expect(formatSlotDay("2026-10-19T07:45:00Z")).toBe("Mon, 19 Oct");
    expect(formatSlotDay("2026-10-19T20:00:00Z")).toBe("Tue, 20 Oct");
  });
});
