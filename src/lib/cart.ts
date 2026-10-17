/** A cart line. Prices are never stored: the total is always computed from the current menu. */
export type CartLine = { itemId: string; qty: number };
export type Cart = CartLine[];

/** Most of one item in a single order; keeps a mis-tap from becoming a 500-samosa order. */
export const MAX_QTY_PER_ITEM = 20;

const STORAGE_KEY = "oac.cart.v1";

const clampQty = (qty: number) => Math.min(MAX_QTY_PER_ITEM, Math.floor(qty));

export function setQty(cart: Cart, itemId: string, qty: number): Cart {
  const next = clampQty(qty);
  if (!(next > 0)) return cart.filter((l) => l.itemId !== itemId);
  if (cart.some((l) => l.itemId === itemId)) {
    return cart.map((l) => (l.itemId === itemId ? { ...l, qty: next } : l));
  }
  return [...cart, { itemId, qty: next }];
}

export function addItem(cart: Cart, itemId: string): Cart {
  const current = cart.find((l) => l.itemId === itemId)?.qty ?? 0;
  return setQty(cart, itemId, current + 1);
}

/** Takes one unit off; the line disappears at zero. */
export function removeItem(cart: Cart, itemId: string): Cart {
  const current = cart.find((l) => l.itemId === itemId)?.qty;
  return current === undefined ? cart : setQty(cart, itemId, current - 1);
}

export function cartCount(cart: Cart): number {
  return cart.reduce((sum, l) => sum + l.qty, 0);
}

/** Total in paise at today's menu prices. Items no longer on the menu count for nothing. */
export function cartTotalPaise(cart: Cart, menu: { id: string; price_paise: number }[]): number {
  const prices = new Map(menu.map((m) => [m.id, m.price_paise]));
  return cart.reduce((sum, l) => sum + (prices.get(l.itemId) ?? 0) * l.qty, 0);
}

/** Restores a cart from storage; anything unreadable becomes an empty cart. */
export function parseCart(raw: string | null): Cart {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  let cart: Cart = [];
  for (const line of parsed) {
    if (typeof line?.itemId !== "string" || typeof line?.qty !== "number") continue;
    const existing = cart.find((l) => l.itemId === line.itemId)?.qty ?? 0;
    cart = setQty(cart, line.itemId, existing + line.qty);
  }
  return cart;
}

/**
 * The cart as an external store for `useSyncExternalStore`: localStorage when it works, with an
 * in-memory copy so the cart still functions for the visit when storage is blocked.
 * The server snapshot is `null` ("not read yet"); the client snapshot is always a string.
 */
let memory: string | undefined;
const listeners = new Set<() => void>();

export const cartStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      memory = undefined; // another tab changed it: re-read
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot(): string {
    if (memory === undefined) {
      try {
        memory = window.localStorage.getItem(STORAGE_KEY) ?? "";
      } catch {
        memory = "";
      }
    }
    return memory;
  },
  getServerSnapshot(): string | null {
    return null;
  },
  write(cart: Cart): void {
    memory = JSON.stringify(cart);
    try {
      window.localStorage.setItem(STORAGE_KEY, memory);
    } catch {
      // Private mode or blocked storage: the cart simply lives for this visit.
    }
    listeners.forEach((l) => l());
  },
};
