import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { SignOutButton } from "@/components/SignOutButton";
import { StaffConsole } from "@/components/staff/StaffConsole";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchStaffData } from "@/lib/staff/queries";
import { createClient } from "@/lib/supabase/server";
import { consoleCanteen } from "@/lib/tenancy/current";

export const metadata = { title: "Counter" };

export default async function StaffHome() {
  const supabase = await createClient();
  const now = new Date();
  const canteen = await consoleCanteen(supabase);
  const data = canteen ? await fetchStaffData(supabase, canteen.id) : null;

  return (
    <main id="main" className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-16">
      <header className="my-3 flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-2 pl-3 shadow-edge">
        <div className="flex items-center gap-3">
          <BrandMark />
          <h1 className="text-2xl font-bold">Counter</h1>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/staff/feedback" className={buttonStyles({ variant: "ghost", className: "rounded-pill" })}>
            Feedback
          </Link>
          <SignOutButton variant="ghost" className="rounded-pill" />
        </div>
      </header>
      {canteen ? (
        <StaffConsole initial={data} canteenId={canteen.id} holdMinutes={canteen.no_show_hold_minutes ?? 15} serverNow={now.toISOString()} />
      ) : (
        <EmptyState title="You are not assigned to a canteen yet" description="Ask your college admin to add you to a canteen." />
      )}
    </main>
  );
}
