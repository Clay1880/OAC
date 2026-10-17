"use server";

import { createClient } from "@/lib/supabase/server";

export type FeedbackError =
  | "ORDER_NOT_FOUND"
  | "NOT_COLLECTED"
  | "INVALID_RATING"
  | "INVALID_COMMENT"
  | "ALREADY_SUBMITTED"
  | "UNKNOWN";

const KNOWN: readonly string[] = [
  "ORDER_NOT_FOUND",
  "NOT_COLLECTED",
  "INVALID_RATING",
  "INVALID_COMMENT",
  "ALREADY_SUBMITTED",
];

export async function submitFeedback(input: {
  orderId: string;
  rating: number;
  comment: string;
}): Promise<{ ok: true } | { ok: false; error: FeedbackError }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_feedback", {
    p_order_id: input.orderId,
    p_rating: input.rating,
    p_comment: input.comment,
  });
  if (error) return { ok: false, error: KNOWN.includes(error.message) ? (error.message as FeedbackError) : "UNKNOWN" };
  return { ok: true };
}
