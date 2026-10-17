"use client";

import { useEffect, useState } from "react";
import { AssistCard } from "@/components/assist/AssistCard";
import { CartSheet } from "@/components/CartSheet";
import { useCart } from "@/components/CartProvider";
import { HomeHero } from "@/components/HomeHero";
import { Icon } from "@/components/Icon";
import { MenuList } from "@/components/MenuList";
import { QuickRows } from "@/components/QuickRows";
import { EmptyState } from "@/components/ui/EmptyState";
import { cartCount, cartTotalPaise } from "@/lib/cart";
import { cn } from "@/lib/cn";
import { formatPaise } from "@/lib/format";
import { fetchMenu, groupByCategory, type MenuItem } from "@/lib/menu";
import { applyMenuView, isFlatView, PRICE_CAPS, type MenuSort } from "@/lib/menuFilter";
import type { Signals } from "@/lib/signals";
import { createClient } from "@/lib/supabase/browser";
import type { MealMoment } from "@/lib/assist/moment";
import type { Canteen } from "@/lib/tenancy/types";

/** Menu with a pinned cart bar. Re-reads the menu when the app comes back to the foreground. */
export function MenuScreen({
  canteen,
  initialItems,
  moment,
  signals,
}: {
  canteen: Canteen;
  initialItems: MenuItem[];
  moment: MealMoment;
  signals: Signals;
}) {
  const { cart } = useCart();
  const [items, setItems] = useState(initialItems);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Look only: narrows what is shown, never what is in the cart or the menu.
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<MenuSort>("default");
  const [maxPaise, setMaxPaise] = useState<number | null>(null);

  useEffect(() => {
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      const fresh = await fetchMenu(canteen.id);
      if (fresh) setItems(fresh);
    }
    // The admin marking something sold out (or adding a dish) shows up without a refresh.
    const supabase = createClient();
    const channel = supabase
      .channel(`menu-live-${canteen.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items", filter: `canteen_id=eq.${canteen.id}` },
        () => void refresh(),
      )
      .subscribe();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [canteen.id]);

  const count = cartCount(cart);
  const total = cartTotalPaise(cart, items.filter((i) => i.is_available));

  if (items.length === 0) {
    return (
      <>
        <HomeHero canteenName={canteen.name} />
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
  const view = { query, category, maxPaise, sort };
  const shown = applyMenuView(items, view);

  return (
    <>
      <HomeHero canteenName={canteen.name}>
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

      <div className="relative -mt-[4.5rem]">
        <AssistCard canteenId={canteen.id} moment={moment} />
      </div>

      <QuickRows items={items} signals={signals} />

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

      <div className="-mx-4 -mt-2 flex gap-2 overflow-x-auto px-4 pb-4" role="group" aria-label="Sort and price">
        {(
          [
            ["price-asc", "Price: low to high"],
            ["price-desc", "Price: high to low"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={sort === value}
            onClick={() => setSort(sort === value ? "default" : value)}
            className={cn(
              "min-h-11 shrink-0 whitespace-nowrap rounded-chip px-4 text-sm font-semibold transition-colors duration-150",
              sort === value ? "bg-brand text-on-brand" : "bg-surface text-ink",
            )}
          >
            {label}
          </button>
        ))}
        {PRICE_CAPS.map(({ paise, label }) => (
          <button
            key={paise}
            type="button"
            aria-pressed={maxPaise === paise}
            onClick={() => setMaxPaise(maxPaise === paise ? null : paise)}
            className={cn(
              "min-h-11 shrink-0 whitespace-nowrap rounded-chip px-4 text-sm font-semibold transition-colors duration-150",
              maxPaise === paise ? "bg-brand text-on-brand" : "bg-surface text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title="Nothing matches" description="Try a different search or clear the filters." className="py-8" />
      ) : (
        <MenuList items={shown} flat={isFlatView(view)} />
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
