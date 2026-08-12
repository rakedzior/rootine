import {
  forwardRef,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FocusEventHandler,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";
import { Check, Clock3 } from "lucide-react";
import { AnchoredPopover } from "./AnchoredPopover";

export interface TimePickerOption {
  value: string;
  label?: string;
  disabled?: boolean;
}

export type TimePickerDensity = "compact" | "standard";
export type TimePickerOptionsPresentation = "popover" | "inline";

export interface TimePickerProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size" | "value" | "defaultValue" | "onChange"
> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  error?: string;
  density?: TimePickerDensity;
  fieldClassName?: string;
  options?: Array<TimePickerOption | string>;
  optionsPresentation?: TimePickerOptionsPresentation;
  onOptionSelect?: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}

function toSeconds(value: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function isInTimeRange(value: string, min?: string | number, max?: string | number) {
  const candidate = toSeconds(value);
  const lower = typeof min === "string" ? toSeconds(min) : null;
  const upper = typeof max === "string" ? toSeconds(max) : null;
  if (candidate === null) return false;
  if (lower !== null && upper !== null && lower > upper) return candidate >= lower || candidate <= upper;
  return !(lower !== null && candidate < lower) && !(upper !== null && candidate > upper);
}

function followsStep(value: string, min: string | number | undefined, step: string | number | undefined) {
  if (step === "any") return true;
  const candidate = toSeconds(value);
  const base = typeof min === "string" ? toSeconds(min) ?? 0 : 0;
  const seconds = Number(step ?? 60);
  if (candidate === null || !Number.isFinite(seconds) || seconds <= 0) return true;
  return ((candidate - base) % seconds + seconds) % seconds === 0;
}

export const TimePicker = forwardRef<HTMLInputElement, TimePickerProps>(function TimePicker(
  {
    id,
    value,
    onChange,
    label,
    hint,
    error,
    density = "standard",
    fieldClassName = "",
    className = "",
    options = [],
    optionsPresentation = "popover",
    onOptionSelect,
    min,
    max,
    step,
    disabled,
    required,
    onBlur,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": describedBy,
    ...inputProps
  },
  forwardedRef,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const labelId = `${controlId}-label`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const listboxId = `${controlId}-options`;
  const descriptionIds = [describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const listTriggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const normalizedOptions = useMemo(() => options.map((option) => (
    typeof option === "string" ? { value: option, label: option } : { ...option, label: option.label ?? option.value }
  )), [options]);
  const selectedIndex = normalizedOptions.findIndex((option) => option.value === value && !option.disabled);
  const firstEnabledIndex = normalizedOptions.findIndex((option) => !option.disabled);
  const [activeIndex, setActiveIndex] = useState(() => selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);

  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

  const optionIsDisabled = (option: TimePickerOption) => Boolean(
    option.disabled
    || !isInTimeRange(option.value, min, max)
    || !followsStep(option.value, min, step),
  );

  const openOptions = () => {
    if (disabled || !normalizedOptions.some((option) => !optionIsDisabled(option))) return;
    const currentIndex = normalizedOptions.findIndex((option) => option.value === value && !optionIsDisabled(option));
    const availableIndex = normalizedOptions.findIndex((option) => !optionIsDisabled(option));
    setActiveIndex(currentIndex >= 0 ? currentIndex : availableIndex);
    setOpen(true);
  };

  const moveOptionFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='option']:not([aria-disabled='true'])"));
    if (!items.length) return;
    event.preventDefault();
    const currentPosition = items.indexOf(document.activeElement as HTMLElement);
    const nextPosition = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowUp"
          ? (currentPosition - 1 + items.length) % items.length
          : (currentPosition + 1) % items.length;
    items[nextPosition]?.focus();
  };

  const optionRows = normalizedOptions.map((option, index) => {
    const optionDisabled = optionIsDisabled(option);
    const selected = option.value === value;
    return (
      <button
        key={`${option.value}-${index}`}
        type="button"
        role="option"
        aria-selected={selected}
        aria-disabled={optionDisabled || undefined}
        disabled={optionDisabled}
        tabIndex={activeIndex === index ? 0 : -1}
        className={`ui-time-picker__option ${selected ? "is-selected" : ""}`.trim()}
        onFocus={() => setActiveIndex(index)}
        onClick={() => {
          onChange(option.value);
          onOptionSelect?.(option.value);
          setOpen(false);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <span>{option.label}</span>
        {selected && <Check size={13} aria-hidden="true" />}
      </button>
    );
  });

  return (
    <div className={`ui-field ui-time-picker ui-time-picker--${density} ${normalizedOptions.length ? "ui-time-picker--has-options" : ""} ${fieldClassName}`.trim()}>
      {label && <label id={labelId} className="ui-field__label" htmlFor={controlId}>{label}</label>}
      <div className="ui-time-picker__controls">
        <input
          {...inputProps}
          ref={inputRef}
          id={controlId}
          type="time"
          lang="pl-PL"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          required={required}
          className={`ui-field__control ui-time-picker__input ${className}`.trim()}
          aria-label={ariaLabel ?? (!label && !ariaLabelledBy ? "Godzina" : undefined)}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={descriptionIds}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.currentTarget.value)}
          onBlur={onBlur}
        />
        {normalizedOptions.length > 0 && optionsPresentation === "popover" && (
          <button
            ref={listTriggerRef}
            type="button"
            className="ui-time-picker__list-trigger"
            aria-label={label ? `Wybierz godzinę z listy: ${label}` : "Wybierz godzinę z listy"}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listboxId}
            disabled={disabled || !normalizedOptions.some((option) => !optionIsDisabled(option))}
            onClick={() => open ? setOpen(false) : openOptions()}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              openOptions();
            }}
          >
            <Clock3 size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      {hint && <p id={hintId} className="ui-field__hint">{hint}</p>}
      {error && <p id={errorId} className="ui-field__error" role="alert">{error}</p>}

      {normalizedOptions.length > 0 && optionsPresentation === "inline" && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label ? `Dostępne godziny: ${label}` : "Dostępne godziny"}
          className={`ui-time-picker__options ui-time-picker__options--inline ui-time-picker__options--${density}`}
          onKeyDown={moveOptionFocus}
        >
          {optionRows}
        </div>
      )}

      <AnchoredPopover
        id={listboxId}
        open={open}
        anchorRef={listTriggerRef}
        onDismiss={() => setOpen(false)}
        initialFocus="first"
        role="listbox"
        aria-label={label ? `Dostępne godziny: ${label}` : "Dostępne godziny"}
        className={`ui-time-picker__options ui-time-picker__options--${density}`}
        minWidth={148}
        layer="popover"
        onKeyDown={moveOptionFocus}
      >
        {optionRows}
      </AnchoredPopover>
    </div>
  );
});
