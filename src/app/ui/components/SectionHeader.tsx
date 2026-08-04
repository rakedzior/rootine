import type { ReactNode } from "react";

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  actions?: ReactNode;
  count?: ReactNode;
  meta?: ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  level?: 2 | 3 | 4;
  variant?: "title" | "label";
  className?: string;
}

export function SectionHeader({
  title,
  description,
  action,
  actions,
  count,
  meta,
  collapsible = false,
  collapsed = false,
  onToggle,
  level = 2,
  variant = "title",
  className = "",
}: SectionHeaderProps) {
  const Heading = `h${level}` as "h2" | "h3" | "h4";
  const heading = (
    <div className="ui-section-header__heading">
      <Heading className="ui-section-header__title">{title}</Heading>
      {count !== undefined && <span className="ui-section-header__count">{count}</span>}
      {meta && <span className="ui-section-header__meta">{meta}</span>}
    </div>
  );
  return (
    <div className={`ui-section-header ${variant === "label" ? "ui-section-header--label" : ""} ${className}`.trim()}>
      <div className="ui-section-header__body">
        {collapsible ? (
          <button type="button" className="ui-section-header__toggle" aria-expanded={!collapsed} onClick={onToggle}>
            {heading}
          </button>
        ) : heading}
        {description && <p className="ui-section-header__description">{description}</p>}
      </div>
      {actions ?? action}
    </div>
  );
}
