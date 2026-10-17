import { AuthShell } from "@/components/AuthShell";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Your details" };

export default function OnboardingPage() {
  return (
    <AuthShell
      title="One last step"
      intro="The canteen needs these to hand your order to the right person."
    >
      <OnboardingForm />
    </AuthShell>
  );
}
