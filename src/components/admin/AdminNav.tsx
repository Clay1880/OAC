"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/slots", label: "Slots" },
  { href: "/admin/defaulters", label: "Defaulters" },
  { href: "/admin/staff", label: "Staff" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="-mx-4 overflow-x-auto border-b-2 border-ink px-4">
      <ul className="flex gap-1">
        {LINKS.map(({ href, label }) => {
          const current = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center rounded-t-chip px-4 font-semibold",
                  current ? "bg-ink text-paper" : "text-ink hover:bg-sunken",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
