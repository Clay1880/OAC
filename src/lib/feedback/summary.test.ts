import { describe, expect, it } from "vitest";
import { starString, summarizeFeedback } from "./summary";

describe("summarizeFeedback", () => {
  it("counts, averages to one decimal and tallies each star", () => {
    expect(summarizeFeedback([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({
      count: 3,
      average: 4.3,
      distribution: [0, 0, 0, 2, 1],
    });
  });

  it("is null and all zeros when there is no feedback", () => {
    expect(summarizeFeedback([])).toEqual({ count: 0, average: null, distribution: [0, 0, 0, 0, 0] });
  });

  it("puts one star at index 0", () => {
    expect(summarizeFeedback([{ rating: 1 }, { rating: 1 }, { rating: 2 }]).distribution).toEqual([2, 1, 0, 0, 0]);
  });
});

describe("starString", () => {
  it("fills as many stars as the rating and outlines the rest", () => {
    expect(starString(4)).toBe("★★★★☆");
    expect(starString(1)).toBe("★☆☆☆☆");
    expect(starString(5)).toBe("★★★★★");
  });
});
