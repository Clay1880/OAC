import Link from "next/link";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Admin" };

const SECTIONS = [
  { href: "/admin/menu", title: "Menu", text: "Add dishes, change prices and mark items sold out." },
  { href: "/admin/slots", title: "Slots", text: "Create pickup slots and set how many orders each takes." },
  { href: "/admin/defaulters", title: "Defaulters", text: "Students who did not collect an order and owe money." },
  { href: "/admin/staff", title: "Staff", text: "Create counter logins, reset passwords, deactivate accounts." },
];

export default function AdminHome() {
  return (
    <>
      <h1 className="text-4xl font-semibold">Admin</h1>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="block h-full rounded-card transition-transform duration-150 hover:-translate-y-0.5">
              <Card className="h-full">
                <h2 className="text-2xl font-semibold">{s.title}</h2>
                <p className="mt-1 text-ink-soft">{s.text}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
