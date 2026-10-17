import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { isDemoLoginEnabled } from "@/lib/config";
import { DemoLoginForm } from "./DemoLoginForm";

export const metadata = { title: "Demo sign in" };

export default function DemoLoginPage() {
  if (!isDemoLoginEnabled()) notFound();
  return (
    <AuthShell
      title="Demo sign in"
      intro="For presentations: sign in as the demo student with an ID and password instead of an emailed code."
      footer={
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
          Back to student sign in
        </Link>
      }
    >
      <DemoLoginForm />
    </AuthShell>
  );
}
