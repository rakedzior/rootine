import type { ReactNode } from "react";

export type SummaryStripTone = "neutral" | "primary" | "success" | "warning" | "danger";

export interface SummaryStripItem {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: SummaryStripTone;
}

export interface SummaryStripProps {
  items: readonly SummaryStripItem[];
  label?: string;
  className?: string;
}

/**
 * A compact, shared summary row for operational screens. It keeps related signals
 * on one visual plane without turning them into a dashboard of equal-weight cards.
 */
export function SummaryStrip({ items, label, className = "" }: SummaryStripProps) {
  return (
    <dl className={`ui-summary-strip ui-summary-strip--${items.length} ${className}`.trim()} aria-label={label}>
      {items.map((item, index) => (
        <div key={index} className={`ui-summary-strip__item ui-summary-strip__item--${item.tone ?? "neutral"}`}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.note !== undefined && <dd className="ui-summary-strip__note">{item.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
