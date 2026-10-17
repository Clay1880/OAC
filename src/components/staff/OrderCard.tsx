"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { HoldTimer } from "@/components/staff/HoldTimer";
import { formatPaise } from "@/lib/format";
import { formatCountdown, holdRemainingMs } from "@/lib/staff/hold";
import type { StaffOrder, StaffOrderLine } from "@/lib/staff/types";
import { cn } from "@/lib/cn";

export type StaffAction = "accept" | "ready" | "collect" | "noShow";

/**
 * One order. The actions sit at the bottom, full width and 56px tall, where a thumb holding the
 * phone one-handed reaches them.
 */
export function OrderCard({
  order,
  lines,
  nowMs,
  holdMinutes,
  busy,
  highlighted,
  onAction,
}: {
  order: StaffOrder;
  lines: StaffOrderLine[];
  nowMs: number;
  holdMinutes: number;
  busy: boolean;
  highlighted?: boolean;
  onAction: (action: StaffAction) => void;
}) {
  const holdRemaining = holdRemainingMs(order.slot_starts_at, holdMinutes, nowMs);
  const canFlag = holdRemaining === 0;

  return (
    <article
      data-order-code={order.code}
      data-status={order.status}
      aria-label={`Order ${order.code}`}
      className={cn(
        "flex flex-col gap-3 rounded-card border bg-surface p-4 shadow-edge",
        highlighted ? "border-chili ring-2 ring-chili" : "border-line",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="order-code text-3xl leading-none">{order.code}</h3>
        <Badge status={order.status} />
      </header>

      <div className="text-sm">
        <p className="font-semibold text-ink">
          {order.student_name}
          {order.reg_no && <span className="num font-normal text-ink-soft"> · {order.reg_no}</span>}
        </p>
        {order.phone && (
          <a href={`tel:${order.phone}`} className="num text-ink-soft underline underline-offset-2">
            {order.phone}
          </a>
        )}
      </div>

      <ul className="text-base">
        {lines.map((l) => (
          <li key={l.name}>
            <span className="num font-semibold">{l.qty} ×</span> {l.name}
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-soft">
        Collect <span className="num font-semibold text-ink">{formatPaise(order.total_paise)}</span> at the counter
      </p>

      {order.status === "ready" && <HoldTimer slotStartsAt={order.slot_starts_at} holdMinutes={holdMinutes} nowMs={nowMs} />}
      {order.status === "no_show" && (
        <p className="text-sm font-semibold text-status-no-show-ink">Unpaid no-show. Hand over only after payment.</p>
      )}

      <div className="mt-1 flex flex-col gap-2">
        {order.status === "placed" && (
          <Button size="lg" fullWidth disabled={busy} onClick={() => onAction("accept")}>
            Accept
          </Button>
        )}
        {order.status === "accepted" && (
          <Button size="lg" fullWidth disabled={busy} onClick={() => onAction("ready")}>
            Mark ready
          </Button>
        )}
        {order.status === "ready" && (
          <>
            <Button size="lg" fullWidth disabled={busy} onClick={() => onAction("collect")}>
              Collected · paid
            </Button>
            <Button variant="danger" size="lg" fullWidth disabled={busy || !canFlag} onClick={() => onAction("noShow")}>
              {canFlag ? "Flag no-show" : `Flag no-show · ${formatCountdown(holdRemaining)}`}
            </Button>
          </>
        )}
        {order.status === "no_show" && (
          <Button size="lg" fullWidth disabled={busy} onClick={() => onAction("collect")}>
            Paid · collected
          </Button>
        )}
      </div>
    </article>
  );
}
