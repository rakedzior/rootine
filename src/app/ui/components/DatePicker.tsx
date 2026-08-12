import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Circle } from "lucide-react";
import { Button } from "./Button";
import { uiLayers } from "../tokens";

export type DatePickerDensity = "compact" | "standard";

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  displayValue?: ReactNode;
  portalLayer?: keyof typeof uiLayers;
  /** @deprecated Use portalLayer so layering remains semantic. */
  portalZIndex?: number;
  fieldClassName?: string;
  /** Feature-owned class applied directly to the trigger root. */
  triggerClassName?: string;
  /** Controls both trigger and calendar geometry. */
  density?: DatePickerDensity;
  /** Render the calendar as part of its parent surface instead of a trigger + floating popover. */
  inline?: boolean;
  /** Use one-letter weekday headers for dense calendar surfaces. */
  compactWeekdays?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

const WEEKDAYS = [
  { short: "Pn", label: "Poniedziałek" },
  { short: "Wt", label: "Wtorek" },
  { short: "Śr", label: "Środa" },
  { short: "Cz", label: "Czwartek" },
  { short: "Pt", label: "Piątek" },
  { short: "So", label: "Sobota" },
  { short: "Nd", label: "Niedziela" },
];
const dateFormatter = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric" });
const monthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12);
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;
  return date;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfCalendarMonth(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return first;
}

function addCalendarDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + amount);
  return next;
}

function shiftCalendarMonth(date: Date, amount: number) {
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 12).getDate();
  targetMonth.setDate(Math.min(date.getDate(), lastDay));
  return targetMonth;
}

function clampToRange(date: Date, min: Date | null, max: Date | null) {
  const key = toDateKey(date);
  if (min && key < toDateKey(min)) return new Date(min);
  if (max && key > toDateKey(max)) return new Date(max);
  return date;
}

function monthHasAvailableDate(month: Date, minKey?: string, maxKey?: string) {
  const first = toDateKey(new Date(month.getFullYear(), month.getMonth(), 1, 12));
  const last = toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0, 12));
  return !(minKey && last < minKey) && !(maxKey && first > maxKey);
}

function calendarToday() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date;
}

export function DatePicker({
  value,
  onChange,
  id,
  label,
  hint,
  error,
  disabled,
  required,
  min,
  max,
  displayValue: customDisplayValue,
  portalLayer,
  portalZIndex,
  fieldClassName = "",
  triggerClassName = "",
  density = "standard",
  inline = false,
  compactWeekdays = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": describedBy,
}: DatePickerProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const triggerId = `${controlId}-trigger`;
  const labelId = `${controlId}-label`;
  const hiddenTriggerLabelId = `${controlId}-accessible-label`;
  const valueId = `${controlId}-value`;
  const dialogId = `${controlId}-calendar`;
  const dialogLabelId = `${controlId}-calendar-label`;
  const monthHeadingId = `${controlId}-month-heading`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const descriptionIds = [describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;
  const selectedDate = useMemo(() => parseDateKey(value), [value]);
  const minDate = useMemo(() => min ? parseDateKey(min) : null, [min]);
  const maxDate = useMemo(() => max ? parseDateKey(max) : null, [max]);
  const minKey = minDate ? toDateKey(minDate) : undefined;
  const maxKey = maxDate ? toDateKey(maxDate) : undefined;
  const today = calendarToday();
  const todayKey = toDateKey(today);
  const [openState, setOpenState] = useState(false);
  const open = inline || openState;
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate ?? today);
  const [focusedDateKey, setFocusedDateKey] = useState(() => toDateKey(selectedDate ?? today));
  const [position, setPosition] = useState({ left: 0, top: 0, above: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const displayValue = customDisplayValue ?? (selectedDate ? dateFormatter.format(selectedDate) : "Wybierz datę");
  const fallbackLabel = !label && !ariaLabelledBy && !ariaLabel ? "Data" : undefined;
  const purposeLabelId = ariaLabelledBy
    ?? (label ? labelId : ariaLabel || fallbackLabel ? hiddenTriggerLabelId : undefined);
  const triggerLabelledBy = [purposeLabelId, valueId].filter(Boolean).join(" ") || undefined;

  const isUnavailable = (dateKey: string) => Boolean((minKey && dateKey < minKey) || (maxKey && dateKey > maxKey));

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(304, Math.max(0, window.innerWidth - 24));
    const measuredHeight = calendarRef.current?.getBoundingClientRect().height ?? 380;
    const height = Math.min(measuredHeight, Math.max(0, window.innerHeight - 24));
    const gap = 8;
    const viewportGap = 12;
    const above = window.innerHeight - rect.bottom < height + viewportGap && rect.top > height;
    setPosition({
      left: Math.max(viewportGap, Math.min(rect.left, window.innerWidth - width - viewportGap)),
      top: Math.max(viewportGap, above ? rect.top - height - gap : Math.min(rect.bottom + gap, window.innerHeight - height - viewportGap)),
      above,
    });
  };

  const close = useCallback((restoreFocus = false) => {
    if (!inline) setOpenState(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, [inline]);

  const show = () => {
    if (disabled) return;
    const initial = clampToRange(selectedDate ?? calendarToday(), minDate, maxDate);
    setVisibleMonth(new Date(initial.getFullYear(), initial.getMonth(), 1, 12));
    setFocusedDateKey(toDateKey(initial));
    setOpenState(true);
    requestAnimationFrame(updatePosition);
  };

  useEffect(() => {
    if (!open || inline) return;
    updatePosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !calendarRef.current?.contains(target)) close();
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !calendarRef.current?.contains(target)) close();
    };
    const handleViewportChange = () => updatePosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [close, inline, open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      calendarRef.current
        ?.querySelector<HTMLButtonElement>(`[data-date-key="${focusedDateKey}"]`)
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedDateKey, open, visibleMonth]);

  const days = useMemo(() => {
    const start = startOfCalendarMonth(visibleMonth);
    return Array.from({ length: 42 }, (_, index) => addCalendarDays(start, index));
  }, [visibleMonth]);
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7)),
    [days],
  );

  const moveFocus = (candidate: Date) => {
    const next = clampToRange(candidate, minDate, maxDate);
    setFocusedDateKey(toDateKey(next));
    setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1, 12));
  };

  const changeMonth = (amount: number) => {
    const focusedDate = parseDateKey(focusedDateKey) ?? selectedDate ?? today;
    moveFocus(shiftCalendarMonth(focusedDate, amount));
  };

  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    let candidate: Date | null = null;
    if (event.key === "ArrowLeft") candidate = addCalendarDays(date, -1);
    if (event.key === "ArrowRight") candidate = addCalendarDays(date, 1);
    if (event.key === "ArrowUp") candidate = addCalendarDays(date, -7);
    if (event.key === "ArrowDown") candidate = addCalendarDays(date, 7);
    if (event.key === "Home") candidate = addCalendarDays(date, -((date.getDay() + 6) % 7));
    if (event.key === "End") candidate = addCalendarDays(date, 6 - ((date.getDay() + 6) % 7));
    if (event.key === "PageUp") candidate = shiftCalendarMonth(date, event.shiftKey ? -12 : -1);
    if (event.key === "PageDown") candidate = shiftCalendarMonth(date, event.shiftKey ? 12 : 1);
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChange(toDateKey(date));
      close(true);
      return;
    }
    if (!candidate) return;
    event.preventDefault();
    moveFocus(candidate);
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };

  const previousMonth = shiftCalendarMonth(visibleMonth, -1);
  const nextMonth = shiftCalendarMonth(visibleMonth, 1);
  const previousMonthDisabled = !monthHasAvailableDate(previousMonth, minKey, maxKey);
  const nextMonthDisabled = !monthHasAvailableDate(nextMonth, minKey, maxKey);

  const calendar = (
    <div
      ref={calendarRef}
      id={dialogId}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${dialogLabelId} ${monthHeadingId}`}
      className={`ui-date-picker ui-date-picker--${density} ${inline ? "ui-date-picker--inline" : position.above ? "ui-date-picker--above" : ""}`.trim()}
      style={inline ? undefined : {
        left: position.left,
        top: position.top,
        ...(portalLayer ? { zIndex: uiLayers[portalLayer] } : portalZIndex ? { zIndex: portalZIndex } : {}),
      }}
      onKeyDown={handleDialogKeyDown}
    >
      <span id={dialogLabelId} className="ui-sr-only">
        {ariaLabel ?? (label ? `Wybierz datę: ${label}` : "Wybierz datę")}
      </span>
      <div className="ui-date-picker__header">
        <strong id={monthHeadingId} aria-live="polite">{monthFormatter.format(visibleMonth)}</strong>
        <div>
          {inline && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Przejdź do dzisiaj"
              title="Dzisiaj"
              onClick={() => moveFocus(today)}
            >
              <Circle size={11} strokeWidth={1.5} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Poprzedni miesiąc"
            disabled={previousMonthDisabled}
            onClick={() => changeMonth(-1)}
          >
            <ChevronLeft size={13} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Następny miesiąc"
            disabled={nextMonthDisabled}
            onClick={() => changeMonth(1)}
          >
            <ChevronRight size={13} />
          </Button>
        </div>
      </div>
      <div className="ui-date-picker__calendar" role="grid" aria-labelledby={monthHeadingId}>
        <div className="ui-date-picker__weekdays" role="row">
          {WEEKDAYS.map((day) => (
            <span key={day.short} role="columnheader" aria-label={day.label}>
              {compactWeekdays ? day.short.slice(0, 1) : day.short}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={toDateKey(week[0])} className="ui-date-picker__week" role="row">
            {week.map((date) => {
              const dateKey = toDateKey(date);
              const outside = date.getMonth() !== visibleMonth.getMonth();
              const unavailable = isUnavailable(dateKey);
              const selected = dateKey === value;
              return (
                <div key={dateKey} role="gridcell" aria-selected={selected}>
                  <button
                    type="button"
                    disabled={unavailable}
                    tabIndex={dateKey === focusedDateKey ? 0 : -1}
                    data-date-key={dateKey}
                    aria-label={dateFormatter.format(date)}
                    aria-current={dateKey === todayKey ? "date" : undefined}
                    className={`${outside ? "is-outside" : ""} ${dateKey === todayKey ? "is-today" : ""} ${selected ? "is-selected" : ""}`.trim()}
                    onFocus={() => setFocusedDateKey(dateKey)}
                    onKeyDown={(event) => handleDayKeyDown(event, date)}
                    onClick={() => {
                      onChange(dateKey);
                      if (!inline) close(true);
                    }}
                  >
                    {date.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {!inline && (
        <div className="ui-date-picker__footer">
          <button type="button" disabled={!value} onClick={() => { onChange(""); close(true); }}>Wyczyść</button>
          <button
            type="button"
            disabled={isUnavailable(todayKey)}
            onClick={() => {
              onChange(todayKey);
              close(true);
            }}
          >
            Dzisiaj
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className={`${inline ? "ui-field ui-field--date-inline" : "ui-field"} ui-date-field--${density} ${fieldClassName}`.trim()}>
      {!inline && label && <label id={labelId} className="ui-field__label" htmlFor={triggerId}>{label}</label>}
      {!inline && (ariaLabel || fallbackLabel) && (
        <span id={hiddenTriggerLabelId} className="ui-sr-only">{ariaLabel ?? fallbackLabel}</span>
      )}
      {!inline && <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={`ui-field__control ui-date-trigger ui-date-trigger--${density} ${open ? "is-open" : ""} ${triggerClassName}`.trim()}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        aria-labelledby={triggerLabelledBy}
        aria-describedby={descriptionIds}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => open ? close() : show()}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !open) return;
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }}
      >
        <span id={valueId}>{displayValue}</span>
        <CalendarDays size={13} aria-hidden="true" />
      </button>}
      {!inline && hint && <p id={hintId} className="ui-field__hint">{hint}</p>}
      {!inline && error && <p id={errorId} className="ui-field__error" role="alert">{error}</p>}

      {open && (inline ? calendar : createPortal(calendar, document.body))}
    </div>
  );
}
