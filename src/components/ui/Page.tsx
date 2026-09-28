import type { ReactNode } from "react";

/** Page title block with right-aligned actions on one horizontal axis. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="font-display text-page-title text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-body text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/** One surface per form/content section. No nested cards inside. */
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
    <section className={`rounded-panel border border-line bg-surface p-6 ${className}`}>
      {(title || headerAside) && (
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <div>
            {title && <h2 className="font-display text-section-title text-ink">{title}</h2>}
            {description && <p className="mt-2 text-body text-ink-2">{description}</p>}
          </div>
          {headerAside}
        </div>
      )}
      {children}
    </section>
  );
}
