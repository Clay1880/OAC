import Link from "next/link";
import { CartProvider } from "@/components/CartProvider";
import { SignOutButton } from "@/components/SignOutButton";

export default function StudentLayout({ children }: LayoutProps<"/">) {
  return (
    <CartProvider>
      <div className="mx-auto min-h-dvh w-full max-w-md px-4 pb-28">
        <header className="flex items-center justify-between py-4">
          <Link href="/" className="font-display text-xl font-semibold tracking-wide text-chili">
            OAC
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            <Link href="/orders" className="inline-flex min-h-12 items-center rounded-chip px-3 font-semibold hover:bg-sunken">
              My orders
            </Link>
            <SignOutButton variant="ghost" />
          </nav>
        </header>
        <main id="main">{children}</main>
      </div>
    </CartProvider>
  );
}
