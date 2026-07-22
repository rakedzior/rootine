import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export interface MenuProps extends HTMLAttributes<HTMLDivElement> {}

export const Menu = forwardRef<HTMLDivElement, MenuProps>(function Menu({ className, onKeyDown, ...props }, ref) {
  return <div
    ref={ref}
    role="menu"
    className={cx("ui-menu", className)}
    onKeyDown={(event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']:not([aria-disabled='true']):not(:disabled)"));
      if (!items.length) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex = currentIndex < 0
        ? event.key === "ArrowUp" || event.key === "End" ? items.length - 1 : 0
        : event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowUp"
            ? (currentIndex - 1 + items.length) % items.length
            : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    }}
    {...props}
  />;
});

export type MenuItemTone = "default" | "primary" | "success" | "danger";

export interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  selected?: boolean;
  tone?: MenuItemTone;
}

export function MenuItem({ className, children, leadingIcon, trailingIcon, selected = false, tone = "default", type = "button", ...props }: MenuItemProps) {
  return (
    <button
      type={type}
      role="menuitem"
      className={cx("ui-menu-item", `ui-menu-item--${tone}`, selected && "is-selected", className)}
      {...props}
    >
      {leadingIcon && <span className="ui-menu-item__icon" aria-hidden="true">{leadingIcon}</span>}
      <span className="ui-menu-item__label">{children}</span>
      {trailingIcon && <span className="ui-menu-item__trailing" aria-hidden="true">{trailingIcon}</span>}
    </button>
  );
}
