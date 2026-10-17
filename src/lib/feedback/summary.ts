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

export function summarizeFeedback(rows: { rating: number }[]): FeedbackSummary {
  const distribution: FeedbackSummary["distribution"] = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const { rating } of rows) {
    distribution[rating - 1] += 1;
    sum += rating;
  }
  return {
    count: rows.length,
    average: rows.length === 0 ? null : Math.round((sum / rows.length) * 10) / 10,
    distribution,
  };
}

/** A rating as text, e.g. 4 -> "★★★★☆". */
export function starString(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}
