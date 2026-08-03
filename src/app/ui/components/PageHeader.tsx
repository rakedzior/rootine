import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, leading, meta, actions, below, className = "" }: PageHeaderProps) {
  return (
    <header className={`ui-page-header ${className}`.trim()}>
      <div className="ui-page-header__row">
        <div className="ui-page-header__identity">
          {leading && <div className="ui-page-header__leading">{leading}</div>}
          <div className="ui-page-header__copy">
            <div className="ui-page-header__heading">
              <h1 className="ui-page-header__title">{title}</h1>
              {meta && <div className="ui-page-header__meta">{meta}</div>}
            </div>
            {description && <p className="ui-page-header__description">{description}</p>}
          </div>
        </div>
        {actions && <div className="ui-page-header__actions">{actions}</div>}
      </div>
      {below && <div className="ui-page-header__below">{below}</div>}
    </header>
  );
}
