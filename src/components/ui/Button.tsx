import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet-danger";
type Size = "sm" | "md" | "icon" | "icon-sm";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed disabled:bg-primary/40 disabled:text-on-primary/60",
  secondary:
    "border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-muted disabled:text-ink-3",
  ghost: "text-ink-2 hover:bg-surface-muted hover:text-ink disabled:text-ink-3",
  danger: "bg-danger text-ink-inverse hover:bg-danger/90 disabled:bg-danger/45",
  "quiet-danger": "text-danger hover:bg-danger-soft disabled:text-ink-3",
};

/** 44px is the desktop control baseline; sm is for dense rows. */
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-body-sm gap-1.5",
  md: "h-11 px-4 text-body gap-2",
  icon: "h-11 w-11",
  "icon-sm": "h-8 w-8",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-control font-semibold transition-colors disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    />
  );
});
