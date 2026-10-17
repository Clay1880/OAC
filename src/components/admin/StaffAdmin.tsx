"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { createStaff, resetStaffPassword, setStaffActive } from "@/lib/admin/actions";

export type StaffRow = {
  id: string;
  loginId: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword: boolean;
};

type Credentials = { loginId: string; password: string; reason: "created" | "reset" };

const CREATE_ERRORS = {
  ID_TAKEN: "That login ID is already used.",
  INVALID_ID: "Use 3 to 32 letters, numbers, dots, dashes or underscores, starting with a letter or number.",
  INVALID_NAME: "Enter the staff member's name.",
  FORBIDDEN: "Only the admin can do this.",
  FAILED: "Something went wrong. Please try again.",
} as const;

export function StaffAdmin({ initialStaff }: { initialStaff: StaffRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loginId, setLoginId] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setCreating(true);
    const result = await createStaff({ loginId, fullName });
    setCreating(false);
    if (!result.ok) {
      setError(CREATE_ERRORS[result.error]);
      return;
    }
    setCredentials({ loginId: result.loginId, password: result.temporaryPassword, reason: "created" });
    setLoginId("");
    setFullName("");
    router.refresh();
  }

  async function reset(row: StaffRow) {
    setBusyId(row.id);
    const result = await resetStaffPassword(row.id);
    setBusyId(null);
    if (!result.ok) {
      toast({ title: "Could not reset the password.", tone: "error" });
      return;
    }
    setCredentials({ loginId: row.loginId, password: result.temporaryPassword, reason: "reset" });
    router.refresh();
  }

  async function toggleActive(row: StaffRow) {
    setBusyId(row.id);
    const result = await setStaffActive(row.id, !row.isActive);
    setBusyId(null);
    toast(
      result.ok
        ? { title: row.isActive ? `${row.fullName} is deactivated` : `${row.fullName} is active again`, tone: "success" }
        : { title: "Could not change that account.", tone: "error" },
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      {credentials && (
        <section
          role="status"
          aria-label="Temporary password"
          className="rounded-card border-2 border-ink bg-status-placed p-5 text-status-placed-ink"
        >
          <h2 className="text-2xl font-semibold">
            {credentials.reason === "created" ? "Login created" : "Password reset"}
          </h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt>Login ID</dt>
            <dd className="num font-semibold">{credentials.loginId}</dd>
            <dt>Temporary password</dt>
            <dd className="order-code select-all text-xl">{credentials.password}</dd>
          </dl>
          <p className="mt-3 text-sm">
            This is shown once. They will be asked to choose their own password when they first sign in.
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => setCredentials(null)}>
            I have noted it down
          </Button>
        </section>
      )}

      <Card>
        <h2 className="mb-4 text-2xl font-semibold">Add staff</h2>
        <form onSubmit={create} noValidate className="flex flex-col gap-4">
          <Field label="Full name" name="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <Field
            label="Login ID"
            name="loginId"
            autoCapitalize="none"
            autoComplete="off"
            hint="They sign in with this and the temporary password."
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            error={error}
            required
          />
          <Button type="submit" size="lg" fullWidth loading={creating}>
            Create login
          </Button>
        </form>
      </Card>

      {initialStaff.length === 0 ? (
        <EmptyState title="No staff yet" description="Add the first counter login above." />
      ) : (
        <ul className="divide-y divide-line">
          {initialStaff.map((row) => (
            <li key={row.id} data-staff-id={row.id} data-login-id={row.loginId} className="flex flex-col gap-3 py-4">
              <div>
                <p className="text-lg font-semibold">
                  {row.fullName}
                  {!row.isActive && <span className="ml-2 rounded-chip bg-sunken px-2 py-0.5 text-sm font-semibold text-ink-soft">Deactivated</span>}
                </p>
                <p className="text-sm text-ink-soft">
                  Login ID <span className="num font-semibold text-ink">{row.loginId}</span>
                  {row.mustChangePassword && " · has not chosen a password yet"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={busyId === row.id} onClick={() => void reset(row)} aria-label={`Reset password for ${row.fullName}`}>
                  Reset password
                </Button>
                <Button
                  variant={row.isActive ? "danger" : "secondary"}
                  disabled={busyId === row.id}
                  onClick={() => void toggleActive(row)}
                  aria-label={`${row.isActive ? "Deactivate" : "Reactivate"} ${row.fullName}`}
                >
                  {row.isActive ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
