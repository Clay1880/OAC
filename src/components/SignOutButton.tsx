"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { signOut } from "@/lib/auth/actions";

export function SignOutButton({ variant = "secondary", ...rest }: Omit<ButtonProps, "onClick" | "loading">) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant={variant}
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await signOut();
        router.replace("/login");
        router.refresh();
      }}
      {...rest}
    >
      Sign out
    </Button>
  );
}
