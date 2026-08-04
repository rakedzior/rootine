import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
  showTitle?: boolean;
  className?: string;
}

export function PageHeader({
  title,
  description,
  leading,
  meta,
  actions,
  below,
  showTitle = false,
  className = "",
}: PageHeaderProps) {
  const hasCopy = showTitle || description || meta;

  return (
    <header className={`ui-page-header ${!showTitle ? "ui-page-header--titleless" : ""} ${className}`.trim()}>
      <div className="ui-page-header__row">
        <div className="ui-page-header__identity">
          {leading && <div className="ui-page-header__leading">{leading}</div>}
          {hasCopy && <div className="ui-page-header__copy">
            {showTitle
              ? <div className="ui-page-header__heading">
                <div className="ui-page-header__title" role="presentation">{title}</div>
                {meta && <div className="ui-page-header__meta">{meta}</div>}
              </div>
              : meta && <div className="ui-page-header__meta">{meta}</div>}
            {description && <p className="ui-page-header__description">{description}</p>}
          </div>}
        </div>
        {actions && <div className="ui-page-header__actions">{actions}</div>}
      </div>
      {below && <div className="ui-page-header__below">{below}</div>}
    </header>
  );
}
