import { admin } from "../tests/integration/helpers";

/**
 * Removes slots earlier test runs left behind. Test slots start at a fractional second (see
 * createSlot); real and demo slots always start on a whole minute, so those are never touched.
 * Students pick a time on a clock, so stale slots would crowd out the minutes tests need.
 */
export default async function globalSetup() {
  const { data } = await admin.from("slots").select("id, starts_at").gt("starts_at", new Date().toISOString()).limit(5000);
  const stale = (data ?? []).filter((s) => Date.parse(s.starts_at) % 60_000 !== 0).map((s) => s.id);

  for (let i = 0; i < stale.length; i += 200) {
    const chunk = stale.slice(i, i + 200);
    const { data: used } = await admin.from("orders").select("slot_id").in("slot_id", chunk);
    const inUse = new Set((used ?? []).map((o) => o.slot_id));
    const removable = chunk.filter((id) => !inUse.has(id));
    if (removable.length) await admin.from("slots").delete().in("id", removable);
  }
}
