import type { OrderStatus } from "@/lib/orders/types";
import { cn } from "@/lib/cn";

const FLOW: OrderStatus[] = ["placed", "accepted", "ready", "collected"];

/**
 * The four green segments from the JavaGem tracking screen: one per step, filled up to where the
 * order is. Decorative; OrderStatusTimeline below it is what screen readers get.
 */
export function OrderProgressBar({ status, className }: { status: OrderStatus; className?: string }) {
  const ended = status === "cancelled" || status === "no_show";
  // How many segments are filled: a cancelled order stopped at "placed"; a no-show got as far as "ready".
  const filled = status === "cancelled" ? 1 : status === "no_show" ? 3 : FLOW.indexOf(status) + 1;

  return (
    <div aria-hidden="true" className={cn("flex gap-2", className)}>
      {FLOW.map((step, i) => (
        <span
          key={step}
          className={cn("h-1.5 flex-1 rounded-pill", i < filled ? (ended ? "bg-danger" : "bg-status-ready-dot") : "bg-line")}
        />
      ))}
    </div>
  );
}
