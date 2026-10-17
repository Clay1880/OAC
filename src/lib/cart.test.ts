import { describe, expect, it } from "vitest";
import { addItem, cartCount, cartTotalPaise, parseCart, removeItem, setQty, type Cart } from "./cart";

const menu = [
  { id: "a", price_paise: 2000 },
  { id: "b", price_paise: 4550 },
];

describe("cart math", () => {
  it("addItem adds a new line and increments an existing one without mutating", () => {
    const empty: Cart = [];
    const one = addItem(empty, "a");
    const two = addItem(one, "a");

    expect(empty).toEqual([]);
    expect(one).toEqual([{ itemId: "a", qty: 1 }]);
    expect(two).toEqual([{ itemId: "a", qty: 2 }]);
  });

  it("keeps lines in the order they were first added", () => {
    const cart = addItem(addItem(addItem([], "b"), "a"), "b");

    expect(cart.map((l) => l.itemId)).toEqual(["b", "a"]);
  });

  it("removeItem takes one unit off and drops the line at zero", () => {
    const cart = setQty([], "a", 2);

    expect(removeItem(cart, "a")).toEqual([{ itemId: "a", qty: 1 }]);
    expect(removeItem(removeItem(cart, "a"), "a")).toEqual([]);
    expect(removeItem(cart, "missing")).toEqual(cart);
  });

  it("setQty to 0 or less removes the line", () => {
    const cart = setQty(setQty([], "a", 3), "b", 1);

    expect(setQty(cart, "a", 0)).toEqual([{ itemId: "b", qty: 1 }]);
    expect(setQty(cart, "a", -2)).toEqual([{ itemId: "b", qty: 1 }]);
  });

  it("setQty floors fractions and caps a line at 20", () => {
    expect(setQty([], "a", 2.9)).toEqual([{ itemId: "a", qty: 2 }]);
    expect(setQty([], "a", 500)).toEqual([{ itemId: "a", qty: 20 }]);
    expect(addItem(setQty([], "a", 20), "a")).toEqual([{ itemId: "a", qty: 20 }]);
  });

  it("cartTotalPaise uses current menu prices, so a repriced item changes the total", () => {
    const cart = setQty(setQty([], "a", 2), "b", 1);

    expect(cartTotalPaise(cart, menu)).toBe(2 * 2000 + 4550);
    expect(cartTotalPaise(cart, [{ id: "a", price_paise: 2500 }, menu[1]])).toBe(2 * 2500 + 4550);
  });

  it("cartTotalPaise counts nothing for an item that left the menu", () => {
    expect(cartTotalPaise(setQty([], "gone", 3), menu)).toBe(0);
  });

  it("cartCount sums quantities", () => {
    expect(cartCount(setQty(setQty([], "a", 2), "b", 3))).toBe(5);
    expect(cartCount([])).toBe(0);
  });
});

describe("parseCart", () => {
  it("restores a stored cart", () => {
    expect(parseCart(JSON.stringify([{ itemId: "a", qty: 2 }]))).toEqual([{ itemId: "a", qty: 2 }]);
  });

  it("falls back to an empty cart for missing or corrupt storage", () => {
    expect(parseCart(null)).toEqual([]);
    expect(parseCart("not json")).toEqual([]);
    expect(parseCart(JSON.stringify({ a: 1 }))).toEqual([]);
  });

  it("drops malformed lines and merges duplicates", () => {
    const stored = JSON.stringify([
      { itemId: "a", qty: 1 },
      { itemId: "a", qty: 2 },
      { itemId: 5, qty: 1 },
      { itemId: "b", qty: 0 },
      { itemId: "c", qty: "x" },
    ]);

    expect(parseCart(stored)).toEqual([{ itemId: "a", qty: 3 }]);
  });
});
