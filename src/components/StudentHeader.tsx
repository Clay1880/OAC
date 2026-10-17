"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { SignOutButton } from "@/components/SignOutButton";

/** Light top bar for the inner screens: a back chevron, the app name, and Sign out. Home draws its own dark header. */
export function StudentHeader() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  const back = pathname.startsWith("/orders/") ? "/orders" : "/";

  return (
    <header className="flex items-center justify-between gap-2 px-4 pb-1 pt-4">
      <Link
        href={back}
        aria-label="Back"
        className="inline-flex size-12 items-center justify-center rounded-control border border-line bg-surface shadow-edge"
      >
        <Icon name="left" className="size-5" />
      </Link>
      <p className="text-base font-semibold">OAC</p>
      <SignOutButton variant="ghost" className="rounded-pill" />
    </header>
  );
}
