"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Horizontal scroller for the seven day columns. Below the width where all
 * seven fit, it scrolls, with edge fades (and a hint) showing there's more.
 */
export function WeekGridScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);
  const scrollable = edges.left || edges.right;
  return (
    <div className="relative">
      {scrollable && <p className="mb-2 text-caption text-ink-2">Scroll sideways to compare all seven days →</p>}
      <div ref={ref} id="week-grid" tabIndex={-1} className="overflow-x-auto pb-2 focus:outline-none">
        {children}
      </div>
      <div aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-canvas to-transparent transition-opacity ${edges.left ? "opacity-100" : "opacity-0"}`} />
      <div aria-hidden className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-canvas to-transparent transition-opacity ${edges.right ? "opacity-100" : "opacity-0"}`} />
    </div>
  );
}
