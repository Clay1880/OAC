import type { ReactNode } from "react";
import { SignOutButton } from "@/components/SignOutButton";

/** The dark top of the JavaGem home screen: where you pick up, Sign out, and (optionally) the search bar. */
export function HomeHero({ children }: { children?: ReactNode }) {
  return (
    <section className="-mx-4 -mt-3 bg-linear-to-b from-dark to-dark-soft px-4 pb-24 pt-5 text-on-dark">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-on-dark-soft">Pickup from</p>
          <p className="mt-1 text-sm font-semibold">AIT Pune canteen</p>
        </div>
        <SignOutButton variant="ghost" className="rounded-pill text-on-dark hover:bg-white/10" />
      </div>
      {children}
    </section>
  );
}
