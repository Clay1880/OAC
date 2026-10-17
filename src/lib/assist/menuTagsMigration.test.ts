import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const MIGRATION = join(root, "supabase/migrations/0015_menu_tags_prod.sql");
const DIETS = ["veg", "non-veg", "egg"];

type Tagging = { tags: string[]; moments: string[] };

const list = (literal: string) => (literal === "" ? [] : literal.split(","));

/** The dish names in the seed's menu insert: lines shaped like `('Aloo chat', 3500, 'Chat', 10),`. */
function seededDishNames(): string[] {
  const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");
  return [...seed.matchAll(/^\s*\('([^']+)',\s*\d+,\s*'[^']+',\s*\d+\)[,;]?\s*$/gm)].map((m) => m[1]);
}

/** The seed's per-dish `update ... set tags = '{..}', meal_moments = '{..}' ... and name = '..';` statements. */
function seedTagging(): Map<string, Tagging> {
  const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");
  const updates = seed.matchAll(
    /update public\.menu_items set tags = '\{([^}]*)\}', meal_moments = '\{([^}]*)\}'\s+where [^;]*? and name = '([^']+)';/g,
  );
  return new Map([...updates].map((m) => [m[3], { tags: list(m[1]), moments: list(m[2]) }]));
}

/** The migration's value rows: `('Aloo chat', '{veg,hot}', '{snack}'),`, in file order (duplicates kept). */
function migrationRows(): { name: string; tagging: Tagging }[] {
  const sql = readFileSync(MIGRATION, "utf8");
  return [...sql.matchAll(/^\s*\('([^']+)',\s*'\{([^}]*)\}',\s*'\{([^}]*)\}'\)[,;]?\s*$/gm)].map((m) => ({
    name: m[1],
    tagging: { tags: list(m[2]), moments: list(m[3]) },
  }));
}

describe("0015_menu_tags_prod.sql", () => {
  it("exists", () => {
    expect(existsSync(MIGRATION)).toBe(true);
  });

  it("covers every one of the 62 seeded dishes exactly once", () => {
    const names = migrationRows().map((r) => r.name);
    const seeded = seededDishNames();

    expect(seeded).toHaveLength(62);
    expect(names).toHaveLength(62);
    expect(new Set(names).size).toBe(62);
    expect([...names].sort()).toEqual([...seeded].sort());
  });

  it("gives each dish exactly one diet tag and at least one meal moment", () => {
    for (const { name, tagging } of migrationRows()) {
      expect(tagging.tags.filter((t) => DIETS.includes(t)), `${name} diet tags`).toHaveLength(1);
      expect(tagging.moments.length, `${name} meal moments`).toBeGreaterThan(0);
    }
  });

  it("uses exactly the seed's values, so a fresh reset and a migrated database agree", () => {
    const fromMigration = new Map(migrationRows().map((r) => [r.name, r.tagging]));

    expect(seedTagging().size).toBe(62);
    expect(fromMigration).toEqual(seedTagging());
  });

  it("only touches oac's untagged items, so an owner's later edits are kept", () => {
    const sql = readFileSync(MIGRATION, "utf8");

    expect(sql).toMatch(/canteen_id = \(select id from public\.canteens where slug = 'oac'\)/);
    expect(sql).toMatch(/tags = '\{\}'/);
  });
});
