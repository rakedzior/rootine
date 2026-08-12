import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Moon,
  RotateCcw,
  Search,
  Sun,
  Sunrise,
  X,
} from "lucide-react";
import { Button, DatePicker, Tabs } from "../../ui";
import { toCalendarDateKey } from "../../data/taskWorkspace";
import {
  REMINDER_OPTIONS,
  REPEAT_OPTIONS,
  browserTimezone,
  type DateVal,
} from "./taskPageModel";

const HALF_HOUR_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

const COMMON_TIMEZONES = [
  "Europe/Warsaw",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Athens",
  "Europe/Helsinki",
  "Europe/Kyiv",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

type LayerKind =
  | "time"
  | "time-timezone"
  | "reminder"
  | "repeat"
  | "start-date"
  | "end-date"
  | "start-time"
  | "end-time"
  | "duration-timezone"
  | null;

function nextHalfHour(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const rounded = (Math.floor(minutes / 30) + 1) * 30;
  return HALF_HOUR_OPTIONS[rounded >= 24 * 60 ? 0 : Math.min(47, rounded / 30)];
}

function addMinutesToTime(value: string, amount: number) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const total = (hours * 60 + minutes + amount + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function nearestHalfHourValue(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "";
  const rounded = Math.ceil((hours * 60 + minutes) / 30) * 30;
  return HALF_HOUR_OPTIONS[rounded >= 24 * 60 ? 0 : Math.min(47, rounded / 30)];
}

function dateKey(date: Date | null) {
  return date ? toCalendarDateKey(date) : "";
}

function compactDate(date: Date | null) {
  if (!date) return "Wybierz";
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" }).replace(".", "");
}

function timezoneLabel(timezone: string, date = new Date()) {
  try {
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    const city = timezone === "UTC" ? "UTC" : timezone.split("/").at(-1)?.replaceAll("_", " ") ?? timezone;
    return `${city}, ${offset}`;
  } catch {
    return timezone;
  }
}

function timezoneValues(current: string) {
  try {
    const supportedValuesOf = (Intl as typeof Intl & {
      supportedValuesOf?: (key: "timeZone") => string[];
    }).supportedValuesOf;
    const values = supportedValuesOf?.("timeZone") ?? COMMON_TIMEZONES;
    return [current, ...values].filter((value, index, all) => all.indexOf(value) === index);
  } catch {
    return [current, ...COMMON_TIMEZONES].filter((value, index, all) => all.indexOf(value) === index);
  }
}

function ScheduleLayer({
  anchorEl,
  parentEl,
  layerRef,
  label,
  width = 304,
  children,
}: {
  anchorEl: HTMLElement;
  parentEl: HTMLElement;
  layerRef: RefObject<HTMLDivElement | null>;
  label: string;
  width?: number;
  children: ReactNode;
}) {
  const [position, setPosition] = useState({ top: 8, left: 8, width });

  const updatePosition = useCallback(() => {
    const anchorRect = anchorEl.getBoundingClientRect();
    const parentRect = parentEl.getBoundingClientRect();
    const layerHeight = layerRef.current?.getBoundingClientRect().height ?? 300;
    const viewportGap = 8;
    const availableWidth = Math.max(0, window.innerWidth - viewportGap * 2);
    const resolvedWidth = Math.min(width, availableWidth);
    const preferredLeft = Math.min(anchorRect.left, parentRect.right - resolvedWidth - 8);
    const left = Math.max(viewportGap, Math.min(preferredLeft, window.innerWidth - resolvedWidth - viewportGap));
    const belowTop = anchorRect.bottom + 6;
    const aboveTop = anchorRect.top - layerHeight - 6;
    const top = belowTop + layerHeight <= window.innerHeight - viewportGap
      ? belowTop
      : Math.max(viewportGap, aboveTop);
    setPosition({ top, left, width: resolvedWidth });
  }, [anchorEl, layerRef, parentEl, width]);

  useLayoutEffect(() => {
    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (layerRef.current) observer?.observe(layerRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [layerRef, updatePosition]);

  return createPortal(
    <div
      ref={layerRef}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      className="task-sched__layer task-sched--v2"
      style={position}
    >
      {children}
    </div>,
    document.body,
  );
}

function OptionLayer({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="task-sched__layer-options" role="listbox" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          className={option.value === value ? "is-selected" : undefined}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          {option.value === value && <Check size={14} strokeWidth={1.7} aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

function TimezoneLayer({
  value,
  date,
  onChange,
}: {
  value: string;
  date: Date | null;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => timezoneValues(value), [value]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pl-PL");
    if (!normalized) return options;
    return options.filter((timezone) => (
      timezone.toLocaleLowerCase("pl-PL").includes(normalized)
      || timezoneLabel(timezone, date ?? new Date()).toLocaleLowerCase("pl-PL").includes(normalized)
    ));
  }, [date, options, query]);

  return (
    <div className="task-sched__timezone-layer">
      <label className="task-sched__layer-search">
        <Search size={13} strokeWidth={1.6} aria-hidden="true" />
        <span className="ui-sr-only">Szukaj strefy czasowej</span>
        <input
          type="search"
          value={query}
          placeholder="Szukaj miasta lub strefy"
          autoFocus
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <div className="task-sched__timezone-options" role="listbox" aria-label="Strefa czasowa">
        {filtered.map((timezone) => (
          <button
            key={timezone}
            type="button"
            role="option"
            aria-selected={timezone === value}
            className={timezone === value ? "is-selected" : undefined}
            onClick={() => onChange(timezone)}
          >
            <span>{timezoneLabel(timezone, date ?? new Date())}</span>
            {timezone === value && <Check size={14} strokeWidth={1.7} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DurationTimePicker({
  value,
  label,
  editMode,
  onChange,
  onClose,
  onEditModeChange,
}: {
  value: string;
  label: string;
  editMode: "options" | "manual";
  onChange: (value: string) => void;
  onClose: () => void;
  onEditModeChange: (mode: "options" | "manual") => void;
}) {
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const selectedOption = HALF_HOUR_OPTIONS.includes(value) ? value : nearestHalfHourValue(value);

  useEffect(() => {
    if (editMode !== "options") return;
    const frame = requestAnimationFrame(() => selectedOptionRef.current?.scrollIntoView?.({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [editMode, value]);

  return (
    <div className="task-sched__time-menu" role="group" aria-label={`${label} — wybór godziny`}>
      <div className="task-sched__time-menu-input">
        <Clock size={13} strokeWidth={1.5} aria-hidden="true" />
        <input
          type="time"
          step={60}
          aria-label={`${label} — wpisz własną godzinę`}
          value={value}
          onClick={() => onEditModeChange("manual")}
          onFocus={() => onEditModeChange("manual")}
          onChange={(event) => onChange(event.currentTarget.value)}
          autoFocus={editMode === "manual"}
        />
        <button type="button" aria-label={`Wyczyść ${label.toLocaleLowerCase("pl-PL")}`} onClick={() => onChange("")}>
          <X size={13} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      {editMode === "options" && (
        <div className="task-sched__time-options" role="listbox" aria-label={`${label} — co pół godziny`}>
          {HALF_HOUR_OPTIONS.map((option) => (
            <button
              key={option}
              ref={option === selectedOption ? selectedOptionRef : undefined}
              type="button"
              role="option"
              aria-selected={option === value}
              className={option === value ? "is-selected" : undefined}
              onClick={() => { onChange(option); onClose(); }}
            >
              {option}
              {option === value && <Check size={14} strokeWidth={1.7} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DatePickerPopup({
  value,
  onConfirm,
  onClose,
  anchorEl,
  placementAnchorEl,
  dateOnly = false,
}: {
  value: DateVal;
  onConfirm: (v: DateVal) => void;
  onClose: () => void;
  anchorEl: HTMLElement;
  placementAnchorEl?: HTMLElement | null;
  dateOnly?: boolean;
}) {
  const [tab, setTab] = useState<"data" | "duracja">(!dateOnly && value.duration ? "duracja" : "data");
  const today = useMemo(() => {
    const next = new Date();
    next.setHours(0, 0, 0, 0);
    return next;
  }, []);
  const initialDate = value.date ?? today;
  const [selDate, setSelDate] = useState<Date | null>(initialDate);
  const [endDate, setEndDate] = useState<Date | null>(value.endDate ?? initialDate);
  const [time, setTime] = useState(value.time || (value.duration ? value.startTime : ""));
  const [reminder, setReminder] = useState(value.reminder);
  const [repeat, setRepeat] = useState(value.repeat);
  const [startTime, setStartTime] = useState(value.startTime || "09:00");
  const [endTime, setEndTime] = useState(value.endTime || "10:00");
  const [allDay, setAllDay] = useState(value.allDay);
  const [timezone, setTimezone] = useState(value.timezone || browserTimezone());
  const [activeLayer, setActiveLayer] = useState<LayerKind>(null);
  const [timeEditMode, setTimeEditMode] = useState<"options" | "manual">("options");
  const popRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const timeRowRef = useRef<HTMLButtonElement>(null);
  const reminderRowRef = useRef<HTMLButtonElement>(null);
  const repeatRowRef = useRef<HTMLButtonElement>(null);
  const startDateRef = useRef<HTMLButtonElement>(null);
  const endDateRef = useRef<HTMLButtonElement>(null);
  const startTimeRef = useRef<HTMLButtonElement>(null);
  const endTimeRef = useRef<HTMLButtonElement>(null);
  const durationTimezoneRef = useRef<HTMLButtonElement>(null);
  const popWidth = tab === "duracja" ? 372 : 328;
  const [popupPosition, setPopupPosition] = useState({ top: 8, left: 8 });
  const startDateKey = dateKey(selDate);
  const endDateKey = dateKey(endDate);
  const sameDurationDay = Boolean(startDateKey && endDateKey && startDateKey === endDateKey);
  const scheduleError = !dateOnly && tab === "data" && selDate && !allDay && !time
    ? "Podaj godzinę zadania albo wybierz cały dzień."
    : !dateOnly && tab === "duracja" && (!selDate || !endDate)
      ? "Wybierz datę rozpoczęcia i zakończenia."
      : !dateOnly && tab === "duracja" && endDateKey < startDateKey
        ? "Data zakończenia nie może być wcześniejsza niż data startu."
        : !dateOnly && tab === "duracja" && !allDay && (!startTime || !endTime)
          ? "Podaj godzinę rozpoczęcia i zakończenia."
          : !dateOnly && tab === "duracja" && !allDay && sameDurationDay && endTime <= startTime
            ? "Godzina zakończenia musi być późniejsza niż rozpoczęcia."
            : "";

  const positionPopup = useCallback(() => {
    const target = placementAnchorEl ?? anchorEl;
    const rect = target.getBoundingClientRect();
    const popupHeight = popRef.current?.getBoundingClientRect().height ?? (tab === "duracja" ? 500 : 600);
    let left = placementAnchorEl ? rect.right + 8 : rect.right - popWidth;
    let top = placementAnchorEl ? rect.top : rect.bottom + 6;
    if (placementAnchorEl && left + popWidth > window.innerWidth - 8) left = rect.left - popWidth - 8;
    if (top + popupHeight > window.innerHeight - 8) {
      top = placementAnchorEl ? rect.bottom - popupHeight : window.innerHeight - popupHeight - 8;
    }
    setPopupPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - popWidth - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - popupHeight - 8)),
    });
  }, [anchorEl, placementAnchorEl, popWidth, tab]);

  useLayoutEffect(() => {
    positionPopup();
    const frame = requestAnimationFrame(positionPopup);
    return () => cancelAnimationFrame(frame);
  }, [positionPopup]);

  useEffect(() => {
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    return () => {
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
    };
  }, [positionPopup]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const selected = popRef.current?.querySelector<HTMLElement>("[aria-pressed='true']");
      (selected ?? popRef.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideAnchor = anchorEl.contains(target) || Boolean(placementAnchorEl?.contains(target));
      const insideLayerTrigger = [
        timeRowRef,
        reminderRowRef,
        repeatRowRef,
        startDateRef,
        endDateRef,
        startTimeRef,
        endTimeRef,
        durationTimezoneRef,
      ].some((ref) => ref.current?.contains(target));
      if (layerRef.current?.contains(target)) return;
      if (popRef.current?.contains(target)) {
        if (insideLayerTrigger) return;
        if (activeLayer) setActiveLayer(null);
        return;
      }
      if (!insideAnchor) {
        onClose();
        requestAnimationFrame(() => anchorEl.focus());
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (activeLayer) {
        setActiveLayer(null);
        return;
      }
      onClose();
      requestAnimationFrame(() => anchorEl.focus());
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeLayer, anchorEl, onClose, placementAnchorEl]);

  const setLayer = (layer: LayerKind) => {
    setActiveLayer((current) => current === layer ? null : layer);
  };

  const ensureTimed = () => {
    const now = new Date();
    const next = time || nextHalfHour(now);
    const rollsToTomorrow = !time && next === "00:00" && dateKey(selDate) === dateKey(today);
    if (rollsToTomorrow) {
      const nextDate = new Date(today);
      nextDate.setDate(nextDate.getDate() + 1);
      setSelDate(nextDate);
      if (!endDate || dateKey(endDate) < dateKey(nextDate)) setEndDate(new Date(nextDate));
    }
    setTime(next);
    setStartTime(next);
    if (rollsToTomorrow || !endTime || (sameDurationDay && endTime <= next)) {
      setEndTime(addMinutesToTime(next, 60));
    }
    setAllDay(false);
    return next;
  };

  const toggleAllDay = () => {
    if (allDay) ensureTimed();
    else setAllDay(true);
    setActiveLayer(null);
  };

  const changeStartDate = (nextKey: string) => {
    const next = nextKey ? new Date(`${nextKey}T12:00:00`) : null;
    setSelDate(next);
    if (next && (!endDate || dateKey(endDate) < nextKey)) setEndDate(new Date(next));
  };

  const changeEndDate = (nextKey: string) => {
    setEndDate(nextKey ? new Date(`${nextKey}T12:00:00`) : null);
  };

  const confirmAndClose = () => {
    if (scheduleError) return;
    onConfirm({
      date: selDate,
      endDate: tab === "duracja" ? endDate : selDate,
      time: allDay ? "" : tab === "data" ? time : "",
      reminder,
      repeat,
      startTime: allDay ? "" : startTime,
      endTime: allDay ? "" : endTime,
      duration: tab === "duracja",
      allDay,
      timezone,
    });
    onClose();
    requestAnimationFrame(() => anchorEl.focus());
  };

  const handleClear = () => {
    setSelDate(null);
    setEndDate(null);
    setTime("");
    setReminder("");
    setRepeat("");
    setStartTime("09:00");
    setEndTime("10:00");
    setAllDay(true);
    setTimezone(browserTimezone());
    setActiveLayer(null);
  };

  const tomorrow = useMemo(() => {
    const next = new Date(today);
    next.setDate(next.getDate() + 1);
    return next;
  }, [today]);
  const nextWeek = useMemo(() => {
    const next = new Date(today);
    next.setDate(next.getDate() + 7);
    return next;
  }, [today]);
  const nextMonth = useMemo(() => {
    const next = new Date(today);
    next.setMonth(next.getMonth() + 1);
    return next;
  }, [today]);
  const quickDates = [
    { label: "Dziś", icon: Sun, date: today },
    { label: "Jutro", icon: Sunrise, date: tomorrow },
    { label: "Następny tydzień", icon: CalendarDays, date: nextWeek },
    { label: "Następny miesiąc", icon: Moon, date: nextMonth },
  ];

  const isSameDate = (left: Date | null, right: Date) => Boolean(left
    && left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate());

  const reminderLabel = REMINDER_OPTIONS.find((option) => option.value === reminder)?.label ?? "Przypomnienie";
  const repeatLabel = REPEAT_OPTIONS.find((option) => option.value === repeat)?.label ?? "Powtarzaj";
  const layerAnchor = activeLayer === "time" || activeLayer === "time-timezone"
    ? timeRowRef.current
    : activeLayer === "reminder"
      ? reminderRowRef.current
      : activeLayer === "repeat"
        ? repeatRowRef.current
        : activeLayer === "start-date"
          ? startDateRef.current
          : activeLayer === "end-date"
            ? endDateRef.current
            : activeLayer === "start-time"
              ? startTimeRef.current
              : activeLayer === "end-time"
                ? endTimeRef.current
                : durationTimezoneRef.current;

  const renderLayerContent = () => {
    if (activeLayer === "time") {
      return (
        <>
          <DurationTimePicker
            value={time}
            label="Godzina zadania"
            editMode={timeEditMode}
            onChange={(next) => {
              setTime(next);
              setStartTime(next);
              if (next) {
                setAllDay(false);
                if (!endTime || (sameDurationDay && endTime <= next)) setEndTime(addMinutesToTime(next, 60));
              }
            }}
            onEditModeChange={setTimeEditMode}
            onClose={() => setActiveLayer(null)}
          />
          <button type="button" className="task-sched__layer-timezone" onClick={() => setActiveLayer("time-timezone")}>
            <span>{timezoneLabel(timezone, selDate ?? today)}</span>
            <ChevronRight size={12} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </>
      );
    }
    if (activeLayer === "time-timezone" || activeLayer === "duration-timezone") {
      return <TimezoneLayer value={timezone} date={selDate} onChange={(next) => { setTimezone(next); setActiveLayer(null); }} />;
    }
    if (activeLayer === "reminder") {
      return <OptionLayer label="Przypomnienie" value={reminder} options={REMINDER_OPTIONS} onChange={(next) => {
        if (next && allDay) ensureTimed();
        setReminder(next);
        setActiveLayer(null);
      }} />;
    }
    if (activeLayer === "repeat") {
      return <OptionLayer label="Powtarzanie" value={repeat} options={REPEAT_OPTIONS} onChange={(next) => {
        setRepeat(next);
        setActiveLayer(null);
      }} />;
    }
    if (activeLayer === "start-date" || activeLayer === "end-date") {
      const isStart = activeLayer === "start-date";
      return (
        <DatePicker
          aria-label={isStart ? "Data startu" : "Data zakończenia"}
          value={isStart ? startDateKey : endDateKey}
          min={isStart ? undefined : startDateKey || undefined}
          onChange={(next) => {
            if (isStart) changeStartDate(next);
            else changeEndDate(next);
            setActiveLayer(null);
          }}
          fieldClassName="task-sched__layer-calendar"
          inline
          compactWeekdays
        />
      );
    }
    if (activeLayer === "start-time" || activeLayer === "end-time") {
      const isStart = activeLayer === "start-time";
      const current = isStart ? startTime : endTime;
      return (
        <DurationTimePicker
          value={allDay ? "" : current}
          label={isStart ? "Godzina startu" : "Godzina zakończenia"}
          editMode={timeEditMode}
          onChange={(next) => {
            if (isStart) {
              setStartTime(next);
              setTime(next);
              if (next && sameDurationDay && (!endTime || endTime <= next)) setEndTime(addMinutesToTime(next, 60));
            } else setEndTime(next);
          }}
          onEditModeChange={setTimeEditMode}
          onClose={() => setActiveLayer(null)}
        />
      );
    }
    return null;
  };

  return createPortal(
    <>
      <div
        ref={popRef}
        role="dialog"
        aria-modal="false"
        aria-label="Ustaw termin zadania"
        aria-describedby={scheduleError ? "task-schedule-error" : undefined}
        tabIndex={-1}
        className={`task-sched__popover task-sched--v2 task-sched__popover--${tab}`}
        style={{ top: popupPosition.top, left: popupPosition.left, width: `${popWidth}px` }}
      >
        {!dateOnly && (
          <Tabs
            className="ui-tabs--segmented task-schedule-tabs"
            ariaLabel="Sposób planowania terminu"
            activeId={tab}
            onChange={(id) => {
              const nextTab = id as "data" | "duracja";
              setTab(nextTab);
              setActiveLayer(null);
              if (nextTab === "duracja") {
                setSelDate((current) => current ?? today);
                setEndDate((current) => current ?? selDate ?? today);
                const nextStart = time || startTime || nextHalfHour();
                setStartTime(nextStart);
                if (!endTime || (sameDurationDay && endTime <= nextStart)) {
                  setEndTime(addMinutesToTime(nextStart, 60));
                }
              }
            }}
            items={[
              { id: "data", label: "Data", panelId: "task-date-data-panel", tabId: "task-date-data-tab" },
              { id: "duracja", label: "Czas trwania", panelId: "task-date-duracja-panel", tabId: "task-date-duracja-tab" },
            ]}
          />
        )}

        {tab === "data" ? (
          <div
            id="task-date-data-panel"
            role={dateOnly ? "group" : "tabpanel"}
            aria-label={dateOnly ? "Data zadania" : undefined}
            aria-labelledby={dateOnly ? undefined : "task-date-data-tab"}
            className="task-sched__panel"
          >
            <div className="task-sched__quick">
              {quickDates.map(({ label, icon: Icon, date: quickDate }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  aria-pressed={isSameDate(selDate, quickDate)}
                  onClick={() => {
                    setSelDate(new Date(quickDate));
                    if (!endDate || dateKey(endDate) < dateKey(quickDate)) setEndDate(new Date(quickDate));
                  }}
                className={`task-sched__quick-btn${isSameDate(selDate, quickDate) ? " is-active" : ""}`}
                title={label}
              >
                  <Icon size={19} strokeWidth={1.5} />
                </button>
              ))}
            </div>

            <DatePicker
              label="Data zadania"
              value={startDateKey}
              onChange={changeStartDate}
              fieldClassName="task-sched__main-calendar"
              inline
              compactWeekdays
            />

            {dateOnly ? (
              <p className="task-sched__source-note">Godzinę, przypomnienie i powtarzanie edytuj w module źródłowym.</p>
            ) : (
              <>
                <div className="task-sched__rows">
                  <div className="task-sched__row">
                    <button
                      ref={timeRowRef}
                      type="button"
                      aria-expanded={activeLayer === "time" || activeLayer === "time-timezone"}
                      onClick={() => {
                        ensureTimed();
                        setTimeEditMode("options");
                        setLayer("time");
                      }}
                      className={`task-sched__row-btn${time && !allDay ? " is-set" : ""}`}
                    >
                      <Clock size={15} strokeWidth={1.5} aria-hidden="true" />
                      <span className="task-sched__row-label">Czas</span>
                      {time && !allDay && <span className="task-sched__row-value">{time}</span>}
                      <ChevronRight size={12} strokeWidth={1.5} className="task-sched__row-chevron" />
                    </button>
                  </div>
                  <div className="task-sched__row">
                    <button
                      ref={reminderRowRef}
                      type="button"
                      aria-expanded={activeLayer === "reminder"}
                      onClick={() => setLayer("reminder")}
                      className={`task-sched__row-btn${reminder ? " is-set" : ""}`}
                    >
                      <Bell size={15} strokeWidth={1.5} aria-hidden="true" />
                      <span className="task-sched__row-label">{reminder ? reminderLabel : "Przypomnienie"}</span>
                      <ChevronRight size={12} strokeWidth={1.5} className="task-sched__row-chevron" />
                    </button>
                  </div>
                  <div className="task-sched__row">
                    <button
                      ref={repeatRowRef}
                      type="button"
                      aria-expanded={activeLayer === "repeat"}
                      onClick={() => setLayer("repeat")}
                      className={`task-sched__row-btn${repeat ? " is-set" : ""}`}
                    >
                      <RotateCcw size={15} strokeWidth={1.5} aria-hidden="true" />
                      <span className="task-sched__row-label">{repeat ? repeatLabel : "Powtarzaj"}</span>
                      <ChevronRight size={12} strokeWidth={1.5} className="task-sched__row-chevron" />
                    </button>
                  </div>
                  <div className="task-sched__row">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={allDay}
                      onClick={toggleAllDay}
                      className="task-sched__row-btn task-sched__row-btn--split"
                    >
                      <span>Cały dzień</span>
                      <span className={`task-sched__switch${allDay ? " is-on" : ""}`} aria-hidden="true"><span /></span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div id="task-date-duracja-panel" role="tabpanel" aria-labelledby="task-date-duracja-tab" className="task-sched__duration-panel">
            <div className="task-sched__duration-grid">
              <span className="task-sched__duration-label">Start</span>
              <button
                ref={startDateRef}
                type="button"
                className="task-sched__duration-control"
                aria-label={`Data startu: ${compactDate(selDate)}`}
                aria-expanded={activeLayer === "start-date"}
                onClick={() => setLayer("start-date")}
              >
                {compactDate(selDate)}
              </button>
              <button
                ref={startTimeRef}
                type="button"
                disabled={allDay}
                className="task-sched__duration-control task-sched__duration-control--time"
                aria-label={`Godzina startu: ${allDay ? "cały dzień" : startTime}`}
                aria-expanded={activeLayer === "start-time"}
                onClick={() => {
                  setTimeEditMode("options");
                  setLayer("start-time");
                }}
              >
                {allDay ? "--:--" : startTime}
              </button>

              <span className="task-sched__duration-label">Koniec</span>
              <button
                ref={endDateRef}
                type="button"
                className="task-sched__duration-control"
                aria-label={`Data zakończenia: ${compactDate(endDate)}`}
                aria-expanded={activeLayer === "end-date"}
                onClick={() => setLayer("end-date")}
              >
                {compactDate(endDate)}
              </button>
              <button
                ref={endTimeRef}
                type="button"
                disabled={allDay}
                className="task-sched__duration-control task-sched__duration-control--time"
                aria-label={`Godzina zakończenia: ${allDay ? "cały dzień" : endTime}`}
                aria-expanded={activeLayer === "end-time"}
                onClick={() => {
                  setTimeEditMode("options");
                  setLayer("end-time");
                }}
              >
                {allDay ? "--:--" : endTime}
              </button>
            </div>

            <div className="task-sched__dur-row">
              <span>Cały dzień</span>
              <button
                type="button"
                role="switch"
                aria-checked={allDay}
                aria-label="Cały dzień"
                onClick={toggleAllDay}
                className={`task-sched__switch task-sched__switch--lg${allDay ? " is-on" : ""}`}
              >
                <span />
              </button>
            </div>

            <button
              ref={durationTimezoneRef}
              type="button"
              className="task-sched__timezone-btn"
              aria-expanded={activeLayer === "duration-timezone"}
              onClick={() => setLayer("duration-timezone")}
            >
              <span>{timezoneLabel(timezone, selDate ?? today)}</span>
              <ChevronDown size={13} strokeWidth={1.6} aria-hidden="true" />
            </button>

            <div className="task-sched__duration-actions">
              <div className="task-sched__row">
                <button
                  ref={reminderRowRef}
                  type="button"
                  aria-expanded={activeLayer === "reminder"}
                  onClick={() => setLayer("reminder")}
                  className={`task-sched__row-btn${reminder ? " is-set" : ""}`}
                >
                  <Bell size={15} strokeWidth={1.5} aria-hidden="true" />
                  <span className="task-sched__row-label">{reminder ? reminderLabel : "Przypomnienie"}</span>
                  <ChevronRight size={12} strokeWidth={1.5} className="task-sched__row-chevron" />
                </button>
              </div>
              <div className="task-sched__row">
                <button
                  ref={repeatRowRef}
                  type="button"
                  aria-expanded={activeLayer === "repeat"}
                  onClick={() => setLayer("repeat")}
                  className={`task-sched__row-btn${repeat ? " is-set" : ""}`}
                >
                  <RotateCcw size={15} strokeWidth={1.5} aria-hidden="true" />
                  <span className="task-sched__row-label">{repeat ? repeatLabel : "Powtarzaj"}</span>
                  <ChevronRight size={12} strokeWidth={1.5} className="task-sched__row-chevron" />
                </button>
              </div>
            </div>
          </div>
        )}

        {scheduleError && <p id="task-schedule-error" role="alert" className="task-sched__error">{scheduleError}</p>}

        <div className="task-sched__footer">
          <Button type="button" variant="ghost" fullWidth onClick={handleClear}>Wyczyść</Button>
          <Button type="button" variant="primary" fullWidth onClick={confirmAndClose} disabled={Boolean(scheduleError)}>OK</Button>
        </div>
      </div>

      {activeLayer && layerAnchor && popRef.current && (
        <ScheduleLayer
          anchorEl={layerAnchor}
          parentEl={popRef.current}
          layerRef={layerRef}
          label={activeLayer.includes("timezone") ? "Wybierz strefę czasową" : activeLayer.includes("date") ? "Wybierz datę" : activeLayer === "repeat" ? "Powtarzanie" : activeLayer === "reminder" ? "Przypomnienie" : "Wybierz godzinę"}
          width={activeLayer.includes("date") ? 304 : activeLayer.includes("timezone") ? 320 : tab === "duracja" ? 332 : 304}
        >
          {renderLayerContent()}
        </ScheduleLayer>
      )}
    </>,
    document.body,
  );
}
