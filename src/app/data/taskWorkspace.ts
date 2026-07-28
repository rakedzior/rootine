import { CALENDAR_TASKS } from "./calendarTasks";
import {
  isCommitmentTaskSource,
  projectCommitments,
  propagateCommitmentEdits,
  stripProjectedCommitments,
  type CommitmentTaskSource,
} from "./commitmentRepository";
import { hydrateTaskCompletion } from "./taskCompletion";
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
  reminderMinutes?: number;
  recurrence?: TaskRecurrence;
  timezone: string;
};

export type WorkspaceTask = {
  id: number;
  text: string;
  done: boolean;
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
};
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
  if (!year || !month || !day) return "skrzynka";
  const targetDay = Date.UTC(year, month - 1, day);
  const referenceDay = Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const dayDifference = Math.round((targetDay - referenceDay) / 86_400_000);
  if (dayDifference <= 0) return "dzis";
  if (dayDifference === 1) return "jutro";
  if (dayDifference <= 7) return "7dni";
  return "skrzynka";
}

const DEFAULT_TASKS: WorkspaceTask[] = [
  { id: 1, text: "Ogród – Piłsudskiego – Zarezerwowane", done: false, time: "18:00", tags: ["hobby"], list: "hobby", view: "dzis", priority: "medium" },
  { id: 2, text: "ZAKO Drinkbar – zarezerwowane", done: false, tags: ["hobby"], list: "hobby", view: "dzis", priority: "low" },
  { id: 3, text: "Klub RE – rezerwacja sala paląca", done: false, tags: ["dom"], list: "dom", view: "dzis" },
  { id: 4, text: "Przejrzeć raporty finansowe Q2", done: false, time: "14:00", tags: ["praca"], list: "praca", view: "jutro", priority: "high" },
  { id: 5, text: "Kupić bilety na koncert", done: false, tags: ["hobby"], list: "hobby", view: "7dni" },
  { id: 6, text: "Przegląd samochodu", done: false, time: "10:00", tags: ["dom"], list: "dom", view: "7dni", priority: "medium" },
  { id: 7, text: "Wysłać ofertę do klienta", done: false, time: "09:00", tags: ["praca"], list: "praca", view: "skrzynka", priority: "high" },
  { id: 8, text: "Zamówić suplementy", done: false, tags: ["zdrowie"], list: "zdrowie", view: "skrzynka" },
  { id: 9, text: "Tomasz Karcz – zadzwonić", done: true, tags: ["praca"], list: "praca", view: "dzis" },
  { id: 10, text: "Black Gallery Pub – nie odbierają", done: true, tags: ["hobby"], list: "hobby", view: "dzis" },
  { id: 11, text: "Stara Zajezdnia – rezerwacja", done: true, tags: ["dom"], list: "dom", view: "skrzynka" },
  ...CALENDAR_TASKS.map(({ dateLabel, ...task }) => ({ ...task, date: dateLabel, view: taskViewForCalendarDate(task.calendarDate) })),
];

const DEFAULT_HABITS: WorkspaceHabit[] = [
  { id: 1, name: "Medytacja rano", streak: 5, done: true, completedDates: [toCalendarDateKey(new Date())] },
  { id: 2, name: "8 szklanek wody", streak: 2, done: false, completedDates: [] },
  { id: 3, name: "30 min czytania", streak: 12, done: false, completedDates: [] },
  { id: 4, name: "Spacer 20 min", streak: 0, done: false, completedDates: [] },
];

const DEFAULT_LISTS: WorkspaceList[] = [
  { id: "praca", label: "Praca", color: "#4772FA" },
  { id: "dom", label: "Dom", color: "#D4AA68" },
  { id: "hobby", label: "Hobby", color: "#A0A0A0" },
  { id: "zdrowie", label: "Zdrowie", color: "#70B89F" },
];

const DEFAULT_TAGS: WorkspaceTag[] = [
  { id: "praca", label: "praca", color: "#4772FA" },
  { id: "trening", label: "trening", color: "#70B89F" },
  { id: "dom", label: "dom", color: "#D4AA68" },
  { id: "finanse", label: "finanse", color: "#A0A0A0" },
  { id: "zdrowie", label: "zdrowie", color: "#70B89F" },
  { id: "hobby", label: "hobby", color: "#9B8CE8" },
];

function createDefaultWorkspace(): TaskWorkspace {
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
    && typeof value.view === "string"
    && (value.calendarDate === undefined || typeof value.calendarDate === "string")
    && (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")))
    && (value.schedule === undefined || isTaskSchedule(value.schedule))
    && (value.source === undefined || isCommitmentTaskSource(value.source));
}

function isClockTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isTaskSchedule(value: unknown): value is TaskSchedule {
  if (!isRecord(value)) return false;
  if (typeof value.allDay !== "boolean" || typeof value.startTime !== "string") return false;
  const validTimeRange = value.allDay
    ? value.startTime === "" && value.endTime === undefined
    : isClockTime(value.startTime)
      && (value.endTime === undefined
        || (typeof value.endTime === "string" && isClockTime(value.endTime) && value.endTime > value.startTime));
  return validTimeRange
    && (value.reminderMinutes === undefined
      || (typeof value.reminderMinutes === "number"
        && Number.isInteger(value.reminderMinutes)
        && value.reminderMinutes >= 0))
    && (value.recurrence === undefined || ["daily", "weekly", "monthly", "yearly"].includes(String(value.recurrence)))
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
      || (Array.isArray(value.completedDates) && value.completedDates.every((date) => typeof date === "string")));
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
      tasks: workspace.tasks.map((task) => isCalendarTask(task) && task.view === "kalendarz"
        ? { ...task, view: taskViewForCalendarDate(task.calendarDate) }
        : task),
      habits: workspace.habits.map((habit) => {
        const completedDates = habit.completedDates ?? (habit.done ? [todayKey] : []);
        return { ...habit, completedDates, done: completedDates.includes(todayKey) };
      }),
    };
}

function withProjectedCommitments(workspace: TaskWorkspace): TaskWorkspace {
  return {
    ...workspace,
    tasks: [
      ...stripProjectedCommitments(workspace.tasks),
      ...projectCommitments(),
    ],
  };
}

export function loadTaskWorkspaceResult(): LocalLoadResult<TaskWorkspace> {
  const result = readLocalWorkspace({
    key: TASK_STORAGE_KEY,
    fallback: createDefaultWorkspace,
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
  const sourceSaved = propagateCommitmentEdits(workspace.tasks);
  const next: TaskWorkspace = {
    ...workspace,
    version: WORKSPACE_VERSION,
    updatedAt: new Date().toISOString(),
    tasks: stripProjectedCommitments(workspace.tasks),
  };
  return writeLocalWorkspace(TASK_STORAGE_KEY, next) && sourceSaved;
}

export function isHabitDoneOnDate(habit: WorkspaceHabit, dateKey: string): boolean {
  return habit.completedDates ? habit.completedDates.includes(dateKey) : habit.done;
}

export function toggleHabitOnDate(habit: WorkspaceHabit, dateKey: string): WorkspaceHabit {
  const nextDone = !isHabitDoneOnDate(habit, dateKey);
  const completedDates = new Set(habit.completedDates ?? []);
  if (nextDone) completedDates.add(dateKey);
  else completedDates.delete(dateKey);
  return { ...habit, done: nextDone, completedDates: [...completedDates].sort() };
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
