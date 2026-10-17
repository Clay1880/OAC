"use client";

import Image from "next/image";
import { Stepper } from "@/components/Stepper";
import { useCart } from "@/components/CartProvider";
import { formatPaise } from "@/lib/format";
import { groupByCategory, type MenuItem } from "@/lib/menu";
import { menuPhoto } from "@/lib/menuImage";
import { cn } from "@/lib/cn";

// Dishes without a photo get a lettered tile; each category has its own cream or copper tint.
const TINTS = ["bg-sunken text-brand-deep", "bg-brand-soft text-brand-deep"];

export function MenuList({ items }: { items: MenuItem[] }) {
  const { cart, add, remove } = useCart();
  const qtyOf = (id: string) => cart.find((l) => l.itemId === id)?.qty ?? 0;

  return (
    <div className="flex flex-col gap-7">
      {groupByCategory(items).map(({ category, items: list }, index) => (
        <section key={category} aria-labelledby={`cat-${category}`}>
          <h2 id={`cat-${category}`} className="mb-3 text-base font-semibold">
            {category}
          </h2>
          <ul className="grid grid-cols-2 gap-3">
            {list.map((item) => {
              const qty = qtyOf(item.id);
              const photo = menuPhoto(item.name);
              return (
                <li
                  key={item.id}
                  data-item-id={item.id}
                  className={cn(
                    "flex flex-col rounded-card border border-line bg-surface p-2.5 shadow-edge",
                    !item.is_available && "opacity-60",
                  )}
                >
                  <div className="relative aspect-square overflow-hidden rounded-chip">
                    {photo ? (
                      <Image src={photo} alt="" fill sizes="(max-width: 576px) 44vw, 240px" className="object-cover" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn("flex size-full items-center justify-center text-4xl font-semibold", TINTS[index % TINTS.length])}
                      >
                        {item.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2.5 line-clamp-2 min-h-[2.6em] text-[0.9375rem] font-semibold leading-snug">{item.name}</h3>
                  <p className="mt-0.5 line-clamp-1 text-xs text-ink-faint">{item.description ?? category}</p>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <p className="num text-base font-semibold">{formatPaise(item.price_paise)}</p>
                    {!item.is_available ? (
                      <span className="rounded-pill border-2 border-dashed border-line-strong px-2.5 py-1 text-xs font-semibold text-ink-soft">
                        Sold out
                      </span>
                    ) : qty === 0 ? (
                      <button
                        type="button"
                        aria-label={`Add ${item.name}`}
                        onClick={() => add(item.id)}
                        className="inline-flex size-10 items-center justify-center rounded-chip bg-brand text-xl font-semibold leading-none text-on-brand transition-transform duration-150 active:scale-95"
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    ) : null}
                  </div>
                  {item.is_available && qty > 0 && (
                    <div className="mt-1 flex justify-end">
                      <Stepper name={item.name} qty={qty} onAdd={() => add(item.id)} onRemove={() => remove(item.id)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
