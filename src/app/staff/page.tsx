import { BrandMark } from "@/components/BrandMark";
import { SignOutButton } from "@/components/SignOutButton";
import { StaffConsole } from "@/components/staff/StaffConsole";
import { fetchStaffData } from "@/lib/staff/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Counter" };

export default async function StaffHome() {
  const supabase = await createClient();
  const now = new Date();
  const [data, settings] = await Promise.all([
    fetchStaffData(supabase),
    supabase.from("app_settings").select("no_show_hold_minutes").single(),
  ]);

  return (
    <main id="main" className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-16">
      <header className="my-3 flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-2 pl-3 shadow-edge">
        <div className="flex items-center gap-3">
          <BrandMark />
          <h1 className="text-2xl font-bold">Counter</h1>
        </div>
        <SignOutButton variant="ghost" className="rounded-pill" />
      </header>
      <StaffConsole
        initial={data}
        holdMinutes={settings.data?.no_show_hold_minutes ?? 15}
        serverNow={now.toISOString()}
      />
    </main>
  );
}
