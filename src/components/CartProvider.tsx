"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { addItem, cartStore, parseCart, removeItem, setQty, type Cart } from "@/lib/cart";

type CartApi = {
  cart: Cart;
  /** False until the stored cart has been read, so screens do not flash "empty". */
  ready: boolean;
  add: (itemId: string) => void;
  remove: (itemId: string) => void;
  set: (itemId: string, qty: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartApi | null>(null);

// Every change re-reads the latest stored cart, so two quick taps never overwrite each other.
const update = (fn: (c: Cart) => Cart) => cartStore.write(fn(parseCart(cartStore.getSnapshot())));

export function CartProvider({ children }: { children: ReactNode }) {
  // Server and first client render see `null`; the stored cart appears right after hydration.
  const raw = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);

  const api = useMemo<CartApi>(
    () => ({
      cart: parseCart(raw),
      ready: raw !== null,
      add: (id) => update((c) => addItem(c, id)),
      remove: (id) => update((c) => removeItem(c, id)),
      set: (id, qty) => update((c) => setQty(c, id, qty)),
      clear: () => update(() => []),
    }),
    [raw],
  );

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside <CartProvider>");
  return value;
}
