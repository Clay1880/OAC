"use client";

import { Stepper } from "@/components/Stepper";
import { useCart } from "@/components/CartProvider";
import { formatPaise } from "@/lib/format";
import { cartTotalPaise } from "@/lib/cart";
import type { MenuItem } from "@/lib/menu";
import { cn } from "@/lib/cn";

/**
 * The cart as an editable list with a total at today's prices.
 * `flaggedIds` are lines the server refused (sold out): they are highlighted and say so.
 */
export function CartLines({ menu, flaggedIds = [] }: { menu: MenuItem[]; flaggedIds?: string[] }) {
  const { cart, add, remove, set } = useCart();
  const byId = new Map(menu.map((m) => [m.id, m]));

  return (
    <div>
      <ul className="divide-y divide-line">
        {cart.map((line) => {
          const item = byId.get(line.itemId);
          const flagged = flaggedIds.includes(line.itemId) || !item || !item.is_available;
          return (
            <li
              key={line.itemId}
              data-flagged={flagged || undefined}
              className={cn("flex items-center justify-between gap-3 py-3", flagged && "-mx-2 rounded-chip bg-chili-soft px-2")}
            >
              <div className="min-w-0">
                <p className="font-semibold">{item?.name ?? "No longer on the menu"}</p>
                {flagged ? (
                  <p role="status" className="text-sm font-medium text-chili-deep">
                    Sold out right now.{" "}
                    <button type="button" onClick={() => set(line.itemId, 0)} className="underline underline-offset-2">
                      Remove from order
                    </button>
                  </p>
                ) : (
                  <p className="num text-sm text-ink-soft">{formatPaise(item!.price_paise * line.qty)}</p>
                )}
              </div>
              {!flagged && (
                <Stepper
                  name={item!.name}
                  qty={line.qty}
                  onAdd={() => add(line.itemId)}
                  onRemove={() => remove(line.itemId)}
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-baseline justify-between border-t-2 border-ink pt-4">
        <span className="font-display text-xl font-semibold">Total</span>
        <span className="num text-2xl font-semibold">{formatPaise(cartTotalPaise(cart, menu.filter((m) => m.is_available)))}</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">Pay at the counter when you collect.</p>
    </div>
  );
}
