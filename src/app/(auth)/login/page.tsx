import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { isDemoLoginEnabled } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

/** Allowed sign-up domains, the same rows the database guard checks. Empty when none (or unreadable). */
async function collegeDomains(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("college_domains").select("domain").order("domain");
  return (data ?? []).map((row) => row.domain as string);
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [{ inactive, expired }, domains] = await Promise.all([searchParams, collegeDomains()]);
  return (
    <AuthShell
      title="Order ahead, skip the queue."
      intro="Sign in with your college email. We will send you a one-time code."
      footer={
        <>
          Canteen staff?{" "}
          <Link href="/staff-login" className="font-semibold text-ink underline underline-offset-4">
            Sign in here
          </Link>
          {isDemoLoginEnabled() && (
            <>
              {" "}
              · Demo?{" "}
              <Link href="/demo-login" className="font-semibold text-ink underline underline-offset-4">
                Use the demo account
              </Link>
            </>
          )}
        </>
      }
    >
      {expired && (
        <p role="alert" className="rounded-chip border-2 border-danger bg-danger-soft px-4 py-3 text-danger-deep">
          Your session has expired. Please sign in again.
        </p>
      )}
      {inactive && (
        <p role="alert" className="rounded-chip border-2 border-danger bg-danger-soft px-4 py-3 text-danger-deep">
          This account has been deactivated. Please ask the canteen admin.
        </p>
      )}
      <LoginForm domains={domains} />
    </AuthShell>
  );
}
