import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { FeedbackList } from "@/components/staff/FeedbackList";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { starString, toFeedbackSummary, type FeedbackRow, type FeedbackSummaryRow } from "@/lib/feedback/summary";
import { createClient } from "@/lib/supabase/server";
import { consoleCanteen } from "@/lib/tenancy/current";

export const metadata = { title: "Feedback" };

const LIST_LIMIT = 100;

export default async function StaffFeedbackPage() {
  const supabase = await createClient();
  const now = new Date();
  const canteen = await consoleCanteen(supabase);

  // The summary is computed in SQL over every rating; only the list is capped at the latest rows.
  const [ratings, latest] = canteen
    ? await Promise.all([
        supabase.rpc("feedback_summary", { p_canteen_id: canteen.id }),
        supabase
          .from("staff_feedback_v")
          .select("order_id, rating, comment, created_at, order_code, student_name, items")
          .eq("canteen_id", canteen.id)
          .order("created_at", { ascending: false })
          .limit(LIST_LIMIT),
      ])
    : [null, null];

  const failed = canteen !== null && (ratings?.error || latest?.error);
  const rows = (latest?.data ?? []) as FeedbackRow[];
  const summary = toFeedbackSummary(((ratings?.data ?? []) as FeedbackSummaryRow[])[0]);
  const widest = Math.max(1, ...summary.distribution);

  return (
    <main id="main" data-surface="staff" className="mx-auto min-h-dvh w-full max-w-xl bg-paper px-4 pb-16 sm:shadow-canvas">
      <header className="my-3 flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-2 pl-3 shadow-edge">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">Feedback</h1>
            {canteen && <p className="truncate text-sm text-ink-soft">{canteen.name}</p>}
          </div>
        </div>
        <Link href="/staff" className={buttonStyles({ variant: "ghost", className: "shrink-0 rounded-pill" })}>
          ← Counter
        </Link>
      </header>

      {!canteen ? (
        <EmptyState title="You are not assigned to a canteen yet" description="Ask your college admin to add you to a canteen." />
      ) : failed ? (
        <EmptyState tone="error" title="Could not load feedback" description="Check the connection and reload the page." />
      ) : summary.count === 0 ? (
        <EmptyState title="No feedback yet" description="Ratings show up here once students rate a collected order." />
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-label="Rating summary" className="rounded-card border border-line bg-surface p-5 shadow-edge">
            <div className="flex items-end gap-4">
              <p className="num text-6xl font-bold leading-none">{summary.average?.toFixed(1)}</p>
              <div className="pb-1">
                <p aria-hidden="true" className="text-2xl leading-none tracking-wide text-brand-deep">
                  {starString(Math.round(summary.average ?? 0))}
                </p>
                <p className="mt-1 text-ink-soft">
                  {summary.count} {summary.count === 1 ? "rating" : "ratings"}
                </p>
              </div>
            </div>
            <ul aria-label="Ratings by stars" className="mt-5 flex flex-col gap-2">
              {[5, 4, 3, 2, 1].map((stars) => {
                const n = summary.distribution[stars - 1];
                return (
                  <li key={stars} className="flex items-center gap-3">
                    <span className="num w-12 shrink-0 text-ink-soft">{stars} ★</span>
                    <span aria-hidden="true" className="h-3 flex-1 overflow-hidden rounded-pill bg-sunken">
                      <span className="block h-full rounded-pill bg-brand" style={{ width: `${(n / widest) * 100}%` }} />
                    </span>
                    <span className="num w-8 shrink-0 text-right font-semibold">
                      {n}
                      <span className="sr-only"> {n === 1 ? "rating" : "ratings"} of {stars} {stars === 1 ? "star" : "stars"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="latest-heading">
            <h2 id="latest-heading" className="mb-3 text-[1.0625rem] font-bold">
              Latest feedback
            </h2>
            <FeedbackList rows={rows} nowMs={now.getTime()} />
          </section>
        </div>
      )}
    </main>
  );
}
