"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export type ToastTone = "success" | "error" | "info";

export type ToastOptions = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. Errors linger longer by default. */
  duration?: number;
};

type ToastItem = Required<Pick<ToastOptions, "title" | "tone" | "duration">> &
  Pick<ToastOptions, "description"> & { id: number };

type ToastApi = {
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const tone = options.tone ?? "info";
    const item: ToastItem = {
      id: nextId.current++,
      title: options.title,
      description: options.description,
      tone,
      duration: options.duration ?? (tone === "error" ? 7000 : 4000),
    };
    setItems((current) => [...current, item].slice(-MAX_VISIBLE));
    return item.id;
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const toneStyles: Record<ToastTone, { card: string; icon: ReactNode }> = {
  success: {
    card: "border-status-ready-dot",
    icon: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  },
  error: {
    card: "border-chili",
    icon: <path d="M12 7v6M12 17v.01" />,
  },
  info: {
    card: "border-line-strong",
    icon: <path d="M12 11v6M12 7v.01" />,
  },
};

const iconTone: Record<ToastTone, string> = {
  success: "bg-status-ready-dot text-on-chili",
  error: "bg-chili text-on-chili",
  info: "bg-ink text-paper",
};

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);

  // Hovering or focusing a toast holds it on screen so it can be read and dismissed.
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [paused, item.id, item.duration, onDismiss]);

  const { card, icon } = toneStyles[item.tone];

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-card border-2 bg-surface p-3 pl-3.5 shadow-lift motion-safe:animate-toast-in",
        card,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full", iconTone[item.tone])}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>
      <div className="min-w-0 flex-1 py-1">
        <p className="font-semibold leading-snug">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-sm text-ink-soft">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="-my-0.5 -mr-1 inline-flex size-12 shrink-0 items-center justify-center rounded-chip text-ink-soft transition-colors duration-150 hover:bg-sunken hover:text-ink"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
