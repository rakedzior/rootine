import { CALENDAR_TASKS } from "./calendarTasks";
import {
  isCommitmentTaskSource,
  linkedWorkTaskOriginIds,
  projectCommitments,
  propagateCommitmentEdits,
  stripProjectedCommitments,
  type CommitmentTaskSource,
} from "./commitmentRepository";
import { hydrateTaskCompletion } from "./taskCompletion";
import {
  calendarDaysBetween,
  isLocalDateKey,
  parseLocalDateKey,
  shiftLocalDateKey,
} from "./localDate";
import { readLocalWorkspace, writeLocalWorkspace, type LocalLoadResult } from "./localRepository";

export const TASK_STORAGE_KEY = "rootine.task-workspace.v1";
const WORKSPACE_VERSION = 2 as const;

export type TaskPriority = "high" | "medium" | "low";
export type TaskSubtask = { id: number; text: string; done: boolean };
export type TaskComment = { id: number; author: string; text: string; time: string };
export type TaskRecurrence = "daily" | "weekly" | "monthly" | "yearly";
export type TaskSchedule = {
  allDay: boolean;
  startTime: string;
  endTime?: string;
  endDate?: string;
  reminderMinutes?: number;
  recurrence?: TaskRecurrence;
  completedDates?: string[];
  completedAtByDate?: Record<string, string>;
  timezone: string;
};

export type WorkspaceTask = {
  id: number;
  text: string;
  done: boolean;
  completedAt?: string;
  time?: string;
  endTime?: string;
  tags?: string[];
  list?: string;
  view: string;
  priority?: TaskPriority;
  notes?: string;
  deleted?: boolean;
  calendarDate?: string;
  date?: string;
  subtasks?: TaskSubtask[];
  comments?: TaskComment[];
  schedule?: TaskSchedule;
  source?: CommitmentTaskSource;
};

export type WorkspaceHabit = {
  id: number;
  name: string;
  streak: number;
  done: boolean;
  completedDates?: string[];
  schedule?: HabitSchedule;
  priority?: TaskPriority;
  time?: string;
  timeOfDay?: HabitTimeOfDay;
  reminderMinutes?: number;
  color?: string;
  pausePeriods?: HabitPause[];
};
export type HabitTimeOfDay = "morning" | "afternoon" | "evening";
export type HabitSchedule = {
  type: "daily" | "weekly" | "interval";
  weekdays?: number[];
  interval?: number;
  startDate: string;
  endDate?: string;
};
export type HabitPause = { startDate: string; endDate?: string };
export type WorkspaceList = { id: string; label: string; color: string };
export type WorkspaceTag = { id: string; label: string; color: string };

export type TaskWorkspace = {
  version: typeof WORKSPACE_VERSION;
  updatedAt: string;
  tasks: WorkspaceTask[];
  habits: WorkspaceHabit[];
  lists: WorkspaceList[];
  tags: WorkspaceTag[];
};

type LegacyTaskWorkspace = Omit<TaskWorkspace, "version" | "tasks"> & {
  version: 1;
  tasks: Array<Omit<WorkspaceTask, "schedule">>;
};

export function toCalendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function taskViewForCalendarDate(calendarDate: string, referenceDate = new Date()): string {
  const [year, month, day] = calendarDate.split("-").map(Number);
  if (!year || !month || !day) return "bezterminu";
  const targetDay = Date.UTC(year, month - 1, day);
  const referenceDay = Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const dayDifference = Math.round((targetDay - referenceDay) / 86_400_000);
  if (dayDifference <= 0) return "dzis";
  if (dayDifference === 1) return "jutro";
  if (dayDifference <= 7) return "7dni";
  if (dayDifference <= 30) return "30dni";
  return "wszystkie";
}

const DEFAULT_TASKS: WorkspaceTask[] = [
  { id: 1, text: "Ogród – Piłsudskiego – Zarezerwowane", done: false, time: "18:00", tags: ["hobby"], list: "hobby", view: "dzis", priority: "medium" },
  { id: 2, text: "ZAKO Drinkbar – zarezerwowane", done: false, tags: ["hobby"], list: "hobby", view: "dzis", priority: "low" },
  { id: 3, text: "Klub RE – rezerwacja sala paląca", done: false, tags: ["dom"], list: "dom", view: "dzis" },
  { id: 4, text: "Przejrzeć raporty finansowe Q2", done: false, time: "14:00", tags: ["praca"], list: "praca", view: "jutro", priority: "high" },
  { id: 5, text: "Kupić bilety na koncert", done: false, tags: ["hobby"], list: "hobby", view: "7dni" },
  { id: 6, text: "Przegląd samochodu", done: false, time: "10:00", tags: ["dom"], list: "dom", view: "7dni", priority: "medium" },
  { id: 7, text: "Wysłać ofertę do klienta", done: false, time: "09:00", tags: ["praca"], list: "praca", view: "bezterminu", priority: "high" },
  { id: 8, text: "Zamówić suplementy", done: false, tags: ["zdrowie"], list: "zdrowie", view: "bezterminu" },
  { id: 9, text: "Tomasz Karcz – zadzwonić", done: true, tags: ["praca"], list: "praca", view: "dzis" },
  { id: 10, text: "Black Gallery Pub – nie odbierają", done: true, tags: ["hobby"], list: "hobby", view: "dzis" },
  { id: 11, text: "Stara Zajezdnia – rezerwacja", done: true, tags: ["dom"], list: "dom", view: "bezterminu" },
  ...CALENDAR_TASKS.map(({ dateLabel, ...task }) => ({ ...task, date: dateLabel, view: taskViewForCalendarDate(task.calendarDate) })),
];

function recentHabitDates(length: number, includeToday = true): string[] {
  const startOffset = includeToday ? 0 : 1;
  return Array.from({ length }, (_, index) => toCalendarDateKey(new Date(Date.now() - (index + startOffset) * 86_400_000))).sort();
}

const DEFAULT_HABITS: WorkspaceHabit[] = [
  { id: 1, name: "Medytacja rano", streak: 5, done: true, completedDates: recentHabitDates(5) },
  { id: 2, name: "8 szklanek wody", streak: 2, done: false, completedDates: recentHabitDates(2, false) },
  { id: 3, name: "30 min czytania", streak: 12, done: false, completedDates: recentHabitDates(12, false) },
  { id: 4, name: "Spacer 20 min", streak: 0, done: false, completedDates: [] },
];

// Lists and tags are categories, so they take the `category-*` palette. They must not take
// the semantic colours: blue is the action signal, and ochre/green mean warning/success.
// These previously carried pre-audit hexes (#4772FA, #70B89F, #D4AA68), which is why demo
// data painted itself in a palette the app no longer uses.
const DEFAULT_LISTS: WorkspaceList[] = [
  { id: "praca", label: "Praca", color: "#7FA6C9" },
  { id: "dom", label: "Dom", color: "#B9A171" },
  { id: "hobby", label: "Hobby", color: "#8793A1" },
  { id: "zdrowie", label: "Zdrowie", color: "#79A8A4" },
];

const DEFAULT_TAGS: WorkspaceTag[] = [
  { id: "praca", label: "praca", color: "#7FA6C9" },
  { id: "trening", label: "trening", color: "#79A8A4" },
  { id: "dom", label: "dom", color: "#B9A171" },
  { id: "finanse", label: "finanse", color: "#8793A1" },
  { id: "zdrowie", label: "zdrowie", color: "#79A8A4" },
  { id: "hobby", label: "hobby", color: "#7D7FA8" },
];

export function createDefaultTaskWorkspace(): TaskWorkspace {
  return {
    version: WORKSPACE_VERSION,
    updatedAt: new Date(0).toISOString(),
    tasks: hydrateTaskCompletion(DEFAULT_TASKS).map((task) => ({ ...task })),
    habits: DEFAULT_HABITS.map((habit) => ({ ...habit })),
    lists: DEFAULT_LISTS.map((list) => ({ ...list })),
    tags: DEFAULT_TAGS.map((tag) => ({ ...tag })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorkspaceTask(value: unknown): value is WorkspaceTask {
  if (!isRecord(value)) return false;
  return typeof value.id === "number"
    && typeof value.text === "string"
    && typeof value.done === "boolean"
    && (value.completedAt === undefined || isTimestamp(value.completedAt))
    && typeof value.view === "string"
    && (value.calendarDate === undefined || typeof value.calendarDate === "string")
    && (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")))
    && (value.schedule === undefined || isTaskSchedule(value.schedule))
    && (value.source === undefined || isCommitmentTaskSource(value.source));
}

function isClockTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isCompletionTimestampMap(value: unknown): value is Record<string, string> {
  return isRecord(value)
    && Object.entries(value).every(([date, timestamp]) => isLocalDateKey(date) && isTimestamp(timestamp));
}

function isTaskSchedule(value: unknown): value is TaskSchedule {
  if (!isRecord(value)) return false;
  if (typeof value.allDay !== "boolean" || typeof value.startTime !== "string") return false;
  const validEndDate = value.endDate === undefined || (typeof value.endDate === "string" && isLocalDateKey(value.endDate));
  const validTimeRange = value.allDay
    ? value.startTime === "" && value.endTime === undefined
    : isClockTime(value.startTime)
      && (value.endTime === undefined
        || (typeof value.endTime === "string"
          && isClockTime(value.endTime)
          && (value.endDate !== undefined || value.endTime > value.startTime)));
  return validEndDate
    && validTimeRange
    && (value.reminderMinutes === undefined
      || (typeof value.reminderMinutes === "number"
        && Number.isInteger(value.reminderMinutes)
        && value.reminderMinutes >= 0))
    && (value.recurrence === undefined || ["daily", "weekly", "monthly", "yearly"].includes(String(value.recurrence)))
    && (value.completedDates === undefined
      || (Array.isArray(value.completedDates)
        && value.completedDates.every(isLocalDateKey)
        && new Set(value.completedDates).size === value.completedDates.length))
    && (value.completedAtByDate === undefined || isCompletionTimestampMap(value.completedAtByDate))
    && typeof value.timezone === "string"
    && value.timezone.trim().length > 0;
}

function isWorkspaceHabit(value: unknown): value is WorkspaceHabit {
  return isRecord(value)
    && typeof value.id === "number"
    && typeof value.name === "string"
    && typeof value.streak === "number"
    && typeof value.done === "boolean"
    && (value.completedDates === undefined
      || (Array.isArray(value.completedDates) && value.completedDates.every(isLocalDateKey)))
    && (value.schedule === undefined || isHabitSchedule(value.schedule))
    && (value.priority === undefined || ["high", "medium", "low"].includes(String(value.priority)))
    && (value.time === undefined || (typeof value.time === "string" && isClockTime(value.time)))
    && (value.timeOfDay === undefined || ["morning", "afternoon", "evening"].includes(String(value.timeOfDay)))
    && (value.reminderMinutes === undefined
      || (typeof value.reminderMinutes === "number" && Number.isInteger(value.reminderMinutes) && value.reminderMinutes >= 0))
    && (value.color === undefined || typeof value.color === "string")
    && (value.pausePeriods === undefined
      || (Array.isArray(value.pausePeriods) && value.pausePeriods.every(isHabitPause)));
}

function isHabitSchedule(value: unknown): value is HabitSchedule {
  if (!isRecord(value) || !["daily", "weekly", "interval"].includes(String(value.type))) return false;
  if (!isLocalDateKey(value.startDate)) return false;
  if (value.endDate !== undefined && !isLocalDateKey(value.endDate)) return false;
  if (value.endDate !== undefined && value.endDate < value.startDate) return false;
  if (value.weekdays !== undefined && (
    !Array.isArray(value.weekdays)
    || value.weekdays.length === 0
    || value.weekdays.some((day) => typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 7)
  )) return false;
  if (value.interval !== undefined && (typeof value.interval !== "number" || !Number.isInteger(value.interval) || value.interval < 1)) return false;
  if (value.type === "weekly" && (!Array.isArray(value.weekdays) || value.weekdays.length === 0)) return false;
  return value.type !== "interval" || value.interval !== undefined;
}

function isHabitPause(value: unknown): value is HabitPause {
  return isRecord(value)
    && isLocalDateKey(value.startDate)
    && (value.endDate === undefined || isLocalDateKey(value.endDate))
    && (value.endDate === undefined || value.endDate >= value.startDate);
}

function isWorkspaceList(value: unknown): value is WorkspaceList {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.label === "string"
    && typeof value.color === "string";
}

function isWorkspace(value: unknown): value is TaskWorkspace {
  return isRecord(value)
    && value.version === WORKSPACE_VERSION
    && typeof value.updatedAt === "string"
    && Array.isArray(value.tasks)
    && value.tasks.every(isWorkspaceTask)
    && Array.isArray(value.habits)
    && value.habits.every(isWorkspaceHabit)
    && Array.isArray(value.lists)
    && value.lists.every(isWorkspaceList)
    && Array.isArray(value.tags)
    && value.tags.every(isWorkspaceList);
}

function isLegacyWorkspace(value: unknown): value is LegacyTaskWorkspace {
  return isRecord(value)
    && value.version === 1
    && typeof value.updatedAt === "string"
    && Array.isArray(value.tasks)
    && value.tasks.every((task) => isRecord(task)
      && typeof task.id === "number"
      && typeof task.text === "string"
      && typeof task.done === "boolean"
      && typeof task.view === "string")
    && Array.isArray(value.habits)
    && value.habits.every(isWorkspaceHabit)
    && Array.isArray(value.lists)
    && value.lists.every(isWorkspaceList)
    && Array.isArray(value.tags)
    && value.tags.every(isWorkspaceList);
}

function currentTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw";
  } catch {
    return "Europe/Warsaw";
  }
}

function scheduleFromLegacyTask(task: Omit<WorkspaceTask, "schedule">): TaskSchedule | undefined {
  if (!task.calendarDate) return undefined;
  return {
    allDay: !task.time,
    startTime: task.time ?? "",
    endTime: task.endTime,
    timezone: currentTimezone(),
  };
}

function migrateLegacyWorkspace(value: unknown): TaskWorkspace | null {
  if (!isLegacyWorkspace(value)) return null;
  return {
    ...value,
    version: WORKSPACE_VERSION,
    tasks: value.tasks.map((task) => ({ ...task, schedule: scheduleFromLegacyTask(task) })),
  };
}

function normalizeLoadedWorkspace(workspace: TaskWorkspace): TaskWorkspace {
    const todayKey = toCalendarDateKey(new Date());
    return {
      ...workspace,
      tasks: workspace.tasks.map((task) => {
        if (isCalendarTask(task) && (task.view === "kalendarz" || task.view === "skrzynka")) {
          return { ...task, view: taskViewForCalendarDate(task.calendarDate) };
        }
        if (!isCalendarTask(task) && task.view === "skrzynka") return { ...task, view: "bezterminu" };
        return task;
      }),
      habits: workspace.habits.map((habit) => normalizeHabitState(habit, todayKey)),
    };
}

function withProjectedCommitments(workspace: TaskWorkspace): TaskWorkspace {
  const projected = projectCommitments();
  const linkedOriginIds = linkedWorkTaskOriginIds();
  return {
    ...workspace,
    tasks: [
      ...stripProjectedCommitments(workspace.tasks)
        .filter((task) => !linkedOriginIds.has(task.id)),
      ...projected,
    ],
  };
}

function stripRuntimeTaskOccurrences(tasks: readonly WorkspaceTask[]): WorkspaceTask[] {
  const sourceTasks = new Map<number, WorkspaceTask>();
  for (const task of tasks) {
    const candidate = task as WorkspaceTask & {
      occurrence?: { virtual?: unknown };
    };
    if (candidate.occurrence?.virtual === true) continue;
    if (!candidate.occurrence) {
      sourceTasks.set(task.id, task);
      continue;
    }
    const { occurrence: _occurrence, ...sourceTask } = candidate;
    sourceTasks.set(sourceTask.id, sourceTask);
  }
  return [...sourceTasks.values()];
}

export function loadTaskWorkspaceResult(): LocalLoadResult<TaskWorkspace> {
  const result = readLocalWorkspace({
    key: TASK_STORAGE_KEY,
    fallback: createDefaultTaskWorkspace,
    validate: isWorkspace,
    migrate: migrateLegacyWorkspace,
  });
  return {
    ...result,
    workspace: withProjectedCommitments(normalizeLoadedWorkspace(result.workspace)),
  };
}

export function loadTaskWorkspace(): TaskWorkspace {
  return loadTaskWorkspaceResult().workspace;
}

export function saveTaskWorkspace(workspace: TaskWorkspace): boolean {
  const sourceTasks = stripRuntimeTaskOccurrences(workspace.tasks);
  const sourceSaved = propagateCommitmentEdits(sourceTasks);
  const next: TaskWorkspace = {
    ...workspace,
    version: WORKSPACE_VERSION,
    updatedAt: new Date().toISOString(),
    tasks: stripProjectedCommitments(sourceTasks),
  };
  return writeLocalWorkspace(TASK_STORAGE_KEY, next) && sourceSaved;
}

function defaultHabitSchedule(startDate: string): HabitSchedule {
  return { type: "daily", startDate };
}

function habitSchedule(habit: WorkspaceHabit): HabitSchedule {
  return habit.schedule ?? defaultHabitSchedule(habit.completedDates?.[0] ?? toCalendarDateKey(new Date()));
}

function habitWeekday(dateKey: string): number {
  const date = parseLocalDateKey(dateKey);
  if (!date) return 0;
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function habitWeekStart(dateKey: string): string {
  const date = parseLocalDateKey(dateKey);
  if (!date) return dateKey;
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toCalendarDateKey(date);
}

export function isHabitPausedOnDate(habit: WorkspaceHabit, dateKey: string): boolean {
  return (habit.pausePeriods ?? []).some((period) => (
    dateKey >= period.startDate && (period.endDate === undefined || dateKey <= period.endDate)
  ));
}

function isHabitActiveOnDate(habit: WorkspaceHabit, dateKey: string): boolean {
  const schedule = habitSchedule(habit);
  return dateKey >= schedule.startDate && (schedule.endDate === undefined || dateKey <= schedule.endDate);
}

export function isHabitScheduledOnDate(habit: WorkspaceHabit, dateKey: string): boolean {
  if (!isHabitActiveOnDate(habit, dateKey) || isHabitPausedOnDate(habit, dateKey)) return false;
  const schedule = habitSchedule(habit);
  if (schedule.type === "daily") return true;
  if (schedule.type === "weekly") {
    const weekdays = schedule.weekdays ?? [];
    if (!weekdays.includes(habitWeekday(dateKey))) return false;
    const startWeek = habitWeekStart(schedule.startDate);
    const currentWeek = habitWeekStart(dateKey);
    const days = calendarDaysBetween(startWeek, currentWeek);
    const interval = schedule.interval ?? 1;
    return days !== null && days >= 0 && Math.floor(days / 7) % interval === 0;
  }
  const days = calendarDaysBetween(schedule.startDate, dateKey);
  const interval = schedule.interval ?? 1;
  return days !== null && days >= 0 && days % interval === 0;
}

export type HabitDayState = "completed" | "scheduled" | "paused" | "rest" | "inactive";

export function habitDayState(habit: WorkspaceHabit, dateKey: string): HabitDayState {
  if (isHabitPausedOnDate(habit, dateKey)) return "paused";
  // A completion entered from history is intentional even when the date was
  // outside the original active range or an otherwise free day.
  if (isHabitDoneOnDate(habit, dateKey) && dateKey <= toCalendarDateKey(new Date())) return "completed";
  if (!isHabitActiveOnDate(habit, dateKey)) return "inactive";
  if (!isHabitScheduledOnDate(habit, dateKey)) return "rest";
  return "scheduled";
}

export function isHabitDoneOnDate(habit: WorkspaceHabit, dateKey: string): boolean {
  return habit.completedDates ? habit.completedDates.includes(dateKey) : habit.done && dateKey === toCalendarDateKey(new Date());
}

export function getHabitCurrentStreak(habit: WorkspaceHabit, referenceDate = toCalendarDateKey(new Date())): number {
  let streak = 0;
  for (let offset = 0; offset < 3660; offset += 1) {
    const dateKey = shiftLocalDateKey(referenceDate, -offset);
    if (dateKey < habitSchedule(habit).startDate) break;
    if (isHabitPausedOnDate(habit, dateKey)) continue;
    if (!isHabitScheduledOnDate(habit, dateKey)) continue;
    if (!isHabitDoneOnDate(habit, dateKey)) break;
    streak += 1;
  }
  return streak;
}

export function getHabitBestStreak(habit: WorkspaceHabit, referenceDate = toCalendarDateKey(new Date())): number {
  const start = habitSchedule(habit).startDate;
  let best = 0;
  let current = 0;
  for (let dateKey = start; dateKey <= referenceDate; dateKey = shiftLocalDateKey(dateKey, 1)) {
    if (isHabitPausedOnDate(habit, dateKey)) continue;
    if (!isHabitScheduledOnDate(habit, dateKey)) continue;
    if (isHabitDoneOnDate(habit, dateKey)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

export function getHabitCompletionStats(habit: WorkspaceHabit, startDate: string, endDate: string) {
  let scheduled = 0;
  let completed = 0;
  for (let dateKey = startDate; dateKey <= endDate; dateKey = shiftLocalDateKey(dateKey, 1)) {
    if (!isHabitScheduledOnDate(habit, dateKey)) continue;
    scheduled += 1;
    if (isHabitDoneOnDate(habit, dateKey)) completed += 1;
  }
  return { scheduled, completed };
}

export function normalizeHabitState(habit: WorkspaceHabit, referenceDate = toCalendarDateKey(new Date())): WorkspaceHabit {
  const legacyEndDate = habit.done ? referenceDate : shiftLocalDateKey(referenceDate, -1);
  const legacyDates = !habit.schedule && habit.streak > 0
    ? Array.from({ length: habit.streak }, (_, index) => shiftLocalDateKey(legacyEndDate, -index))
    : [];
  const sourceDates = [...(habit.completedDates ?? []), ...legacyDates];
  const completedDates = [...new Set(sourceDates.filter(isLocalDateKey))].sort();
  const schedule = habit.schedule && isHabitSchedule(habit.schedule)
    ? { ...habit.schedule, weekdays: habit.schedule.weekdays ? [...new Set(habit.schedule.weekdays)].sort() : undefined }
    : defaultHabitSchedule(completedDates[0] ?? referenceDate);
  const pausePeriods = (habit.pausePeriods ?? []).filter(isHabitPause).map((period) => ({ ...period }));
  const next = { ...habit, completedDates, schedule, pausePeriods };
  return {
    ...next,
    done: isHabitScheduledOnDate(next, referenceDate) && isHabitDoneOnDate(next, referenceDate),
    streak: getHabitCurrentStreak(next, referenceDate),
  };
}

export function setHabitCompletionOnDate(habit: WorkspaceHabit, dateKey: string, done: boolean): WorkspaceHabit {
  if (done && (dateKey > toCalendarDateKey(new Date()) || isHabitPausedOnDate(habit, dateKey))) return habit;
  const completedDates = new Set(habit.completedDates ?? []);
  if (done) completedDates.add(dateKey);
  else completedDates.delete(dateKey);
  return normalizeHabitState({ ...habit, completedDates: [...completedDates].sort() });
}

export function setTaskDoneState(task: WorkspaceTask, done: boolean, completedAt?: string): WorkspaceTask {
  if (task.done === done) return task;
  if (done) return { ...task, done, completedAt: completedAt ?? new Date().toISOString() };
  const { completedAt: _completedAt, ...withoutCompletion } = task;
  return { ...withoutCompletion, done };
}

export function toggleHabitOnDate(habit: WorkspaceHabit, dateKey: string): WorkspaceHabit {
  return setHabitCompletionOnDate(habit, dateKey, !isHabitDoneOnDate(habit, dateKey));
}

export function isCalendarTask(task: WorkspaceTask): task is WorkspaceTask & { calendarDate: string } {
  return typeof task.calendarDate === "string" && task.calendarDate.length > 0;
}

export function replaceCalendarTasks(workspace: TaskWorkspace, calendarTasks: WorkspaceTask[]): TaskWorkspace {
  return {
    ...workspace,
    tasks: [...workspace.tasks.filter((task) => !isCalendarTask(task)), ...calendarTasks],
  };
}

export function trashTask(workspace: TaskWorkspace, taskId: number): TaskWorkspace {
  return {
    ...workspace,
    tasks: workspace.tasks.map((task) => task.id === taskId ? { ...task, deleted: true } : task),
  };
}

export function restoreTask(workspace: TaskWorkspace, taskId: number): TaskWorkspace {
  return {
    ...workspace,
    tasks: workspace.tasks.map((task) => task.id === taskId ? { ...task, deleted: false } : task),
  };
}

export function purgeTask(workspace: TaskWorkspace, taskId: number): TaskWorkspace {
  return {
    ...workspace,
    tasks: workspace.tasks.filter((task) => task.id !== taskId),
  };
}

export function emptyTaskTrash(workspace: TaskWorkspace): TaskWorkspace {
  return {
    ...workspace,
    tasks: workspace.tasks.filter((task) => !task.deleted),
  };
}
