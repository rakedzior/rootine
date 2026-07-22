import { CALENDAR_TASKS } from "./calendarTasks";
import { hydrateTaskCompletion } from "./taskCompletion";

const STORAGE_KEY = "rootine.task-workspace.v1";
const WORKSPACE_VERSION = 1 as const;

export type TaskPriority = "high" | "medium" | "low";
export type TaskSubtask = { id: number; text: string; done: boolean };
export type TaskComment = { id: number; author: string; text: string; time: string };

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
};

export type WorkspaceHabit = { id: number; name: string; streak: number; done: boolean };
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

export function toCalendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function taskViewForCalendarDate(calendarDate: string, referenceDate = new Date()): string {
  const target = new Date(`${calendarDate}T12:00:00`);
  if (Number.isNaN(target.getTime())) return "skrzynka";
  const reference = new Date(referenceDate);
  reference.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const dayDifference = Math.round((target.getTime() - reference.getTime()) / 86_400_000);
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
  { id: 1, name: "Medytacja rano", streak: 5, done: true },
  { id: 2, name: "8 szklanek wody", streak: 2, done: false },
  { id: 3, name: "30 min czytania", streak: 12, done: false },
  { id: 4, name: "Spacer 20 min", streak: 0, done: false },
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
    && (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")));
}

function isWorkspaceHabit(value: unknown): value is WorkspaceHabit {
  return isRecord(value)
    && typeof value.id === "number"
    && typeof value.name === "string"
    && typeof value.streak === "number"
    && typeof value.done === "boolean";
}

function isWorkspaceList(value: unknown): value is WorkspaceList {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.label === "string"
    && typeof value.color === "string";
}

export function loadTaskWorkspace(): TaskWorkspace {
  const fallback = createDefaultWorkspace();
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<TaskWorkspace>;
    if (
      parsed.version !== WORKSPACE_VERSION
      || !Array.isArray(parsed.tasks)
      || !Array.isArray(parsed.habits)
      || !Array.isArray(parsed.lists)
      || !Array.isArray(parsed.tags)
      || !parsed.tasks.every(isWorkspaceTask)
      || !parsed.habits.every(isWorkspaceHabit)
      || !parsed.lists.every(isWorkspaceList)
      || !parsed.tags.every(isWorkspaceList)
    ) return fallback;
    const workspace = parsed as TaskWorkspace;
    return {
      ...workspace,
      tasks: workspace.tasks.map((task) => isCalendarTask(task) && task.view === "kalendarz"
        ? { ...task, view: taskViewForCalendarDate(task.calendarDate) }
        : task),
    };
  } catch {
    return fallback;
  }
}

export function saveTaskWorkspace(workspace: TaskWorkspace): boolean {
  if (typeof window === "undefined") return false;
  const next: TaskWorkspace = { ...workspace, version: WORKSPACE_VERSION, updatedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("rootine:task-workspace", { detail: { updatedAt: next.updatedAt } }));
    return true;
  } catch {
    return false;
  }
}

export function isCalendarTask(task: WorkspaceTask): task is WorkspaceTask & { calendarDate: string } {
  return typeof task.calendarDate === "string" && task.calendarDate.length > 0;
}

export function replaceCalendarTasks(workspace: TaskWorkspace, calendarTasks: WorkspaceTask[]): TaskWorkspace {
  return {
    ...workspace,
    tasks: [...workspace.tasks.filter((task) => !isCalendarTask(task) || task.deleted), ...calendarTasks],
  };
}
