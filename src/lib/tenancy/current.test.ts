import { describe, expect, it } from "vitest";
import { pickDefaultCanteen } from "./current";
import type { Canteen } from "./types";

function canteen(id: string, status: Canteen["status"], created_at: string): Canteen {
  return {
    id,
    college_id: "c1",
    name: id,
    slug: id,
    code_prefix: "AB",
    status,
    order_cutoff_minutes: 5,
    no_show_hold_minutes: 15,
    created_at,
  };
}

describe("pickDefaultCanteen", () => {
  it("picks the earliest approved canteen", () => {
    const picked = pickDefaultCanteen([
      canteen("late", "approved", "2026-02-01T00:00:00Z"),
      canteen("early", "approved", "2026-01-01T00:00:00Z"),
    ]);
    expect(picked?.id).toBe("early");
  });

  it("ignores pending and suspended canteens", () => {
    const picked = pickDefaultCanteen([
      canteen("pending", "pending", "2025-01-01T00:00:00Z"),
      canteen("suspended", "suspended", "2025-06-01T00:00:00Z"),
      canteen("open", "approved", "2026-01-01T00:00:00Z"),
    ]);
    expect(picked?.id).toBe("open");
  });

  it("returns null when there are no canteens", () => {
    expect(pickDefaultCanteen([])).toBeNull();
  });
});
