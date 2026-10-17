import { formatCountdown, holdRemainingMs } from "@/lib/staff/hold";

/** How long until a ready order that was never collected can be flagged as a no-show. */
export function HoldTimer({
  slotStartsAt,
  holdMinutes,
  nowMs,
}: {
  slotStartsAt: string;
  holdMinutes: number;
  nowMs: number;
}) {
  const remaining = holdRemainingMs(slotStartsAt, holdMinutes, nowMs);
  return remaining > 0 ? (
    <p className="text-sm text-ink-soft">
      Held for pickup. No-show can be flagged in <span className="num font-semibold text-ink">{formatCountdown(remaining)}</span>
    </p>
  ) : (
    <p className="text-sm font-semibold text-danger-deep">Hold is over. Not collected? Flag as no-show.</p>
  );
}
