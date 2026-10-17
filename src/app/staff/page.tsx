import { SignOutButton } from "@/components/SignOutButton";

export const metadata = { title: "Counter" };

// Placeholder until the counter console lands (Task 8).
export default function StaffHome() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-4xl font-semibold">Counter</h1>
      <p className="text-ink-soft">Orders will appear here.</p>
      <SignOutButton />
    </main>
  );
}
