import { AuthShell } from "@/components/AuthShell";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata = { title: "Choose a new password" };

export default function ChangePasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      intro="You are using a temporary password. Pick one only you know before you continue."
    >
      <ChangePasswordForm />
    </AuthShell>
  );
}
