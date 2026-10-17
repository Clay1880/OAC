"use client";

import { useCallback, useEffect, useState } from "react";
import { offeredSlots, type Slot } from "@/lib/slots";
import { createClient } from "@/lib/supabase/browser";

const TICK_MS = 15_000;

/**
 * Slots a student can pick, kept fresh from the database.
 *
 * Time comes from the server: `serverNowIso` is when the page was rendered, and the gap to the
 * phone's clock is remembered, so a phone with the wrong time or timezone still sees the right
 * cutoffs. Seat counts refresh over Realtime and again when the app returns to the foreground.
 */
export function useSlots(initial: Slot[], serverNowIso: string, cutoffMinutes: number) {
  const [slots, setSlots] = useState(initial);
  const [failed, setFailed] = useState(false);
  // Server clock minus phone clock, taken once at mount.
  const [skew] = useState(() => Date.parse(serverNowIso) - Date.now());
  // "Now" on the server's clock; advanced by a timer so cutoffs are re-evaluated as time passes.
  const [nowMs, setNowMs] = useState(() => Date.now() + skew);

  const refresh = useCallback(async () => {
    setNowMs(Date.now() + skew);
    const { data, error } = await createClient()
      .from("slots")
      .select("id, starts_at, capacity, booked_count")
      .gt("starts_at", new Date(Date.now() + skew).toISOString())
      .order("starts_at");
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setSlots(data as Slot[]);
  }, [skew]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("slots-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "slots" }, () => void refresh())
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    // Re-evaluate cutoffs as time passes even when nothing changes in the database.
    const timer = setInterval(() => setNowMs(Date.now() + skew), TICK_MS);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      clearInterval(timer);
    };
  }, [refresh, skew]);

  return { slots: offeredSlots(slots, nowMs, cutoffMinutes), failed, refresh };
}
