"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { CartSheet } from "@/components/CartSheet";
import { useCart } from "@/components/CartProvider";
import { HomeHero } from "@/components/HomeHero";
import { Icon } from "@/components/Icon";
import { MenuList } from "@/components/MenuList";
import { EmptyState } from "@/components/ui/EmptyState";
import { cartCount, cartTotalPaise } from "@/lib/cart";
import { cn } from "@/lib/cn";
import { formatPaise } from "@/lib/format";
import { fetchMenu, groupByCategory, type MenuItem } from "@/lib/menu";
import { createClient } from "@/lib/supabase/browser";

/** Menu with a pinned cart bar. Re-reads the menu when the app comes back to the foreground. */
export function MenuScreen({ initialItems }: { initialItems: MenuItem[] }) {
  const { cart } = useCart();
  const [items, setItems] = useState(initialItems);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Look only: narrows what is shown, never what is in the cart or the menu.
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      const fresh = await fetchMenu();
      if (fresh) setItems(fresh);
    }
    // The admin marking something sold out (or adding a dish) shows up without a refresh.
    const supabase = createClient();
    const channel = supabase
      .channel("menu-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => void refresh())
      .subscribe();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);

  const count = cartCount(cart);
  const total = cartTotalPaise(cart, items.filter((i) => i.is_available));

  if (items.length === 0) {
    return (
      <>
        <HomeHero />
        <div className="-mt-16">
          <EmptyState
            title="The menu is empty"
            description="The canteen has not added anything yet. Check back in a little while."
          />
        </div>
      </>
    );
  }

  const categories = groupByCategory(items).map((g) => g.category);
  const needle = query.trim().toLowerCase();
  const shown = items.filter(
    (i) => (category === null || i.category === category) && (needle === "" || i.name.toLowerCase().includes(needle)),
  );

  return (
    <>
      <HomeHero>
        <label className="relative mt-5 block">
          <span className="sr-only">Search the menu</span>
          <Icon name="search" className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-on-dark-soft" />
          <input
            type="search"
            name="menu-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            placeholder="Search the menu"
            className="min-h-14 w-full rounded-control bg-white/10 pl-12 pr-4 text-base text-on-dark placeholder:text-on-dark-soft"
          />
        </label>
      </HomeHero>

      <div className="relative -mt-[4.5rem] h-40 overflow-hidden rounded-card bg-brand-deep p-5 text-on-brand shadow-lift">
        <Image
          src="/figma/photos/p1.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 576px) 60vw, 340px"
          className="object-cover object-center [mask-image:linear-gradient(to_right,transparent_35%,black_85%)] [-webkit-mask-image:linear-gradient(to_right,transparent_35%,black_85%)]"
        />
        <span className="relative inline-block rounded-chip bg-danger px-2.5 py-1 text-xs font-semibold text-on-danger">Promo</span>
        <p className="relative mt-3 max-w-[11.5rem] text-[1.375rem] font-semibold leading-tight">Order ahead, skip the queue</p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-4" role="group" aria-label="Categories">
        {[null, ...categories].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "min-h-11 shrink-0 whitespace-nowrap rounded-chip px-4 text-sm font-semibold transition-colors duration-150",
              category === c ? "bg-brand text-on-brand" : "bg-surface text-ink",
            )}
          >
            {c ?? "All"}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title="Nothing matches" description="Try a different search or pick All." className="py-8" />
      ) : (
        <MenuList items={shown} />
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-[4.75rem] z-10 px-4">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-between rounded-control bg-brand px-5 text-on-brand shadow-press transition-transform duration-150 active:translate-y-0.5"
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
