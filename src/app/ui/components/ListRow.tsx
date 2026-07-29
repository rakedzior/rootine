import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ListRowDensity = "compact" | "default" | "comfortable";

interface ListRowOwnProps {
  /**
   * Fixed-width "when" column rendered before everything else, so values line up down the
   * list. The unit belongs to the section: a clock time inside a single day, "9 dni" in an
   * overdue group. Leave empty (not absent) for rows that have no value, so the rest of the
   * row stays aligned.
   */
  rail?: ReactNode;
  /** Checkbox, icon or status dot. Fixed-width so titles align down the column. */
  leading?: ReactNode;
  title: ReactNode;
  /**
   * Makes the title itself the click target instead of the whole row. Use this whenever the
   * row also contains controls (a checkbox, removable tags): a row-level <button> would nest
   * interactive elements, which is invalid and breaks keyboard and screen-reader use.
   */
  onTitleClick?: () => void;
  /** Accessible name for the title button. Required when `onTitleClick` is set. */
  titleLabel?: string;
  /** Secondary line under the title. */
  subtitle?: ReactNode;
  /** Facts about the row (dates, amounts, tags). */
  meta?: ReactNode;
  /**
   * `inline` places meta right after the title, so the eye does not cross an empty gutter.
   * `end` keeps meta in an aligned right-hand column — use it for table-like rows where
   * comparing values down the column is the point.
   */
  metaAlign?: "inline" | "end";
  /** Actions, tags or a chevron, always pinned to the right edge. */
  trailing?: ReactNode;
  density?: ListRowDensity;
  /**
   * Hairline between rows. Right for table-like lists where rows are records to compare;
   * wrong for dense working lists, where a rule under every line is noise.
   */
  divided?: boolean;
  selected?: boolean;
  /** Dims the row without changing its height or layout. */
  completed?: boolean;
  className?: string;
}

export type ListRowProps = ListRowOwnProps
  & Omit<ButtonHTMLAttributes<HTMLElement>, keyof ListRowOwnProps | "title">
  & { as?: "div" | "button" };

/**
 * One row of a homogeneous list. Heights come from --row-height-*, so rows in different
 * modules share a rhythm.
 *
 * Use for lists of comparable items with at most one primary action.
 * Do not use for variable-height content (notes, long descriptions) — that is a Card.
 */
export const ListRow = forwardRef<HTMLElement, ListRowProps>(function ListRow(
  {
    rail,
    leading,
    title,
    onTitleClick,
    titleLabel,
    subtitle,
    meta,
    metaAlign = "inline",
    trailing,
    density = "default",
    divided = true,
    selected = false,
    completed = false,
    as,
    className = "",
    ...props
  },
  ref,
) {
  // A row-level button cannot contain other controls, so `onTitleClick` always wins.
  const interactive = !onTitleClick
    && (as === "button" || (as === undefined && typeof props.onClick === "function"));
  const Component = (interactive ? "button" : "div") as "button";
  const classes = [
    "ui-list-row",
    `ui-list-row--${density}`,
    `ui-list-row--meta-${metaAlign}`,
    divided ? "ui-list-row--divided" : "",
    (interactive || onTitleClick) ? "ui-list-row--interactive" : "",
    selected ? "is-selected" : "",
    completed ? "is-completed" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <Component
      ref={ref as never}
      className={classes}
      aria-current={selected ? "true" : undefined}
      {...(interactive ? { type: "button" as const } : {})}
      {...props}
    >
      {rail !== undefined && <span className="ui-list-row__rail">{rail}</span>}
      {leading && <span className="ui-list-row__leading">{leading}</span>}
      {onTitleClick ? (
        <button
          type="button"
          className="ui-list-row__copy ui-list-row__copy--action"
          aria-label={titleLabel}
          aria-pressed={selected}
          onClick={onTitleClick}
        >
          <span className="ui-list-row__title">{title}</span>
          {subtitle && <small className="ui-list-row__subtitle">{subtitle}</small>}
        </button>
      ) : (
        <span className="ui-list-row__copy">
          <span className="ui-list-row__title">{title}</span>
          {subtitle && <small className="ui-list-row__subtitle">{subtitle}</small>}
        </span>
      )}
      {meta && <span className="ui-list-row__meta">{meta}</span>}
      {trailing && <span className="ui-list-row__trailing">{trailing}</span>}
    </Component>
  );
});
