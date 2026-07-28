import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { Link } from "react-router";
import {
  Plus, Check, Inbox, Flame, Trash2, RotateCcw,
  ChevronDown, ChevronLeft, ChevronRight,
  Tag, TrendingUp, Calendar, CalendarDays, LayoutGrid,
  Clock, Star, X, Circle,
  Sun, Sunrise, Moon, Bell,
  Flag, MessageSquare,
  MoreHorizontal, Search,
  Printer, ListPlus,
  PenLine, BarChart2, Hash, List, CheckSquare,
} from "lucide-react";
import { persistTaskCompletion } from "../data/taskCompletion";
import { calendarDaysBetween, todayLocalDateKey } from "../data/localDate";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { TRAVEL_STORAGE_KEY } from "../data/travelWorkspace";
import { WORK_STORAGE_KEY } from "../data/workWorkspace";
import {
  isHabitDoneOnDate,
  emptyTaskTrash,
  loadTaskWorkspace,
  purgeTask,
  restoreTask,
  saveTaskWorkspace,
  trashTask,
  toggleHabitOnDate,
  taskViewForCalendarDate,
  TASK_STORAGE_KEY,
  toCalendarDateKey,
  type TaskComment,
  type TaskPriority,
  type TaskRecurrence,
  type TaskSchedule,
  type TaskSubtask,
  type WorkspaceHabit,
  type WorkspaceList,
  type WorkspaceTag,
  type WorkspaceTask,
} from "../data/taskWorkspace";
import {
  Badge,
  Button,
  ContextNavItem,
  ContextSidebar,
  DetailPanel,
  Menu,
  MenuItem,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  SectionHeader,
  Select,
  Tabs,
  WorkspaceToolbar,
  uiColors,
  uiShadows,
} from "../ui";
import "../../styles/task-habits.css";

const C = {
  bg:           uiColors.graphiteCanvas,
  subSidebar:   uiColors.graphiteSidebar,
  elevated:     uiColors.graphiteHover,
  card:         uiColors.graphiteCard,
  cardHover:    uiColors.graphiteHover,
  inputBg:      uiColors.graphiteInput,
  borderSubtle: uiColors.borderSubtle,
  borderStrong: uiColors.borderStrong,
  textPrimary:  uiColors.chalkWhite,
  textSecond:   uiColors.textSecondary,
  textMuted:    uiColors.textMuted,
  textDisabled: uiColors.textDisabled,
  iceBlue:      uiColors.precisionBlueText,
  iceBlueSolid: uiColors.precisionBlueStrong,
  iceBlueBg:    uiColors.precisionBlueSoft,
  seaGlass:     uiColors.success,
  seaGlassBg:   uiColors.successSoft,
  warning:      uiColors.warning,
  danger:       uiColors.danger,
  dangerBg:     uiColors.dangerSoft,
  blueBorder:   "color-mix(in srgb, var(--color-precision-blue) 35%, transparent)",
  floatingShadow: uiShadows.floating,
} as const;

type Priority = TaskPriority;
export type Subtask = TaskSubtask;
export type Task = WorkspaceTask;
type Habit = WorkspaceHabit;
export type ListItem = WorkspaceList;
export type TagItem = WorkspaceTag;

const PRIORITY_COLOR: Record<Priority, string> = {
  high: C.danger, medium: C.warning, low: C.iceBlue,
};

const SMART_VIEWS = [
  { id: "wszystkie",   label: "Wszystkie",      icon: Circle     },
  { id: "skrzynka",   label: "Skrzynka",       icon: Inbox      },
  { id: "dzis",       label: "Dziś",            icon: LayoutGrid },
  { id: "jutro",      label: "Jutro",           icon: Calendar   },
  { id: "7dni",       label: "Następne 7 dni",  icon: TrendingUp },
  { id: "podsumowanie", label: "Podsumowanie",  icon: BarChart2  },
  { id: "nawyki",     label: "Nawyki",           icon: Flame      },
];

const VIEW_LABELS: Record<string, string> = {
  wszystkie:    "Wszystkie zadania",
  skrzynka:     "Skrzynka zadań",
  dzis:         "Dziś",
  jutro:        "Jutro",
  "7dni":       "Następne 7 dni",
  podsumowanie: "Podsumowanie",
  nawyki:       "Nawyki",
  ukonczone:    "Ukończone",
  kosz:         "Kosz",
};

function initialTaskView() {
  if (typeof window === "undefined") return "dzis";
  const requested = new URLSearchParams(window.location.search).get("widok");
  return requested && VIEW_LABELS[requested] ? requested : "dzis";
}

const PALETTE = [
  C.iceBlue, C.seaGlass, C.warning, C.danger,
  C.textSecond, uiColors.violet,
];
const VISIBLE_TAG_LIMIT = 6;



const PL_MONTHS = [
  "styczeń","luty","marzec","kwiecień","maj","czerwiec",
  "lipiec","sierpień","wrzesień","październik","listopad","grudzień",
];
const PL_MONTHS_SHORT = ["sty","lut","mar","kwi","maj","cze","lip","sie","wrz","paź","lis","gru"];

function getWeekRangeLabel(): string {
  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today); mon.setDate(today.getDate() - ((dow + 6) % 7));
  const sun = new Date(mon);  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => `${d.getDate()} ${PL_MONTHS_SHORT[d.getMonth()]}`;
  return `${fmt(mon)} - ${fmt(sun)}`;
}

function fmtTaskDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${PL_MONTHS_SHORT[d.getMonth()]}`;
}

type DateVal = {
  date: Date | null;
  time: string;
  reminder: string;
  repeat: string;
  startTime: string;
  endTime: string;
  duration: boolean;
  allDay: boolean;
};

const DEFAULT_DATE_VAL: DateVal = {
  date: null, time: "", reminder: "", repeat: "",
  startTime: "09:00", endTime: "10:00", duration: false, allDay: true,
};

function buildCalendarGrid(viewYear: number, viewMonth: number) {
  const firstDow   = new Date(viewYear, viewMonth, 1).getDay();
  const offset     = (firstDow + 6) % 7;
  const inMonth    = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevDays   = new Date(viewYear, viewMonth, 0).getDate();
  const cells: { d: number; m: number; y: number; cur: boolean }[] = [];

  for (let i = offset - 1; i >= 0; i--) {
    const m = viewMonth === 0  ? 11 : viewMonth - 1;
    const y = viewMonth === 0  ? viewYear - 1 : viewYear;
    cells.push({ d: prevDays - i, m, y, cur: false });
  }
  for (let d = 1; d <= inMonth; d++) cells.push({ d, m: viewMonth, y: viewYear, cur: true });
  let nd = 1;
  while (cells.length < 42) {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ d: nd++, m, y, cur: false });
  }
  return cells;
}

function formatDateLabel(val: DateVal): string {
  if (!val.date) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tmrw  = new Date(today); tmrw.setDate(tmrw.getDate() + 1);
  const d     = new Date(val.date); d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return "Dziś";
  if (d.getTime() === tmrw.getTime())  return "Jutro";
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

function todayStr() {
  const d = new Date();
  const w = d.toLocaleDateString("pl-PL", { weekday: "long" });
  const r = d.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
  return (w[0].toUpperCase() + w.slice(1)) + ", " + r;
}

function viewedTaskDayHeading(view: string) {
  if (view !== "dzis" && view !== "jutro") return null;
  const date = new Date();
  if (view === "jutro") date.setDate(date.getDate() + 1);
  const weekday = date.toLocaleDateString("pl-PL", { weekday: "long" });
  return `${weekday}, ${view === "dzis" ? "Dziś" : "Jutro"}`;
}

function overdueDateLabel(calendarDate: string): string {
  const daysAgo = calendarDaysBetween(calendarDate, todayLocalDateKey());
  if (daysAgo === null) return "Po terminie";
  if (daysAgo === 1) return "Wczoraj";
  if (daysAgo > 1) return `${daysAgo} dni temu`;
  return "Po terminie";
}

function getMiniWeek() {
  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return { n: d.getDate(), today: d.toDateString() === today.toDateString() };
  });
}

// ── Shared dropdown options ───────────────────────────────
const REMINDER_OPTIONS = [
  { value: "",     label: "Brak"           },
  { value: "0",    label: "W momencie"     },
  { value: "5",    label: "5 minut przed"  },
  { value: "10",   label: "10 minut przed" },
  { value: "30",   label: "30 minut przed" },
  { value: "60",   label: "1 godzina przed"},
  { value: "1440", label: "1 dzień przed"  },
];

const REPEAT_OPTIONS = [
  { value: "",        label: "Nie powtarzaj" },
  { value: "daily",   label: "Codziennie"    },
  { value: "weekly",  label: "Co tydzień"    },
  { value: "monthly", label: "Co miesiąc"    },
  { value: "yearly",  label: "Co rok"        },
];

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw";
  } catch {
    return "Europe/Warsaw";
  }
}

function scheduleFromDateValue(value: DateVal): TaskSchedule | undefined {
  if (!value.date) return undefined;
  const hasTime = value.duration ? Boolean(value.startTime && value.endTime) : Boolean(value.time);
  const allDay = value.allDay || !hasTime;
  return {
    allDay,
    startTime: allDay ? "" : value.duration ? value.startTime : value.time,
    endTime: !allDay && value.duration ? value.endTime : undefined,
    reminderMinutes: value.reminder === "" ? undefined : Number(value.reminder),
    recurrence: (value.repeat || undefined) as TaskRecurrence | undefined,
    timezone: browserTimezone(),
  };
}

// ── Custom select (themed) ────────────────────────────────
function CustomSelect({ value, onChange, options, placeholder = "Wybierz…" }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select
      compact
      aria-label={placeholder}
      value={value}
      options={options}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

// Native time input keeps keyboard entry, validation, and the platform picker
// in one control instead of maintaining a second time-selection model.
function TimePicker({
  value,
  onChange,
  label = "Godzina",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 10px", borderRadius: "var(--radius-lg)",
      border: `1px solid ${C.borderStrong}`,
      background: C.inputBg,
    }}>
      <Clock size={13} strokeWidth={1.5} aria-hidden="true" style={{ color: C.iceBlue, flexShrink: 0 }} />
      <input
        type="time"
        step={1800}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          flex: 1, minWidth: 0, padding: "4px 6px",
          border: "none", borderRadius: 6, background: "transparent",
          color: C.iceBlue, fontSize: "13px",
          fontFamily: "'DM Mono', monospace",
        }}
      />
      {value && (
        <button
          type="button"
          aria-label={`Wyczyść: ${label.toLocaleLowerCase("pl-PL")}`}
          onClick={() => onChange("")}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", padding: 4 }}
        >
          <X size={12} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ── Date Picker Popup ─────────────────────────────────────
function DatePickerPopup({
  value, onConfirm, onClose, anchorEl, placementAnchorEl,
}: {
  value: DateVal;
  onConfirm: (v: DateVal) => void;
  onClose: () => void;
  anchorEl: HTMLElement;
  placementAnchorEl?: HTMLElement | null;
}) {
  const [tab,     setTab]     = useState<"data" | "duracja">("data");
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [selDate,    setSelDate]    = useState<Date | null>(() => {
    if (value.date) return value.date;
    const t = new Date(); t.setHours(0, 0, 0, 0); return t;
  });
  const [viewYear,   setViewYear]   = useState((value.date ?? today).getFullYear());
  const [viewMonth,  setViewMonth]  = useState((value.date ?? today).getMonth());
  const [time,       setTime]       = useState(value.time || (value.duration ? value.startTime : ""));
  const [reminder,   setReminder]   = useState(value.reminder);
  const [repeat,     setRepeat]     = useState(value.repeat);
  const [startTime,  setStartTime]  = useState(value.startTime || "09:00");
  const [endTime,    setEndTime]    = useState(value.endTime   || "10:00");
  const [showTime,       setShowTime]       = useState(false);
  const [showRem,        setShowRem]        = useState(false);
  const [showRep,        setShowRep]        = useState(false);
  const [openTimeField,  setOpenTimeField]  = useState<"start" | "koniec" | null>(null);
  const [allDay,         setAllDay]         = useState(value.allDay);
  const [showDurRem,     setShowDurRem]     = useState(false);
  const [showDurRep,     setShowDurRep]     = useState(false);
  const scheduleError = tab === "duracja" && !selDate
    ? "Wybierz datę dla przedziału czasu."
    : tab === "duracja" && !allDay && (!startTime || !endTime)
      ? "Podaj godzinę rozpoczęcia i zakończenia."
      : tab === "duracja" && !allDay && endTime <= startTime
        ? "Godzina zakończenia musi być późniejsza niż rozpoczęcia."
        : "";

  const popRef = useRef<HTMLDivElement>(null);
  const popWidth = 292;
  const [popupPosition, setPopupPosition] = useState({ top: 8, left: 8 });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const selected = popRef.current?.querySelector<HTMLElement>("[aria-pressed='true']");
      (selected ?? popRef.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    const target = placementAnchorEl ?? anchorEl;
    const rect = target.getBoundingClientRect();
    const popupHeight = popRef.current?.getBoundingClientRect().height ?? (placementAnchorEl ? 650 : 420);
    let left = placementAnchorEl ? rect.right + 8 : rect.right - popWidth;
    let top = placementAnchorEl ? rect.top : rect.bottom + 6;

    if (placementAnchorEl && left + popWidth > window.innerWidth - 8) {
      left = rect.left - popWidth - 8;
    }
    if (top + popupHeight > window.innerHeight - 8) {
      top = placementAnchorEl ? rect.bottom - popupHeight : window.innerHeight - popupHeight - 8;
    }

    setPopupPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - popWidth - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - popupHeight - 8)),
    });
  }, [anchorEl, placementAnchorEl, tab, showTime, showRem, showRep, showDurRem, showDurRep, allDay]);

  useEffect(() => {
    const reposition = () => {
      const target = placementAnchorEl ?? anchorEl;
      const rect = target.getBoundingClientRect();
      const popupHeight = popRef.current?.getBoundingClientRect().height ?? 650;
      let left = placementAnchorEl ? rect.right + 8 : rect.right - popWidth;
      let top = placementAnchorEl ? rect.top : rect.bottom + 6;
      if (placementAnchorEl && left + popWidth > window.innerWidth - 8) left = rect.left - popWidth - 8;
      if (top + popupHeight > window.innerHeight - 8) top = placementAnchorEl ? rect.bottom - popupHeight : window.innerHeight - popupHeight - 8;
      setPopupPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - popWidth - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - popupHeight - 8)),
      });
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [anchorEl, placementAnchorEl]);

  const confirmAndClose = useCallback(() => {
    if (scheduleError) return;
    onConfirm({
      date: selDate,
      time: allDay ? "" : tab === "data" ? time : "",
      reminder,
      repeat,
      startTime: allDay ? "" : startTime,
      endTime: allDay ? "" : endTime,
      duration: tab === "duracja" && !allDay,
      allDay,
    });
    onClose();
    requestAnimationFrame(() => anchorEl.focus());
  }, [allDay, anchorEl, endTime, onClose, onConfirm, reminder, repeat, scheduleError, selDate, startTime, tab, time]);

  const cancelAndClose = useCallback(() => {
    onClose();
    requestAnimationFrame(() => anchorEl.focus());
  }, [anchorEl, onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const insideAnchor = anchorEl.contains(e.target as Node) || Boolean(placementAnchorEl?.contains(e.target as Node));
      if (popRef.current && !popRef.current.contains(e.target as Node) && !insideAnchor) {
        onClose();
        requestAnimationFrame(() => anchorEl.focus());
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      requestAnimationFrame(() => anchorEl.focus());
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorEl, onClose, placementAnchorEl]);

  const cells = buildCalendarGrid(viewYear, viewMonth);

  const isSame = (d: Date | null, y: number, m: number, n: number) =>
    d ? d.getFullYear() === y && d.getMonth() === m && d.getDate() === n : false;
  const isToday = (y: number, m: number, n: number) =>
    today.getFullYear() === y && today.getMonth() === m && today.getDate() === n;

  const selectDate = (y: number, m: number, d: number) => {
    setSelDate(new Date(y, m, d));
    if (m !== viewMonth) { setViewYear(y); setViewMonth(m); }
  };

  const prevMonth = () => viewMonth === 0  ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1);
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0),  setViewYear(y => y + 1)) : setViewMonth(m => m + 1);
  const goToday   = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };

  const tmrw = new Date(today); tmrw.setDate(tmrw.getDate() + 1);
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);
  const nextMonth_ = new Date(today); nextMonth_.setMonth(nextMonth_.getMonth() + 1);

  const quickDates = [
    { label: "Dziś",   icon: Sun,         date: today       },
    { label: "Jutro",  icon: Sunrise,     date: tmrw        },
    { label: "Tydzień",icon: CalendarDays,date: nextWeek    },
    { label: "Miesiąc",icon: Moon,        date: nextMonth_  },
  ];

  const handleOk = confirmAndClose;

  const handleClear = () => {
    setSelDate(null); setTime(""); setReminder(""); setRepeat("");
    setStartTime("09:00"); setEndTime("10:00"); setAllDay(true);
  };

  const rowBtn = {
    width: "100%", display: "flex" as const, alignItems: "center" as const,
    gap: "10px", padding: "9px 2px", background: "none", border: "none",
    cursor: "pointer", color: C.textMuted,
  };

  const moveCalendarFocus = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const movement: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    let nextIndex = index + (movement[event.key] ?? 0);
    if (event.key === "Home") nextIndex = index - (index % 7);
    if (event.key === "End") nextIndex = index + (6 - (index % 7));
    if (!(event.key in movement) && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const target = popRef.current?.querySelector<HTMLButtonElement>(`[data-task-day-index="${Math.max(0, Math.min(41, nextIndex))}"]`);
    target?.focus();
  };

  return (
    <div
      ref={popRef}
      role="dialog"
      aria-modal="false"
      aria-label="Ustaw termin zadania"
      aria-describedby={scheduleError ? "task-schedule-error" : undefined}
      tabIndex={-1}
      style={{
        position: "fixed", top: popupPosition.top, left: popupPosition.left, width: `${popWidth}px`, zIndex: 9999,
        background: C.elevated,
        border: `1px solid ${C.borderStrong}`,
        borderRadius: "var(--radius-lg)",
        boxShadow: C.floatingShadow,
        overflow: "hidden",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* ── Top tabs ── */}
      <Tabs
        className="task-schedule-tabs"
        ariaLabel="Sposób planowania terminu"
        activeId={tab}
        onChange={(id) => setTab(id as "data" | "duracja")}
        items={[
          { id: "data", label: "Data", panelId: "task-date-data-panel", tabId: "task-date-data-tab" },
          { id: "duracja", label: "Czas trwania", panelId: "task-date-duracja-panel", tabId: "task-date-duracja-tab" },
        ]}
      />

      {tab === "data" ? (
        <div id="task-date-data-panel" role="tabpanel" aria-labelledby="task-date-data-tab" style={{ padding: "12px" }}>
          {/* ── Quick shortcuts ── */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
            {quickDates.map(({ label, icon: Icon, date: qd }) => {
              const active = isSame(selDate, qd.getFullYear(), qd.getMonth(), qd.getDate());
              return (
                <button
                  key={label}
                  onClick={() => { setSelDate(new Date(qd)); setViewYear(qd.getFullYear()); setViewMonth(qd.getMonth()); }}
                  style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                    gap: "5px", padding: "9px 4px", borderRadius: "var(--radius-md)",
                    background: active ? C.iceBlueBg : C.elevated,
                    color: active ? C.iceBlue : C.textMuted,
                    border: `1px solid ${active ? C.blueBorder : "transparent"}`,
                    cursor: "pointer",
                  }}
                >
                  <Icon size={15} strokeWidth={1.5} />
                  <span style={{ fontSize: "9px", lineHeight: 1, whiteSpace: "nowrap" }}>{label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Month navigation ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 500, color: C.textPrimary }}>
              {PL_MONTHS[viewMonth]} {viewYear}
            </span>
            <div style={{ display: "flex", gap: "2px" }}>
              {[
                { icon: ChevronLeft,  action: prevMonth },
                { icon: Circle,       action: goToday   },
                { icon: ChevronRight, action: nextMonth },
              ].map(({ icon: Icon, action }, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={i === 0 ? "Poprzedni miesiąc" : i === 1 ? "Pokaż bieżący miesiąc" : "Następny miesiąc"}
                  onClick={action}
                  style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: C.textMuted, padding: "4px 5px", borderRadius: "6px",
                  display: "flex", alignItems: "center",
                }}>
                  <Icon size={i === 1 ? 7 : 13} strokeWidth={i === 1 ? 2.5 : 1.75} />
                </button>
              ))}
            </div>
          </div>

          {/* ── Day headers ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: "2px" }}>
            {["P","W","Ś","C","P","S","N"].map((d, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: "10px", color: C.textDisabled, padding: "3px 0", fontWeight: 600 }}>
                {d}
              </div>
            ))}
          </div>

          {/* ── Calendar grid ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "1px" }}>
            {cells.map((cell, i) => {
              const sel = isSame(selDate, cell.y, cell.m, cell.d);
              const tod = isToday(cell.y, cell.m, cell.d);
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={new Intl.DateTimeFormat("pl-PL", { dateStyle: "full" }).format(new Date(cell.y, cell.m, cell.d, 12))}
                  aria-pressed={sel}
                  aria-current={tod ? "date" : undefined}
                  data-task-day-index={i}
                  tabIndex={sel || (!selDate && tod) ? 0 : -1}
                  onClick={() => selectDate(cell.y, cell.m, cell.d)}
                  onKeyDown={(event) => moveCalendarFocus(event, i)}
                  style={{
                    aspectRatio: "1", display: "flex", alignItems: "center",
                    justifyContent: "center", borderRadius: "50%",
                    fontSize: "11px",
                    fontFamily: "'DM Mono', monospace",
                    background: sel ? C.iceBlueSolid : "transparent",
                    color: sel ? C.textPrimary : tod ? C.iceBlue : cell.cur ? C.textPrimary : C.textDisabled,
                    fontWeight: tod && !sel ? 700 : 400,
                    border: `1px solid ${tod && !sel ? C.blueBorder : "transparent"}`,
                    cursor: "pointer",
                  }}
                >
                  {cell.d}
                </button>
              );
            })}
          </div>

          {/* ── Expandable rows ── */}
          {[
            {
              key: "time", label: "Czas", Icon: Clock,
              show: showTime, toggle: () => setShowTime(v => !v),
              content: <TimePicker label="Godzina zadania" value={time} onChange={v => { setTime(v); setStartTime(v); if (v) setAllDay(false); }} />,
            },
            {
              key: "reminder", label: "Przypomnienie", Icon: Bell,
              show: showRem, toggle: () => setShowRem(v => !v),
              content: <CustomSelect value={reminder} onChange={setReminder} options={REMINDER_OPTIONS} />,
            },
            {
              key: "repeat", label: "Powtarzaj", Icon: RotateCcw,
              show: showRep, toggle: () => setShowRep(v => !v),
              content: <CustomSelect value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} />,
            },
          ].map(({ key, label, Icon, show, toggle, content }) => (
            <div key={key} style={{ borderTop: `1px solid ${C.borderSubtle}`, marginTop: "8px" }}>
              <button onClick={toggle} style={rowBtn}>
                <Icon size={13} strokeWidth={1.5} />
                <span style={{ flex: 1, textAlign: "left", fontSize: "12px" }}>{label}</span>
                {key === "time" && time && !allDay && (
                  <span style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", color: C.iceBlue }}>{time}</span>
                )}
                <ChevronRight size={11} strokeWidth={1.5}
                  style={{ transform: show ? "rotate(90deg)" : "none", transition: "transform .2s", color: C.textDisabled }} />
              </button>
              {show && <div style={{ paddingBottom: "8px" }}>{content}</div>}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.borderSubtle}`, marginTop: "8px" }}>
            <button
              type="button"
              role="switch"
              aria-checked={allDay}
              onClick={() => { setAllDay(v => !v); setShowTime(false); }}
              style={{ ...rowBtn, justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px" }}>Cały dzień</span>
              <span style={{
                width: "34px", height: "18px", borderRadius: "var(--radius-pill)", position: "relative", display: "block",
                background: allDay ? C.iceBlueSolid : C.elevated, transition: "background .2s",
              }}>
                <span style={{
                  position: "absolute", top: "3px", left: allDay ? "17px" : "3px", width: "12px", height: "12px",
                  borderRadius: "50%", background: C.textPrimary, transition: "left .2s",
                }} />
              </span>
            </button>
          </div>
        </div>
      ) : (
        /* ── Czas trwania tab ── */
        <div id="task-date-duracja-panel" role="tabpanel" aria-labelledby="task-date-duracja-tab">
          {/* Cały dzień — ustawione przed godziną rozpoczęcia */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px" }}>
            <span style={{ fontSize: "13px", color: C.textSecond }}>Cały dzień</span>
            <button
              type="button"
              role="switch"
              aria-checked={allDay}
              aria-label="Cały dzień"
              onClick={() => { setAllDay(v => !v); setOpenTimeField(null); }}
              style={{
                width: "36px", height: "20px", borderRadius: "var(--radius-pill)", border: "none",
                background: allDay ? C.iceBlueSolid : C.elevated,
                cursor: "pointer", position: "relative" as const, transition: "background .2s",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute" as const, top: "3px",
                left: allDay ? "17px" : "3px",
                width: "14px", height: "14px", borderRadius: "50%",
                background: C.textPrimary, transition: "left .2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }} />
            </button>
          </div>

          <div style={{ height: "1px", background: C.borderSubtle, margin: "2px 0" }} />

          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            margin: "8px 12px 2px", padding: "8px 10px",
            borderRadius: 8, background: C.inputBg, border: `1px solid ${C.borderSubtle}`,
          }}>
            <Calendar size={13} aria-hidden="true" style={{ color: C.iceBlue, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: C.textSecond }}>
              {selDate
                ? selDate.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })
                : "Nie wybrano daty"}
            </span>
            <span style={{ fontSize: 10, color: C.textMuted }}>ten sam dzień</span>
          </div>

          {/* Rozpocznij / Koniec rows */}
          {([
            { label: "Rozpocznij", timeVal: startTime, field: "start" as const },
            { label: "Koniec", timeVal: endTime, field: "koniec" as const },
          ]).map(({ label, timeVal, field }) => {
            const open    = openTimeField === field;
            return (
              <div key={field}>
                <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 12px" }}>
                  <span style={{ width: "68px", fontSize: "12px", color: C.textSecond, flexShrink: 0 }}>{label}</span>
                  {/* Time chip — toggles picker */}
                  <button
                    type="button"
                    disabled={allDay}
                    onClick={() => { if (!allDay) setOpenTimeField(open ? null : field); }}
                    style={{
                      flex: 1, padding: "6px 10px", borderRadius: "8px", textAlign: "center" as const,
                      background: open ? C.iceBlueBg : C.inputBg,
                      border: `1px solid ${open ? C.blueBorder : C.borderSubtle}`,
                      color: open ? C.iceBlue : timeVal ? C.textPrimary : C.textMuted,
                      fontSize: "12px", fontFamily: "'DM Mono', monospace",
                      cursor: allDay ? "default" : "pointer", opacity: allDay ? 0.55 : 1,
                    }}
                  >
                    {timeVal || "--:--"}
                  </button>
                </div>
                {/* Inline time picker */}
                {open && !allDay && (
                  <div style={{ padding: "0 12px 8px" }}>
                    <TimePicker
                      value={timeVal}
                      label={field === "start" ? "Godzina rozpoczęcia" : "Godzina zakończenia"}
                      onChange={v => {
                        if (field === "start") { setStartTime(v); setTime(v); }
                        else setEndTime(v);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Timezone */}
          <div style={{
            margin: "0 12px 4px",
            borderRadius: "8px", background: C.inputBg, border: `1px solid ${C.borderSubtle}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "9px 12px",
          }}>
            <span style={{ fontSize: "12px", color: C.textSecond }}>{browserTimezone()}</span>
            <span style={{ fontSize: "10px", color: C.textMuted }}>strefa urządzenia</span>
          </div>

          {/* O godzinie (przypomnienie) */}
          <div style={{ borderTop: `1px solid ${C.borderSubtle}`, margin: "8px 12px 0" }}>
            <button onClick={() => { setShowDurRem(v => !v); setShowDurRep(false); }} style={{
              width: "100%", display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 0", background: "none", border: "none", cursor: "pointer",
            }}>
              <Bell size={13} strokeWidth={1.5} style={{ color: reminder ? C.iceBlue : C.iceBlue }} />
              <span style={{ flex: 1, textAlign: "left" as const, fontSize: "12px", color: C.iceBlue }}>
                {reminder ? (REMINDER_OPTIONS.find(o => o.value === reminder)?.label ?? "O godzinie") : "O godzinie"}
              </span>
              <ChevronRight size={11} strokeWidth={1.5}
                style={{ color: C.textDisabled, transform: showDurRem ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
            </button>
            {showDurRem && (
              <div style={{ paddingBottom: 10 }}>
                <CustomSelect value={reminder} onChange={setReminder} options={REMINDER_OPTIONS} />
              </div>
            )}
          </div>

          {/* Powtarzaj */}
          <div style={{ borderTop: `1px solid ${C.borderSubtle}`, margin: "0 12px" }}>
            <button onClick={() => { setShowDurRep(v => !v); setShowDurRem(false); }} style={{
              width: "100%", display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 0", background: "none", border: "none", cursor: "pointer",
            }}>
              <RotateCcw size={13} strokeWidth={1.5} style={{ color: repeat ? C.iceBlue : C.textMuted }} />
              <span style={{ flex: 1, textAlign: "left" as const, fontSize: "12px", color: repeat ? C.iceBlue : C.textMuted }}>
                {repeat ? (REPEAT_OPTIONS.find(o => o.value === repeat)?.label ?? "Powtarzaj") : "Powtarzaj"}
              </span>
              <ChevronRight size={11} strokeWidth={1.5}
                style={{ color: C.textDisabled, transform: showDurRep ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
            </button>
            {showDurRep && (
              <div style={{ paddingBottom: 10 }}>
                <CustomSelect value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} />
              </div>
            )}
          </div>
        </div>
      )}

      {scheduleError && (
        <p
          id="task-schedule-error"
          role="alert"
          style={{ margin: 0, padding: "8px 12px", color: C.danger, fontSize: 11, lineHeight: 1.45 }}
        >
          {scheduleError}
        </p>
      )}

      {/* ── Footer ── */}
      <div style={{
        display: "flex", gap: "8px", padding: "10px 12px",
        borderTop: `1px solid ${C.borderSubtle}`,
      }}>
        <button type="button" onClick={handleClear} style={{
          flex: 1, padding: "8px", borderRadius: "8px",
          background: "transparent", border: `1px solid ${C.borderSubtle}`,
          color: C.textSecond, fontSize: "12px", fontWeight: 500, cursor: "pointer",
        }}>
          Wyczyść
        </button>
        <button type="button" onClick={cancelAndClose} style={{
          flex: 1, padding: "8px", borderRadius: "8px",
          background: "transparent", border: `1px solid ${C.borderSubtle}`,
          color: C.textSecond, fontSize: "12px", fontWeight: 500, cursor: "pointer",
        }}>
          Anuluj
        </button>
        <button type="button" onClick={handleOk} disabled={Boolean(scheduleError)} style={{
          flex: 1, padding: "8px", borderRadius: "8px",
          background: C.iceBlueSolid, border: "none",
          color: C.textPrimary, fontSize: "var(--text-body)", fontWeight: 600,
          cursor: scheduleError ? "not-allowed" : "pointer", opacity: scheduleError ? 0.55 : 1,
        }}>
          Zastosuj
        </button>
      </div>
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────
function TaskRow({
  task, selected, onToggle, onSelect, onUpdate, tagi, deadlineLabel,
}: {
  task: Task; selected: boolean;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  onUpdate: (id: number, patch: Partial<Task>) => void;
  tagi: TagItem[];
  deadlineLabel?: string;
}) {
  const taskTags = task.source
    ? []
    : (task.tags ?? []).map(id => tagi.find(t => t.id === id)).filter(Boolean) as TagItem[];
  const priorityColor = task.priority === "high" ? C.danger : task.priority === "medium" ? C.warning : task.priority === "low" ? C.seaGlass : null;
  const timeLabel = task.time ? `${task.time}${task.endTime ? `–${task.endTime}` : ""}` : null;
  const sourceLabel = task.source?.kind === "work" ? "Praca" : task.source ? "Podróże" : null;

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-100 group"
      style={{
        background: selected ? C.card : "transparent",
        borderLeft: selected ? `2px solid ${C.iceBlue}` : "2px solid transparent",
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = C.card + "88"; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <button
        type="button"
        aria-label={task.done ? "Oznacz zadanie jako niewykonane" : "Oznacz zadanie jako wykonane"}
        onClick={e => { e.stopPropagation(); onToggle(task.id); }}
        className={`task-checkbox mt-[2px] ${task.done ? "is-checked" : ""}`}
        style={{ "--task-checkbox-color": task.done ? C.iceBlue : priorityColor ?? C.borderStrong } as React.CSSProperties}
      >
        {task.done && <Check size={8} strokeWidth={2.5} />}
      </button>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Otwórz szczegóły zadania: ${task.text}`}
        onClick={() => onSelect(task.id)}
        className="flex-1 min-w-0 border-0 bg-transparent p-0 text-left"
      >
        <span className="text-[13px] leading-snug block" style={{
          color: task.done ? C.textMuted : C.textPrimary,
          textDecoration: task.done ? "line-through" : "none",
        }}>
          {task.text}
        </span>
        {task.date && !deadlineLabel && (
          <div className="flex items-center gap-1 mt-1">
            <Calendar size={9} strokeWidth={1.5} style={{ color: C.textMuted }} />
            <span style={{ fontSize: "10px", color: C.textMuted }}>{task.date}</span>
          </div>
        )}
        {task.source && (
          <span className="mt-1 block truncate text-[10px]" style={{ color: C.textMuted }}>
            {sourceLabel} · {task.source.context}
          </span>
        )}
      </button>
      {(taskTags.length > 0 || timeLabel || deadlineLabel || task.source) && (
        <div className="flex items-center gap-1.5 flex-shrink-0 self-center ml-2">
          {taskTags.map(td => (
            <button
              type="button"
              key={td.id}
              onClick={e => { e.stopPropagation(); onUpdate(task.id, { tags: (task.tags ?? []).filter(id => id !== td.id) }); }}
              title={`Usuń tag #${td.label}`}
              className="task-tag-control flex items-center gap-0.5 rounded-md"
              style={{
                fontSize: "10px", color: C.textSecond, background: C.inputBg,
                border: `1px solid ${C.borderSubtle}`, boxShadow: `inset 2px 0 0 ${td.color}`,
                padding: "3px 5px 3px 7px", cursor: "pointer", whiteSpace: "nowrap",
              }}>
              #{td.label}
              <X size={7} strokeWidth={2.2} />
            </button>
          ))}
          {timeLabel && (
            <div className="flex items-center gap-1" style={{ paddingLeft: taskTags.length > 0 ? 4 : 0 }}>
              <Clock size={9} strokeWidth={1.5} style={{ color: C.iceBlue }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: C.iceBlue, whiteSpace: "nowrap" }}>
                {timeLabel}
              </span>
            </div>
          )}
          {deadlineLabel && (
            <div className="task-overdue-deadline">
              <Calendar size={9} strokeWidth={1.6} aria-hidden="true" />
              <span>{deadlineLabel}</span>
            </div>
          )}
          {task.source && (
            <Link
              to={task.source.href}
              aria-label={`Otwórz zadanie w module ${sourceLabel}: ${task.source.context}`}
              className="task-source-link rounded-md px-1.5 text-[10px] no-underline"
              style={{ color: C.iceBlue, background: C.iceBlueBg }}
            >
              {sourceLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ── Priority dropdown ─────────────────────────────────────
const PRIORITY_FLAGS = [
  { p: "high"   as Priority, label: "Wysoki", color: C.danger  },
  { p: "medium" as Priority, label: "Średni", color: C.warning },
  { p: "low"    as Priority, label: "Niski",  color: C.iceBlue },
  { p: null,                 label: "Brak",   color: C.textMuted },
] as const;

function PriorityDropdown({ current, anchorEl, onSelect, onClose }: {
  current: Priority | null; anchorEl: HTMLElement;
  onSelect: (p: Priority | null) => void; onClose: () => void;
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const rect = anchorEl.getBoundingClientRect();
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [anchorEl, onClose]);
  return (
    <Menu ref={ref} style={{
      position: "fixed", top: rect.bottom + 4, right: window.innerWidth - rect.right,
      width: 148, zIndex: 9999,
    }}>
      {PRIORITY_FLAGS.map(({ p, label, color }) => (
        <MenuItem
          key={String(p)}
          selected={current === p}
          onClick={() => onSelect(p as Priority | null)}
          leadingIcon={<Flag fill={p ? color : "none"} style={{ color }} />}
          trailingIcon={current === p ? <Check /> : undefined}
        >
          {label}
        </MenuItem>
      ))}
    </Menu>
  );
}

// ── List picker dropdown ───────────────────────────────────
function ListPicker({ current, anchorEl, onSelect, onClose, listy }: {
  current: string | null; anchorEl: HTMLElement;
  onSelect: (id: string | null) => void; onClose: () => void;
  listy: ListItem[];
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const rect = anchorEl.getBoundingClientRect();
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [anchorEl, onClose]);

  const all = [
    { id: null as string | null, label: "Skrzynka zadań", color: C.textMuted },
    ...listy.map(l => ({ id: l.id as string | null, label: l.label, color: l.color })),
  ].filter(l => l.label.toLowerCase().includes(q.toLowerCase()));

  const currentLabel = listy.find(l => l.id === current)?.label ?? "Skrzynka zadań";

  return (
    <Menu ref={ref} style={{
      position: "fixed", bottom: window.innerHeight - rect.top + 4, left: rect.left,
      width: 210, zIndex: 9999,
    }}>
      <div style={{ padding: "8px", borderBottom: `1px solid ${C.borderSubtle}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.inputBg, borderRadius: 7, padding: "5px 9px" }}>
          <Search size={11} strokeWidth={1.5} style={{ color: C.textDisabled, flexShrink: 0 }} />
          <input autoFocus placeholder="Szukaj" value={q} onChange={e => setQ(e.target.value)}
            style={{ background: "none", border: "none", outline: "none", fontSize: 10, color: C.textPrimary, flex: 1, fontFamily: "var(--font-sans)" }} />
        </div>
      </div>
      {all.map(l => (
        <MenuItem
          key={String(l.id)}
          selected={current === l.id}
          onClick={() => onSelect(l.id)}
          leadingIcon={<span className="h-2 w-2 rounded-full" style={{ background: l.color }} />}
          trailingIcon={current === l.id ? <Check /> : undefined}
        >
          {l.label}
        </MenuItem>
      ))}
      <div style={{ borderTop: `1px solid ${C.borderSubtle}`, padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}>
        <Inbox size={11} strokeWidth={1.5} style={{ color: C.textDisabled }} />
        <span style={{ fontSize: 11, color: C.textMuted }}>{currentLabel}</span>
      </div>
    </Menu>
  );
}

// ── More menu ─────────────────────────────────────────────
const MORE_ITEMS: ({ action: string; label: string; icon: React.ComponentType<{size?:number;strokeWidth?:number;style?:React.CSSProperties}>; danger?: boolean } | null)[] = [
  { action: "subtask",   label: "Dodaj podzadanie",   icon: ListPlus   },
  { action: "print",     label: "Drukuj",               icon: Printer    },
  null,
  { action: "delete",    label: "Usuń",                 icon: Trash2, danger: true },
];

function MoreMenu({ anchorEl, onAction, onClose }: {
  anchorEl: HTMLElement;
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const rect = anchorEl.getBoundingClientRect();
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      anchorEl.focus();
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorEl, onClose]);
  return (
    <Menu ref={ref} aria-label="Akcje zadania" style={{
      position: "fixed", bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right,
      width: 210, zIndex: 9999,
    }}>
      {MORE_ITEMS.map((item, i) =>
        item === null
          ? <div key={i} style={{ height: 1, background: C.borderSubtle, margin: "3px 0" }} />
          : (
            <MenuItem key={item.action} tone={item.danger ? "danger" : "default"} onClick={() => onAction(item.action)} leadingIcon={<item.icon />}>
              {item.label}
            </MenuItem>
          )
      )}
    </Menu>
  );
}

// ── Task detail panel ─────────────────────────────────────
export function TaskDetail({ task, onClose, onUpdate, onDelete, listy, tagi }: {
  task: Task; onClose: () => void;
  onUpdate: (id: number, patch: Partial<Task>) => void;
  onDelete: (id: number) => void;
  listy: ListItem[];
  tagi: TagItem[];
}) {
  const [showPriority,  setShowPriority]  = useState(false);
  const [showListPick,  setShowListPick]  = useState(false);
  const [showMore,      setShowMore]      = useState(false);
  const [showComments,  setShowComments]  = useState(false);
  const [newComment,    setNewComment]    = useState("");
  const comments = task.comments ?? [];
  const [editTitle,     setEditTitle]     = useState(task.text);
  const [editNotes,     setEditNotes]     = useState(task.notes ?? "");

  const [showDatePicker, setShowDatePicker] = useState(false);
  const taskCalendarDate = task.calendarDate;
  const parsedTaskDate = taskCalendarDate ? new Date(`${taskCalendarDate}T12:00:00`) : null;
  const storedSchedule = task.schedule;
  const [taskDateVal,    setTaskDateVal]    = useState<DateVal>({
    date: parsedTaskDate && !Number.isNaN(parsedTaskDate.getTime()) ? parsedTaskDate : null,
    time: (storedSchedule?.endTime ?? task.endTime) ? "" : storedSchedule?.startTime ?? task.time ?? "",
    reminder: storedSchedule?.reminderMinutes === undefined ? "" : String(storedSchedule.reminderMinutes),
    repeat: storedSchedule?.recurrence ?? "",
    startTime: storedSchedule?.startTime || task.time || "09:00",
    endTime: storedSchedule?.endTime || task.endTime || "10:00",
    duration: Boolean(storedSchedule?.endTime ?? task.endTime),
    allDay: storedSchedule?.allDay ?? !task.time,
  });
  useEffect(() => {
    const nextDate = taskCalendarDate ? new Date(`${taskCalendarDate}T12:00:00`) : null;
    const schedule = task.schedule;
    setTaskDateVal((current) => ({
      ...current,
      date: nextDate && !Number.isNaN(nextDate.getTime()) ? nextDate : null,
      time: (schedule?.endTime ?? task.endTime) ? "" : schedule?.startTime ?? task.time ?? "",
      reminder: schedule?.reminderMinutes === undefined ? "" : String(schedule.reminderMinutes),
      repeat: schedule?.recurrence ?? "",
      startTime: schedule?.startTime || task.time || "09:00",
      endTime: schedule?.endTime || task.endTime || "10:00",
      duration: Boolean(schedule?.endTime ?? task.endTime),
      allDay: schedule?.allDay ?? !task.time,
    }));
  }, [task.id, taskCalendarDate, task.time, task.endTime, task.schedule]);

  const flagBtnRef = useRef<HTMLButtonElement>(null);
  const listBtnRef = useRef<HTMLButtonElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const dateBtnRef = useRef<HTMLButtonElement>(null);

  // Sync title/notes when task changes
  useEffect(() => { setEditTitle(task.text); }, [task.text]);
  useEffect(() => { setEditNotes(task.notes ?? ""); }, [task.notes]);

  const closeAll = () => { setShowPriority(false); setShowListPick(false); setShowMore(false); };

  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  const flagColor = task.priority === "high" ? C.danger : task.priority === "medium" ? C.warning : task.priority === "low" ? C.iceBlue : C.textMuted;
  const listLabel = listy.find(l => l.id === task.list)?.label ?? "Skrzynka zadań";
  const listColor = listy.find(l => l.id === task.list)?.color ?? C.textMuted;
  const taskTagDefs = (task.tags ?? []).map(id => tagi.find(t => t.id === id)).filter(Boolean) as TagItem[];
  const dateStr   = task.date ?? "Bez terminu";
  const timeStr   = task.time ? `, ${task.time}${task.endTime ? `–${task.endTime}` : ""}` : "";
  const sourceLabel = task.source?.kind === "work" ? "Praca" : task.source ? "Podróże" : null;

  const addComment = () => {
    if (!newComment.trim()) return;
    const comment: TaskComment = {
      id: Date.now(),
      author: "Ty",
      text: newComment.trim(),
      time: new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date()),
    };
    onUpdate(task.id, { comments: [...comments, comment] });
    setNewComment("");
  };

  const toggleSubtask = (subId: number) => {
    const updated = (task.subtasks ?? []).map(s => s.id === subId ? { ...s, done: !s.done } : s);
    onUpdate(task.id, { subtasks: updated });
  };

  const D = {
    bg:     C.subSidebar,
    border: C.borderSubtle,
    hover:  C.elevated,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>

      {/* ── Top toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
        {/* Done checkbox (square) */}
        <button
          type="button"
          aria-label={task.done ? "Oznacz zadanie jako niewykonane" : "Oznacz zadanie jako wykonane"}
          onClick={() => onUpdate(task.id, { done: !task.done })}
          className={`task-checkbox task-checkbox--detail ${task.done ? "is-checked" : ""}`}
          style={{ "--task-checkbox-color": task.done ? C.iceBlue : C.borderStrong } as React.CSSProperties}
        >
          {task.done && <Check size={9} strokeWidth={2.5} />}
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: D.border, flexShrink: 0 }} />

        {/* Date chip — opens DatePickerPopup */}
        <button
          ref={dateBtnRef}
          type="button"
          aria-label="Zmień termin zadania"
          onClick={() => { setShowDatePicker(v => !v); closeAll(); }}
          style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, overflow: "hidden", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          <Calendar size={12} strokeWidth={1.5} style={{ color: C.iceBlue, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.iceBlue, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {dateStr}{timeStr}
          </span>
        </button>

        {/* Priority flag */}
        <button
          ref={flagBtnRef}
          type="button"
          aria-label={task.source?.kind === "travel" ? "Priorytet jest zarządzany w module źródłowym" : "Zmień priorytet zadania"}
          disabled={task.source?.kind === "travel"}
          onClick={() => { setShowPriority(v => !v); setShowListPick(false); setShowMore(false); }}
          style={{ background: "none", border: "none", cursor: task.source?.kind === "travel" ? "not-allowed" : "pointer", padding: 3, display: "flex", flexShrink: 0, opacity: task.source?.kind === "travel" ? 0.55 : 1 }}
        >
          <Flag size={15} strokeWidth={1.5} fill={task.priority ? flagColor : "none"} style={{ color: flagColor }} />
        </button>

        <button
          type="button"
          aria-label="Zamknij szczegóły zadania"
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex", flexShrink: 0, color: C.textMuted }}
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>

      {task.source && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: `1px solid ${D.border}`, background: C.iceBlueBg }}>
          <span style={{ minWidth: 0, flex: 1, fontSize: 10.5, color: C.textSecond, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Źródło: {sourceLabel} · {task.source.context}
          </span>
          <Link to={task.source.href} style={{ flexShrink: 0, fontSize: 10.5, color: C.iceBlue, textDecoration: "none" }}>
            Otwórz źródło
          </Link>
        </div>
      )}

      {/* ── Main content ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none", padding: "14px 14px 8px", display: "flex", flexDirection: "column" }}>

        {/* Title row — auto-height */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8, flexShrink: 0 }}>
          <textarea
            value={editTitle}
            placeholder="Co chciałbyś zrobić?"
            onChange={e => {
              setEditTitle(e.target.value);
              const t = e.target;
              t.style.height = "auto";
              t.style.height = t.scrollHeight + "px";
            }}
            onBlur={() => onUpdate(task.id, { text: editTitle })}
            ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
            rows={1}
            style={{
              flex: 1, background: "none", border: "none", outline: "none", resize: "none", overflow: "hidden",
              fontSize: 16, fontWeight: 600, color: C.textPrimary, lineHeight: 1.3,
              fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", padding: 0,
              textDecoration: task.done ? "line-through" : "none",
            }}
          />
        </div>

        {/* Notes — fills remaining space */}
        <textarea
          value={editNotes}
          disabled={Boolean(task.source)}
          onChange={e => { if (!task.source) setEditNotes(e.target.value); }}
          onBlur={() => { if (!task.source) onUpdate(task.id, { notes: editNotes }); }}
          placeholder={task.source ? "Notatki są zarządzane w module źródłowym." : "Wpisz treść lub wpisz /, aby wyświetlić menu"}
          style={{
            flex: 1, minHeight: 80, width: "100%", background: "none", border: "none", outline: "none", resize: "none",
            fontSize: 12, color: C.textSecond, lineHeight: 1.6,
            fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", padding: 0,
          }}
        />

        {/* Tags */}
        {!task.source && (taskTagDefs.length > 0 || showTagInput) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, alignItems: "center" }}>
            {taskTagDefs.map(td => (
              <span key={td.id} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 20,
                color: C.textSecond, background: C.inputBg,
                border: `1px solid ${C.borderSubtle}`, boxShadow: `inset 2px 0 0 ${td.color}`,
              }}>
                #{td.label}
                <button
                  type="button"
                  aria-label={`Usuń tag ${td.label} z zadania`}
                  className="task-tag-control"
                  onClick={() => onUpdate(task.id, { tags: (task.tags ?? []).filter(id => id !== td.id) })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", padding: 0, lineHeight: 1 }}>
                  <X size={9} strokeWidth={2.5} />
                </button>
              </span>
            ))}
            {showTagInput ? (
              <input
                autoFocus
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    const raw = tagInput.replace(/^#/, "").trim().toLowerCase();
                    if (raw) {
                      const exists = tagi.find(t => t.id === raw || t.label.toLowerCase() === raw);
                      const tagId = exists ? exists.id : raw;
                      if (!(task.tags ?? []).includes(tagId)) {
                        onUpdate(task.id, { tags: [...(task.tags ?? []), tagId] });
                      }
                    }
                    setTagInput(""); setShowTagInput(false);
                  }
                  if (e.key === "Escape") { setTagInput(""); setShowTagInput(false); }
                }}
                onBlur={() => { setTagInput(""); setShowTagInput(false); }}
                placeholder="#tag"
                style={{
                  background: C.subSidebar, border: `1px solid ${C.blueBorder}`, borderRadius: 20,
                  outline: "none", fontSize: 11, color: C.textSecond, padding: "3px 8px",
                  fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", width: 72,
                }}
              />
            ) : (
              <button
                type="button"
                className="task-tag-control"
                onClick={() => setShowTagInput(true)}
                style={{ background: "none", border: `1px dashed ${C.borderStrong}`, borderRadius: 20, cursor: "pointer", fontSize: 11, color: C.textMuted, padding: "3px 8px", display: "flex", alignItems: "center", gap: 3 }}>
                <Plus size={9} strokeWidth={2} /> tag
              </button>
            )}
          </div>
        )}
        {!task.source && taskTagDefs.length === 0 && !showTagInput && (
          <button
            type="button"
            className="task-tag-control"
            onClick={() => setShowTagInput(true)}
            style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 11, padding: 0 }}>
            <Tag size={11} strokeWidth={1.5} /> Dodaj tag
          </button>
        )}

        {/* Subtasks */}
        {!task.source && (task.subtasks ?? []).length > 0 && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${D.border}`, paddingTop: 12 }}>
            {(task.subtasks ?? []).map(st => (
              <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <button
                  type="button"
                  aria-label={st.done ? `Oznacz podzadanie ${st.text || "bez nazwy"} jako niewykonane` : `Oznacz podzadanie ${st.text || "bez nazwy"} jako wykonane`}
                  onClick={() => toggleSubtask(st.id)}
                  className={`task-checkbox ${st.done ? "is-checked" : ""}`}
                  style={{ "--task-checkbox-color": st.done ? C.iceBlue : C.borderStrong } as React.CSSProperties}
                >
                  {st.done && <Check size={7} strokeWidth={2.5} />}
                </button>
                <span style={{ fontSize: 12, color: st.done ? C.textMuted : C.textSecond, textDecoration: st.done ? "line-through" : "none" }}>{st.text || "Nowe podzadanie"}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${C.borderSubtle}`, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: C.textMuted }}>Naciśnij klawisz "Enter", aby dodać pozycję do listy</span>
            </div>
          </div>
        )}

        {/* Comments section */}
        {!task.source && showComments && comments.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, marginBottom: 12 }}>Komentarze {comments.length}</p>
            {comments.map(c => (
              <div key={c.id} style={{ display: "flex", gap: 9, marginBottom: 12 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, background: C.iceBlueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: C.iceBlue }}>
                  {c.author[0]}
                </div>
                <div>
                  <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: C.textPrimary }}>{c.author}</span>
                    <span style={{ fontSize: 10, color: C.textMuted }}>{c.time}</span>
                  </div>
                  <p style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Comment input ── */}
      {!task.source && showComments && (
        <div style={{ borderTop: `1px solid ${D.border}`, padding: "8px 12px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${newComment ? C.iceBlue : C.borderSubtle}`, borderRadius: 8, padding: "7px 10px", transition: "border-color .2s" }}>
            <input
              aria-label="Nowy komentarz"
              placeholder="Napisz komentarz"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addComment()}
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}
            />
          </div>
        </div>
      )}

      {/* ── Footer bar ── */}
      {task.source && (
        <div style={{ borderTop: `1px solid ${D.border}`, padding: "9px 12px", fontSize: 10, lineHeight: 1.45, color: C.textMuted }}>
          Tytuł, ukończenie i termin synchronizują się ze źródłem. Pozostałe pola edytuj w module {sourceLabel}.
        </div>
      )}
      <div style={{ borderTop: `1px solid ${D.border}`, display: task.source ? "none" : "flex", alignItems: "center", padding: "7px 10px", flexShrink: 0, gap: 4 }}>
        {/* List picker */}
        <button ref={listBtnRef}
          onClick={() => { setShowListPick(v => !v); setShowMore(false); setShowPriority(false); }}
          style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "left", minWidth: 0, padding: "2px 0" }}
        >
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: listColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listLabel}</span>
        </button>

        <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
          {/* Comments toggle */}
          <button type="button" aria-label="Pokaż komentarze" aria-expanded={showComments} onClick={() => setShowComments(v => !v)}
            style={{ padding: "4px 6px", borderRadius: 6, background: showComments ? C.iceBlueBg : "none", border: "none", cursor: "pointer", color: showComments ? C.iceBlue : C.textMuted, display: "flex", alignItems: "center", gap: 3 }}>
            <MessageSquare size={13} strokeWidth={1.5} />
            {comments.length > 0 && <span style={{ fontSize: 9, color: C.iceBlue, fontWeight: 700 }}>{comments.length}</span>}
          </button>
          {/* More (...) */}
          <button ref={moreBtnRef} type="button" aria-label="Więcej akcji zadania" aria-expanded={showMore}
            onClick={() => { setShowMore(v => !v); setShowListPick(false); setShowPriority(false); }}
            style={{ padding: "4px 5px", borderRadius: 6, background: showMore ? C.elevated : "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", alignItems: "center" }}>
            <MoreHorizontal size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ── Floating menus ── */}
      {showDatePicker && dateBtnRef.current && (
        <DatePickerPopup
          value={taskDateVal}
          onConfirm={v => {
            setTaskDateVal(v);
            const label = formatDateLabel(v);
            const calendarDate = v.date ? toCalendarDateKey(v.date) : undefined;
            if (task.source) {
              onUpdate(task.id, {
                date: label || undefined,
                calendarDate,
                ...(calendarDate ? { view: taskViewForCalendarDate(calendarDate) } : {}),
              });
              setShowDatePicker(false);
              return;
            }
            onUpdate(task.id, {
              date: label || undefined,
              time: v.duration ? v.startTime : v.time || undefined,
              endTime: v.duration ? v.endTime : undefined,
              calendarDate,
              schedule: scheduleFromDateValue(v),
              ...(calendarDate ? { view: taskViewForCalendarDate(calendarDate) } : {}),
            });
            setShowDatePicker(false);
          }}
          onClose={() => setShowDatePicker(false)}
          anchorEl={dateBtnRef.current}
        />
      )}
      {showPriority && task.source?.kind !== "travel" && flagBtnRef.current && (
        <PriorityDropdown
          current={task.priority ?? null}
          anchorEl={flagBtnRef.current}
          onSelect={p => { onUpdate(task.id, { priority: p ?? undefined }); setShowPriority(false); }}
          onClose={() => setShowPriority(false)}
        />
      )}
      {showListPick && !task.source && listBtnRef.current && (
        <ListPicker
          current={task.list ?? null}
          anchorEl={listBtnRef.current}
          onSelect={id => { onUpdate(task.id, { list: id ?? undefined }); setShowListPick(false); }}
          onClose={() => setShowListPick(false)}
          listy={listy}
        />
      )}
      {showMore && !task.source && moreBtnRef.current && (
        <MoreMenu
          anchorEl={moreBtnRef.current}
          onAction={action => {
            if (action === "delete") { onDelete(task.id); }
            if (action === "subtask") {
              const sub: Subtask = { id: Date.now(), text: "Nowe podzadanie", done: false };
              onUpdate(task.id, { subtasks: [...(task.subtasks ?? []), sub] });
            }
            if (action === "print") window.print();
            setShowMore(false);
          }}
          onClose={() => setShowMore(false)}
        />
      )}
    </div>
  );
}

// ── Summary right panel ───────────────────────────────────
function SummaryPanel({ tasks, habits, onToggleHabit }: {
  tasks: Task[]; habits: Habit[]; onToggleHabit: (id: number) => void;
}) {
  const done  = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const doneH = habits.filter(h => h.done).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const week  = getMiniWeek();
  const todayIdx = week.findIndex(d => d.today);
  const panelBg = C.card;
  const panelBorder = C.borderSubtle;
  const headingColor = C.textMuted;
  const secondaryText = C.textMuted;
  const DL = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 py-5 space-y-6">
      <section>
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: headingColor }}>Podsumowanie dnia</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { label: "Zadania", done, total, accent: done > 0 ? C.seaGlass : C.textPrimary },
            { label: "Nawyki", done: doneH, total: habits.length, accent: doneH > 0 ? C.seaGlass : C.textPrimary },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-3 text-center" style={{ background: panelBg, border: `1px solid ${panelBorder}` }}>
              <div className="font-semibold leading-none" style={{ fontFamily: "'DM Mono',monospace", color: s.accent }}>
                <span className="text-[22px]">{s.done}</span>
                <span className="text-[22px]" style={{ color: secondaryText }}>/{s.total}</span>
              </div>
              <div className="text-[9px] mt-1.5 uppercase tracking-widest" style={{ color: secondaryText }}>{s.label} · wykonane</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-3.5" style={{ background: panelBg, border: `1px solid ${panelBorder}` }}>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px]" style={{ color: headingColor }}>Postęp dnia</span>
            <span className="text-[16px] font-semibold leading-none" style={{ fontFamily: "'DM Mono',monospace", color: pct === 100 ? C.seaGlass : C.iceBlue }}>{pct}%</span>
          </div>
          <div className="h-[4px] rounded-full overflow-hidden" style={{ background: C.borderSubtle }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: pct === 100 ? C.seaGlass : C.iceBlueSolid }} />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: headingColor }}>Nawyki na dziś</p>
          <span className="text-[10px]" style={{ fontFamily: "'DM Mono',monospace", color: secondaryText }}>{doneH}/{habits.length}</span>
        </div>
        <div className="space-y-1.5">
          {habits.map(h => (
            <button key={h.id} type="button" aria-pressed={h.done} onClick={() => onToggleHabit(h.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer text-left transition-all duration-150"
              style={{ background: panelBg, border: `1px solid ${panelBorder}` }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = panelBg)}>
              <div className="w-[14px] h-[14px] rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={{ border: `1.5px solid ${h.done ? C.seaGlass : C.borderStrong}`, background: h.done ? C.seaGlassBg : "transparent" }}>
                {h.done && <Check size={7} strokeWidth={2.5} style={{ color: C.seaGlass }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] leading-none" style={{ color: h.done ? C.textMuted : C.textSecond, textDecoration: h.done ? "line-through" : "none" }}>{h.name}</div>
                {h.streak > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Flame size={9} strokeWidth={1.5} style={{ color: C.warning }} />
                    <span className="text-[10px]" style={{ color: secondaryText }}>{h.streak} dni</span>
                  </div>
                )}
              </div>
              {h.done && <Star size={10} strokeWidth={1.5} style={{ color: C.warning, flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: headingColor }}>Ten tydzień</p>
        <div className="rounded-xl p-3.5" style={{ background: panelBg, border: `1px solid ${panelBorder}` }}>
          <div className="flex gap-1.5">
            {week.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex items-center justify-center rounded-lg text-[10px] font-medium transition-all"
                  style={{
                    aspectRatio: "1",
                    background: d.today ? C.iceBlueBg : i < todayIdx ? C.seaGlassBg : "transparent",
                    color: d.today ? C.iceBlue : i < todayIdx ? C.seaGlass : secondaryText,
                    border: `1px solid ${d.today ? C.blueBorder : "transparent"}`,
                  }}>
                  {i < todayIdx ? <Check size={8} strokeWidth={2.5} /> : d.n}
                </div>
                <span className="text-[9px]" style={{ color: d.today ? C.iceBlue : secondaryText }}>{DL[i]}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: panelBorder }}>
            <span className="text-[11px]" style={{ color: headingColor }}>Seria aktywna</span>
            <div className="flex items-center gap-1">
              <Flame size={11} strokeWidth={1.5} style={{ color: C.warning }} />
              <span className="text-[11px] font-medium" style={{ fontFamily: "'DM Mono',monospace", color: C.warning }}>{todayIdx} dni</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function HabitsWorkspace({
  habits,
  onToggleHabit,
  onAddHabit,
}: {
  habits: Habit[];
  onToggleHabit: (id: number) => void;
  onAddHabit: (name: string) => void;
}) {
  const [newHabit, setNewHabit] = useState("");
  const todayKey = toCalendarDateKey(new Date());
  const completed = habits.filter((habit) => isHabitDoneOnDate(habit, todayKey)).length;
  const progress = habits.length ? Math.round(completed / habits.length * 100) : 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newHabit.trim();
    if (!name) return;
    onAddHabit(name);
    setNewHabit("");
  };

  return (
    <div className="task-habits-workspace">
      <section className="task-habits-overview" aria-labelledby="task-habits-title">
        <div>
          <h2 id="task-habits-title">Nawyki na dziś</h2>
          <p>Odhacz dzisiejszy rytm. Każdy dzień jest zapisywany osobno, więc jutro zaczniesz z czystą listą.</p>
        </div>
        <div className="task-habits-progress">
          <div>
            <span>Wykonanie</span>
            <strong>{progress}%</strong>
          </div>
          <div
            className="task-habits-progress__track"
            role="progressbar"
            aria-label="Dzisiejszy postęp nawyków"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <i style={{ width: `${progress}%` }} />
          </div>
          <small>{completed} z {habits.length} ukończonych</small>
        </div>
      </section>

      <form className="task-habits-add" onSubmit={submit}>
        <input
          value={newHabit}
          onChange={(event) => setNewHabit(event.target.value)}
          placeholder="Dodaj nowy nawyk"
          aria-label="Nazwa nowego nawyku"
        />
        <Button type="submit" variant="primary" leadingIcon={<Plus size={13} />} disabled={!newHabit.trim()}>
          Dodaj nawyk
        </Button>
      </form>

      {habits.length ? (
        <div className="task-habits-list">
          {habits.map((habit) => {
            const doneToday = isHabitDoneOnDate(habit, todayKey);
            return (
              <button
                key={habit.id}
                type="button"
                className={`task-habit-row ${doneToday ? "is-done" : ""}`}
                aria-pressed={doneToday}
                aria-label={doneToday
                  ? `Oznacz nawyk jako niewykonany: ${habit.name}`
                  : `Ukończ nawyk: ${habit.name}`}
                onClick={() => onToggleHabit(habit.id)}
              >
                <span className="task-habit-row__check" aria-hidden="true">
                  {doneToday && <Check size={10} strokeWidth={2.5} />}
                </span>
                <span className="task-habit-row__copy">
                  <strong>{habit.name}</strong>
                  <small>
                    <Flame size={11} aria-hidden="true" />
                    {habit.streak > 0 ? `${habit.streak} dni serii` : "Nowy rytm"}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="task-habits-empty">
          <span>Nie masz jeszcze nawyków. Dodaj pierwszy powyżej.</span>
        </div>
      )}
    </div>
  );
}

// ── Podsumowanie: document main area ──────────────────────
function SummaryDocument({ tasks, listy }: { tasks: Task[]; listy: ListItem[] }) {
  const done   = tasks.filter(t => t.done);
  const undone = tasks.filter(t => !t.done);
  const weekLabel = getWeekRangeLabel();

  const tbBtns = [
    "H1","H2","H3","|","B","I","U","S","|","🔗","</>","«»",
  ];

  function Line({ task, showDate }: { task: Task; showDate: boolean }) {
    const col = listy.find(l => l.id === task.list)?.color ?? C.danger;
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3.5px 0" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: col, flexShrink: 0, marginTop: 6, opacity: 0.9 }} />
        {showDate && task.date && (
          <span style={{ fontSize: 12, color: C.textMuted, flexShrink: 0 }}>[{fmtTaskDate(task.date)}]</span>
        )}
        <span style={{ fontSize: 12, color: C.textSecond, lineHeight: 1.55 }}>{task.text}</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: C.bg }}>
      {/* Header */}
      <div style={{ padding: "18px 26px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3.5, flexShrink: 0 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 14, height: 1.5, background: C.textMuted, borderRadius: 1 }} />)}
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary, fontFamily: "var(--font-sans)" }}>
              Podsumowanie
            </span>
          </div>
          <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "var(--font-data)" }}>{weekLabel}</span>
        </div>
        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 1,
          padding: "5px 8px", marginBottom: 18,
          background: C.card, borderRadius: 10,
          border: `1px solid ${C.borderSubtle}`,
        }}>
          {tbBtns.map((b, i) => b === "|" ? (
            <div key={i} style={{ width: 1, height: 13, background: C.borderStrong, margin: "0 4px" }} />
          ) : (
            <button key={i} style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "3px 7px", borderRadius: 5,
              fontSize: 10.5, fontWeight: 700, color: C.textMuted,
              fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", lineHeight: 1,
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.elevated)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Date range hero */}
      <div style={{ padding: "0 26px 16px", flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: C.textPrimary, fontFamily: "var(--font-sans)" }}>
          {weekLabel}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 26px 16px", scrollbarWidth: "none" }}>
        {/* Ukończone */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.seaGlass, marginBottom: 8, fontFamily: "var(--font-sans)" }}>
            Ukończone
          </div>
          {done.length === 0
            ? <p style={{ fontSize: 12, color: C.textMuted, paddingLeft: 14 }}>Brak ukończonych zadań w tym okresie.</p>
            : done.map(t => <Line key={t.id} task={t} showDate={true} />)
          }
        </div>
        {/* Niewykonane */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.danger, marginBottom: 8, fontFamily: "var(--font-sans)" }}>
            Niewykonane
          </div>
          {undone.length === 0
            ? <p style={{ fontSize: 12, color: C.textMuted, paddingLeft: 14 }}>Brak niewykonanych. Świetna robota!</p>
            : undone.map(t => <Line key={t.id} task={t} showDate={false} />)
          }
        </div>
      </div>

    </div>
  );
}

// ── Lightweight floating menu for input bar dropdowns ─────
function InputFloatMenu({ anchorEl, onClose, children }: {
  anchorEl: HTMLElement; onClose: () => void; children: React.ReactNode;
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(anchorEl);
  triggerRef.current = anchorEl;
  const rect = anchorEl.getBoundingClientRect();
  return (
    <Menu ref={ref} triggerRef={triggerRef} onDismiss={onClose} initialFocus="selected" style={{
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      minWidth: 170,
      zIndex: 9999,
    }}>
      {children}
    </Menu>
  );
}

// ── Main page ─────────────────────────────────────────────
export default function Zadania() {
  const [initialWorkspace] = useState(loadTaskWorkspace);
  const workspaceRef = useRef(initialWorkspace);
  const [taskView,      setTaskView]      = useState(initialTaskView);
  const [listFilter,    setListFilter]    = useState<string | null>(null);
  const [tagFilter,     setTagFilter]     = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  const [tasks,         setTasks]         = useState<Task[]>(initialWorkspace.tasks);
  const [habits,        setHabits]        = useState<Habit[]>(initialWorkspace.habits);
  const [listy,         setListy]         = useState<ListItem[]>(initialWorkspace.lists);
  const [tagi,          setTagi]          = useState<TagItem[]>(initialWorkspace.tags);
  const [selectedId,    setSelectedId]    = useState<number | null>(null);
  const [newTask,       setNewTask]       = useState("");
  const [newTaskTags,   setNewTaskTags]   = useState<string[]>([]);
  const [newTaskList,   setNewTaskList]   = useState<string | null>(null);
  const [inputFocused,  setInputFocused]  = useState(false);
  const [newPriority,   setNewPriority]   = useState<Priority | null>(null);
  const [newDateVal,    setNewDateVal]    = useState<DateVal>(DEFAULT_DATE_VAL);
  const [inputDropdown, setInputDropdown] = useState<"priority" | "list" | "tags" | null>(null);
  const [showDone,      setShowDone]      = useState(true);
  const [showOverdue,   setShowOverdue]   = useState(true);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [taxonomyDelete, setTaxonomyDelete] = useState<{
    kind: "list" | "tag";
    id: string;
    label: string;
    affected: number;
  } | null>(null);
  const [purgeTaskId, setPurgeTaskId] = useState<number | null>(null);
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false);

  useEffect(() => {
    const nextWorkspace = { ...workspaceRef.current, tasks, habits, lists: listy, tags: tagi };
    workspaceRef.current = nextWorkspace;
    setStorageFailed(!saveTaskWorkspace(nextWorkspace));
  }, [habits, listy, tagi, tasks]);

  useEffect(() => {
    const syncWorkspace = () => {
      const nextWorkspace = loadTaskWorkspace();
      workspaceRef.current = nextWorkspace;
      setTasks(nextWorkspace.tasks);
      setHabits(nextWorkspace.habits);
      setListy(nextWorkspace.lists);
      setTagi(nextWorkspace.tags);
      setSelectedId((current) => current !== null && nextWorkspace.tasks.some((task) => task.id === current) ? current : null);
    };
    const unsubscribers = [
      subscribeToLocalWorkspace(TASK_STORAGE_KEY, syncWorkspace),
      subscribeToLocalWorkspace(WORK_STORAGE_KEY, syncWorkspace),
      subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, syncWorkspace),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (taskView === "dzis") url.searchParams.delete("widok");
    else url.searchParams.set("widok", taskView);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [taskView]);

  // Sidebar collapse state
  const [listyOpen,     setListyOpen]     = useState(false);
  const [tagiOpen,      setTagiOpen]      = useState(false);

  // Sidebar CRUD state
  const [addingList,    setAddingList]    = useState(false);
  const [newListLabel,  setNewListLabel]  = useState("");
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListLabel, setEditListLabel] = useState("");
  const [listSearchOpen, setListSearchOpen] = useState(false);
  const [listSearch,    setListSearch]    = useState("");
  const [addingTag,     setAddingTag]     = useState(false);
  const [newTagLabel,   setNewTagLabel]   = useState("");
  const [editingTagId,  setEditingTagId]  = useState<string | null>(null);
  const [editTagLabel,  setEditTagLabel]  = useState("");
  const [tagSearchOpen, setTagSearchOpen] = useState(false);
  const [tagSearch,     setTagSearch]     = useState("");

  const inputRef        = useRef<HTMLInputElement>(null);
  const dateButtonRef   = useRef<HTMLButtonElement>(null);
  const flagBtnInputRef = useRef<HTMLButtonElement>(null);
  const listBtnInputRef = useRef<HTMLButtonElement>(null);
  const hashBtnInputRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("akcja") !== "nowe-zadanie") return;
    if (taskView !== "dzis") setTaskView("dzis");
    window.setTimeout(() => inputRef.current?.focus(), 0);
    url.searchParams.delete("akcja");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [taskView]);

  const selectedTask = tasks.find(t => t.id === selectedId) ?? null;
  const tagUsage = tasks.reduce<Record<string, number>>((counts, task) => {
    for (const tag of task.tags ?? []) counts[tag] = (counts[tag] ?? 0) + 1;
    return counts;
  }, {});
  const listUsage = tasks.reduce<Record<string, number>>((counts, task) => {
    if (task.list) counts[task.list] = (counts[task.list] ?? 0) + 1;
    return counts;
  }, {});
  const normalizedListSearch = listSearch.trim().toLowerCase();
  const visibleLists = listy
    .filter(list => !normalizedListSearch || list.label.toLowerCase().includes(normalizedListSearch))
    .sort((a, b) => (listUsage[b.id] ?? 0) - (listUsage[a.id] ?? 0))
    .slice(0, normalizedListSearch ? undefined : VISIBLE_TAG_LIMIT);
  const normalizedTagSearch = tagSearch.trim().toLowerCase().replace(/^#/, "");
  const visibleTags = tagi
    .filter(tag => !normalizedTagSearch || tag.label.includes(normalizedTagSearch))
    .sort((a, b) => (tagUsage[b.id] ?? 0) - (tagUsage[a.id] ?? 0))
    .slice(0, normalizedTagSearch ? undefined : VISIBLE_TAG_LIMIT);

  const visible = tasks.filter(t => {
    if (taskView === "kosz") return Boolean(t.deleted);
    if (t.deleted) return false;
    if (taskView === "ukonczone") return t.done;
    const viewMatch = taskView === "wszystkie" || taskView === "podsumowanie" || taskView === "nawyki"
      ? true : t.view === taskView;
    const listMatch = listFilter ? t.list === listFilter : true;
    const tagMatch  = tagFilter  ? (t.tags ?? []).includes(tagFilter) : true;
    const prioMatch = priorityFilter ? t.priority === priorityFilter : true;
    return viewMatch && listMatch && tagMatch && prioMatch;
  });
  const pending   = visible.filter(t => !t.done);
  const completed = visible.filter(t => t.done);
  const todayKey = toCalendarDateKey(new Date());
  const overdue = taskView === "dzis"
    ? pending.filter(t => Boolean(t.calendarDate) && t.calendarDate! < todayKey)
    : [];
  const overdueIds = new Set(overdue.map(task => task.id));
  const currentPending = pending.filter(task => !overdueIds.has(task.id));
  const dayHeading = viewedTaskDayHeading(taskView);
  const dayHeadingCount = currentPending.length + completed.length;

  const viewCounts = Object.fromEntries(
    SMART_VIEWS.map(v => [
      v.id,
      v.id === "nawyki"
        ? habits.filter((habit) => !isHabitDoneOnDate(habit, todayKey)).length
        : tasks.filter(t => !t.deleted && !t.done && (
          v.id === "wszystkie" || v.id === "podsumowanie" ? true : t.view === v.id
        )).length,
    ])
  );

  // Hashtag parsing
  const handleTaskInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const match = v.match(/#([\p{L}\p{N}_-]+)\s$/u);
    if (match) {
      const raw = match[1].toLocaleLowerCase("pl-PL");
      if (!newTaskTags.includes(raw)) setNewTaskTags(prev => [...prev, raw]);
      setNewTask(v.replace(/#([\p{L}\p{N}_-]+)\s$/u, "").trimEnd());
    } else {
      setNewTask(v);
    }
  };

  const handleTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && newTask === "" && newTaskTags.length > 0) {
      setNewTaskTags(prev => prev.slice(0, -1));
    }
  };

  const addTask = () => {
    const text = newTask.trim();
    if (!text) return;
    const id = Date.now();
    const dateLabel = formatDateLabel(newDateVal);
    const calendarDate = newDateVal.date ? toCalendarDateKey(newDateVal.date) : undefined;
    const fallbackView = taskView === "wszystkie"
      || taskView === "podsumowanie"
      || taskView === "nawyki"
      || taskView === "kosz"
      || taskView === "ukonczone"
      ? "dzis"
      : taskView;
    setTagi(existing => {
      const known = new Set(existing.map(tag => tag.id));
      const missing = newTaskTags.filter(tag => !known.has(tag));
      return missing.length === 0
        ? existing
        : [...existing, ...missing.map((tag, index) => ({
            id: tag,
            label: tag,
            color: PALETTE[(existing.length + index) % PALETTE.length],
          }))];
    });
    setTasks(p => [...p, {
      id, text, done: false, view: calendarDate ? taskViewForCalendarDate(calendarDate) : fallbackView,
      tags: newTaskTags.length > 0 ? newTaskTags : undefined,
      list: newTaskList ?? undefined,
      priority: newPriority ?? undefined,
      time: newDateVal.duration ? newDateVal.startTime : newDateVal.time || undefined,
      endTime: newDateVal.duration ? newDateVal.endTime : undefined,
      schedule: scheduleFromDateValue(newDateVal),
      date: dateLabel || undefined,
      calendarDate,
    }]);
    setNewTask(""); setNewPriority(null); setNewTaskTags([]); setNewTaskList(null);
    setNewDateVal(DEFAULT_DATE_VAL); setInputDropdown(null);
    setSelectedId(id);
  };

  // List CRUD
  const addList = () => {
    const label = newListLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/\s+/g, "-");
    const color = PALETTE[listy.length % PALETTE.length];
    setListy(p => [...p, { id, label, color }]);
    setNewListLabel(""); setAddingList(false);
  };
  const saveList = (id: string) => {
    const label = editListLabel.trim();
    if (label) setListy(p => p.map(l => l.id === id ? { ...l, label } : l));
    setEditingListId(null);
  };
  const deleteList = (id: string) => {
    const list = listy.find((candidate) => candidate.id === id);
    if (!list) return;
    setTaxonomyDelete({ kind: "list", id, label: list.label, affected: listUsage[id] ?? 0 });
  };

  // Tag CRUD
  const addTagItem = () => {
    const label = newTagLabel.trim().toLowerCase().replace(/^#/, "");
    if (!label) return;
    const id = label.replace(/\s+/g, "-");
    const color = PALETTE[(tagi.length) % PALETTE.length];
    setTagi(p => [...p, { id, label, color }]);
    setNewTagLabel(""); setAddingTag(false);
  };
  const saveTag = (id: string) => {
    const label = editTagLabel.trim().toLowerCase();
    if (label) setTagi(p => p.map(t => t.id === id ? { ...t, label } : t));
    setEditingTagId(null);
  };
  const deleteTag = (id: string) => {
    const tag = tagi.find((candidate) => candidate.id === id);
    if (!tag) return;
    setTaxonomyDelete({ kind: "tag", id, label: `#${tag.label}`, affected: tagUsage[id] ?? 0 });
  };

  const confirmTaxonomyDelete = () => {
    if (!taxonomyDelete) return;
    if (taxonomyDelete.kind === "list") {
      setListy((current) => current.filter((list) => list.id !== taxonomyDelete.id));
      setTasks((current) => current.map((task) => task.list === taxonomyDelete.id
        ? { ...task, list: undefined }
        : task));
      if (listFilter === taxonomyDelete.id) setListFilter(null);
    } else {
      setTagi((current) => current.filter((tag) => tag.id !== taxonomyDelete.id));
      setTasks((current) => current.map((task) => (task.tags ?? []).includes(taxonomyDelete.id)
        ? { ...task, tags: task.tags?.filter((tag) => tag !== taxonomyDelete.id) }
        : task));
      if (tagFilter === taxonomyDelete.id) setTagFilter(null);
    }
    setTaxonomyDelete(null);
  };

  const updateTask = (id: number, patch: Partial<Task>) => {
    if (typeof patch.done === "boolean") persistTaskCompletion(id, patch.done);
    setTasks(p => p.map(t => t.id === id ? { ...t, ...patch } : t));
  };
  const workspaceWithTasks = (nextTasks: Task[]) => ({
    ...workspaceRef.current,
    tasks: nextTasks,
    habits,
    lists: listy,
    tags: tagi,
  });
  const deleteTask = (id: number) => {
    setTasks((current) => trashTask(workspaceWithTasks(current), id).tasks);
    setSelectedId(null);
  };
  const restoreTaskFromTrash = (id: number) => {
    setTasks((current) => restoreTask(workspaceWithTasks(current), id).tasks);
    setSelectedId(null);
  };
  const permanentlyDeleteTask = (id: number) => {
    setTasks((current) => purgeTask(workspaceWithTasks(current), id).tasks);
    setPurgeTaskId(null);
    setSelectedId(null);
  };
  const emptyTrash = () => {
    setTasks((current) => emptyTaskTrash(workspaceWithTasks(current)).tasks);
    setEmptyTrashOpen(false);
    setSelectedId(null);
  };
  const toggleHabit = (id: number) => setHabits((current) => current.map((habit) => (
    habit.id === id ? toggleHabitOnDate(habit, toCalendarDateKey(new Date())) : habit
  )));
  const addHabit = (name: string) => setHabits((current) => [
    ...current,
    { id: Date.now(), name, streak: 0, done: false, completedDates: [] },
  ]);

  const rescheduleOverdue = () => {
    const ids = new Set(overdue.map(task => task.id));
    setTasks(existing => existing.map(task => ids.has(task.id)
      ? { ...task, calendarDate: todayKey, date: "Dziś", view: "dzis" }
      : task));
    setRescheduleOpen(false);
  };

  const closeDatePicker = useCallback(() => setDatePickerOpen(false), []);

  useEffect(() => { setSelectedId(null); }, [taskView, listFilter, tagFilter]);

  const getPlaceholder = () => {
    if (listFilter) return `Dodaj zadanie do "${listy.find(l => l.id === listFilter)?.label}"`;
    if (tagFilter)  return `Dodaj zadanie z #${tagFilter}`;
    return `Dodaj zadanie do "${VIEW_LABELS[taskView] ?? taskView}"`;
  };

  const dateLabel = formatDateLabel(newDateVal);
  const flagColor = newPriority === "high" ? C.danger : newPriority === "medium" ? C.warning : newPriority === "low" ? C.iceBlue : null;

  const startNewTask = () => {
    if (taskView === "podsumowanie" || taskView === "nawyki" || taskView === "ukonczone" || taskView === "kosz") {
      setTaskView("dzis");
    }
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <ModuleShell>

      {/* ── Sub-sidebar ── */}
      <ContextSidebar label="Widoki i listy zadań" className="overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

        {/* Smart views */}
        <div className="px-2.5 pb-4 pt-5">
          <SectionHeader title="Główne" level={3} variant="label" className="px-1.5" />
          <div className="space-y-px">
            {SMART_VIEWS.map(v => {
            const Icon = v.icon;
            const active = taskView === v.id && !listFilter && !tagFilter;
            const count = viewCounts[v.id];
            return (
              <ContextNavItem
                key={v.id}
                active={active}
                onClick={() => { setTaskView(v.id); setListFilter(null); setTagFilter(null); }}
                icon={<Icon />}
                label={v.label}
                meta={v.id !== "podsumowanie" && count > 0 ? count : undefined}
              />
            );
            })}
          </div>
        </div>

        <div className="mx-3 my-2 h-px" style={{ background: C.borderSubtle }} />

        {/* Listy */}
        <div className="px-2.5 mb-2">
          <div className="flex items-center justify-between px-1.5 mb-1.5">
            <button onClick={() => setListyOpen(v => !v)}
              className="flex items-center gap-1.5 flex-1"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <ChevronRight size={10} strokeWidth={2} style={{ color: C.textDisabled, transform: listyOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: C.textMuted }}>Listy</span>
            </button>
            {listyOpen && (
              <div className="task-taxonomy-header-actions flex items-center gap-1">
                <button
                  onClick={() => { setListSearchOpen(open => !open); setListSearch(""); }}
                  aria-label="Szukaj listy"
                  title="Szukaj listy"
                  style={{ background: "none", border: "none", cursor: "pointer", color: listSearchOpen ? C.iceBlue : C.textMuted, display: "flex", padding: 2 }}
                  onMouseEnter={e => { if (!listSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textMuted; }}
                  onMouseLeave={e => { if (!listSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textMuted; }}>
                  <Search size={11} strokeWidth={1.8} />
                </button>
                <button onClick={() => { setAddingList(true); setAddingTag(false); setListSearchOpen(false); }}
                  aria-label="Dodaj listę"
                  title="Dodaj listę"
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", padding: 2 }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}>
                  <Plus size={11} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
          {listyOpen && <div className="space-y-px">
            {listSearchOpen && (
              <div className="flex items-center gap-1.5 mx-1 mb-1 px-2 py-1 rounded-md" style={{ background: C.inputBg, border: `1px solid ${C.borderSubtle}` }}>
                <Search size={11} strokeWidth={1.7} style={{ color: C.textDisabled, flexShrink: 0 }} />
                <input
                  autoFocus
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                  placeholder="Szukaj listy"
                  aria-label="Szukaj listy"
                  className="tag-search-input flex-1 min-w-0 bg-transparent outline-none"
                  style={{ border: "none", fontSize: 10, color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}
                />
              </div>
            )}
            {listy.length === 0 && !addingList && (
              <p style={{ fontSize: 11, color: C.textMuted, padding: "4px 12px" }}>Brak list. Kliknij + aby dodać.</p>
            )}
            {listy.length > 0 && visibleLists.length === 0 && (
              <p style={{ fontSize: 10, color: C.textMuted, padding: "4px 12px" }}>Brak pasujących list.</p>
            )}
            {visibleLists.map(l => {
              const active = listFilter === l.id;
              const count = tasks.filter(t => !t.done && t.list === l.id).length;
              return (
                <div key={l.id} className="group relative">
                  {editingListId === l.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                      <input autoFocus value={editListLabel} onChange={e => setEditListLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveList(l.id); if (e.key === "Escape") setEditingListId(null); }}
                        onBlur={() => saveList(l.id)}
                        style={{ flex: 1, background: C.inputBg, border: `1px solid ${C.blueBorder}`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "var(--font-sans)" }} />
                    </div>
                  ) : (
                    <ContextNavItem
                      active={active}
                      onClick={() => {
                        if (taskView === "podsumowanie" || taskView === "nawyki") setTaskView("wszystkie");
                        setListFilter(active ? null : l.id);
                        setTagFilter(null);
                      }}
                      icon={<span className="h-2 w-2 rounded-full" style={{ background: l.color, opacity: active ? 1 : 0.7 }} />}
                      label={l.label}
                      meta={count > 0 ? count : undefined}
                    />
                  )}
                  {/* Hover actions */}
                  {editingListId !== l.id && (
                    <div className="task-taxonomy-actions absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-70 transition-opacity hover:opacity-100 focus-within:opacity-100">
                      <button type="button" aria-label={`Edytuj listę ${l.label}`} onClick={e => { e.stopPropagation(); setEditingListId(l.id); setEditListLabel(l.label); }}
                        style={{ background: C.elevated, border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.textMuted, display: "flex" }}>
                        <PenLine size={9} strokeWidth={1.5} />
                      </button>
                      <button type="button" aria-label={`Usuń listę ${l.label}`} onClick={e => { e.stopPropagation(); deleteList(l.id); }}
                        style={{ background: C.elevated, border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.danger, display: "flex" }}>
                        <Trash2 size={9} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {addingList && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: PALETTE[listy.length % PALETTE.length], flexShrink: 0 }} />
                <input autoFocus placeholder="Nazwa listy" value={newListLabel} onChange={e => setNewListLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addList(); if (e.key === "Escape") { setAddingList(false); setNewListLabel(""); } }}
                  onBlur={() => { if (newListLabel.trim()) addList(); else { setAddingList(false); setNewListLabel(""); } }}
                  style={{ flex: 1, background: C.inputBg, border: `1px solid ${C.blueBorder}`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "var(--font-sans)" }} />
              </div>
            )}
          </div>}
        </div>

        <div className="mx-3 my-2 h-px" style={{ background: C.borderSubtle }} />

        {/* Tagi */}
        <div className="px-2.5 mb-2">
          <div className="flex items-center justify-between px-1.5 mb-1.5">
            <button onClick={() => setTagiOpen(v => !v)}
              className="flex items-center gap-1.5 flex-1"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <ChevronRight size={10} strokeWidth={2} style={{ color: C.textDisabled, transform: tagiOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: C.textMuted }}>Tagi</span>
            </button>
            {tagiOpen && (
              <div className="task-taxonomy-header-actions flex items-center gap-1">
                <button
                  onClick={() => { setTagSearchOpen(open => !open); setTagSearch(""); }}
                  aria-label="Szukaj tagu"
                  title="Szukaj tagu"
                  style={{ background: "none", border: "none", cursor: "pointer", color: tagSearchOpen ? C.iceBlue : C.textMuted, display: "flex", padding: 2 }}
                  onMouseEnter={e => { if (!tagSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textMuted; }}
                  onMouseLeave={e => { if (!tagSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textMuted; }}>
                  <Search size={11} strokeWidth={1.8} />
                </button>
                <button onClick={() => { setAddingTag(true); setAddingList(false); setTagSearchOpen(false); }}
                  aria-label="Dodaj tag"
                  title="Dodaj tag"
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", padding: 2 }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}>
                  <Plus size={11} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
          {tagiOpen && <div className="space-y-px">
            {tagSearchOpen && (
              <div className="flex items-center gap-1.5 mx-1 mb-1 px-2 py-1 rounded-md" style={{ background: C.inputBg, border: `1px solid ${C.borderSubtle}` }}>
                <Search size={11} strokeWidth={1.7} style={{ color: C.textDisabled, flexShrink: 0 }} />
                <input
                  autoFocus
                  value={tagSearch}
                  onChange={e => setTagSearch(e.target.value)}
                  placeholder="Szukaj tagu"
                  aria-label="Szukaj tagu"
                  className="tag-search-input flex-1 min-w-0 bg-transparent outline-none"
                  style={{ border: "none", fontSize: 10, color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}
                />
              </div>
            )}
            {tagi.length === 0 && !addingTag && (
              <p style={{ fontSize: 11, color: C.textMuted, padding: "4px 12px" }}>Brak tagów.</p>
            )}
            {tagi.length > 0 && visibleTags.length === 0 && (
              <p style={{ fontSize: 10, color: C.textMuted, padding: "4px 12px" }}>Brak pasujących tagów.</p>
            )}
            {visibleTags.map(t => {
              const active = tagFilter === t.id;
              return (
                <div key={t.id} className="group relative">
                  {editingTagId === t.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                      <input autoFocus value={editTagLabel} onChange={e => setEditTagLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveTag(t.id); if (e.key === "Escape") setEditingTagId(null); }}
                        onBlur={() => saveTag(t.id)}
                        style={{ flex: 1, background: C.inputBg, border: `1px solid ${C.blueBorder}`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "var(--font-sans)" }} />
                    </div>
                  ) : (
                    <ContextNavItem
                      active={active}
                      onClick={() => {
                        if (taskView === "podsumowanie" || taskView === "nawyki") setTaskView("wszystkie");
                        setTagFilter(active ? null : t.id);
                        setListFilter(null);
                      }}
                      icon={<span className="h-2 w-2 rounded-full" style={{ background: t.color, opacity: active ? 1 : 0.7 }} />}
                      label={`#${t.label}`}
                    />
                  )}
                  {editingTagId !== t.id && (
                    <div className="task-taxonomy-actions absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-70 transition-opacity hover:opacity-100 focus-within:opacity-100">
                      <button type="button" aria-label={`Edytuj tag #${t.label}`} onClick={e => { e.stopPropagation(); setEditingTagId(t.id); setEditTagLabel(t.label); }}
                        style={{ background: C.elevated, border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.textMuted, display: "flex" }}>
                        <PenLine size={9} strokeWidth={1.5} />
                      </button>
                      <button type="button" aria-label={`Usuń tag #${t.label}`} onClick={e => { e.stopPropagation(); deleteTag(t.id); }}
                        style={{ background: C.elevated, border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.danger, display: "flex" }}>
                        <Trash2 size={9} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {addingTag && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: PALETTE[tagi.length % PALETTE.length], flexShrink: 0 }} />
                <input autoFocus placeholder="#tag" value={newTagLabel} onChange={e => setNewTagLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addTagItem(); if (e.key === "Escape") { setAddingTag(false); setNewTagLabel(""); } }}
                  onBlur={() => { if (newTagLabel.trim()) addTagItem(); else { setAddingTag(false); setNewTagLabel(""); } }}
                  style={{ flex: 1, background: C.inputBg, border: `1px solid ${C.blueBorder}`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "var(--font-sans)" }} />
              </div>
            )}
          </div>}
        </div>

        <div className="flex-1" />
        <div className="px-2.5 py-3 border-t space-y-px" style={{ borderColor: C.borderSubtle }}>
          {([
            { icon: RotateCcw, label: "Ukończone", view: "ukonczone" },
            { icon: Trash2,    label: "Kosz",      view: "kosz" },
          ] as const).map(({ icon: Icon, label, view }) => {
            const active = taskView === view && !listFilter && !tagFilter;
            return (
              <ContextNavItem
                key={label}
                active={active}
                onClick={() => { setTaskView(view); setListFilter(null); setTagFilter(null); }}
                icon={<Icon />}
                label={label}
              />
            );
          })}
        </div>
      </ContextSidebar>

      {/* ── Summary document (replaces task list in podsumowanie mode) ── */}
      {taskView === "podsumowanie" && (
        <ModuleMain>
          <PageHeader
            title="Zadania"
            description={`Podsumowanie · ${todayStr()}`}
            leading={<CheckSquare size={18} strokeWidth={1.5} />}
            meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
            actions={<Button className="ui-button--icon-mobile" variant="primary" leadingIcon={<Plus size={14} />} onClick={startNewTask}><span className="header-action-label">Nowe zadanie</span></Button>}
          />
          <WorkspaceToolbar>
            <Select
              aria-label="Widok zadań"
              fieldClassName="context-mobile-select"
              compact
              value={taskView}
              options={[
                ...SMART_VIEWS.map((item) => ({ value: item.id, label: item.label })),
                { value: "ukonczone", label: "Ukończone" },
                { value: "kosz", label: "Kosz" },
              ]}
              onChange={(event) => { setTaskView(event.target.value); setListFilter(null); setTagFilter(null); }}
            />
            <span className="workspace-context-label">Podsumowanie</span>
          </WorkspaceToolbar>
          <SummaryDocument tasks={tasks.filter(t => !t.deleted)} listy={listy} />
        </ModuleMain>
      )}

      {taskView === "nawyki" && (
        <ModuleMain>
          <PageHeader
            title="Zadania"
            description={`Nawyki · ${todayStr()}`}
            leading={<Flame size={18} strokeWidth={1.5} />}
            meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
          />
          <WorkspaceToolbar>
            <Select
              aria-label="Widok zadań"
              fieldClassName="context-mobile-select"
              compact
              value={taskView}
              options={[
                ...SMART_VIEWS.map((item) => ({ value: item.id, label: item.label })),
                { value: "ukonczone", label: "Ukończone" },
                { value: "kosz", label: "Kosz" },
              ]}
              onChange={(event) => { setTaskView(event.target.value); setListFilter(null); setTagFilter(null); }}
            />
            <span className="workspace-context-label">Nawyki</span>
          </WorkspaceToolbar>
          <HabitsWorkspace habits={habits} onToggleHabit={toggleHabit} onAddHabit={addHabit} />
        </ModuleMain>
      )}

      {/* ── Task list ── */}
      <ModuleMain
        style={{
          background: C.bg,
          display: taskView === "podsumowanie" || taskView === "nawyki" ? "none" : undefined,
        }}>
        <PageHeader
          title="Zadania"
          description={`${listFilter ? listy.find(l => l.id === listFilter)?.label : tagFilter ? `#${tagFilter}` : VIEW_LABELS[taskView]} · ${todayStr()}`}
          leading={<CheckSquare size={18} strokeWidth={1.5} />}
          meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
          actions={(
            taskView === "kosz" && visible.length > 0 ? (
              <Button variant="danger" leadingIcon={<Trash2 size={14} />} onClick={() => setEmptyTrashOpen(true)}>
                Opróżnij kosz
              </Button>
            ) : (
              <Button className="ui-button--icon-mobile" variant="primary" leadingIcon={<Plus size={14} />} onClick={startNewTask}>
                <span className="header-action-label">Nowe zadanie</span>
              </Button>
            )
          )}
        />

        <WorkspaceToolbar className="task-workspace-toolbar">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Select
              aria-label="Widok zadań"
              fieldClassName="context-mobile-select"
              compact
              value={taskView}
              options={[
                ...SMART_VIEWS.map((item) => ({ value: item.id, label: item.label })),
                { value: "ukonczone", label: "Ukończone" },
                { value: "kosz", label: "Kosz" },
              ]}
              onChange={(event) => { setTaskView(event.target.value); setListFilter(null); setTagFilter(null); }}
            />
            <span className="workspace-context-label">
              {listFilter ? listy.find(l => l.id === listFilter)?.label : tagFilter ? `#${tagFilter}` : VIEW_LABELS[taskView]}
            </span>
            {(listFilter || tagFilter || priorityFilter) && (
              <div className="flex flex-wrap items-center gap-1.5">
              {listFilter && (
                <Button variant="quiet" size="sm" onClick={() => setListFilter(null)}
                  style={{ background: (listy.find(l => l.id === listFilter)?.color ?? C.iceBlue)+"18", color: listy.find(l => l.id === listFilter)?.color ?? C.iceBlue }}>
                  {listy.find(l => l.id === listFilter)?.label} <X size={9} strokeWidth={2} />
                </Button>
              )}
              {tagFilter && (
                <Button variant="quiet" size="sm" onClick={() => setTagFilter(null)}
                  style={{ background: (tagi.find(t => t.id === tagFilter)?.color ?? C.iceBlue)+"18", color: tagi.find(t => t.id === tagFilter)?.color ?? C.iceBlue }}>
                  #{tagFilter} <X size={9} strokeWidth={2} />
                </Button>
              )}
              {priorityFilter && (
                <Button variant="quiet" size="sm" onClick={() => setPriorityFilter(null)}
                  style={{ background: PRIORITY_COLOR[priorityFilter]+"18", color: PRIORITY_COLOR[priorityFilter] }}>
                  {priorityFilter === "high" ? "Wysoki" : priorityFilter === "medium" ? "Średni" : "Niski"} <X size={9} strokeWidth={2} />
                </Button>
              )}
              </div>
            )}
          </div>
          <div className="task-priority-filters flex items-center gap-1" aria-label="Filtr priorytetu">
            {([
              { id: "high" as Priority, label: "Wysoki", color: C.danger },
              { id: "medium" as Priority, label: "Średni", color: C.warning },
              { id: "low" as Priority, label: "Niski", color: C.iceBlue },
            ]).map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                size="sm"
                aria-pressed={priorityFilter === item.id}
                onClick={() => setPriorityFilter(priorityFilter === item.id ? null : item.id)}
                style={{ color: priorityFilter === item.id ? item.color : C.textMuted, background: priorityFilter === item.id ? `${item.color}14` : undefined }}
              >
                {item.label}
              </Button>
            ))}
            {pending.length > 0 && <Badge tone="neutral">{pending.length} otwartych</Badge>}
          </div>
        </WorkspaceToolbar>

        <div className="task-content flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-7 py-5">
          {/* Add task input */}
          <form
            className="task-entry mx-1 mb-3 rounded-xl transition-all duration-200"
            aria-label="Dodaj zadanie"
            onSubmit={(event) => {
              event.preventDefault();
              addTask();
            }}
            style={{
              background: C.inputBg,
              border: `1px solid ${C.borderSubtle}`,
              boxShadow: "none",
            }}>
            <div className="flex items-center gap-2 px-3.5 py-2.5 flex-wrap">
              <Plus size={13} strokeWidth={1.75} style={{ color: inputFocused ? C.iceBlue : C.textMuted, flexShrink: 0 }} />
              {/* Tag chips in input */}
              {newTaskTags.map(tagId => {
                const td = tagi.find(t => t.id === tagId);
                const color = td?.color ?? C.iceBlue;
                return (
                  <span key={tagId} style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 20,
                    color, background: color + "1A", flexShrink: 0,
                  }}>
                    #{td?.label ?? tagId}
                    <button
                      type="button"
                      aria-label={`Usuń tag #${td?.label ?? tagId} z nowego zadania`}
                      onClick={() => setNewTaskTags(p => p.filter(id => id !== tagId))}
                      style={{ background: "none", border: "none", cursor: "pointer", color, display: "flex", padding: 0 }}>
                      <X size={8} strokeWidth={2.5} />
                    </button>
                  </span>
                );
              })}
              <input
                ref={inputRef} type="text"
                aria-label="Nazwa nowego zadania"
                placeholder={newTaskTags.length === 0 ? getPlaceholder() : "Dodaj więcej…"}
                value={newTask}
                onChange={handleTaskInput}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={handleTaskKeyDown}
                className="task-entry-input flex-1 bg-transparent outline-none text-[13px] min-w-0"
                style={{ color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", minWidth: 80 }}
              />

              {/* Controls */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {/* Flag — priority */}
                <button
                  ref={flagBtnInputRef}
                  type="button"
                  aria-label="Ustaw priorytet nowego zadania"
                  aria-expanded={inputDropdown === "priority"}
                  onClick={() => setInputDropdown(d => d === "priority" ? null : "priority")}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  title="Priorytet"
                  style={{
                    background: flagColor ? flagColor + "18" : inputDropdown === "priority" ? C.elevated : "transparent",
                    color: flagColor ?? C.textMuted,
                    border: `1px solid ${flagColor ? flagColor + "40" : "transparent"}`,
                  }}>
                  <Flag size={12} strokeWidth={1.5} fill={flagColor ?? "none"} />
                </button>

                {/* List */}
                <button
                  ref={listBtnInputRef}
                  type="button"
                  aria-label="Wybierz listę nowego zadania"
                  aria-expanded={inputDropdown === "list"}
                  onClick={() => setInputDropdown(d => d === "list" ? null : "list")}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  title="Lista"
                  style={{
                    background: newTaskList ? listy.find(l => l.id === newTaskList)?.color + "18" : inputDropdown === "list" ? C.elevated : "transparent",
                    color: newTaskList ? listy.find(l => l.id === newTaskList)?.color : C.textMuted,
                    border: `1px solid ${newTaskList ? (listy.find(l => l.id === newTaskList)?.color ?? C.iceBlue) + "40" : "transparent"}`,
                  }}>
                  <List size={12} strokeWidth={1.5} />
                </button>

                {/* Hash — tags */}
                <button
                  ref={hashBtnInputRef}
                  type="button"
                  aria-label="Dodaj tagi do nowego zadania"
                  aria-expanded={inputDropdown === "tags"}
                  onClick={() => setInputDropdown(d => d === "tags" ? null : "tags")}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  title="Tagi"
                  style={{
                    background: newTaskTags.length > 0 ? C.iceBlueBg : inputDropdown === "tags" ? C.elevated : "transparent",
                    color: newTaskTags.length > 0 ? C.iceBlue : C.textMuted,
                    border: `1px solid ${newTaskTags.length > 0 ? C.blueBorder : "transparent"}`,
                  }}>
                  <Hash size={12} strokeWidth={1.5} />
                </button>

                {/* Date */}
                <button
                  ref={dateButtonRef}
                  type="button"
                  aria-label="Ustaw termin nowego zadania"
                  aria-expanded={datePickerOpen}
                  onClick={() => { setDatePickerOpen(o => !o); setInputDropdown(null); }}
                  className="flex items-center gap-1 px-1.5 h-7 rounded-lg transition-all flex-shrink-0"
                  style={{
                    background: dateLabel ? C.iceBlueBg : "transparent",
                    color: dateLabel ? C.iceBlue : C.textMuted,
                    border: `1px solid ${dateLabel ? C.blueBorder : "transparent"}`,
                  }}>
                  <Calendar size={12} strokeWidth={1.5} />
                  {dateLabel && (
                    <span style={{ fontSize: "10px", fontWeight: 500 }}>{dateLabel}</span>
                  )}
                </button>

                {(newTask || newTaskTags.length > 0 || newPriority || newTaskList) && (
                  <button
                    type="submit"
                    aria-label="Dodaj zadanie"
                    className="text-[10px] font-semibold px-2 h-7 rounded-md flex-shrink-0"
                    style={{ background: C.iceBlueSolid, color: C.textPrimary }}>
                    ↵
                  </button>
                )}
              </div>
            </div>
          </form>

          {overdue.length > 0 && (
            <section className="task-overdue-section" aria-labelledby="task-overdue-heading">
              <div className="task-overdue-header">
                <div className="task-overdue-heading">
                  <button
                    type="button"
                    className="task-overdue-toggle"
                    aria-label={showOverdue ? "Zwiń zadania po terminie" : "Rozwiń zadania po terminie"}
                    aria-expanded={showOverdue}
                    aria-controls="task-overdue-list"
                    onClick={() => setShowOverdue(open => !open)}
                  >
                    <ChevronDown
                      size={13}
                      strokeWidth={1.6}
                      aria-hidden="true"
                      style={{ transform: showOverdue ? "none" : "rotate(-90deg)" }}
                    />
                  </button>
                  <h2 id="task-overdue-heading" className="task-overdue-title">Po terminie</h2>
                  <span className="task-overdue-count">{overdue.length}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setRescheduleOpen(true)}>
                  Przełóż
                </Button>
              </div>
              {showOverdue && (
                <div id="task-overdue-list" className="space-y-px">
                  {overdue.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      tagi={tagi}
                      deadlineLabel={overdueDateLabel(task.calendarDate!)}
                      selected={selectedId === task.id}
                      onToggle={id => updateTask(id, { done: true })}
                      onUpdate={updateTask}
                      onSelect={id => setSelectedId(selectedId === id ? null : id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {dayHeading && dayHeadingCount > 0 && (
            <div className="task-day-heading" aria-label={`${dayHeading}. ${dayHeadingCount} zadań`}>
              <ChevronDown size={13} strokeWidth={1.6} aria-hidden="true" />
              <h2 className="task-day-heading__title">{dayHeading}</h2>
              <span className="task-day-heading__count">{dayHeadingCount}</span>
            </div>
          )}

          {taskView === "ukonczone" ? (
            /* Ukończone view — flat list of all done tasks */
            <div className="space-y-px">
              {visible.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: C.textMuted }}>
                  <RotateCcw size={28} strokeWidth={1} />
                  <span className="text-[13px]">Brak ukończonych zadań</span>
                </div>
              )}
              {visible.map(t => (
                <TaskRow key={t.id} task={t} tagi={tagi}
                  selected={selectedId === t.id}
                  onToggle={id => updateTask(id, { done: false })}
                  onUpdate={updateTask}
                  onSelect={id => setSelectedId(selectedId === id ? null : id)} />
              ))}
            </div>
          ) : taskView === "kosz" ? (
            <div className="space-y-px">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: C.textMuted }}>
                  <Trash2 size={28} strokeWidth={1} />
                  <span className="text-[13px]">Kosz jest pusty</span>
                </div>
              ) : visible.map(t => (
                <div key={t.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <TaskRow task={t} tagi={tagi}
                      selected={selectedId === t.id}
                      onToggle={() => restoreTaskFromTrash(t.id)}
                      onUpdate={updateTask}
                      onSelect={id => setSelectedId(selectedId === id ? null : id)} />
                  </div>
                  <Button
                    variant="quiet"
                    size="sm"
                    leadingIcon={<RotateCcw size={12} />}
                    onClick={() => restoreTaskFromTrash(t.id)}
                  >
                    Przywróć
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    iconOnly
                    aria-label={`Usuń trwale zadanie ${t.text}`}
                    onClick={() => setPurgeTaskId(t.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Pending tasks */}
              {currentPending.length > 0 && (
                <div className="space-y-px mb-2">
                  {currentPending.map(t => (
                    <TaskRow key={t.id} task={t} tagi={tagi}
                      selected={selectedId === t.id}
                      onToggle={id => updateTask(id, { done: true })}
                      onUpdate={updateTask}
                      onSelect={id => setSelectedId(selectedId === id ? null : id)} />
                  ))}
                </div>
              )}

              {/* Completed */}
              {completed.length > 0 && (
                <div className="mt-2">
                  <button onClick={() => setShowDone(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors mb-1"
                    style={{ color: C.textMuted }}>
                    <ChevronDown size={12} strokeWidth={1.5}
                      style={{ transform: showDone ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .2s" }} />
                    Ukończone · {completed.length}
                  </button>
                  {showDone && (
                    <div className="space-y-px">
                      {completed.map(t => (
                        <TaskRow key={t.id} task={t} tagi={tagi}
                          selected={selectedId === t.id}
                          onToggle={id => updateTask(id, { done: false })}
                          onUpdate={updateTask}
                          onSelect={id => setSelectedId(selectedId === id ? null : id)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {taskView !== "kosz" && pending.length === 0 && completed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: C.textMuted }}>
              <Circle size={28} strokeWidth={1} />
              <span className="text-[13px]">Brak zadań</span>
              <button onClick={() => inputRef.current?.focus()} className="text-[11px] mt-1" style={{ color: C.iceBlue }}>
                Dodaj pierwsze zadanie →
              </button>
            </div>
          )}
        </div>
      </ModuleMain>

      {/* ── Right panel ── */}
      {(selectedTask || taskView === "podsumowanie") && (
        <DetailPanel
          className={selectedTask ? "" : "task-summary-detail"}
          label={selectedTask ? "Szczegóły zadania" : "Podsumowanie zadań"}
          onDismiss={() => selectedTask ? setSelectedId(null) : setTaskView("dzis")}
        >
        {selectedTask ? (
          <TaskDetail
            task={selectedTask}
            onClose={() => setSelectedId(null)}
            onUpdate={updateTask}
            onDelete={selectedTask.deleted ? (id) => setPurgeTaskId(id) : deleteTask}
            listy={listy}
            tagi={tagi}
          />
        ) : (
          <SummaryPanel tasks={visible} habits={habits} onToggleHabit={toggleHabit} />
        )}
        </DetailPanel>
      )}

      {/* ── Date picker popup (fixed) ── */}
      {datePickerOpen && dateButtonRef.current && (
        <DatePickerPopup
          value={newDateVal}
          onConfirm={v => { setNewDateVal(v); }}
          onClose={closeDatePicker}
          anchorEl={dateButtonRef.current}
        />
      )}

      {rescheduleOpen && (
        <Modal
          title="Przełożyć zaległe zadania na dziś?"
          onClose={() => setRescheduleOpen(false)}
          width={480}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setRescheduleOpen(false)}>Anuluj</Button>
              <Button variant="primary" onClick={rescheduleOverdue}>Przełóż na dziś</Button>
            </>
          )}
        >
          <p className="task-reschedule-copy">
            Wszystkie zadania z sekcji „Po terminie” dostaną dzisiejszą datę.
            Pozostałe informacje pozostaną bez zmian.
          </p>
        </Modal>
      )}

      {taxonomyDelete && (
        <Modal
          title={`Usunąć ${taxonomyDelete.kind === "list" ? "listę" : "tag"} „${taxonomyDelete.label}”?`}
          description={taxonomyDelete.affected > 0
            ? `${taxonomyDelete.affected} ${taxonomyDelete.affected === 1 ? "zadanie korzysta" : "zadań korzysta"} z tej klasyfikacji. Zadania pozostaną, a odwołania zostaną bezpiecznie usunięte.`
            : "Ta klasyfikacja nie jest używana przez żadne zadanie."}
          onClose={() => setTaxonomyDelete(null)}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setTaxonomyDelete(null)}>Anuluj</Button>
              <Button variant="danger" onClick={confirmTaxonomyDelete}>Usuń i uporządkuj zadania</Button>
            </>
          )}
        >
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            Tej operacji nie można cofnąć, dlatego zależności zostaną zaktualizowane w tym samym zapisie.
          </p>
        </Modal>
      )}

      {purgeTaskId !== null && (
        <Modal
          title="Usunąć zadanie trwale?"
          description="Zadanie zniknie z Kosza i nie będzie można go przywrócić."
          onClose={() => setPurgeTaskId(null)}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setPurgeTaskId(null)}>Anuluj</Button>
              <Button variant="danger" onClick={() => permanentlyDeleteTask(purgeTaskId)}>Usuń trwale</Button>
            </>
          )}
        >
          <p className="text-[12px] text-[var(--color-text-secondary)]">
            {tasks.find((task) => task.id === purgeTaskId)?.text}
          </p>
        </Modal>
      )}

      {emptyTrashOpen && (
        <Modal
          title="Opróżnić Kosz?"
          description={`${tasks.filter((task) => task.deleted).length} zadań zostanie usuniętych trwale.`}
          onClose={() => setEmptyTrashOpen(false)}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setEmptyTrashOpen(false)}>Anuluj</Button>
              <Button variant="danger" onClick={emptyTrash}>Opróżnij Kosz</Button>
            </>
          )}
        >
          <p className="text-[12px] text-[var(--color-text-secondary)]">
            Jeśli chcesz zachować wybrane pozycje, przywróć je przed opróżnieniem.
          </p>
        </Modal>
      )}

      {/* ── Input priority dropdown ── */}
      {inputDropdown === "priority" && flagBtnInputRef.current && (
        <InputFloatMenu anchorEl={flagBtnInputRef.current} onClose={() => setInputDropdown(null)}>
          {([
            { p: "high"   as Priority, label: "Wysoki", color: C.danger  },
            { p: "medium" as Priority, label: "Średni", color: C.warning },
            { p: "low"    as Priority, label: "Niski",  color: C.iceBlue },
            { p: null,                 label: "Brak",   color: C.textMuted },
          ] as const).map(({ p, label, color }) => (
            <MenuItem key={String(p)}
              selected={newPriority === p}
              onClick={() => {
                setNewPriority(p as Priority | null);
                setInputDropdown(null);
                requestAnimationFrame(() => flagBtnInputRef.current?.focus());
              }}
              leadingIcon={<Flag fill={p ? color : "none"} style={{ color }} />}
              trailingIcon={newPriority === p ? <Check /> : undefined}>
              {label}
            </MenuItem>
          ))}
        </InputFloatMenu>
      )}

      {/* ── Input list dropdown ── */}
      {inputDropdown === "list" && listBtnInputRef.current && (
        <InputFloatMenu anchorEl={listBtnInputRef.current} onClose={() => setInputDropdown(null)}>
          {[{ id: null as string | null, label: "Skrzynka zadań", color: C.textMuted }, ...listy.map(l => ({ ...l, id: l.id as string | null }))].map(l => (
            <MenuItem key={String(l.id)}
              selected={newTaskList === l.id}
              onClick={() => {
                setNewTaskList(l.id);
                setInputDropdown(null);
                requestAnimationFrame(() => listBtnInputRef.current?.focus());
              }}
              leadingIcon={<span className="h-2 w-2 rounded-full" style={{ background: l.color }} />}
              trailingIcon={newTaskList === l.id ? <Check /> : undefined}>
              {l.label}
            </MenuItem>
          ))}
        </InputFloatMenu>
      )}

      {/* ── Input tags dropdown ── */}
      {inputDropdown === "tags" && hashBtnInputRef.current && (
        <InputFloatMenu anchorEl={hashBtnInputRef.current} onClose={() => setInputDropdown(null)}>
          {tagi.map(t => {
            const active = newTaskTags.includes(t.id);
            return (
              <MenuItem key={t.id}
                selected={active}
                onClick={() => setNewTaskTags(p => active ? p.filter(id => id !== t.id) : [...p, t.id])}
                leadingIcon={<span className="h-2 w-2 rounded-full" style={{ background: t.color }} />}
                trailingIcon={active ? <Check /> : undefined}>
                #{t.label}
              </MenuItem>
            );
          })}
        </InputFloatMenu>
      )}
    </ModuleShell>
  );
}
