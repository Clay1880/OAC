import { starString, type FeedbackRow } from "@/lib/feedback/summary";

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "5 minutes ago", "yesterday", "3 days ago". Under a minute is "just now". */
export function relativeTime(iso: string, nowMs: number): string {
  const diff = Date.parse(iso) - nowMs;
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return relative.format(Math.round(diff / size), unit);
  }
  return "just now";
}

/** The latest ratings, newest first. Comments are plain text: React escapes them. */
export function FeedbackList({ rows, nowMs }: { rows: FeedbackRow[]; nowMs: number }) {
  return (
    <ul aria-label="Latest feedback" className="flex flex-col gap-3">
      {rows.map((row) => (
        <li
          key={row.order_id}
          data-order-code={row.order_code}
          className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-edge"
        >
          <div className="flex items-start justify-between gap-3">
            <span role="img" aria-label={`${row.rating} out of 5 stars`} className="text-2xl leading-none tracking-wide text-brand-deep">
              {starString(row.rating)}
            </span>
            <span className="shrink-0 text-sm text-ink-soft">{relativeTime(row.created_at, nowMs)}</span>
          </div>
          {row.comment && <p className="whitespace-pre-line break-words text-ink">{row.comment}</p>}
          <p className="text-sm text-ink-soft">
            <span className="order-code text-base text-ink">{row.order_code}</span>
            {" · "}
            {row.student_name}
          </p>
          {row.items && <p className="text-sm text-ink-soft">{row.items}</p>}
        </li>
      ))}
    </ul>
  );
}
