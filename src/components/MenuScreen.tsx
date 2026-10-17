"use client";

import { useEffect, useState } from "react";
import { CartSheet } from "@/components/CartSheet";
import { useCart } from "@/components/CartProvider";
import { MenuList } from "@/components/MenuList";
import { EmptyState } from "@/components/ui/EmptyState";
import { cartCount, cartTotalPaise } from "@/lib/cart";
import { formatPaise } from "@/lib/format";
import { fetchMenu, type MenuItem } from "@/lib/menu";

/** Menu with a pinned cart bar. Re-reads the menu when the app comes back to the foreground. */
export function MenuScreen({ initialItems }: { initialItems: MenuItem[] }) {
  const { cart } = useCart();
  const [items, setItems] = useState(initialItems);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      const fresh = await fetchMenu();
      if (fresh) setItems(fresh);
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);

  const count = cartCount(cart);
  const total = cartTotalPaise(cart, items.filter((i) => i.is_available));

  if (items.length === 0) {
    return (
      <EmptyState
        title="The menu is empty"
        description="The canteen has not added anything yet. Check back in a little while."
      />
    );
  }

  return (
    <>
      <MenuList items={items} />
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="mx-auto flex min-h-14 w-full max-w-md items-center justify-between rounded-chip bg-chili px-5 text-on-chili shadow-press transition-transform duration-150 active:translate-y-0.5"
          >
            <span className="font-semibold">
              View order · <span className="num">{count}</span> {count === 1 ? "item" : "items"}
            </span>
            <span className="num text-lg font-semibold">{formatPaise(total)}</span>
          </button>
        </div>
      )}
      <CartSheet open={sheetOpen} onClose={() => setSheetOpen(false)} menu={items} />
    </>
  );
}
