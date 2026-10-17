// Removes the "Test" menu items that the automated tests leave behind in the local database, so a
// shared demo shows only the real menu.
//
//   node scripts/clean-test-menu.mjs --dry-run     (counts only, changes nothing)
//   node scripts/clean-test-menu.mjs
//
// Orders made only of test items are deleted with them (their seats are given back). An order that
// mixes a test item with a real one is left alone and its test items are hidden instead. Uses the
// service-role key from .env.local: run it only against your local stack.
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // rely on the real environment
}
const dryRun = process.argv.includes("--dry-run");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const chunks = (list, size = 100) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data ?? [];
};

const test = must(await db.from("menu_items").select("id").eq("category", "Test"));
const testIds = new Set(test.map((t) => t.id));
if (testIds.size === 0) {
  console.log("No test menu items. Nothing to do.");
  process.exit(0);
}

// Orders that contain at least one test item, and every line of those orders.
const touched = new Set();
for (const ids of chunks([...testIds])) {
  for (const l of must(await db.from("order_items").select("order_id").in("menu_item_id", ids))) touched.add(l.order_id);
}
const lines = [];
for (const ids of chunks([...touched])) lines.push(...must(await db.from("order_items").select("order_id, menu_item_id").in("order_id", ids)));

const mixedOrders = new Set(lines.filter((l) => !testIds.has(l.menu_item_id)).map((l) => l.order_id));
const testOnlyOrders = [...touched].filter((id) => !mixedOrders.has(id));
const keptItemIds = new Set(lines.filter((l) => mixedOrders.has(l.order_id) && testIds.has(l.menu_item_id)).map((l) => l.menu_item_id));
const deletableItemIds = [...testIds].filter((id) => !keptItemIds.has(id));

console.log(`test items: ${testIds.size} | orders made only of test items: ${testOnlyOrders.length} | mixed orders kept: ${mixedOrders.size} | test items to hide instead of delete: ${keptItemIds.size}`);
if (dryRun) {
  console.log("Dry run: nothing changed.");
  process.exit(0);
}

// Give back the seats those orders held (cancelled orders already gave theirs back).
const seats = new Map();
for (const ids of chunks(testOnlyOrders)) {
  for (const o of must(await db.from("orders").select("id, slot_id, status").in("id", ids))) {
    if (o.status !== "cancelled") seats.set(o.slot_id, (seats.get(o.slot_id) ?? 0) + 1);
  }
}
for (const [slotId, n] of seats) {
  const [slot] = must(await db.from("slots").select("booked_count").eq("id", slotId));
  if (slot) must(await db.from("slots").update({ booked_count: Math.max(0, slot.booked_count - n) }).eq("id", slotId).select("id"));
}

for (const ids of chunks(testOnlyOrders)) must(await db.from("orders").delete().in("id", ids).select("id"));
for (const ids of chunks(deletableItemIds)) must(await db.from("menu_items").delete().in("id", ids).select("id"));
for (const ids of chunks([...keptItemIds])) must(await db.from("menu_items").update({ is_available: false }).in("id", ids).select("id"));

const left = must(await db.from("menu_items").select("id, category"));
console.log(`Done. Menu items now: ${left.length} (test items left: ${left.filter((i) => i.category === "Test").length}).`);
