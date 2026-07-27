import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  fieldClassName?: string;
}

const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const dateFormatter = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric" });
const monthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfCalendarMonth(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return first;
}

export function DatePicker({
  value,
  onChange,
  label,
  hint,
  error,
  disabled,
  min,
  max,
  fieldClassName = "",
}: DatePickerProps) {
  const generatedId = useId();
  const triggerId = `${generatedId}-trigger`;
  const dialogId = `${generatedId}-calendar`;
  const selectedDate = useMemo(() => parseDateKey(value), [value]);
  const todayKey = toDateKey(new Date());
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate ?? new Date());
  const [position, setPosition] = useState({ left: 0, top: 0, above: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = 304;
    const height = 356;
    const gap = 8;
    const viewportGap = 12;
    const above = window.innerHeight - rect.bottom < height + viewportGap && rect.top > height;
    setPosition({
      left: Math.max(viewportGap, Math.min(rect.left, window.innerWidth - width - viewportGap)),
      top: above ? rect.top - height - gap : rect.bottom + gap,
      above,
    });
  };

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const show = () => {
    if (disabled) return;
    setVisibleMonth(selectedDate ?? new Date());
    setOpen(true);
    requestAnimationFrame(updatePosition);
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !calendarRef.current?.contains(target)) close();
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
  }, [open]);

  const days = useMemo(() => {
    const start = startOfCalendarMonth(visibleMonth);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };

  return (
    <div className={`ui-field ${fieldClassName}`.trim()}>
      {label && <label className="ui-field__label" htmlFor={triggerId}>{label}</label>}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={`ui-field__control ui-date-trigger ${open ? "is-open" : ""}`.trim()}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        onClick={() => open ? close() : show()}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedDate ? dateFormatter.format(selectedDate) : "Wybierz datę"}</span>
        <CalendarDays size={14} aria-hidden="true" />
      </button>
      {hint && <p className="ui-field__hint">{hint}</p>}
      {error && <p className="ui-field__error" role="alert">{error}</p>}

      {open && createPortal(
        <div
          ref={calendarRef}
          id={dialogId}
          role="dialog"
          aria-modal="false"
          aria-label="Wybierz datę"
          className={`ui-date-picker ${position.above ? "ui-date-picker--above" : ""}`.trim()}
          style={{ left: position.left, top: position.top }}
        >
          <div className="ui-date-picker__header">
            <strong>{monthFormatter.format(visibleMonth)}</strong>
            <div>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Poprzedni miesiąc"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))}
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Następny miesiąc"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
          <div className="ui-date-picker__weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="ui-date-picker__days">
            {days.map((date) => {
              const dateKey = toDateKey(date);
              const outside = date.getMonth() !== visibleMonth.getMonth();
              const unavailable = Boolean((min && dateKey < min) || (max && dateKey > max));
              return (
                <button
                  key={dateKey}
                  type="button"
                  disabled={unavailable}
                  aria-label={dateFormatter.format(date)}
                  aria-pressed={dateKey === value}
                  className={`${outside ? "is-outside" : ""} ${dateKey === todayKey ? "is-today" : ""} ${dateKey === value ? "is-selected" : ""}`.trim()}
                  onClick={() => {
                    onChange(dateKey);
                    close(true);
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="ui-date-picker__footer">
            <button type="button" onClick={() => { onChange(""); close(true); }}>Wyczyść</button>
            <button
              type="button"
              onClick={() => {
                onChange(todayKey);
                close(true);
              }}
            >
              Dzisiaj
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
