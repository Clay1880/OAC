import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { isStudent } from "./auth";

/** A client whose `profiles` read answers `{ data, error }` and records the filter it was given. */
function fake(result: { data: { role: string } | null; error: unknown }) {
  const seen: { table?: string; column?: string; value?: string } = {};
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => {
          Object.assign(seen, { table, column, value });
          return { maybeSingle: async () => result };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, seen };
}

describe("isStudent", () => {
  it("is true for a student and reads the caller's own profile", async () => {
    const { client, seen } = fake({ data: { role: "student" }, error: null });
    expect(await isStudent(client, "u1")).toBe(true);
    expect(seen).toEqual({ table: "profiles", column: "id", value: "u1" });
  });

  it("is false for staff and for an admin", async () => {
    expect(await isStudent(fake({ data: { role: "staff" }, error: null }).client, "u")).toBe(false);
    expect(await isStudent(fake({ data: { role: "admin" }, error: null }).client, "u")).toBe(false);
  });

  it("is false on an error, with no profile, or when the client throws", async () => {
    expect(await isStudent(fake({ data: null, error: { message: "boom" } }).client, "u")).toBe(false);
    expect(await isStudent(fake({ data: null, error: null }).client, "u")).toBe(false);
    const throwing = {
      from: () => {
        throw new Error("down");
      },
    } as unknown as SupabaseClient;
    expect(await isStudent(throwing, "u")).toBe(false);
  });
});
