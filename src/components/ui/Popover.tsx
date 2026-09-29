"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Small anchored surface (no arrow, no backdrop). Placed next to the anchor
 * element, flipped to stay inside the viewport. Escape or an outside click
 * closes it, and focus returns to the anchor.
 */
export function AnchoredPopover({
  anchor,
  onClose,
  label,
  width = 240,
  placement = "side",
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  label: string;
  width?: number;
  /** "side": beside the anchor (default). "below-end": under it, right edges aligned (header menus). */
  placement?: "side" | "below-end";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 0;
      if (placement === "below-end") {
        const w = Math.min(width, window.innerWidth - 16);
        setPos({ top: a.bottom + 6, left: Math.max(8, Math.min(a.right - w, window.innerWidth - w - 8)) });
        return;
      }
      let left = a.right + 8;
      if (left + width > window.innerWidth - 8) left = Math.max(8, a.left - width - 8);
      let top = a.top;
      if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
      setPos({ top, left });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(ref.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, width, placement]);

  useEffect(() => {
    if (!anchor) return;
    const el = ref.current;
    el?.querySelector<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        anchor.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (el && !el.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: placement === "below-end" ? `min(${width}px, calc(100vw - 16px))` : width }}
      className="fixed z-40 max-h-[calc(100dvh-16px)] overflow-y-auto rounded-card border border-line bg-surface-raised p-1.5 shadow-popover"
    >
      {children}
    </div>
  );
}

/** Menu item for popovers and action menus. */
export function MenuItem({
  onSelect,
  children,
  tone = "default",
  disabled,
}: {
  onSelect: () => void;
  children: ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={`flex min-h-9 w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-body-sm disabled:text-ink-3 [&_svg]:size-4 ${
        tone === "danger" ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-surface-muted"
      }`}
    >
      {children}
    </button>
  );
}

export function MenuDivider() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}

/** Ellipsis button that opens an anchored action menu. */
export function ActionMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const id = useId();
  const close = () => setAnchor(null);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-controls={anchor ? id : undefined}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-surface-muted hover:text-ink"
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </button>
      {anchor && (
        <AnchoredPopover anchor={anchor} onClose={close} label={label} width={208}>
          <div id={id} role="menu" aria-label={label}>
            {children(close)}
          </div>
        </AnchoredPopover>
      )}
    </>
  );
}
