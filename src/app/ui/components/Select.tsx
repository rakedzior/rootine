import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  compact?: boolean;
  fieldClassName?: string;
}

type MenuPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  above: boolean;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id,
    label,
    hint,
    error,
    options,
    compact = false,
    fieldClassName = "",
    className = "",
    value,
    defaultValue,
    disabled,
    onChange,
    onBlur,
    "aria-describedby": describedBy,
    ...props
  },
  forwardedRef,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const triggerId = `${controlId}-trigger`;
  const listboxId = `${controlId}-listbox`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const descriptionIds = [describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;
  const selectRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(() => String(defaultValue ?? options[0]?.value ?? ""));
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selectedValue = value === undefined ? internalValue : String(value);
  const selectedOption = options.find((option) => option.value === selectedValue) ?? options[0];
  const enabledIndexes = useMemo(
    () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0),
    [options],
  );

  useImperativeHandle(forwardedRef, () => selectRef.current as HTMLSelectElement);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportGap = 12;
    const preferredHeight = Math.min(320, options.length * 44 + 10);
    const below = window.innerHeight - rect.bottom - viewportGap;
    const above = rect.top - viewportGap;
    const opensAbove = below < Math.min(preferredHeight, 180) && above > below;
    const maxHeight = Math.max(120, Math.min(preferredHeight, opensAbove ? above : below));
    setPosition({
      left: Math.max(viewportGap, Math.min(rect.left, window.innerWidth - rect.width - viewportGap)),
      top: opensAbove ? rect.top - Math.min(preferredHeight, maxHeight) - 6 : rect.bottom + 6,
      width: rect.width,
      maxHeight,
      above: opensAbove,
    });
  };

  const close = (restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openMenu = () => {
    if (disabled || !options.length) return;
    const selectedIndex = options.findIndex((option) => option.value === selectedValue && !option.disabled);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : enabledIndexes[0] ?? -1);
    setOpen(true);
    requestAnimationFrame(updatePosition);
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const handleViewportChange = () => updatePosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, options.length]);

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    if (value === undefined) setInternalValue(option.value);
    const nativeSelect = selectRef.current;
    if (nativeSelect) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(nativeSelect, option.value);
      nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close(true);
  };

  const moveHighlight = (direction: 1 | -1) => {
    if (!enabledIndexes.length) return;
    const currentPosition = enabledIndexes.indexOf(highlightedIndex);
    const nextPosition = currentPosition < 0
      ? (direction === 1 ? 0 : enabledIndexes.length - 1)
      : (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    setHighlightedIndex(enabledIndexes[nextPosition]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openMenu();
      else moveHighlight(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setHighlightedIndex(enabledIndexes[0] ?? -1);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setHighlightedIndex(enabledIndexes.at(-1) ?? -1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      const option = options[highlightedIndex];
      if (option) choose(option);
    }
  };

  return (
    <div className={`ui-field ${fieldClassName}`.trim()}>
      {label && <label className="ui-field__label" htmlFor={triggerId}>{label}</label>}
      <select
        ref={selectRef}
        id={controlId}
        className="ui-select-native"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        disabled={disabled}
        onChange={onChange}
        onBlur={onBlur}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open && highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionIds}
        disabled={disabled}
        className={`ui-field__control ui-select-trigger ${compact ? "ui-select-trigger--compact" : ""} ${open ? "is-open" : ""} ${className}`.trim()}
        onClick={() => open ? close() : openMenu()}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (!open) onBlur?.(event as never);
        }}
      >
        <span className="ui-select-trigger__value">{selectedOption?.label ?? "Wybierz"}</span>
        <ChevronDown className="ui-select-trigger__chevron" size={14} aria-hidden="true" />
      </button>
      {hint && <p id={hintId} className="ui-field__hint">{hint}</p>}
      {error && <p id={errorId} className="ui-field__error" role="alert">{error}</p>}

      {open && position && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? triggerId : undefined}
          className={`ui-select-menu ${position.above ? "ui-select-menu--above" : ""}`.trim()}
          style={{
            left: position.left,
            top: position.top,
            width: position.width,
            maxHeight: position.maxHeight,
          }}
        >
          {options.map((option, index) => {
            const selected = option.value === selectedValue;
            return (
              <button
                key={option.value}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                className={`ui-select-option ${highlightedIndex === index ? "is-highlighted" : ""} ${selected ? "is-selected" : ""}`.trim()}
                onMouseEnter={() => !option.disabled && setHighlightedIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span className="ui-select-option__copy">
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
                {selected && <Check size={13} aria-hidden="true" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
});
