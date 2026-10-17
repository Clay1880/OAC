"use client";

import { Button } from "@/components/ui/Button";
import { Stepper } from "@/components/Stepper";
import { useCart } from "@/components/CartProvider";
import { formatPaise } from "@/lib/format";
import { groupByCategory, type MenuItem } from "@/lib/menu";
import { cn } from "@/lib/cn";

export function MenuList({ items }: { items: MenuItem[] }) {
  const { cart, add, remove } = useCart();
  const qtyOf = (id: string) => cart.find((l) => l.itemId === id)?.qty ?? 0;

  return (
    <div className="flex flex-col gap-8">
      {groupByCategory(items).map(({ category, items: list }) => (
        <section key={category} aria-labelledby={`cat-${category}`}>
          <h2 id={`cat-${category}`} className="mb-1 border-b-2 border-ink pb-2 text-2xl font-semibold">
            {category}
          </h2>
          <ul className="divide-y divide-line">
            {list.map((item) => {
              const qty = qtyOf(item.id);
              return (
                <li
                  key={item.id}
                  data-item-id={item.id}
                  className={cn("flex items-center justify-between gap-4 py-4", !item.is_available && "opacity-60")}
                >
                  <div className="min-w-0">
                    <h3 className="font-sans text-lg font-semibold leading-snug">{item.name}</h3>
                    {item.description && <p className="mt-0.5 text-sm text-ink-soft text-pretty">{item.description}</p>}
                    <p className="num mt-1 font-semibold">{formatPaise(item.price_paise)}</p>
                  </div>
                  <div className="shrink-0">
                    {!item.is_available ? (
                      <span className="rounded-chip border-2 border-dashed border-line-strong px-3 py-2 text-sm font-semibold text-ink-soft">
                        Sold out
                      </span>
                    ) : qty === 0 ? (
                      <Button variant="secondary" aria-label={`Add ${item.name}`} onClick={() => add(item.id)}>
                        Add
                      </Button>
                    ) : (
                      <Stepper name={item.name} qty={qty} onAdd={() => add(item.id)} onRemove={() => remove(item.id)} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
