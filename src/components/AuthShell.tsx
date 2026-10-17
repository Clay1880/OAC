import type { ReactNode } from "react";

/** Shared frame for the signed-out screens: wordmark, a heading and a single-column form. */
export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
      <header>
        <p className="font-display text-lg font-semibold tracking-wide text-chili">OAC</p>
        <h1 className="mt-2 text-4xl font-semibold text-balance">{title}</h1>
        {intro && <p className="mt-3 text-lg text-ink-soft text-pretty">{intro}</p>}
      </header>
      {children}
      {footer && <footer className="text-sm text-ink-soft">{footer}</footer>}
    </main>
  );
}
