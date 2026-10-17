"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCart } from "@/components/CartProvider";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

type Line = { id: string; name: string; qty: number };
type Message = { key: number; role: "user" | "model"; text: string; add?: Line[] };

const STARTERS = ["Something light for lunch", "What's under ₹50?", "Hot and quick"];
const MAX_TURNS = 10;
const MAX_TEXT = 300;

/** Ask about food, prices and pickup times; add what the assistant proposes to the cart. */
export function ChatSheet({ open, onClose, canteenId }: { open: boolean; onClose: () => void; canteenId: string }) {
  const { add } = useCart();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set());
  // A slow answer must not overwrite a newer one.
  const latest = useRef(0);
  const nextKey = useRef(0);
  // A request that fails after the sheet closed has nobody to tell.
  const openRef = useRef(open);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [messages, loading, open]);

  async function send(raw: string) {
    const text = raw.trim().slice(0, MAX_TEXT);
    if (text === "" || loading) return;
    const user: Message = { key: nextKey.current++, role: "user", text };
    const history = [...messages, user];
    setMessages(history);
    setDraft("");

    const ticket = ++latest.current;
    setLoading(true);
    try {
      const turns = history.slice(-MAX_TURNS).map((m) => ({ role: m.role, text: m.text.slice(0, MAX_TEXT) }));
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ canteenId, turns }),
      });
      if (!res.ok) throw new Error(`chat ${res.status}`);
      const body = (await res.json()) as { reply: string; add: Line[] };
      if (ticket !== latest.current) return;
      setMessages((current) => [
        ...current,
        { key: nextKey.current++, role: "model", text: body.reply, add: body.add.length > 0 ? body.add : undefined },
      ]);
    } catch {
      if (ticket !== latest.current || !openRef.current) return;
      toast({ title: "Check your connection and try again.", tone: "error" });
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }

  function addAll(message: Message) {
    // Only ids the route sent with this reply.
    for (const line of message.add ?? []) for (let i = 0; i < line.qty; i++) add(line.id);
    setAdded((current) => new Set(current).add(message.key));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Chat with the assistant"
      footer={
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Message the assistant</span>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_TEXT}
              autoComplete="off"
              enterKeyHint="send"
              className="block min-h-12 w-full rounded-control bg-sunken px-3 text-base text-ink"
            />
          </label>
          <Button type="submit" disabled={draft.trim() === "" || loading}>
            Send
          </Button>
        </form>
      }
    >
      {messages.length === 0 && (
        <div className="space-y-3">
          <p className="text-ink-soft">Ask about today&apos;s menu, prices or pickup times.</p>
          <div role="group" aria-label="Suggestions" className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="min-h-11 rounded-chip bg-sunken px-4 text-sm font-semibold text-ink transition-colors duration-150"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div role="log" aria-live="polite" aria-label="Conversation" className="space-y-3">
        {messages.map((m) => (
          <div key={m.key} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-card px-4 py-2.5",
                m.role === "user" ? "bg-brand text-on-brand" : "bg-sunken text-ink",
              )}
            >
              <p>
                <span className="sr-only">{m.role === "user" ? "You: " : "Assistant: "}</span>
                {m.text}
              </p>
              {m.add && (
                <div className="mt-2 space-y-2">
                  <ul className="flex flex-wrap gap-2">
                    {m.add.map((l) => (
                      <li key={l.id} className="rounded-chip bg-surface px-3 py-1.5 text-sm font-semibold text-ink">
                        {l.name}
                        {l.qty > 1 && <span className="num"> × {l.qty}</span>}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="secondary"
                    disabled={added.has(m.key)}
                    onClick={() => addAll(m)}
                    className="min-h-11"
                  >
                    {added.has(m.key) ? "Added ✓" : "Add to cart"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-sm text-ink-faint">Thinking…</p>}
        <div ref={end} />
      </div>
    </Sheet>
  );
}
