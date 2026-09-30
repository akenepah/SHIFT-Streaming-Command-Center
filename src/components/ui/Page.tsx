import type { ReactNode } from "react";

/** Page title block with optional supporting context and right-aligned actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Legacy name retained for compatibility. Rendered as quiet context, never as a decorative kicker. */
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
      <div className="min-w-0 max-w-3xl">
        <h1 className="font-display text-page-title text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-body text-ink-2">{subtitle}</p>}
        {eyebrow && <p className="mt-2 text-body-sm text-ink-3">{eyebrow}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Form/content section. Use rules and spacing instead of card chrome for basic grouping. */
export function SectionCard({
  title,
  description,
  children,
  className = "",
  headerAside,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  headerAside?: ReactNode;
}) {
  return (
    <section className={`border-t border-line pt-6 ${className}`}>
      {(title || headerAside) && (
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <div className="max-w-2xl">
            {title && <h2 className="font-display text-section-title text-ink">{title}</h2>}
            {description && <p className="mt-1.5 text-body text-ink-2">{description}</p>}
          </div>
          {headerAside}
        </div>
      )}
      {children}
    </section>
  );
}
