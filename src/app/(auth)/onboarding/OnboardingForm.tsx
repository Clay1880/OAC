"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { completeProfile } from "@/lib/auth/actions";
import { normalizePhone } from "@/lib/auth/validate";

type Errors = Partial<Record<"fullName" | "phone" | "regNo" | "form", string>>;

export function OnboardingForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [regNo, setRegNo] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    const next: Errors = {};
    const normalizedPhone = normalizePhone(phone);
    if (fullName.trim() === "") next.fullName = "Enter your full name.";
    if (!normalizedPhone) next.phone = "Enter a 10-digit mobile number.";
    if (regNo.trim() === "") next.regNo = "Enter your registration number.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !normalizedPhone) return;

    setLoading(true);
    const result = await completeProfile({ fullName, phone: normalizedPhone, regNo });
    if (result.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    if (result.error === "SESSION_EXPIRED") {
      router.replace("/login?expired=1");
      router.refresh();
      return;
    }
    setLoading(false);
    setErrors(
      {
        REG_NO_TAKEN: { regNo: "REG_NO_TAKEN: this registration number is already registered. Check it, or ask the canteen admin." },
        INVALID_PHONE: { phone: "Enter a 10-digit mobile number." },
        INVALID_NAME: { fullName: "Enter your full name." },
        INVALID_REG_NO: { regNo: "Enter your registration number." },
        PROFILE_EXISTS: { form: "Your details are already saved." },
        SESSION_EXPIRED: {},
        UNKNOWN: { form: "Something went wrong. Please try again." },
      }[result.error],
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field
        label="Full name"
        name="fullName"
        autoComplete="name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={errors.fullName}
        required
      />
      <Field
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="98765 43210"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        required
      />
      <Field
        label="Registration number"
        name="regNo"
        autoCapitalize="characters"
        autoComplete="off"
        value={regNo}
        onChange={(e) => setRegNo(e.target.value)}
        error={errors.regNo}
        required
      />
      {errors.form && (
        <p role="alert" className="text-sm font-medium text-danger-deep">
          {errors.form}
        </p>
      )}
      <Button type="submit" size="lg" fullWidth loading={loading}>
        Continue
      </Button>
    </form>
  );
}
