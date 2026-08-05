import type { HTMLAttributes, ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export interface ContentHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  mobileNavigation?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  controls?: ReactNode;
  below?: ReactNode;
  headingLevel?: 1 | 2 | 3 | false;
  innerClassName?: string;
}

/**
 * The shared toolbar/header for a view inside a page.
 *
 * PageShell owns the page frame without a display title. ContentHeader owns
 * the current-view heading, local navigation, filters and actions.
 */
export function ContentHeader({
  title,
  description,
  leading,
  mobileNavigation,
  meta,
  actions,
  controls,
  below,
  headingLevel = 1,
  innerClassName,
  className,
  ...props
}: ContentHeaderProps) {
  return (
    <header className={cx("ui-content-header", className)} {...props}>
      <div className={cx("ui-content-header__inner", innerClassName)}>
        <div className="ui-content-header__row">
          <div className="ui-content-header__identity">
            {mobileNavigation && <div className="ui-content-header__mobile-nav">{mobileNavigation}</div>}
            {leading && <div className="ui-content-header__leading">{leading}</div>}
            <div className="ui-content-header__copy">
              <div className="ui-content-header__heading">
                {headingLevel === false
                  ? <div className="ui-content-header__title" role="presentation">{title}</div>
                  : headingLevel === 1
                    ? <h1 className="ui-content-header__title">{title}</h1>
                    : headingLevel === 3
                      ? <h3 className="ui-content-header__title">{title}</h3>
                      : <h2 className="ui-content-header__title">{title}</h2>}
                {meta && <div className="ui-content-header__meta">{meta}</div>}
              </div>
              {description && <p className="ui-content-header__description">{description}</p>}
            </div>
          </div>
          {actions && <div className="ui-content-header__actions">{actions}</div>}
        </div>
        {controls && <div className="ui-content-header__controls">{controls}</div>}
        {below && <div className="ui-content-header__below">{below}</div>}
      </div>
    </header>
  );
}
