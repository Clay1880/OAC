import { cn } from "@/lib/cn";

/** The OAC badge: a plate and cutlery on a round indigo chip. Decorative; the wordmark sits beside it. */
export function BrandMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
        inverted ? "bg-surface text-brand" : "bg-brand-bright text-on-brand",
        className,
      )}
    >
      <svg viewBox="0 0 48 48" className="size-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="24" r="10" />
        <circle cx="24" cy="24" r="5" opacity="0.45" />
        <path d="M6 12v9a3 3 0 0 0 3 3M9 12v12M12 12v9a3 3 0 0 1-3 3M9 24v12" />
        <path d="M42 36V12c-3 2-4 6-4 10v3h4" />
      </svg>
    </span>
  );
}
