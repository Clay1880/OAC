import type { OrderStatus } from "@/lib/orders/types";

/** A row of `public.staff_orders_v`: an order with its slot time and the student's contact details. */
export type StaffOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  total_paise: number;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  collected_at: string | null;
  flagged_at: string | null;
  paid_at: string | null;
  slot_id: string;
  slot_starts_at: string;
  student_id: string;
  student_name: string;
  reg_no: string | null;
  phone: string | null;
  canteen_id: string;
  canteen_name: string;
};

/** A line of an order, as the counter needs it for the prep summary. */
export type StaffOrderLine = { order_id: string; name: string; qty: number };
