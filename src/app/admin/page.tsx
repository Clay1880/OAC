import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Admin" };

const icon = (paths: ReactNode) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);

// One tile per section, in the JavaGem charcoal, copper and cream. Every pair keeps its text readable.
const SECTIONS = [
  {
    href: "/admin/menu",
    title: "Menu",
    text: "Add dishes, change prices and mark items sold out.",
    tone: "bg-dark-soft text-on-dark", chip: "bg-white/15",
    icon: icon(<><path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v6M9 3v6" /><path d="M17 21V3c-2.5 1.5-3.5 4-3.5 7.5V13H17" /></>),
  },
  {
    href: "/admin/slots",
    title: "Slots",
    text: "Create pickup slots and set how many orders each takes.",
    tone: "bg-brand-soft text-ink", chip: "bg-white/60",
    icon: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  },
  {
    href: "/admin/defaulters",
    title: "Defaulters",
    text: "Students who did not collect an order and owe money.",
    tone: "bg-sunken text-ink", chip: "bg-white/70",
    icon: icon(<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.01" /></>),
  },
  {
    href: "/admin/staff",
    title: "Staff",
    text: "Create counter logins, reset passwords, deactivate accounts.",
    tone: "border border-line bg-surface text-ink", chip: "bg-sunken",
    icon: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>),
  },
];

export default function AdminHome() {
  return (
    <>
      <h1 className="text-2xl font-bold">Admin</h1>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className={`flex h-full flex-col gap-3 rounded-card p-5 shadow-edge transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-lift ${s.tone}`}
            >
              <span aria-hidden="true" className={`inline-flex size-12 items-center justify-center rounded-full ${s.chip}`}>
                {s.icon}
              </span>
              <h2 className="text-xl font-semibold">{s.title}</h2>
              <p className="text-sm opacity-90">{s.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
