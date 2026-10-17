"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CodeLookup } from "@/components/staff/CodeLookup";
import { OrderCard, type StaffAction } from "@/components/staff/OrderCard";
import { SlotGroup } from "@/components/staff/SlotGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { acceptOrder, collectOrder, flagNoShow, markReady } from "@/lib/orders/actions";
import type { OrderStatus } from "@/lib/orders/types";
import { findByCode } from "@/lib/staff/codeLookup";
import { groupBySlot } from "@/lib/staff/groupBySlot";
import { fetchStaffData } from "@/lib/staff/queries";
import type { StaffOrder, StaffOrderLine } from "@/lib/staff/types";
import { createClient } from "@/lib/supabase/browser";

const POLL_MS = 15_000;

type Data = { orders: StaffOrder[]; lines: StaffOrderLine[] };

const NEXT_STATUS: Record<StaffAction, OrderStatus> = {
  accept: "accepted",
  ready: "ready",
  collect: "collected",
  noShow: "no_show",
};

const RUN: Record<StaffAction, (orderId: string) => Promise<{ ok: true } | { ok: false; error: string }>> = {
  accept: acceptOrder,
  ready: markReady,
  collect: collectOrder,
  noShow: flagNoShow,
};

const ERROR_COPY: Record<string, string> = {
  ILLEGAL_TRANSITION: "Someone else already changed that order. Showing the latest.",
  HOLD_NOT_ELAPSED: "Too early to flag a no-show.",
  FORBIDDEN: "You are not allowed to do that.",
  ORDER_NOT_FOUND: "That order no longer exists.",
};

const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

export function StaffConsole({
  initial,
  canteenId,
  holdMinutes,
  serverNow,
}: {
  /** Null when the first load failed; the console keeps retrying. */
  initial: Data | null;
  canteenId: string;
  holdMinutes: number;
  serverNow: string;
}) {
  const { toast } = useToast();
  const online = useOnline();
  const [data, setData] = useState<Data>(initial ?? { orders: [], lines: [] });
  const [loadFailed, setLoadFailed] = useState(initial === null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");

  // Server clock minus phone clock, so hold countdowns are right even on a phone with the wrong time.
  const [skew] = useState(() => Date.parse(serverNow) - Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now() + skew);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now() + skew), 1000);
    return () => clearInterval(timer);
  }, [skew]);

  // --- New-order alert: vibration and a short beep. Browsers only allow sound after a tap. -----
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    const unlock = () => {
      if (!audio.current) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) audio.current = new Ctor();
      }
      void audio.current?.resume?.();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const alertNewOrders = useCallback(
    (codes: string[]) => {
      navigator.vibrate?.([200, 100, 200]);
      const ctx = audio.current;
      if (ctx) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.value = 0.15;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      }
      toast({ title: codes.length === 1 ? `New order ${codes[0]}` : `${codes.length} new orders`, tone: "info" });
    },
    [toast],
  );

  // --- Data: Realtime pushes, a 15 s poll and foreground/online refetches all call refetch. ----
  const known = useRef(new Set((initial?.orders ?? []).map((o) => o.id)));
  const refetch = useCallback(async () => {
    const next = await fetchStaffData(createClient(), canteenId);
    if (!next) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    const fresh = next.orders.filter((o) => o.status === "placed" && !known.current.has(o.id));
    next.orders.forEach((o) => known.current.add(o.id));
    setData(next);
    if (fresh.length > 0) alertNewOrders(fresh.map((o) => o.code));
  }, [alertNewOrders, canteenId]);

  useEffect(() => {
    const supabase = createClient();
    let pending: ReturnType<typeof setTimeout> | undefined;
    // A burst of changes (the 1 pm rush) becomes one refetch.
    const refetchSoon = () => {
      clearTimeout(pending);
      pending = setTimeout(() => void refetch(), 250);
    };
    // A filtered subscription is checked as the signed-in role, so the session's token must be on the
    // socket before joining; otherwise Realtime validates the filter as anon and rejects it.
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`staff-orders-${canteenId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `canteen_id=eq.${canteenId}` }, refetchSoon)
        .subscribe();
    });
    const poll = setInterval(() => void refetch(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refetchSoon);

    return () => {
      cancelled = true;
      clearTimeout(pending);
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetchSoon);
    };
  }, [refetch, canteenId]);

  // --- Actions: optimistic, rolled back if the server says no or the network is gone. ----------
  async function act(order: StaffOrder, action: StaffAction) {
    const setStatus = (status: OrderStatus) =>
      setData((d) => ({ ...d, orders: d.orders.map((o) => (o.id === order.id ? { ...o, status } : o)) }));

    setBusy((b) => new Set(b).add(order.id));
    setStatus(NEXT_STATUS[action]);

    let failure: string | null = null;
    try {
      const result = await RUN[action](order.id);
      if (!result.ok) failure = result.error;
    } catch {
      failure = "OFFLINE";
    }

    if (failure !== null) {
      setStatus(order.status);
      toast({
        title: ERROR_COPY[failure] ?? "Could not save that. Check the connection and try again.",
        tone: "error",
      });
    }
    setBusy((b) => {
      const next = new Set(b);
      next.delete(order.id);
      return next;
    });
    void refetch();
  }

  const linesByOrder = useMemo(() => {
    const map = new Map<string, StaffOrderLine[]>();
    for (const l of data.lines) map.set(l.order_id, [...(map.get(l.order_id) ?? []), l]);
    return map;
  }, [data.lines]);

  const groups = useMemo(() => groupBySlot(data.orders), [data.orders]);
  const matches = useMemo(() => findByCode(data.orders, query), [data.orders, query]);
  const searching = query.trim() !== "";

  const card = (o: StaffOrder, highlighted = false) => (
    <OrderCard
      key={o.id}
      order={o}
      lines={linesByOrder.get(o.id) ?? []}
      nowMs={nowMs}
      holdMinutes={holdMinutes}
      busy={busy.has(o.id)}
      highlighted={highlighted}
      onAction={(action) => void act(o, action)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {!online && (
        <p role="status" className="rounded-chip border-2 border-danger bg-danger-soft px-4 py-3 font-semibold text-danger-deep">
          You are offline. Changes will not save until the connection is back.
        </p>
      )}

      {loadFailed && (
        <p role="alert" className="rounded-chip border-2 border-danger bg-danger-soft px-4 py-3 text-danger-deep">
          Could not load orders.{" "}
          <button type="button" onClick={() => void refetch()} className="font-semibold underline underline-offset-2">
            Try again
          </button>
        </p>
      )}

      <CodeLookup value={query} onChange={setQuery} matchCount={matches.length} />

      {searching ? (
        matches.length > 0 && (
          <section aria-label="Matching orders" className="flex flex-col gap-3">
            {matches.map((o) => card(o, true))}
          </section>
        )
      ) : groups.length === 0 ? (loadFailed ? null : (
        <EmptyState title="No orders waiting" description="New orders show up here the moment a student places them." />
      )) : (
        groups.map((g) => (
          <SlotGroup key={g.slotStart} slotStart={g.slotStart} orders={g.orders} lines={data.lines}>
            {g.orders.map((o) => card(o))}
          </SlotGroup>
        ))
      )}
    </div>
  );
}
