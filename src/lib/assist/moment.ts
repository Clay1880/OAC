import { CAMPUS_TZ } from "@/lib/config";

export type MealMoment = "breakfast" | "lunch" | "snack" | "dinner" | "late";

const LABELS: Record<MealMoment, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch break",
  snack: "Evening snack",
  dinner: "Dinner",
  late: "Late night",
};

export const momentLabel = (m: MealMoment): string => LABELS[m];

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Meal moment at an instant, on the campus wall clock:
 * breakfast 06:00-10:59, lunch 11:00-14:59, snack 15:00-18:29, dinner 18:30-22:29, late otherwise.
 */
export function mealMoment(nowMs: number): MealMoment {
  const parts = clock.formatToParts(new Date(nowMs));
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const t = hour * 60 + minute;
  if (t >= 6 * 60 && t < 11 * 60) return "breakfast";
  if (t >= 11 * 60 && t < 15 * 60) return "lunch";
  if (t >= 15 * 60 && t < 18 * 60 + 30) return "snack";
  if (t >= 18 * 60 + 30 && t < 22 * 60 + 30) return "dinner";
  return "late";
}
