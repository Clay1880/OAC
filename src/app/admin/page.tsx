import { SignOutButton } from "@/components/SignOutButton";

export const metadata = { title: "Admin" };

// Placeholder until the admin console lands (Task 9).
export default function AdminHome() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-4xl font-semibold">Admin</h1>
      <p className="text-ink-soft">Menu, slots and defaulters will live here.</p>
      <SignOutButton />
    </main>
  );
}
