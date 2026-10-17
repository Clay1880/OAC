"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { isCollegeEmail } from "@/lib/auth/validate";
import { createClient } from "@/lib/supabase/browser";

/** `domains`: every allowed sign-up domain (college_domains), read by the login page on the server. */
export function LoginForm({ domains }: { domains: string[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);

    if (domains.length === 0) {
      setError("Sign-in is not set up yet. Please tell the canteen admin.");
      return;
    }

    const address = email.trim().toLowerCase();
    if (!isCollegeEmail(address, domains)) {
      setError(`Use your college email address (ending in @${domains[0]}).`);
      return;
    }

    setLoading(true);
    const { error: otpError } = await createClient().auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    if (otpError) {
      setLoading(false);
      setError(
        otpError.status === 429
          ? "Too many codes requested. Wait a minute and try again."
          : "We could not send a code. Check your college email address and try again.",
      );
      return;
    }
    router.push(`/verify?email=${encodeURIComponent(address)}`);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field
        label="College email"
        type="email"
        name="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        placeholder={`you@${domains[0] ?? "college.edu"}`}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
        required
      />
      <Button type="submit" size="lg" fullWidth loading={loading}>
        Send code
      </Button>
    </form>
  );
}
