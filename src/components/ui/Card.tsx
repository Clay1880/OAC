import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /**
   * `paper` is a flat sheet with a hairline edge.
   * `ticket` is the order-chit: the body is separated from a `stub` by a perforated tear line.
   */
  variant?: "paper" | "ticket";
  /** Ticket only: content below the perforation (code, total, status). */
  stub?: ReactNode;
};

const surface = "border border-line bg-surface text-ink shadow-edge";

export function Card({
  variant = "paper",
  stub,
  className,
  children,
  ...rest
}: CardProps) {
  if (variant === "ticket") {
    return (
      <div
        className={cn("overflow-hidden rounded-card", surface, className)}
        {...rest}
      >
        <div className="p-5">{children}</div>
        {stub !== undefined && (
          <>
            <Perforation />
            <div className="bg-sunken/60 p-5">{stub}</div>
          </>
        )}
      </div>
    );
  }
  return (
    <div className={cn("rounded-card p-5", surface, className)} {...rest}>
      {children}
    </div>
  );
}

/** Dashed tear line with the two half-circle bites taken out of the edges. */
function Perforation() {
  return (
    <div aria-hidden="true" className="relative h-0">
      <div className="absolute inset-x-5 top-0 border-t-2 border-dashed border-line-strong/50" />
      <span className="absolute -left-3 -top-3 size-6 rounded-full border border-line bg-paper" />
      <span className="absolute -right-3 -top-3 size-6 rounded-full border border-line bg-paper" />
    </div>
  );
}
