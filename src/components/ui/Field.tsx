import { ChevronDown, Minus, Plus } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export const controlClass =
  "h-11 w-full rounded-control border border-line bg-surface px-3.5 text-body text-ink placeholder:text-ink-3 hover:border-line-strong disabled:bg-surface-muted disabled:text-ink-3";

export function Field({
  id,
  label,
  help,
  error,
  children,
  className = "",
}: {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-label text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-caption text-danger">{error}</p>
      ) : (
        help && <p className="mt-1.5 text-caption text-ink-3">{help}</p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...props },
  ref,
) {
  return <input ref={ref} className={`${controlClass} ${className}`} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = "", children, ...props },
  ref,
) {
  return (
    <div className={`relative ${className}`}>
      <select ref={ref} className={`${controlClass} appearance-none pr-10`} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
    </div>
  );
});

/** Minus / count / plus control used for lineup slot counts. */
export function Stepper({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 10,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const n = Number.isFinite(value) ? value : min;
  return (
    <div className="flex h-11 items-center rounded-control border border-line bg-surface">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(Math.max(min, n - 1))}
        disabled={n <= min}
        className="flex h-full w-11 items-center justify-center rounded-l-control text-ink-2 hover:bg-surface-muted disabled:text-line-strong"
      >
        <Minus aria-hidden className="size-4" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-body tabular-nums text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(Math.min(max, n + 1))}
        disabled={n >= max}
        className="flex h-full w-11 items-center justify-center rounded-r-control text-ink-2 hover:bg-surface-muted disabled:text-line-strong"
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul role="alert" className="rounded-control border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-danger">
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}
