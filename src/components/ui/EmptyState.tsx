import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  /** `empty` for "nothing here yet", `error` for "something went wrong". */
  tone?: "empty" | "error";
  title: string;
  description?: string;
  /** Usually a <Button> (retry, browse the menu). */
  action?: ReactNode;
  /** Replace the default plate illustration. */
  icon?: ReactNode;
  className?: string;
};

export function EmptyState({
  tone = "empty",
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : undefined}
      className={cn(
        "mx-auto flex max-w-sm flex-col items-center px-4 py-12 text-center",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "mb-5 flex size-24 items-center justify-center rounded-full border-2 border-dashed",
          isError
            ? "border-danger text-danger-deep"
            : "border-line-strong text-ink-soft",
        )}
      >
        {icon ?? <Plate isError={isError} />}
      </div>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {description && (
        <p className="mt-2 text-ink-soft text-pretty">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** An empty plate with cutlery; the error version swaps the cutlery for a warning mark. */
function Plate({ isError }: { isError: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="size-14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="24" r="11" />
      <circle cx="24" cy="24" r="6" opacity="0.4" />
      {isError ? (
        <path d="M24 19v6M24 29v.01" strokeWidth="3" />
      ) : (
        <>
          <path d="M6 10v10a3 3 0 0 0 3 3M9 10v14M12 10v10a3 3 0 0 1-3 3M9 24v14" />
          <path d="M42 38V10c-3 2-4 6-4 11v3h4" />
        </>
      )}
    </svg>
  );
}
