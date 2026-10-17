"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { MOODS, type MoodId } from "@/lib/assist/moods";
import { cn } from "@/lib/cn";
import { formatPaise } from "@/lib/format";

type Pick = { id: string; name: string; price_paise: number; reason: string };
type Suggestion = { headline: string; picks: Pick[] };

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-chip px-4 text-sm font-semibold transition-colors duration-150",
        pressed ? "bg-brand text-on-brand" : "bg-sunken text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** Pick a mood, get up to three dishes from the canteen's own menu, add them to the cart. */
export function MoodSheet({ open, onClose, canteenId }: { open: boolean; onClose: () => void; canteenId: string }) {
  const { add } = useCart();
  const { toast } = useToast();
  const [moods, setMoods] = useState<MoodId[]>([]);
  const [vegOnly, setVegOnly] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Suggestion | null>(null);
  // A slow answer must not overwrite a newer one.
  const latest = useRef(0);
  // A request that fails after the sheet closed has nobody to tell.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const toggleMood = (id: MoodId) =>
    setMoods((current) => (current.includes(id) ? current.filter((m) => m !== id) : [...current, id]));

  async function suggest() {
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const res = await fetch("/api/assistant/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ canteenId, moods, note, vegOnly }),
      });
      if (!res.ok) throw new Error(`suggest ${res.status}`);
      const body = (await res.json()) as Suggestion;
      if (ticket !== latest.current) return;
      setResult({ headline: body.headline, picks: body.picks.slice(0, 3) });
    } catch {
      if (ticket !== latest.current || !openRef.current) return;
      toast({ title: "Check your connection and try again.", tone: "error" });
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }

  function addOne(pick: Pick) {
    add(pick.id);
    toast({ title: "Added", description: pick.name, tone: "success" });
  }

  function addAll(picks: Pick[]) {
    for (const p of picks) add(p.id);
    toast({ title: "Added", description: `${picks.length} items in your order`, tone: "success" });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What are you in the mood for?"
      footer={
        <Button size="lg" fullWidth loading={loading} onClick={() => void suggest()}>
          Suggest
        </Button>
      }
    >
      <div role="group" aria-label="Moods" className="flex flex-wrap gap-2">
        {MOODS.map((m) => (
          <Chip key={m.id} pressed={moods.includes(m.id)} onClick={() => toggleMood(m.id)}>
            {m.label}
          </Chip>
        ))}
        <Chip pressed={vegOnly} onClick={() => setVegOnly((v) => !v)}>
          Veg only
        </Chip>
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-semibold text-ink-soft">Anything else?</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          rows={2}
          className="mt-1.5 block w-full resize-none rounded-control bg-sunken p-3 text-base text-ink"
        />
      </label>

      {/* One persistent live region, so a screen reader announces the loading text and then the result. */}
      <div aria-live="polite">
      {loading ? (
        <div className="mt-5 space-y-3">
          <span className="sr-only">Finding something for you</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-card bg-sunken p-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="size-11 rounded-control" />
            </div>
          ))}
        </div>
      ) : (
        result && (
          <section aria-label="Suggestions" className="mt-5">
            <h3 className="font-display text-lg font-bold leading-snug">{result.headline}</h3>
            {result.picks.length === 0 ? (
              <p className="mt-2 text-ink-soft">Nothing on the menu fits right now. Try a different mood.</p>
            ) : (
              <>
                <ul className="mt-3 space-y-2">
                  {result.picks.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-card bg-sunken p-3 pl-4">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold">{p.name}</span>
                          <span className="num shrink-0 text-sm font-semibold">{formatPaise(p.price_paise)}</span>
                        </p>
                        <p className="mt-0.5 text-sm text-ink-faint">{p.reason}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addOne(p)}
                        aria-label={`Add ${p.name}`}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-brand text-on-brand shadow-press transition-transform duration-150 active:translate-y-0.5"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
                {result.picks.length > 1 && (
                  <Button variant="secondary" fullWidth className="mt-3" onClick={() => addAll(result.picks)}>
                    Add all
                  </Button>
                )}
              </>
            )}
          </section>
        )
      )}
      </div>
    </Sheet>
  );
}
