import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { uiLayers } from "../tokens";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pl-PL");
}

export type MenuInitialFocus = "none" | "first" | "last" | "selected";
export type MenuLayer = keyof typeof uiLayers;
export type MenuSize = "standard" | "wide";
export type MenuDensity = "compact" | "standard" | "comfortable";

export interface MenuProps extends HTMLAttributes<HTMLDivElement> {
  triggerRef?: RefObject<HTMLElement | null>;
  onDismiss?: () => void;
  initialFocus?: MenuInitialFocus;
  restoreFocus?: boolean;
  dismissOnFocusOut?: boolean;
  /** Semantic stacking layer; dynamic geometry may still use `style`. */
  layer?: MenuLayer;
  /** Reusable width variant for menus with longer labels. */
  size?: MenuSize;
  /** Named row-height preset; compact preserves the historical 28px menu. */
  density?: MenuDensity;
}

function isTextEntryTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
  ));
}

const ManagedMenuContext = createContext(false);

export const Menu = forwardRef<HTMLDivElement, MenuProps>(function Menu(
  {
    className,
    children,
    onKeyDown,
    onBlur,
    triggerRef,
    onDismiss,
    initialFocus: initialFocusProp,
    restoreFocus = true,
    dismissOnFocusOut = true,
    layer,
    size = "standard",
    density = "compact",
    style,
    ...props
  },
  forwardedRef,
) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);
  const typeaheadBufferRef = useRef("");
  const typeaheadTimerRef = useRef<number | null>(null);
  const initialFocus = initialFocusProp ?? (onDismiss || triggerRef ? "first" : "none");
  const managed = initialFocus !== "none" || Boolean(onDismiss) || Boolean(triggerRef);

  useImperativeHandle(forwardedRef, () => menuRef.current as HTMLDivElement);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (initialFocus === "none") return;
    const frame = requestAnimationFrame(() => {
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(
        "[role^='menuitem']:not([aria-disabled='true']):not(:disabled)",
      ) ?? []);
      const target = initialFocus === "last"
        ? items.at(-1)
        : initialFocus === "selected"
          ? items.find((item) => item.getAttribute("aria-checked") === "true" || item.classList.contains("is-selected")) ?? items[0]
          : items[0];
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [initialFocus]);

  useEffect(() => {
    if (!onDismiss) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef?.current?.contains(target)) return;
      onDismissRef.current?.();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onDismiss, triggerRef]);

  useEffect(() => () => {
    if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current);
  }, []);

  const getItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>(
    "[role^='menuitem']:not([aria-disabled='true']):not(:disabled)",
  ) ?? []);

  const dismiss = (returnFocus: boolean) => {
    onDismissRef.current?.();
    if (returnFocus && restoreFocus) requestAnimationFrame(() => triggerRef?.current?.focus());
  };

  return (
    <ManagedMenuContext.Provider value={managed}>
      <div
        ref={menuRef}
        role="menu"
        aria-orientation="vertical"
        className={cx("ui-menu", `ui-menu--${size}`, `ui-menu--density-${density}`, className)}
        style={{
          ...style,
          ...(layer ? { zIndex: uiLayers[layer] as CSSProperties["zIndex"] } : {}),
        }}
        onBlur={(event) => {
          onBlur?.(event);
          if (
            !event.defaultPrevented
            && dismissOnFocusOut
            && onDismissRef.current
            && !event.currentTarget.contains(event.relatedTarget as Node | null)
            && !triggerRef?.current?.contains(event.relatedTarget as Node | null)
          ) {
            dismiss(false);
          }
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "Escape" && onDismissRef.current) {
            event.preventDefault();
            event.stopPropagation();
            dismiss(true);
            return;
          }
          if (event.key === "Tab" && onDismissRef.current) {
            dismiss(false);
            return;
          }
          // Search fields and other editable controls may be composed into a menu.
          // Their cursor, native select and text-entry keys take precedence over
          // menu roving focus and typeahead; Escape above still dismisses the layer.
          if (isTextEntryTarget(event.target)) return;

          const items = getItems();
          if (!items.length) return;
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
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
            return;
          }
          if (
            event.key.length === 1
            && event.key !== " "
            && !event.altKey
            && !event.ctrlKey
            && !event.metaKey
          ) {
            event.preventDefault();
            const normalizedKey = normalizeForSearch(event.key);
            const previousBuffer = typeaheadBufferRef.current;
            const repeatedCharacter = previousBuffer.length > 0
              && previousBuffer.split("").every((character) => character === normalizedKey)
              && previousBuffer[0] === normalizedKey;
            typeaheadBufferRef.current = repeatedCharacter ? normalizedKey : `${previousBuffer}${normalizedKey}`;
            if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current);
            typeaheadTimerRef.current = window.setTimeout(() => {
              typeaheadBufferRef.current = "";
              typeaheadTimerRef.current = null;
            }, 700);
            const currentIndex = Math.max(-1, items.indexOf(document.activeElement as HTMLElement));
            const orderedItems = [...items.slice(currentIndex + 1), ...items.slice(0, currentIndex + 1)];
            orderedItems
              .find((item) => normalizeForSearch(item.textContent ?? "").startsWith(typeaheadBufferRef.current))
              ?.focus();
          }
        }}
        {...props}
      >
        {children}
      </div>
    </ManagedMenuContext.Provider>
  );
});

export interface MenuTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  open: boolean;
  menuId: string;
}

export const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(function MenuTrigger(
  { open, menuId, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      {...props}
    />
  );
});

export type MenuItemTone = "default" | "primary" | "success" | "danger";

export interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  selected?: boolean;
  tone?: MenuItemTone;
}

export function MenuItem({
  className,
  children,
  leadingIcon,
  trailingIcon,
  selected = false,
  tone = "default",
  type = "button",
  tabIndex,
  ...props
}: MenuItemProps) {
  const managed = useContext(ManagedMenuContext);
  return (
    <button
      type={type}
      role="menuitem"
      tabIndex={tabIndex ?? (managed ? -1 : undefined)}
      className={cx("ui-menu-item", `ui-menu-item--${tone}`, selected && "is-selected", className)}
      {...props}
    >
      {leadingIcon && <span className="ui-menu-item__icon" aria-hidden="true">{leadingIcon}</span>}
      <span className="ui-menu-item__label">{children}</span>
      {trailingIcon && <span className="ui-menu-item__trailing" aria-hidden="true">{trailingIcon}</span>}
    </button>
  );
}
