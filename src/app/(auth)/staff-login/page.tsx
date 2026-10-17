import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { StaffLoginForm } from "./StaffLoginForm";

export const metadata = { title: "Staff sign in" };

export default function StaffLoginPage() {
  return (
    <AuthShell
      title="Staff sign in"
      intro="Use the login ID and password the canteen admin gave you."
      footer={
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
          Back to student sign in
        </Link>
      }
    >
      <StaffLoginForm />
    </AuthShell>
  );
}
