"use client";

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

const WIDTH = { sm: "w-[420px]", md: "w-[560px]", lg: "w-[760px]" };

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
      className={`${WIDTH[width]} max-h-[85vh] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && (
                <div id={descId} className="mt-0.5 text-[13px] text-ink-2">
                  {description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 rounded-md p-1 text-ink-3 hover:bg-canvas hover:text-ink"
            >
              <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
