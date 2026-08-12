import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOptionTone = "default" | "primary" | "success" | "warning" | "danger" | "violet";
export type SelectDensity = "compact" | "standard";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  leadingIcon?: ReactNode;
  meta?: ReactNode;
  tone?: SelectOptionTone;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  density?: SelectDensity;
  /** @deprecated Use density="compact". */
  compact?: boolean;
  fieldClassName?: string;
  menuPlacement?: "start" | "end";
  menuClassName?: string;
}

type MenuPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  above: boolean;
};

const TYPEAHEAD_RESET_MS = 700;

function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pl-PL");
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id,
    label,
    hint,
    error,
    options,
    density: densityProp,
    compact = false,
    fieldClassName = "",
    menuPlacement = "start",
    menuClassName = "",
    className = "",
    value,
    defaultValue,
    disabled,
    required,
    onChange,
    onBlur,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": describedBy,
    "aria-invalid": ariaInvalid,
    "aria-required": ariaRequired,
    ...nativeProps
  },
  forwardedRef,
) {
  const generatedId = useId();
  const density = densityProp ?? (compact ? "compact" : "standard");
  const controlId = id ?? generatedId;
  const triggerId = `${controlId}-trigger`;
  const labelId = `${controlId}-label`;
  const hiddenLabelId = `${controlId}-accessible-label`;
  const valueId = `${controlId}-value`;
  const listboxId = `${controlId}-listbox`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const descriptionIds = [describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;
  const selectRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeaheadBufferRef = useRef("");
  const typeaheadTimerRef = useRef<number | null>(null);
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
  const fallbackLabel = !label && !ariaLabelledBy && !ariaLabel ? "Wybierz opcję" : undefined;
  const purposeLabelId = ariaLabelledBy ?? (label ? labelId : ariaLabel || fallbackLabel ? hiddenLabelId : undefined);
  const triggerLabelledBy = [purposeLabelId, valueId].filter(Boolean).join(" ") || undefined;
  const triggerInvalid = ariaInvalid ?? (error ? true : undefined);
  const triggerRequired = ariaRequired ?? (required ? true : undefined);

  useImperativeHandle(forwardedRef, () => selectRef.current as HTMLSelectElement);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportGap = 12;
    const preferredHeight = Math.min(320, options.length * 44 + 10);
    const below = Math.max(0, window.innerHeight - rect.bottom - viewportGap);
    const above = Math.max(0, rect.top - viewportGap);
    const opensAbove = below < Math.min(preferredHeight, 180) && above > below;
    const maxHeight = Math.max(48, Math.min(preferredHeight, opensAbove ? above : below));
    const availableWidth = Math.max(0, window.innerWidth - viewportGap * 2);
    const width = Math.min(Math.max(rect.width, 148), availableWidth);
    const preferredLeft = menuPlacement === "end" ? rect.right - width : rect.left;
    setPosition({
      left: Math.max(viewportGap, Math.min(preferredLeft, window.innerWidth - width - viewportGap)),
      top: opensAbove ? Math.max(viewportGap, rect.top - maxHeight - 6) : rect.bottom + 6,
      width,
      maxHeight,
      above: opensAbove,
    });
  }, [menuPlacement, options.length]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    typeaheadBufferRef.current = "";
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openMenu = (preferredIndex?: number) => {
    if (disabled || !enabledIndexes.length) return;
    const selectedIndex = options.findIndex((option) => option.value === selectedValue && !option.disabled);
    setHighlightedIndex(preferredIndex ?? (selectedIndex >= 0 ? selectedIndex : enabledIndexes[0] ?? -1));
    setOpen(true);
    requestAnimationFrame(updatePosition);
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const handleViewportChange = () => updatePosition();
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    const frame = requestAnimationFrame(() => {
      const option = menuRef.current
        ?.querySelector<HTMLElement>(`[data-option-index="${highlightedIndex}"]`);
      option?.scrollIntoView?.({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightedIndex, open]);

  useEffect(() => () => {
    if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current);
  }, []);

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

  const moveToTypeaheadMatch = (key: string) => {
    const normalizedKey = normalizeForSearch(key);
    const previousBuffer = typeaheadBufferRef.current;
    const repeatedCharacter = previousBuffer.length > 0
      && previousBuffer.split("").every((character) => character === normalizedKey)
      && previousBuffer[0] === normalizedKey;
    const nextBuffer = repeatedCharacter ? normalizedKey : `${previousBuffer}${normalizedKey}`;
    typeaheadBufferRef.current = nextBuffer;
    if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = window.setTimeout(() => {
      typeaheadBufferRef.current = "";
      typeaheadTimerRef.current = null;
    }, TYPEAHEAD_RESET_MS);

    const currentPosition = Math.max(-1, enabledIndexes.indexOf(highlightedIndex));
    const orderedIndexes = [
      ...enabledIndexes.slice(currentPosition + 1),
      ...enabledIndexes.slice(0, currentPosition + 1),
    ];
    const match = orderedIndexes.find((index) => normalizeForSearch(options[index].label).startsWith(nextBuffer));
    if (match === undefined) return;
    if (!open) openMenu(match);
    else setHighlightedIndex(match);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Tab" && open) {
      close();
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        const initialIndex = event.key === "ArrowUp" ? enabledIndexes.at(-1) : enabledIndexes[0];
        openMenu(initialIndex);
      } else {
        moveHighlight(event.key === "ArrowDown" ? 1 : -1);
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? enabledIndexes[0] : enabledIndexes.at(-1);
      if (nextIndex === undefined) return;
      if (!open) openMenu(nextIndex);
      else setHighlightedIndex(nextIndex);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      const option = options[highlightedIndex];
      if (option) choose(option);
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
      moveToTypeaheadMatch(event.key);
    }
  };

  return (
    <div className={`ui-field ${fieldClassName}`.trim()}>
      {label && <label id={labelId} className="ui-field__label" htmlFor={triggerId}>{label}</label>}
      {(ariaLabel || fallbackLabel) && <span id={hiddenLabelId} className="ui-sr-only">{ariaLabel ?? fallbackLabel}</span>}
      <select
        {...nativeProps}
        ref={selectRef}
        id={controlId}
        className="ui-select-native"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        disabled={disabled}
        required={required}
        onChange={onChange}
        onBlur={onBlur}
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
        aria-labelledby={triggerLabelledBy}
        aria-invalid={triggerInvalid}
        aria-required={triggerRequired}
        aria-describedby={descriptionIds}
        disabled={disabled || !options.length}
        className={`ui-field__control ui-select-trigger ui-select-trigger--${density} ${open ? "is-open" : ""} ${className}`.trim()}
        onClick={() => open ? close() : openMenu()}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (open) close();
          onBlur?.(event as unknown as FocusEvent<HTMLSelectElement>);
        }}
      >
        <span className="ui-select-trigger__content">
          {selectedOption?.leadingIcon && (
            <span className="ui-select-option__icon" aria-hidden="true">{selectedOption.leadingIcon}</span>
          )}
          <span id={valueId} className="ui-select-trigger__value">
            {selectedOption?.label ?? (options.length ? "Wybierz" : "Brak opcji")}
          </span>
        </span>
        {selectedOption?.meta && <span className="ui-select-trigger__meta">{selectedOption.meta}</span>}
        <ChevronDown className="ui-select-trigger__chevron" size={13} aria-hidden="true" />
      </button>
      {hint && <p id={hintId} className="ui-field__hint">{hint}</p>}
      {error && <p id={errorId} className="ui-field__error" role="alert">{error}</p>}

      {open && position && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={purposeLabelId}
          className={`ui-select-menu ui-select-menu--${density} ${position.above ? "ui-select-menu--above" : ""} ${menuClassName}`.trim()}
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
              <div
                key={option.value}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={selected}
                aria-disabled={option.disabled || undefined}
                data-option-index={index}
                className={`ui-select-option ui-select-option--${option.tone ?? "default"} ${highlightedIndex === index ? "is-highlighted" : ""} ${selected ? "is-selected" : ""}`.trim()}
                onPointerMove={() => !option.disabled && setHighlightedIndex(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.leadingIcon && (
                  <span className="ui-select-option__icon" aria-hidden="true">{option.leadingIcon}</span>
                )}
                <span className="ui-select-option__copy">
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
                <span className="ui-select-option__trailing">
                  {option.meta && <span className="ui-select-option__meta">{option.meta}</span>}
                  {selected && <Check size={13} aria-hidden="true" />}
                </span>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
});
