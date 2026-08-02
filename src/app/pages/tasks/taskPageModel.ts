import {
  BarChart2,
  Circle,
  Flame,
  Inbox,
  LayoutGrid,
  Calendar,
  TrendingUp,
} from "lucide-react";
import {
  calendarDaysBetween,
  shiftLocalDateKey,
  todayLocalDateKey,
} from "../../data/localDate";
import {
  projectTaskOccurrences,
  type TaskOccurrence,
} from "../../data/taskSchedule";
import {
  type TaskPriority,
  type TaskRecurrence,
  type TaskSchedule,
  type TaskSubtask,
  type WorkspaceHabit,
  type WorkspaceList,
  type WorkspaceTag,
  type WorkspaceTask,
} from "../../data/taskWorkspace";
import { uiColors, uiShadows } from "../../ui";

export const C = {
  bg:           uiColors.appBg,
  subSidebar:   uiColors.sidebarBg,
  elevated:     uiColors.surfaceHover,
  card:         uiColors.surface2,
  cardHover:    uiColors.surfaceHover,
  inputBg:      uiColors.surface1,
  borderSubtle: uiColors.border,
  borderStrong: uiColors.borderStrong,
  textPrimary:  uiColors.textPrimary,
  textSecond:   uiColors.textSecondary,
  textMuted:    uiColors.textTertiary,
  textDisabled: uiColors.textDisabled,
  iceBlue:      uiColors.primaryText,
  iceBlueSolid: uiColors.primary,
  iceBlueBg:    uiColors.primarySubtle,
  seaGlass:     uiColors.success,
  seaGlassBg:   uiColors.successSubtle,
  warning:      uiColors.warning,
  danger:       uiColors.danger,
  dangerBg:     uiColors.dangerSubtle,
  blueBorder:   "color-mix(in srgb, var(--color-precision-blue) 35%, transparent)",
  floatingShadow: uiShadows.floating,
} as const;

export type Priority = TaskPriority;
export type Subtask = TaskSubtask;
export type Task = WorkspaceTask;
export type Habit = WorkspaceHabit;
export type ListItem = WorkspaceList;
export type TagItem = WorkspaceTag;

export const PRIORITY_COLOR: Record<Priority, string> = {
  high: C.danger, medium: C.warning, low: C.iceBlue,
};

export const SMART_VIEWS = [
  { id: "dzis",       label: "Dziś",            icon: LayoutGrid },
  { id: "wszystkie",   label: "Wszystkie",      icon: Circle     },
  { id: "skrzynka",   label: "Skrzynka",       icon: Inbox      },
  { id: "jutro",      label: "Jutro",           icon: Calendar   },
  { id: "7dni",       label: "Następne 7 dni",  icon: TrendingUp },
  { id: "nawyki",     label: "Nawyki",           icon: Flame      },
  { id: "podsumowanie", label: "Podsumowanie",  icon: BarChart2  },
];

export const PRIMARY_SMART_VIEWS = SMART_VIEWS.filter((view) => view.id !== "nawyki" && view.id !== "podsumowanie");
export const SPECIAL_SMART_VIEWS = SMART_VIEWS.filter((view) => view.id === "nawyki" || view.id === "podsumowanie");

export const VIEW_LABELS: Record<string, string> = {
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

export function initialTaskView() {
  if (typeof window === "undefined") return "dzis";
  const requested = new URLSearchParams(window.location.search).get("widok");
  return requested && VIEW_LABELS[requested] ? requested : "dzis";
}

export const PALETTE = [
  C.iceBlue, C.seaGlass, C.warning, C.danger,
  C.textSecond, uiColors.violet,
];
export const VISIBLE_TAG_LIMIT = 4;

export function formatOpenTaskCount(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const adjective = count === 1 || (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14))
    ? "otwarte"
    : "otwartych";
  return `${count} ${adjective}`;
}

export type TaskSidebarState = {
  taskView: string;
  listFilter: string | null;
  tagFilter: string | null;
  listyOpen: boolean;
  tagiOpen: boolean;
};

const TASK_SIDEBAR_STATE_KEY = "rootine.tasks.sidebar.v2";
const DEFAULT_TASK_SIDEBAR_STATE: TaskSidebarState = {
  taskView: "dzis",
  listFilter: null,
  tagFilter: null,
  // Keep taxonomy available without making administration compete with the
  // user's current task. An explicit choice is persisted across task views.
  listyOpen: false,
  tagiOpen: false,
};

export function loadTaskSidebarState(): TaskSidebarState {
  if (typeof window === "undefined") return DEFAULT_TASK_SIDEBAR_STATE;
  try {
    const raw = window.localStorage.getItem(TASK_SIDEBAR_STATE_KEY);
    if (!raw) return DEFAULT_TASK_SIDEBAR_STATE;
    const parsed = JSON.parse(raw) as Partial<TaskSidebarState>;
    return {
      ...DEFAULT_TASK_SIDEBAR_STATE,
      ...parsed,
      listFilter: typeof parsed.listFilter === "string" ? parsed.listFilter : null,
      tagFilter: typeof parsed.tagFilter === "string" ? parsed.tagFilter : null,
      listyOpen: parsed.listyOpen === true,
      tagiOpen: parsed.tagiOpen === true,
    };
  } catch {
    return DEFAULT_TASK_SIDEBAR_STATE;
  }
}

export function saveTaskSidebarState(patch: Partial<TaskSidebarState>): TaskSidebarState {
  const next = { ...loadTaskSidebarState(), ...patch };
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(TASK_SIDEBAR_STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("rootine:task-sidebar-change", { detail: next }));
  } catch {
    // Sidebar preferences are optional; navigation must continue without storage.
  }
  return next;
}



export const PL_MONTHS_SHORT = ["sty","lut","mar","kwi","maj","cze","lip","sie","wrz","paź","lis","gru"];

export function getWeekRangeLabel(): string {
  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today); mon.setDate(today.getDate() - ((dow + 6) % 7));
  const sun = new Date(mon);  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => `${d.getDate()} ${PL_MONTHS_SHORT[d.getMonth()]}`;
  return `${fmt(mon)} - ${fmt(sun)}`;
}

export function fmtTaskDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${PL_MONTHS_SHORT[d.getMonth()]}`;
}

export type DateVal = {
  date: Date | null;
  time: string;
  reminder: string;
  repeat: string;
  startTime: string;
  endTime: string;
  duration: boolean;
  allDay: boolean;
};

export const DEFAULT_DATE_VAL: DateVal = {
  date: null, time: "", reminder: "", repeat: "",
  startTime: "09:00", endTime: "10:00", duration: false, allDay: true,
};

export function formatDateLabel(val: DateVal): string {
  if (!val.date) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tmrw  = new Date(today); tmrw.setDate(tmrw.getDate() + 1);
  const d     = new Date(val.date); d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return "Dziś";
  if (d.getTime() === tmrw.getTime())  return "Jutro";
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

export function todayStr() {
  const d = new Date();
  const w = d.toLocaleDateString("pl-PL", { weekday: "long" });
  const r = d.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
  return (w[0].toUpperCase() + w.slice(1)) + ", " + r;
}

export function viewedTaskDayHeading(view: string) {
  if (view !== "dzis" && view !== "jutro") return null;
  const date = new Date();
  if (view === "jutro") date.setDate(date.getDate() + 1);
  const weekday = date.toLocaleDateString("pl-PL", { weekday: "long" });
  return `${weekday}, ${view === "dzis" ? "Dziś" : "Jutro"}`;
}

export function overdueDateLabel(calendarDate: string): string {
  const daysAgo = calendarDaysBetween(calendarDate, todayLocalDateKey());
  if (daysAgo === null) return "Po terminie";
  if (daysAgo === 1) return "Wczoraj";
  if (daysAgo > 1) return `${daysAgo} dni temu`;
  return "Po terminie";
}

/**
 * Explicit form for the fixed-width ListRow date column. The user should not have to
 * infer that a bare duration means lateness.
 */
export function overdueRailLabel(calendarDate: string): string {
  const daysAgo = calendarDaysBetween(calendarDate, todayLocalDateKey());
  if (daysAgo === null) return "";
  if (daysAgo === 1) return "Wczoraj";
  if (daysAgo > 1) return `${daysAgo} dni po terminie`;
  return "";
}

/**
 * Chronological order inside a single day: earliest first, untimed tasks last.
 *
 * Only meaningful when every task shares a day — across days a time of day says nothing
 * about sequence, which is why the overdue group is ordered by how late it is instead.
 */
export function sortByScheduledTime<T extends { time?: string | null }>(tasks: T[]): T[] {
  return [...tasks].sort((left, right) => {
    if (left.time && right.time) return left.time.localeCompare(right.time);
    if (left.time) return -1;
    if (right.time) return 1;
    return 0;
  });
}

export function getMiniWeek() {
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
export const REMINDER_OPTIONS = [
  { value: "",     label: "Brak"           },
  { value: "0",    label: "W momencie"     },
  { value: "5",    label: "5 minut przed"  },
  { value: "10",   label: "10 minut przed" },
  { value: "30",   label: "30 minut przed" },
  { value: "60",   label: "1 godzina przed"},
  { value: "1440", label: "1 dzień przed"  },
];

export const REPEAT_OPTIONS = [
  { value: "",        label: "Nie powtarzaj" },
  { value: "daily",   label: "Codziennie"    },
  { value: "weekly",  label: "Co tydzień"    },
  { value: "monthly", label: "Co miesiąc"    },
  { value: "yearly",  label: "Co rok"        },
];

export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw";
  } catch {
    return "Europe/Warsaw";
  }
}

export function smartDateViewRange(view: string, todayKey: string): [string, string] | null {
  if (view === "dzis") return [todayKey, todayKey];
  if (view === "jutro") {
    const tomorrow = shiftLocalDateKey(todayKey, 1);
    return [tomorrow, tomorrow];
  }
  if (view === "7dni") return [shiftLocalDateKey(todayKey, 2), shiftLocalDateKey(todayKey, 7)];
  return null;
}

export function tasksForSmartDateView(tasks: readonly Task[], view: string, todayKey: string) {
  const range = smartDateViewRange(view, todayKey);
  if (!range) return { tasks: [...tasks], occurrences: [] as TaskOccurrence[] };
  const occurrences = projectTaskOccurrences(tasks, range[0], range[1])
    .filter((task) => !task.deleted);
  const byId = new Map<number, Task>();
  for (const task of tasks) {
    if (task.deleted) continue;
    if (!task.calendarDate && task.view === view) byId.set(task.id, task);
    if (view === "dzis" && task.calendarDate && task.calendarDate < todayKey && !task.done) {
      byId.set(task.id, task);
    }
  }
  for (const occurrence of occurrences) byId.set(occurrence.id, occurrence);
  return { tasks: [...byId.values()], occurrences };
}

export function scheduleFromDateValue(value: DateVal, completedDates?: string[]): TaskSchedule | undefined {
  if (!value.date) return undefined;
  const hasTime = value.duration ? Boolean(value.startTime && value.endTime) : Boolean(value.time);
  const allDay = value.allDay || !hasTime;
  return {
    allDay,
    startTime: allDay ? "" : value.duration ? value.startTime : value.time,
    endTime: !allDay && value.duration ? value.endTime : undefined,
    reminderMinutes: allDay || value.reminder === "" ? undefined : Number(value.reminder),
    recurrence: (value.repeat || undefined) as TaskRecurrence | undefined,
    completedDates: completedDates?.length ? [...completedDates].sort() : undefined,
    timezone: browserTimezone(),
  };
}

// ── Custom select (themed) ────────────────────────────────
