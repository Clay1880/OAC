"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ToastRegion, useToastModal } from "./Toast";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Pinned below the scrolling body, e.g. the checkout button. */
  footer?: ReactNode;
  className?: string;
};

/**
 * Bottom sheet on a native <dialog>: focus is trapped, Esc closes, the page behind is inert
 * and focus returns to the opener. Tapping the dimmed backdrop also closes it.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useToastModal(open);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cn("sheet", className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Esc: let the parent decide. Keep the dialog open until `open` flips so state never desyncs.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // `close` also fires when we call dialog.close() ourselves; only report user-initiated closes.
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 rounded-pill bg-line-strong/50" />
          <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-3">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-xl font-bold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-ink-soft">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 inline-flex size-12 shrink-0 items-center justify-center rounded-chip text-ink transition-colors duration-150 hover:bg-sunken"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
            {children}
          </div>
          {footer && (
            <footer className="border-t border-line bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              {footer}
            </footer>
          )}
          {/* Inside the dialog so toasts stay visible and interactive above the modal. */}
          <ToastRegion placement="top" />
        </>
      )}
    </dialog>
  );
}
