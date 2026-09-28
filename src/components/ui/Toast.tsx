"use client";

import { CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastTone = "success" | "info";
type ToastItem = { id: number; message: string; tone: ToastTone };

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

/** One consistent, temporary toast, bottom-right so it never covers page controls. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 3200);
    },
    [dismiss],
  );
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CircleCheck : Info;
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-start gap-2.5 rounded-card border border-line bg-surface-raised px-3.5 py-3 text-body-sm text-ink shadow-popover"
            >
              <Icon aria-hidden className={`mt-px size-4 shrink-0 ${t.tone === "success" ? "text-success" : "text-info"}`} />
              <span className="flex-1">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="-m-1 rounded p-1 text-ink-3 hover:text-ink"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
