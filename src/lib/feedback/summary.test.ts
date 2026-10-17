import { describe, expect, it } from "vitest";
import { starString, toFeedbackSummary } from "./summary";

describe("toFeedbackSummary", () => {
  it("turns a feedback_summary row into the count, average and one-to-five-star distribution", () => {
    expect(toFeedbackSummary({ count: 3, average: 4.3, c1: 0, c2: 0, c3: 0, c4: 2, c5: 1 })).toEqual({
      count: 3,
      average: 4.3,
      distribution: [0, 0, 0, 2, 1],
    });
  });

  it("accepts numbers sent as strings (bigint and numeric over JSON)", () => {
    expect(toFeedbackSummary({ count: "2", average: "1.5", c1: "1", c2: "1", c3: "0", c4: "0", c5: "0" })).toEqual({
      count: 2,
      average: 1.5,
      distribution: [1, 1, 0, 0, 0],
    });
  });

  it("is null and all zeros when there is no feedback or no row", () => {
    const empty = { count: 0, average: null, distribution: [0, 0, 0, 0, 0] };
    expect(toFeedbackSummary({ count: 0, average: null, c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 })).toEqual(empty);
    expect(toFeedbackSummary(undefined)).toEqual(empty);
  });
});

describe("starString", () => {
  it("fills as many stars as the rating and outlines the rest", () => {
    expect(starString(4)).toBe("★★★★☆");
    expect(starString(1)).toBe("★☆☆☆☆");
    expect(starString(5)).toBe("★★★★★");
  });
});
