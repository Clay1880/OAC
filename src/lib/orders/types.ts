/** Mirrors the `order_status` enum in the database. */
export type OrderStatus = "placed" | "accepted" | "ready" | "collected" | "cancelled" | "no_show";

/** A row of `public.orders`. */
export type Order = {
  id: string;
  code: string;
  canteen_id: string;
  student_id: string;
  slot_id: string;
  status: OrderStatus;
  total_paise: number;
  request_id: string;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  collected_at: string | null;
  flagged_at: string | null;
  paid_at: string | null;
};

const PLACE_ORDER_ERRORS = [
  "SLOT_FULL",
  "SLOT_CLOSED",
  "DEFAULTER",
  "ITEM_UNAVAILABLE",
  "EMPTY_ORDER",
  "CANTEEN_UNAVAILABLE",
] as const;

/** Business-rule rejections `place_order` raises, plus UNKNOWN for anything unexpected. */
export type PlaceOrderError = (typeof PLACE_ORDER_ERRORS)[number] | "UNKNOWN";

/** Maps the message of a Postgres error raised by `place_order` to a `PlaceOrderError`. */
export function toPlaceOrderError(error: { message: string }): PlaceOrderError {
  return (PLACE_ORDER_ERRORS as readonly string[]).includes(error.message)
    ? (error.message as PlaceOrderError)
    : "UNKNOWN";
}
