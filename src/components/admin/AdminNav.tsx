"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const icon = (paths: ReactNode) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);

const LINKS = [
  { href: "/admin/menu", label: "Menu", icon: icon(<><path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v6M9 3v6" /><path d="M17 21V3c-2.5 1.5-3.5 4-3.5 7.5V13H17" /></>) },
  { href: "/admin/slots", label: "Slots", icon: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
  { href: "/admin/defaulters", label: "Defaulters", icon: icon(<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.01" /></>) },
  { href: "/admin/staff", label: "Staff", icon: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>) },
];

// The active tab is a cutout that flows into the page canvas: it takes the canvas colour, and two
// inverted corners (quarter-circles drawn with box-shadow) curve it into the sidebar. lg and up only.
const NOTCH =
  "lg:relative lg:rounded-l-[1.75rem] lg:bg-paper " +
  "lg:before:pointer-events-none lg:before:absolute lg:before:-top-7 lg:before:right-0 lg:before:size-7 lg:before:rounded-br-[1.75rem] lg:before:shadow-[0_0.875rem_0_0_var(--paper)] lg:before:content-[''] " +
  "lg:after:pointer-events-none lg:after:absolute lg:after:-bottom-7 lg:after:right-0 lg:after:size-7 lg:after:rounded-tr-[1.75rem] lg:after:shadow-[0_-0.875rem_0_0_var(--paper)] lg:after:content-['']";

/** A row of pills on a phone; a vertical list with a notched active tab in the sidebar from lg up. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="px-4 pb-3 lg:px-0 lg:pb-0">
      <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
        {LINKS.map(({ href, label, icon: svg }) => {
          const current = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 w-full items-center gap-3 whitespace-nowrap rounded-pill px-4 font-semibold transition-colors duration-150 lg:rounded-r-none lg:py-3.5 lg:pl-5",
                  current
                    ? `bg-surface text-brand-deep ${NOTCH}`
                    : "text-on-dark-soft hover:bg-white/10 hover:text-on-dark",
                )}
              >
                {svg}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
