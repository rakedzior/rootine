import type { ReactNode } from "react";

export type StatTone = "default" | "accent" | "success" | "warning" | "danger";

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
}

/**
 * A single summary figure: quiet label, prominent number, optional context line.
 * Extracted from the Sprawy overview, which had the clearest version of this pattern.
 *
 * Use in a ContentGrid row at the top of a module.
 * Do not use for anything interactive — a stat that navigates is a ListRow.
 */
export function StatCard({ label, value, hint, tone = "default", className = "" }: StatCardProps) {
  const classes = ["ui-stat-card", tone === "default" ? "" : `ui-stat-card--${tone}`, className]
    .filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <span className="ui-stat-card__label">{label}</span>
      <strong className="ui-stat-card__value">{value}</strong>
      {hint && <small className="ui-stat-card__hint">{hint}</small>}
    </div>
  );
}

export interface StatGridProps {
  children: ReactNode;
  className?: string;
}

/** Responsive row of StatCards: auto-fit columns, collapsing to one below --bp-mobile. */
export function StatGrid({ children, className = "" }: StatGridProps) {
  return <div className={`ui-stat-grid ${className}`.trim()}>{children}</div>;
}
