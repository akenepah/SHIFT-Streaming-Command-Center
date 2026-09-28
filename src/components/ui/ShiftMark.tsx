/**
 * SHIFT mark: two offset bars, a line "shifting" over. Colors come from tokens,
 * so the mark follows any retheme. Drawn for the dark navigation surface.
 */
export function ShiftMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" className="fill-nav-active" />
      <rect x="7" y="9.5" width="13" height="5" rx="2.5" className="fill-primary" />
      <rect x="12" y="17.5" width="13" height="5" rx="2.5" className="fill-primary" />
      <circle cx="9.5" cy="20" r="2.5" className="fill-accent" />
    </svg>
  );
}
