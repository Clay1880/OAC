import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { VerifyForm } from "./VerifyForm";

export const metadata = { title: "Enter your code" };

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const { email } = await searchParams;
  if (typeof email !== "string" || email === "") redirect("/login");

  return (
    <AuthShell
      title="Check your email"
      intro={
        <>
          We sent a code to <span className="font-semibold text-ink">{email}</span>.
        </>
      }
      footer={
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
          Use a different email
        </Link>
      }
    >
      <VerifyForm email={email} />
    </AuthShell>
  );
}
