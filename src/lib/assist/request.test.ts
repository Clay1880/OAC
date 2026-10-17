import { describe, expect, it } from "vitest";
import { parseSuggestRequest } from "./request";

const canteenId = "11111111-1111-1111-1111-111111111111";

describe("parseSuggestRequest", () => {
  it("rejects a note over 300 characters", () => {
    expect(parseSuggestRequest({ canteenId, moods: [], note: "x".repeat(301) })).toBeNull();
  });

  it("rejects an unknown mood", () => {
    expect(parseSuggestRequest({ canteenId, moods: ["hangry"], note: "" })).toBeNull();
  });

  it("accepts a valid body", () => {
    expect(
      parseSuggestRequest({ canteenId, moods: ["tired", "quick"], note: "no onions", vegOnly: true }),
    ).toEqual({ canteenId, moods: ["tired", "quick"], note: "no onions", vegOnly: true });
  });
});
