import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Mirrors the `order_status` enum in the database. */
export type OrderStatus =
  | "placed"
  | "accepted"
  | "ready"
  | "collected"
  | "cancelled"
  | "no_show";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Placed",
  accepted: "Accepted",
  ready: "Ready",
  collected: "Collected",
  cancelled: "Cancelled",
  no_show: "No-show",
};

// Literal class names so Tailwind can see them. Status is never colour alone: the dot
// and the text label carry it too, and cancelled/no-show also change the dot shape.
const statusStyles: Record<OrderStatus, { chip: string; dot: string }> = {
  placed: {
    chip: "bg-status-placed text-status-placed-ink",
    dot: "bg-status-placed-dot",
  },
  accepted: {
    chip: "bg-status-accepted text-status-accepted-ink",
    dot: "bg-status-accepted-dot",
  },
  ready: {
    chip: "bg-status-ready text-status-ready-ink",
    dot: "bg-status-ready-dot",
  },
  collected: {
    chip: "bg-status-collected text-status-collected-ink",
    dot: "bg-status-collected-dot",
  },
  cancelled: {
    chip: "bg-status-cancelled text-status-cancelled-ink border border-dashed border-status-cancelled-dot",
    dot: "bg-transparent border-2 border-status-cancelled-dot",
  },
  no_show: {
    chip: "bg-status-no-show text-status-no-show-ink",
    dot: "bg-status-no-show-dot rotate-45 rounded-[1px]",
  },
};

export type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  /** Order status; supplies colour and default label. */
  status?: OrderStatus;
  /** For non-status badges. Ignored when `status` is set. */
  tone?: "neutral" | "accent";
  /** `lg` is for staff screens. */
  size?: "md" | "lg";
  children?: ReactNode;
};

export function Badge({
  status,
  tone = "neutral",
  size = "md",
  className,
  children,
  ...rest
}: BadgeProps) {
  const s = status ? statusStyles[status] : undefined;
  const chip =
    s?.chip ??
    (tone === "accent"
      ? "bg-chili-soft text-chili-deep"
      : "bg-sunken text-ink-soft");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-pill font-sans font-semibold leading-none",
        size === "lg" ? "px-4 py-2.5 text-base" : "px-3 py-1.5 text-sm",
        chip,
        className,
      )}
      {...rest}
    >
      {s && (
        <span
          aria-hidden="true"
          className={cn("size-2.5 shrink-0 rounded-full", s.dot)}
        />
      )}
      {children ?? (status ? ORDER_STATUS_LABEL[status] : null)}
    </span>
  );
}
