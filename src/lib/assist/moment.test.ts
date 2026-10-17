import { describe, expect, it } from "vitest";
import { mealMoment, momentLabel } from "./moment";

/** Instant for an IST wall-clock time (IST = UTC+5:30, no DST). */
const ist = (h: number, m: number) => Date.UTC(2026, 9, 17, h, m) - (5 * 60 + 30) * 60_000;

describe("mealMoment", () => {
  it("maps campus wall-clock time to a meal moment", () => {
    expect(mealMoment(ist(7, 30))).toBe("breakfast");
    expect(mealMoment(ist(13, 5))).toBe("lunch");
    expect(mealMoment(ist(16, 0))).toBe("snack");
    expect(mealMoment(ist(20, 0))).toBe("dinner");
    expect(mealMoment(ist(23, 30))).toBe("late");
    expect(mealMoment(ist(3, 0))).toBe("late");
  });

  it("honours the window edges", () => {
    expect(mealMoment(ist(5, 59))).toBe("late");
    expect(mealMoment(ist(6, 0))).toBe("breakfast");
    expect(mealMoment(ist(10, 59))).toBe("breakfast");
    expect(mealMoment(ist(11, 0))).toBe("lunch");
    expect(mealMoment(ist(14, 59))).toBe("lunch");
    expect(mealMoment(ist(15, 0))).toBe("snack");
    expect(mealMoment(ist(18, 29))).toBe("snack");
    expect(mealMoment(ist(18, 30))).toBe("dinner");
    expect(mealMoment(ist(22, 29))).toBe("dinner");
    expect(mealMoment(ist(22, 30))).toBe("late");
  });
});

describe("momentLabel", () => {
  it("returns the display labels", () => {
    expect(momentLabel("breakfast")).toBe("Breakfast");
    expect(momentLabel("lunch")).toBe("Lunch break");
    expect(momentLabel("snack")).toBe("Evening snack");
    expect(momentLabel("dinner")).toBe("Dinner");
    expect(momentLabel("late")).toBe("Late night");
  });
});
