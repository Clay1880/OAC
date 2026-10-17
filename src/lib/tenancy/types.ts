/** A row of `public.canteens`. */
export type Canteen = {
  id: string;
  college_id: string;
  name: string;
  slug: string;
  code_prefix: string;
  status: "pending" | "approved" | "suspended";
  order_cutoff_minutes: number;
  no_show_hold_minutes: number;
  created_at: string;
};

export const CANTEEN_COLUMNS =
  "id, college_id, name, slug, code_prefix, status, order_cutoff_minutes, no_show_hold_minutes, created_at";
