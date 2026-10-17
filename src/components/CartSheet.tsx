"use client";

import Link from "next/link";
import { CartLines } from "@/components/CartLines";
import { useCart } from "@/components/CartProvider";
import { Sheet } from "@/components/ui/Sheet";
import { buttonStyles } from "@/components/ui/Button";
import type { MenuItem } from "@/lib/menu";

export function CartSheet({ open, onClose, menu }: { open: boolean; onClose: () => void; menu: MenuItem[] }) {
  const { cart } = useCart();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your order"
      footer={
        <Link href="/checkout" className={buttonStyles({ size: "lg", fullWidth: true })}>
          Choose pickup time
        </Link>
      }
    >
      {cart.length === 0 ? (
        <p className="py-6 text-ink-soft">Nothing here yet. Add something from the menu.</p>
      ) : (
        <CartLines menu={menu} />
      )}
    </Sheet>
  );
}
