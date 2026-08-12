import { useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AnchoredPopover } from "./AnchoredPopover";
import { Menu, MenuItem, type MenuItemTone } from "./Menu";

export interface PropertyMenuOption {
  value: string;
  label: string;
  leadingIcon?: ReactNode;
  meta?: ReactNode;
  tone?: MenuItemTone;
  className?: string;
  disabled?: boolean;
}

export type PropertyMenuDensity = "compact" | "standard";

export interface PropertyMenuProps {
  value: string;
  options: PropertyMenuOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  children: ReactNode;
  id?: string;
  density?: PropertyMenuDensity;
  layer?: "popover" | "featurePopup" | "nestedPopover" | "systemOverlay" | "drawer";
  align?: "start" | "end";
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  title?: string;
  triggerProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onChange" | "value">;
}

/** Icon/property trigger plus an accessible, managed selection menu. */
export function PropertyMenu({
  value,
  options,
  onChange,
  ariaLabel,
  children,
  id,
  density = "compact",
  layer = "popover",
  align = "start",
  className = "",
  triggerClassName = "",
  disabled,
  title,
  triggerProps,
}: PropertyMenuProps) {
  const generatedId = useId();
  const menuId = id ?? `${generatedId}-menu`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className={`ui-property-menu ui-property-menu--${density} ${className}`.trim()}>
      <button
        {...triggerProps}
        ref={triggerRef}
        type="button"
        className={`ui-property-menu__trigger ${triggerClassName}`.trim()}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        title={title}
        onClick={(event) => {
          triggerProps?.onClick?.(event);
          if (!event.defaultPrevented) setOpen((current) => !current);
        }}
      >
        {children}
      </button>
      <AnchoredPopover
        open={open}
        anchorRef={triggerRef}
        onDismiss={close}
        align={align}
        layer={layer}
        minWidth={190}
        className="ui-property-menu__popover"
        dismissOnFocusOutside={false}
      >
        <Menu
          id={menuId}
          aria-label={ariaLabel}
          triggerRef={triggerRef}
          onDismiss={close}
          initialFocus="selected"
          dismissOnFocusOut={false}
        >
          {options.map((option) => (
            <MenuItem
              key={option.value}
              leadingIcon={option.leadingIcon}
              trailingIcon={option.meta}
              tone={option.tone}
              className={option.className}
              selected={option.value === value}
              aria-label={[
                option.label,
                typeof option.meta === "string" || typeof option.meta === "number" ? option.meta : undefined,
              ].filter(Boolean).join(" ")}
              aria-checked={option.value === value}
              role="menuitemradio"
              disabled={option.disabled}
              onClick={() => {
                if (option.disabled) return;
                onChange(option.value);
                close();
                requestAnimationFrame(() => triggerRef.current?.focus());
              }}
            >
              {option.label}
            </MenuItem>
          ))}
        </Menu>
      </AnchoredPopover>
    </div>
  );
}
