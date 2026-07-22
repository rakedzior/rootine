import type { ReactNode } from "react";

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  level?: 2 | 3 | 4;
  variant?: "title" | "label";
  className?: string;
}

export function SectionHeader({ title, description, action, level = 2, variant = "title", className = "" }: SectionHeaderProps) {
  const Heading = `h${level}` as "h2" | "h3" | "h4";
  return (
    <div className={`ui-section-header ${variant === "label" ? "ui-section-header--label" : ""} ${className}`.trim()}>
      <div>
        <Heading className="ui-section-header__title">{title}</Heading>
        {description && <p className="ui-section-header__description">{description}</p>}
      </div>
      {action}
    </div>
  );
}
