import { describe, expect, it } from "vitest";
import { findByCode, normalizeCodeQuery } from "./codeLookup";

const orders = [{ code: "OAC-K7M2P" }, { code: "OAC-9XQ2P" }, { code: "OAC-ABCDE" }];

describe("normalizeCodeQuery", () => {
  it("uppercases and strips spaces, dashes and the OAC prefix", () => {
    expect(normalizeCodeQuery(" k7-m2p ")).toBe("K7M2P");
    expect(normalizeCodeQuery("oac-k7m2p")).toBe("K7M2P");
    expect(normalizeCodeQuery("OAC K7M2P")).toBe("K7M2P");
  });
});

describe("findByCode", () => {
  it("matches the last characters of the code, ignoring case", () => {
    expect(findByCode(orders, "m2p").map((o) => o.code)).toEqual(["OAC-K7M2P"]);
    expect(findByCode(orders, "K7M2P").map((o) => o.code)).toEqual(["OAC-K7M2P"]);
  });

  it("returns every order that ends the same way", () => {
    expect(findByCode(orders, "2p").map((o) => o.code)).toEqual(["OAC-K7M2P", "OAC-9XQ2P"]);
  });

  it("returns nothing for an empty query or a single character", () => {
    expect(findByCode(orders, "")).toEqual([]);
    expect(findByCode(orders, "P")).toEqual([]);
  });

  it("matches nothing when the query has a character no code can contain (0, 1, I, O)", () => {
    expect(findByCode(orders, "K7M0P")).toEqual([]);
    expect(findByCode([{ code: "OAC-ABCDE" }], "ABCDO")).toEqual([]);
  });
});
