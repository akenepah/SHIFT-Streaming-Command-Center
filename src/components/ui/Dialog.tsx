"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
};

const WIDTH = { sm: "w-[440px]", md: "w-[560px]", lg: "w-[760px]" };

/**
 * Modal built on the native <dialog>: focus is trapped, Escape closes it,
 * and focus returns to the opener when it closes.
 */
export function Dialog({ open, onClose, title, description, children, footer, width = "md" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    // Remember the opener ourselves: callers often unmount the dialog on close,
    // which skips the browser's own focus restore.
    const opener = document.activeElement as HTMLElement | null;
    if (!el.open) el.showModal();
    // showModal() focuses the first control; honor an explicit [data-autofocus] instead.
    el.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (el.open) el.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`${WIDTH[width]} max-h-[88dvh] max-w-[calc(100vw-32px)] rounded-panel border border-line bg-surface-raised p-0 text-ink shadow-overlay`}
    >
      {open && (
        <div className="flex max-h-[88dvh] flex-col">
          <div className="flex items-start gap-4 px-6 pb-4 pt-5">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-display text-card-title">
                {title}
              </h2>
              {description && (
                <div id={descId} className="mt-1 text-body-sm text-ink-2">
                  {description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-2 -mt-1 inline-flex size-11 items-center justify-center rounded-control text-ink-3 hover:bg-surface-muted hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 pb-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-line px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
