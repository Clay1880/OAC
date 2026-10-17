import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { BrandMark } from "@/components/BrandMark";
import { SignOutButton } from "@/components/SignOutButton";
import { adminCallerId } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // The proxy already keeps non-admins out; this is the second lock, close to the data.
  if (!(await adminCallerId(await createClient()))) redirect("/");

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Indigo bar on a phone, fixed sidebar from lg up. */}
      <aside className="bg-dark-soft text-on-dark lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:py-6 lg:pl-4">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-3 lg:pb-8 lg:pt-0">
          <div className="flex items-center gap-2.5">
            <BrandMark inverted />
            <p className="text-lg font-bold tracking-tight">OAC Admin</p>
          </div>
          <div className="lg:hidden">
            <SignOutButton variant="ghost" className="rounded-pill text-on-dark hover:bg-white/10" />
          </div>
        </div>
        <AdminNav />
        <div className="mt-auto hidden pr-4 lg:block">
          <SignOutButton variant="ghost" fullWidth className="rounded-pill text-on-dark hover:bg-white/10" />
        </div>
      </aside>
      <div className="min-w-0">
        <div className="mx-auto w-full max-w-4xl px-4 pb-16 lg:px-10">
          <header className="hidden h-[4.375rem] items-center justify-end lg:flex">
            <span className="inline-flex items-center gap-2.5 rounded-pill border border-line bg-surface py-1.5 pl-1.5 pr-4 shadow-edge">
              <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-deep">
                A
              </span>
              <span className="text-sm font-semibold">Admin</span>
            </span>
          </header>
          <main id="main" className="pt-6 lg:pt-2">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
