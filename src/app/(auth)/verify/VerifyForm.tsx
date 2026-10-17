"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { createClient } from "@/lib/supabase/browser";

const RESEND_COOLDOWN_SECONDS = 30;

export function VerifyForm({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const token = code.replace(/\s/g, "");
    if (!/^\d{6,8}$/.test(token)) {
      setError("Enter the 6-digit code from the email.");
      return;
    }

    setLoading(true);
    const { error: verifyError } = await createClient().auth.verifyOtp({ email, token, type: "email" });
    if (verifyError) {
      setLoading(false);
      setError("That code did not work. Check it, or ask for a new one.");
      return;
    }
    // The proxy sends the student to onboarding or their home from here.
    router.replace("/");
    router.refresh();
  }

  async function resend() {
    setError(undefined);
    setResent(false);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    const { error: otpError } = await createClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (otpError) setError("We could not send a new code. Wait a moment and try again.");
    else setResent(true);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field
        label="One-time code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={8}
        placeholder="123456"
        className="num text-center text-2xl tracking-[0.3em]"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={error}
        hint={resent ? "A new code is on its way." : undefined}
        required
      />
      <Button type="submit" size="lg" fullWidth loading={loading}>
        Verify
      </Button>
      <Button type="button" variant="ghost" fullWidth disabled={cooldown > 0} onClick={resend}>
        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </Button>
    </form>
  );
}
