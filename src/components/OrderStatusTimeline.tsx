import type { OrderStatus } from "@/lib/orders/types";
import { cn } from "@/lib/cn";

const FLOW: { status: OrderStatus; label: string }[] = [
  { status: "placed", label: "Placed" },
  { status: "accepted", label: "Accepted" },
  { status: "ready", label: "Ready" },
  { status: "collected", label: "Collected" },
];

/** Steps for a status: the normal flow, cut short and ended by "Cancelled" or "No-show" when it applies. */
function stepsFor(status: OrderStatus, reachedReady: boolean) {
  if (status === "cancelled") return { steps: [FLOW[0], { status: "cancelled" as const, label: "Cancelled" }], current: 1 };
  if (status === "no_show") {
    const steps = [...FLOW.slice(0, reachedReady ? 3 : 1), { status: "no_show" as const, label: "No-show" }];
    return { steps, current: steps.length - 1 };
  }
  return { steps: FLOW, current: FLOW.findIndex((s) => s.status === status) };
}

/** Where the order is, as a list that reads well to a screen reader (the current step is announced). */
export function OrderStatusTimeline({ status }: { status: OrderStatus }) {
  const { steps, current } = stepsFor(status, true);
  const ended = status === "cancelled" || status === "no_show";

  return (
    <ol aria-label="Order progress" className="flex flex-col">
      {steps.map((step, i) => {
        const done = i < current || (i === current && status === "collected");
        const isCurrent = i === current;
        return (
          <li
            key={step.status}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex items-center gap-4 py-2.5"
          >
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn("absolute left-[0.6875rem] top-8 h-full w-0.5", done ? "bg-brand" : "bg-line-strong/40")}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                done && "border-brand bg-brand text-on-brand",
                isCurrent && !done && (ended ? "border-danger bg-danger text-on-danger" : "border-brand bg-brand-soft"),
                !done && !isCurrent && "border-line-strong/60 bg-surface",
              )}
            >
              {done && (
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              )}
              {isCurrent && !done && !ended && <span className="size-2 rounded-full bg-brand motion-safe:animate-pulse" />}
            </span>
            <span
              className={cn(
                "text-lg",
                isCurrent ? "font-semibold text-ink" : done ? "text-ink-soft" : "text-ink-faint",
              )}
            >
              {step.label}
              {isCurrent && <span className="sr-only"> (current step)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
