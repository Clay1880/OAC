"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { parseRupees } from "@/lib/admin/money";
import { formatPaise } from "@/lib/format";
import { fetchMenu, groupByCategory, type MenuItem } from "@/lib/menu";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/cn";

type Draft = { name: string; description: string; category: string; price: string; sort: string };

const emptyDraft: Draft = { name: "", description: "", category: "", price: "", sort: "0" };
const toDraft = (i: MenuItem): Draft => ({
  name: i.name,
  description: i.description ?? "",
  category: i.category,
  price: (i.price_paise / 100).toFixed(2),
  sort: String(i.sort),
});

export function MenuAdmin({ initialItems }: { initialItems: MenuItem[] }) {
  const { toast } = useToast();
  const [items, setItems] = useState(initialItems);
  /** null = closed, "new" = adding, otherwise the item being edited. */
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [saving, setSaving] = useState(false);

  async function reload() {
    const fresh = await fetchMenu();
    if (fresh) setItems(fresh);
  }

  function open(target: MenuItem | "new") {
    setEditing(target);
    setDraft(target === "new" ? emptyDraft : toDraft(target));
    setErrors({});
  }

  async function toggleAvailable(item: MenuItem) {
    const { error } = await createClient().from("menu_items").update({ is_available: !item.is_available }).eq("id", item.id);
    if (error) toast({ title: "Could not update that item.", tone: "error" });
    await reload();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    const paise = parseRupees(draft.price);
    const sort = Number.parseInt(draft.sort, 10);
    if (draft.name.trim() === "") next.name = "Enter a name.";
    if (draft.category.trim() === "") next.category = "Enter a category, e.g. Snacks.";
    if (paise === null) next.price = "Enter a price like 45 or 45.50.";
    if (!Number.isFinite(sort)) next.sort = "Enter a whole number.";
    setErrors(next);
    if (Object.keys(next).length > 0 || paise === null) return;

    setSaving(true);
    const row = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      category: draft.category.trim(),
      price_paise: paise,
      sort,
    };
    const supabase = createClient();
    const { error } =
      editing === "new"
        ? await supabase.from("menu_items").insert(row)
        : await supabase.from("menu_items").update(row).eq("id", (editing as MenuItem).id);
    setSaving(false);
    if (error) {
      toast({ title: "Could not save the item. Please try again.", tone: "error" });
      return;
    }
    toast({ title: editing === "new" ? "Item added" : "Item saved", tone: "success" });
    setEditing(null);
    await reload();
  }

  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const categories = [...new Set(items.map((i) => i.category))];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Button onClick={() => open("new")}>Add item</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No menu items yet" description="Add the first dish so students have something to order." />
      ) : (
        groupByCategory(items).map(({ category, items: list }) => (
          <section key={category} aria-labelledby={`admin-cat-${category}`}>
            <h2 id={`admin-cat-${category}`} className="mb-1 border-b-2 border-ink pb-2 text-2xl font-semibold">
              {category}
            </h2>
            <ul className="divide-y divide-line">
              {list.map((item) => (
                <li key={item.id} data-item-id={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div className={cn("min-w-0", !item.is_available && "opacity-60")}>
                    <p className="font-semibold">{item.name}</p>
                    <p className="num text-sm text-ink-soft">
                      {formatPaise(item.price_paise)}
                      {!item.is_available && " · sold out"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.is_available}
                      aria-label={`${item.name} available`}
                      onClick={() => void toggleAvailable(item)}
                      className={cn(
                        "relative inline-flex h-12 w-16 items-center rounded-pill border-2 border-ink transition-colors duration-150",
                        item.is_available ? "bg-status-ready" : "bg-sunken",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute size-7 rounded-full bg-ink transition-transform duration-150",
                          item.is_available ? "translate-x-7" : "translate-x-1",
                        )}
                      />
                    </button>
                    <Button variant="secondary" aria-label={`Edit ${item.name}`} onClick={() => open(item)}>
                      Edit
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Sheet
        open={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing === "new" ? "Add item" : "Edit item"}
      >
        <form onSubmit={save} noValidate className="flex flex-col gap-4 pb-2">
          <Field label="Name" name="name" value={draft.name} onChange={set("name")} error={errors.name} required />
          <Field label="Description" name="description" value={draft.description} onChange={set("description")} hint="Optional, one line." />
          <div>
            <Field label="Category" name="category" list="menu-categories" value={draft.category} onChange={set("category")} error={errors.category} required />
            <datalist id="menu-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <Field label="Price (₹)" name="price" inputMode="decimal" value={draft.price} onChange={set("price")} error={errors.price} required />
          <Field label="Sort order" name="sort" inputMode="numeric" value={draft.sort} onChange={set("sort")} error={errors.sort} hint="Lower numbers appear first." />
          <Button type="submit" size="lg" fullWidth loading={saving}>
            Save
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
