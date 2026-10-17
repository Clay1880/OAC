import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { menuPhoto } from "./menuImage";

const root = join(import.meta.dirname, "../..");

/** The dish names in the seed's menu insert: lines shaped like `('Aloo chat', 3500, 'Chat', 10),` (the last row has no comma). */
function seededDishNames(): string[] {
  const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");
  return [...seed.matchAll(/^\s*\('([^']+)',\s*\d+,\s*'[^']+',\s*\d+\)[,;]?\s*$/gm)].map((m) => m[1]);
}

describe("menuPhoto", () => {
  it("finds the 62 seeded dishes", () => {
    expect(seededDishNames()).toHaveLength(62);
  });

  it("gives every seeded dish a photo that exists in public/", () => {
    for (const name of seededDishNames()) {
      const photo = menuPhoto(name);
      expect(photo, `${name} has no photo`).not.toBeNull();
      expect(existsSync(join(root, "public", photo!)), `${name}: ${photo} is missing on disk`).toBe(true);
    }
  });

  it("matches regardless of case and surrounding spaces", () => {
    expect(menuPhoto("  PANI PURI ")).toBe(menuPhoto("Pani Puri"));
  });

  it("gives an unknown dish no photo, so it shows a lettered tile", () => {
    expect(menuPhoto("Dragon Fruit Surprise")).toBeNull();
  });

  it("falls back to a coffee photo for an unmapped coffee drink", () => {
    expect(menuPhoto("Filter Coffee")).toMatch(/^\/figma\/photos\/p[2-5]\.jpg$/);
  });
});
