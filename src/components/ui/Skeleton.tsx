import { cn } from "@/lib/cn";

/**
 * Decorative placeholder block; size and shape come from `className`.
 * The shimmer stops under prefers-reduced-motion. Wrap a group of skeletons in
 * `<div role="status" aria-busy="true"><span className="sr-only">Loading</span>...</div>`
 * so screen readers hear one "Loading" instead of nothing.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("skeleton rounded-chip", className)} />
  );
}

/** A paragraph's worth of lines; the last line is shorter, like real text. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("space-y-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === lines - 1 && lines > 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
