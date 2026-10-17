"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { cn } from "@/lib/cn";

function Tab({ href, label, icon, active }: { href: string; label: string; icon: IconName; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 min-w-24 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors duration-150",
        active ? "text-brand-deep" : "text-ink-faint hover:text-ink",
      )}
    >
      <Icon name={icon} className="size-6" />
      {label}
      <span aria-hidden="true" className={cn("-mt-0.5 h-1 w-3 rounded-pill", active ? "bg-brand-bright" : "bg-transparent")} />
    </Link>
  );
}

/** The JavaGem tab bar: Home and My orders, with the current tab in copper. Hidden at checkout, where "Place order" owns the bottom. */
export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/checkout") return null;
  const onOrders = pathname === "/orders" || pathname.startsWith("/orders/");

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-xl items-center justify-around rounded-t-sheet bg-surface px-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_32px_rgb(0_0_0/0.06)]"
    >
      <Tab href="/" label="Home" icon="home" active={pathname === "/"} />
      <Tab href="/orders" label="My orders" icon="bag" active={onOrders} />
    </nav>
  );
}
