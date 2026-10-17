import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { SignOutButton } from "@/components/SignOutButton";
import { adminCallerId } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // The proxy already keeps non-admins out; this is the second lock, close to the data.
  if (!(await adminCallerId(await createClient()))) redirect("/");

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <p className="font-display text-xl font-semibold tracking-wide text-chili">OAC Admin</p>
        <SignOutButton variant="ghost" />
      </header>
      <AdminNav />
      <main id="main" className="pt-6">
        {children}
      </main>
    </div>
  );
}
