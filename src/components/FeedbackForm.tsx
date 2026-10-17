"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { submitFeedback, type FeedbackError } from "@/lib/feedback/actions";
import { starString } from "@/lib/feedback/summary";

const STARS = [1, 2, 3, 4, 5] as const;
const COMMENT_MAX = 500;

type Given = { rating: number; comment: string | null };

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("size-9 transition-colors duration-150", filled ? "text-brand-deep" : "text-line-strong")}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    >
      <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8L12 2.8z" />
    </svg>
  );
}

/** "Thanks!" state: the rating the student gave, read-only. */
function Thanks({ given }: { given: Given }) {
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-lg font-semibold text-status-ready-ink">
        {`Thanks! You rated it ${starString(given.rating)}`}
      </p>
      {given.comment && <p className="whitespace-pre-line break-words text-ink-soft">{given.comment}</p>}
    </div>
  );
}

/**
 * Rate a delivered order: five stars (a radio group), an optional comment, one send. An order can be
 * rated once; with `existing` set, or after a successful send, the form turns into a read-only thank-you.
 */
export function FeedbackForm({ orderId, existing }: { orderId: string; existing: Given | null }) {
  const [given, setGiven] = useState<Given | null>(existing);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const commentId = useId();
  const stars = useRef<(HTMLButtonElement | null)[]>([]);

  function choose(value: number) {
    setRating(value);
    stars.current[value - 1]?.focus();
  }

  function onKeyDown(event: KeyboardEvent, value: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    choose(Math.min(5, Math.max(1, value + step)));
  }

  async function onSubmit() {
    setSending(true);
    setFailed(false);
    let error: FeedbackError | null = null;
    try {
      const result = await submitFeedback({ orderId, rating, comment });
      if (!result.ok) error = result.error;
    } catch {
      error = "UNKNOWN";
    }
    setSending(false);
    if (error === null || error === "ALREADY_SUBMITTED") {
      // ALREADY_SUBMITTED means a double tap or another tab got there first: show the thanks state.
      setGiven({ rating, comment: comment.trim() || null });
    } else {
      setFailed(true);
    }
  }

  return (
    <section aria-labelledby="feedback-heading" className="rounded-card border border-line bg-surface p-5 shadow-edge">
      <h2 id="feedback-heading" className="mb-3 text-[1.0625rem] font-bold">
        How was your order?
      </h2>
      {given ? (
        <Thanks given={given} />
      ) : (
        <div className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="Rating" className="-ml-1 flex">
            {STARS.map((value) => (
              <button
                key={value}
                ref={(node) => {
                  stars.current[value - 1] = node;
                }}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={value === 1 ? "1 star" : `${value} stars`}
                tabIndex={rating === value || (rating === 0 && value === 1) ? 0 : -1}
                onClick={() => choose(value)}
                onKeyDown={(event) => onKeyDown(event, value)}
                className="flex size-11 items-center justify-center rounded-control"
              >
                <Star filled={value <= rating} />
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={commentId} className="text-sm font-semibold text-ink">
              Anything to add?
            </label>
            <textarea
              id={commentId}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={COMMENT_MAX}
              rows={3}
              className="w-full resize-none rounded-control border-2 border-line-strong bg-sunken px-4 py-3 text-base text-ink placeholder:text-ink-faint focus:border-brand"
            />
          </div>

          {failed && (
            <p role="alert" className="text-sm font-medium text-danger-deep">
              We could not send your feedback. Please try again.
            </p>
          )}

          <Button fullWidth disabled={rating === 0} loading={sending} onClick={() => void onSubmit()}>
            Send feedback
          </Button>
        </div>
      )}
    </section>
  );
}
