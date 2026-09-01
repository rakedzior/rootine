import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Bell,
  CalendarDays,
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
import { AnchoredPopover, Button, DatePicker, Menu, MenuItem, Modal, Switch, Tabs, TimePicker } from "../../ui";
import { toCalendarDateKey } from "../../data/taskWorkspace";
import { HALF_HOUR_TIME_OPTIONS } from "../../data/timeOptions";
import {
  REMINDER_OPTIONS,
  REPEAT_OPTIONS,
  browserTimezone,
  type DateVal,
} from "./taskPageModel";

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

const mobileScheduleQuery = "(max-width: 760px), (max-width: 900px) and (max-height: 480px) and (orientation: landscape)";

function useMobileScheduleSheet() {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(mobileScheduleQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(mobileScheduleQuery);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return matches;
}

function TaskScheduleSurface({
  children,
  anchorRef,
  placementAnchor,
  popRef,
  onClose,
  popWidth,
  scheduleError,
}: {
  children: ReactNode;
  anchorRef: React.RefObject<HTMLElement | null>;
  placementAnchor: boolean;
  popRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  popWidth: number;
  scheduleError: string;
}) {
  const mobileSheet = useMobileScheduleSheet();
  useEffect(() => {
    if (!mobileSheet) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof Element && event.target.closest(".ui-anchored-popover")) return;
      const sheet = document.querySelector(".task-sched__sheet-content")?.closest(".ui-modal");
      if (!sheet?.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    // Capture precedes the calendar detail's legacy document listener, so this
    // always closes only the top schedule layer before the parent detail.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [mobileSheet, onClose]);
  if (mobileSheet) {
    return (
      <Modal
        title="Ustaw termin zadania"
        onClose={onClose}
        size="sm"
        bodyClassName="task-sched__sheet"
      >
        <div className="task-sched__popover task-sched--v2 task-sched__sheet-content" aria-describedby={scheduleError ? "task-schedule-error" : undefined}>
          {children}
        </div>
      </Modal>
    );
  }
  return (
    <AnchoredPopover
      ref={popRef}
      open
      anchorRef={anchorRef}
      placement={placementAnchor ? "right" : "auto"}
      align={placementAnchor ? "start" : "end"}
      layer="featurePopup"
      initialFocus="first"
      dismissOnFocusOutside={false}
      minWidth={popWidth}
      maxHeight={Math.max(240, window.innerHeight - 16)}
      viewportPadding={8}
      onDismiss={onClose}
      role="dialog"
      aria-modal="false"
      aria-label="Ustaw termin zadania"
      aria-describedby={scheduleError ? "task-schedule-error" : undefined}
      tabIndex={-1}
      className="task-sched__popover task-sched--v2"
    >
      {children}
    </AnchoredPopover>
  );
}

function nextHalfHour(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const rounded = (Math.floor(minutes / 30) + 1) * 30;
  return HALF_HOUR_TIME_OPTIONS[rounded >= 24 * 60 ? 0 : Math.min(47, rounded / 30)];
}

function addMinutesToTime(value: string, amount: number) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const total = (hours * 60 + minutes + amount + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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
    // Put familiar, local choices first. It avoids rendering hundreds of IANA
    // entries before someone has started searching, while search still covers
    // the complete browser-provided list.
    return [current, ...COMMON_TIMEZONES, ...values].filter((value, index, all) => all.indexOf(value) === index);
  } catch {
    return [current, ...COMMON_TIMEZONES].filter((value, index, all) => all.indexOf(value) === index);
  }
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
    <Menu aria-label={label} initialFocus="selected" className="task-sched__layer-options">
      {options.map((option) => (
        <MenuItem
          key={option.value}
          role="menuitemradio"
          aria-checked={option.value === value}
          selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </MenuItem>
      ))}
    </Menu>
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
  const visible = query.trim() ? filtered : filtered.slice(0, 80);

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
      <Menu aria-label="Strefa czasowa" initialFocus="none" className="task-sched__timezone-options">
        {visible.map((timezone) => (
          <MenuItem
            key={timezone}
            role="menuitemradio"
            aria-checked={timezone === value}
            selected={timezone === value}
            onClick={() => onChange(timezone)}
          >
            {timezoneLabel(timezone, date ?? new Date())}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}

export function DurationTimePicker({
  value,
  label,
  onChange,
  onClose,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="task-sched__time-menu" role="group" aria-label={`${label} — wybór godziny`}>
      <TimePicker
        aria-label={`${label} — wpisz własną godzinę`}
        value={value}
        step={60}
        density="compact"
        options={HALF_HOUR_TIME_OPTIONS}
        optionsPresentation="inline"
        onChange={onChange}
        onOptionSelect={() => onClose()}
      />
      <Button type="button" variant="ghost" size="sm" leadingIcon={<X size={13} aria-hidden="true" />} onClick={() => onChange("")}>Wyczyść</Button>
    </div>
  );
}

export function DatePickerPopup({
  value,
  onConfirm,
  onClose,
  anchorEl,
  placementAnchorEl,
  focusAfterConfirm,
  dateOnly = false,
}: {
  value: DateVal;
  onConfirm: (v: DateVal) => void;
  onClose: () => void;
  anchorEl: HTMLElement;
  placementAnchorEl?: HTMLElement | null;
  focusAfterConfirm?: HTMLElement | null;
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
  const popRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement>(anchorEl);
  const placementAnchorRef = useRef<HTMLElement>(placementAnchorEl ?? anchorEl);
  const timeRowRef = useRef<HTMLButtonElement>(null);
  const reminderRowRef = useRef<HTMLButtonElement>(null);
  const repeatRowRef = useRef<HTMLButtonElement>(null);
  const startDateRef = useRef<HTMLButtonElement>(null);
  const endDateRef = useRef<HTMLButtonElement>(null);
  const startTimeRef = useRef<HTMLButtonElement>(null);
  const endTimeRef = useRef<HTMLButtonElement>(null);
  const durationTimezoneRef = useRef<HTMLButtonElement>(null);
  const popWidth = tab === "duracja" ? 372 : 328;
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
    requestAnimationFrame(() => (focusAfterConfirm ?? anchorEl).focus());
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
            onChange={(next) => {
              setTime(next);
              setStartTime(next);
              if (next) {
                setAllDay(false);
                if (!endTime || (sameDurationDay && endTime <= next)) setEndTime(addMinutesToTime(next, 60));
              }
            }}
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
          density="compact"
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
          onChange={(next) => {
            if (isStart) {
              setStartTime(next);
              setTime(next);
              if (next && sameDurationDay && (!endTime || endTime <= next)) setEndTime(addMinutesToTime(next, 60));
            } else setEndTime(next);
          }}
          onClose={() => setActiveLayer(null)}
        />
      );
    }
    return null;
  };

  return (
    <>
      <TaskScheduleSurface
        anchorRef={placementAnchorEl ? placementAnchorRef : anchorRef}
        placementAnchor={Boolean(placementAnchorEl)}
        popRef={popRef}
        onClose={onClose}
        popWidth={popWidth}
        scheduleError={scheduleError}
      >
        {!dateOnly && (
          <Tabs
            className="ui-tabs--segmented task-schedule-tabs"
            density="compact"
            fill
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
              density="compact"
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
                    <Switch
                      checked={allDay}
                      onChange={toggleAllDay}
                      label="Cały dzień"
                      className="task-sched__all-day-switch"
                    />
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
                  setLayer("end-time");
                }}
              >
                {allDay ? "--:--" : endTime}
              </button>
            </div>

            <div className="task-sched__dur-row">
              <span>Cały dzień</span>
              <Switch
                checked={allDay}
                aria-label="Cały dzień"
                onChange={toggleAllDay}
              />
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
          <Button type="button" variant="ghost" size="sm" fullWidth onClick={handleClear}>Wyczyść</Button>
          <Button type="button" variant="primary" size="sm" fullWidth onClick={confirmAndClose} disabled={Boolean(scheduleError)}>Zapisz termin</Button>
        </div>
      </TaskScheduleSurface>

      {activeLayer && layerAnchor && (
        <AnchoredPopover
          open
          anchorRef={{ current: layerAnchor }}
          portalRoot={popRef.current}
          onDismiss={() => setActiveLayer(null)}
          dismissOnFocusOutside={false}
          initialFocus="first"
          layer="nestedPopover"
          minWidth={activeLayer.includes("date") ? 304 : activeLayer.includes("timezone") ? 320 : tab === "duracja" ? 332 : 304}
          maxHeight={Math.max(200, window.innerHeight - 16)}
          viewportPadding={8}
          role="dialog"
          aria-modal="false"
          aria-label={activeLayer.includes("timezone") ? "Wybierz strefę czasową" : activeLayer.includes("date") ? "Wybierz datę" : activeLayer === "repeat" ? "Powtarzanie" : activeLayer === "reminder" ? "Przypomnienie" : "Wybierz godzinę"}
          className="task-sched__layer task-sched--v2"
        >
          {renderLayerContent()}
        </AnchoredPopover>
      )}
    </>
  );
}
