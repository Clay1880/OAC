/** A row of `public.staff_feedback_v`: one delivered order's rating, as the counter reads it. */
export type FeedbackRow = {
  order_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  order_code: string;
  student_name: string;
  items: string;
};

export type FeedbackSummary = {
  count: number;
  /** Mean rating rounded to one decimal, or null when there is no feedback. */
  average: number | null;
  /** How many one-star ... five-star ratings, in that order. */
  distribution: [number, number, number, number, number];
};

/** A row of `public.feedback_summary(canteen_id)`. bigint and numeric may arrive as strings. */
export type FeedbackSummaryRow = {
  count: number | string;
  average: number | string | null;
  c1: number | string;
  c2: number | string;
  c3: number | string;
  c4: number | string;
  c5: number | string;
};

/** The summary card's numbers from the SQL summary; no row (not staff of the canteen) reads as empty. */
export function toFeedbackSummary(row: FeedbackSummaryRow | undefined): FeedbackSummary {
  if (!row) return { count: 0, average: null, distribution: [0, 0, 0, 0, 0] };
  return {
    count: Number(row.count),
    average: row.average === null ? null : Number(row.average),
    distribution: [Number(row.c1), Number(row.c2), Number(row.c3), Number(row.c4), Number(row.c5)],
  };
}

/** A rating as text, e.g. 4 -> "★★★★☆". */
export function starString(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}
