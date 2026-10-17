"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { demoLogin } from "@/lib/auth/actions";

export function DemoLoginForm() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setLoading(true);
    const result = await demoLogin(loginId, password);
    if (result.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    setLoading(false);
    setError(
      result.error === "INACTIVE"
        ? "This account is not available."
        : "That login ID or password is not right.",
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field
        label="Login ID"
        name="loginId"
        autoComplete="username"
        autoCapitalize="none"
        value={loginId}
        onChange={(e) => setLoginId(e.target.value)}
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error}
        required
      />
      <Button type="submit" size="lg" fullWidth loading={loading}>
        Sign in
      </Button>
    </form>
  );
}
