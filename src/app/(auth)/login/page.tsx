import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { isDemoLoginEnabled } from "@/lib/config";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { inactive } = await searchParams;
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
      {inactive && (
        <p role="alert" className="rounded-chip border-2 border-chili bg-chili-soft px-4 py-3 text-chili-deep">
          This account has been deactivated. Please ask the canteen admin.
        </p>
      )}
      <LoginForm />
    </AuthShell>
  );
}
