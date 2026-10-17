"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { formatSlotDay, formatSlotTime } from "@/lib/format";
import type { Slot } from "@/lib/slots";
import { createClient } from "@/lib/supabase/browser";

const SLOT_COLUMNS = "id, starts_at, capacity, booked_count";

const CAPACITY_ERRORS: Record<string, string> = {
  BELOW_BOOKED: "That is fewer than the orders already placed in this slot.",
  INVALID_RANGE: "Enter a capacity of 1 or more.",
  SLOT_NOT_FOUND: "That slot no longer exists.",
};

/** From an hour ago, so a slot that just started is still listed while orders are being collected. */
async function fetchUpcomingSlots(): Promise<Slot[] | null> {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data, error } = await createClient()
    .from("slots")
    .select(SLOT_COLUMNS)
    .gte("starts_at", since)
    .order("starts_at")
    .limit(300);
  return error ? null : (data as Slot[]);
}

export function SlotsAdmin({ initialSlots, today }: { initialSlots: Slot[]; today: string }) {
  const { toast } = useToast();
  const [slots, setSlots] = useState(initialSlots);
  const [form, setForm] = useState({ day: today, from: "13:00", to: "14:00", minutes: "10", capacity: "15" });
  const [creating, setCreating] = useState(false);

  async function reload() {
    const fresh = await fetchUpcomingSlots();
    if (fresh) setSlots(fresh);
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    const minutes = Number.parseInt(form.minutes, 10);
    const capacity = Number.parseInt(form.capacity, 10);
    if (!(minutes > 0) || !(capacity > 0)) {
      toast({ title: "Slot length and capacity must be 1 or more.", tone: "error" });
      return;
    }
    setCreating(true);
    const { data, error } = await createClient().rpc("generate_slots", {
      p_day: form.day,
      p_from: form.from,
      p_to: form.to,
      p_minutes: minutes,
      p_capacity: capacity,
    });
    setCreating(false);
    if (error) {
      toast({
        title: error.message === "INVALID_RANGE" ? "Check the times: the end must be after the start." : "Could not create slots.",
        tone: "error",
      });
      return;
    }
    toast({
      title: data === 0 ? "Those slots already exist" : `Created ${data} ${data === 1 ? "slot" : "slots"}`,
      tone: data === 0 ? "info" : "success",
    });
    await reload();
  }

  async function setCapacity(slot: Slot, capacity: number) {
    const { error } = await createClient().rpc("set_slot_capacity", { p_slot_id: slot.id, p_capacity: capacity });
    if (error) {
      toast({ title: CAPACITY_ERRORS[error.message] ?? "Could not change the capacity.", tone: "error" });
    } else {
      toast({ title: "Capacity saved", tone: "success" });
    }
    await reload();
  }

  const days = [...new Set(slots.map((s) => formatSlotDay(s.starts_at)))];
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <h2 className="mb-4 text-[1.0625rem] font-bold">Create slots</h2>
        <form onSubmit={generate} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Day" name="day" type="date" {...field("day")} required />
          </div>
          <Field label="From" name="from" type="time" {...field("from")} required />
          <Field label="Until" name="to" type="time" {...field("to")} required />
          <Field label="Minutes per slot" name="minutes" inputMode="numeric" {...field("minutes")} required />
          <Field label="Orders per slot" name="capacity" inputMode="numeric" {...field("capacity")} required />
          <div className="col-span-2">
            <Button type="submit" size="lg" fullWidth loading={creating}>
              Create slots
            </Button>
          </div>
        </form>
        <p className="mt-3 text-sm text-ink-soft">Times are campus time. Slots that already exist are left as they are.</p>
      </Card>

      {slots.length === 0 ? (
        <EmptyState title="No upcoming slots" description="Create slots above so students can choose a pickup time." />
      ) : (
        days.map((day) => (
          <section key={day} aria-labelledby={`day-${day}`}>
            <h2 id={`day-${day}`} className="mb-3 text-[1.0625rem] font-bold">
              {day}
            </h2>
            <ul className="divide-y divide-line rounded-card border border-line bg-surface px-4 shadow-edge">
              {slots
                .filter((s) => formatSlotDay(s.starts_at) === day)
                .map((slot) => (
                  <SlotRow key={`${slot.id}-${slot.capacity}`} slot={slot} onSave={(c) => setCapacity(slot, c)} />
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function SlotRow({ slot, onSave }: { slot: Slot; onSave: (capacity: number) => void }) {
  const [value, setValue] = useState(String(slot.capacity));
  const parsed = Number.parseInt(value, 10);
  const changed = Number.isFinite(parsed) && parsed !== slot.capacity;

  return (
    <li data-slot-id={slot.id} className="flex items-center justify-between gap-3 py-3">
      <div>
        <p className="num text-xl font-semibold">{formatSlotTime(slot.starts_at)}</p>
        <p className="text-sm text-ink-soft">
          <span className="num">{slot.booked_count}</span> booked
        </p>
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) onSave(parsed);
        }}
      >
        <label className="flex flex-col text-sm font-semibold">
          <span className="sr-only">Capacity for {formatSlotTime(slot.starts_at)}</span>
          <span aria-hidden="true" className="mb-1">Capacity</span>
          <input
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="num min-h-12 w-20 rounded-chip border-2 border-line-strong bg-surface px-3 text-base"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={!changed}>
          Save
        </Button>
      </form>
    </li>
  );
}
