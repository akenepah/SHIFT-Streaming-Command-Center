/**
 * SHIFT wordmark: three stacked, slanted bars plus "SHIFT" in the wordmark
 * face (Montserrat ExtraBold Italic, used nowhere else). Colors come from
 * tokens, drawn for the dark navigation surface.
 */
export function ShiftMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 22" aria-hidden className={className}>
      <path d="M6 1h20l-2 4H4z" className="fill-primary" />
      <path d="M4 9h20l-2 4H2z" className="fill-primary" />
      <path d="M2 17h20l-2 4H0z" className="fill-primary" />
    </svg>
  );
}

export function ShiftWordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <ShiftMark className="h-5 w-6" />
      <span className="font-wordmark text-wordmark font-extrabold italic tracking-tight text-nav-ink">SHIFT</span>
    </span>
  );
}
