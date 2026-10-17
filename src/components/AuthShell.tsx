import Image from "next/image";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";

/**
 * Shared frame for the signed-out screens, after the JavaGem welcome screen: a dark coffee photo
 * with the heading over it, then the form on a rounded light sheet.
 */
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
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-dark">
      <header className="relative flex min-h-[19rem] flex-col justify-end overflow-hidden px-6 pb-12 pt-8 text-on-dark">
        <Image src="/figma/photos/p6.jpg" alt="" fill priority sizes="448px" className="object-cover object-top" />
        <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-dark via-dark/60 to-dark/10" />
        <div className="relative">
          <div className="mb-6 flex items-center gap-2.5">
            <BrandMark />
            <p className="text-lg font-semibold">OAC</p>
          </div>
          <h1 className="text-[1.75rem] font-semibold leading-tight text-balance">{title}</h1>
          {intro && <p className="mt-2 text-sm text-on-dark-soft text-pretty">{intro}</p>}
        </div>
      </header>
      <div className="relative -mt-6 flex flex-1 flex-col gap-5 rounded-t-sheet bg-paper px-5 pb-8 pt-7">
        {children}
        {footer && <footer className="text-sm text-ink-soft">{footer}</footer>}
      </div>
    </main>
  );
}
