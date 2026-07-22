import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`ui-empty-state ${className}`.trim()}>
      {icon && <div className="ui-empty-state__icon" aria-hidden="true">{icon}</div>}
      <p className="ui-empty-state__title">{title}</p>
      {description && <p className="ui-empty-state__description">{description}</p>}
      {action && <div className="ui-empty-state__action">{action}</div>}
    </div>
  );
}
