"use client";

import Image from "next/image";
import { useCart } from "@/components/CartProvider";
import { formatPaise } from "@/lib/format";
import type { MenuItem } from "@/lib/menu";
import { menuPhoto } from "@/lib/menuImage";
import { topPopular, topUsual, type Signals } from "@/lib/signals";

function QuickRow({ title, items }: { title: string; items: MenuItem[] }) {
  const { add } = useCart();
  const headingId = `quick-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-2 text-base font-semibold">
        {title}
      </h2>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {items.map((item) => {
          const photo = menuPhoto(item.name);
          return (
            <li
              key={item.id}
              data-quick-id={item.id}
              className="flex w-36 shrink-0 flex-col rounded-card border border-line bg-surface p-2 shadow-edge"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-chip">
                {photo ? (
                  <Image src={photo} alt="" fill sizes="144px" className="object-cover" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-full items-center justify-center bg-sunken text-3xl font-semibold text-brand-deep"
                  >
                    {item.name.charAt(0)}
                  </span>
                )}
              </div>
              <h3 className="mt-2 line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-snug">{item.name}</h3>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="num text-sm font-semibold">{formatPaise(item.price_paise)}</p>
                <button
                  type="button"
                  aria-label={`Add ${item.name}`}
                  onClick={() => add(item.id)}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-brand text-xl font-semibold leading-none text-on-brand transition-transform duration-150 active:scale-95"
                >
                  <span aria-hidden="true">+</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "Order again" (what this student orders most) and "Most ordered" (campus favourites): each row appears only when it has something to show. */
export function QuickRows({ items, signals }: { items: MenuItem[]; signals: Signals }) {
  const usual = topUsual(signals, items);
  const popular = topPopular(signals, items);
  if (usual.length === 0 && popular.length === 0) return null;
  return (
    <div className="mt-5 flex flex-col gap-5">
      {usual.length > 0 && <QuickRow title="Order again" items={usual} />}
      {popular.length > 0 && <QuickRow title="Most ordered" items={popular} />}
    </div>
  );
}
