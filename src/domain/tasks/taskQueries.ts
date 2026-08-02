import {
  habitDayState,
  loadTaskWorkspace,
  type WorkspaceHabit,
  type WorkspaceTask,
} from "../../app/data/taskWorkspace";
import { normalizeSearchQuery } from "../shared";
import { domainFailure, type DomainCandidate } from "../shared/result";
import { taskSearchSchema } from "./taskSchemas";

export interface TaskSummary {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  time: string | null;
  priority: "high" | "medium" | "low" | null;
  overdue: boolean;
  source: WorkspaceTask["source"];
}

export interface HabitSummary {
  id: string;
  title: string;
  state: ReturnType<typeof habitDayState>;
  streak: number;
  time: string | null;
}

function toTaskSummary(task: WorkspaceTask, today: string): TaskSummary {
  const dueDate = task.calendarDate ?? null;
  return {
    id: String(task.id),
    title: task.text,
    completed: task.done,
    dueDate,
    time: task.schedule?.allDay === false ? task.schedule.startTime : task.time ?? null,
    priority: task.priority ?? null,
    overdue: Boolean(dueDate && dueDate < today && !task.done),
    source: task.source,
  };
}

export function searchTasks(input: unknown, today = new Date().toISOString().slice(0, 10)) {
  const parsed = taskSearchSchema.safeParse(input);
  if (!parsed.success) return { items: [] as TaskSummary[], total: 0, error: parsed.error.issues[0]?.message };
  const normalized = normalizeSearchQuery(parsed.data.query);
  const matches = loadTaskWorkspace().tasks
    .filter((task) => !task.deleted && (parsed.data.includeCompleted || !task.done))
    .filter((task) => normalizeSearchQuery(task.text).includes(normalized))
    .sort((left, right) => {
      const exactLeft = normalizeSearchQuery(left.text) === normalized ? 0 : 1;
      const exactRight = normalizeSearchQuery(right.text) === normalized ? 0 : 1;
      return exactLeft - exactRight
        || (left.calendarDate ?? "9999-99-99").localeCompare(right.calendarDate ?? "9999-99-99")
        || left.text.localeCompare(right.text, "pl");
    });
  return {
    items: matches.slice(0, parsed.data.limit).map((task) => toTaskSummary(task, today)),
    total: matches.length,
  };
}

export function resolveTaskQuery(query: string): { taskId: number } | ReturnType<typeof domainFailure> {
  const result = searchTasks({ query, includeCompleted: true, limit: 8 });
  if (result.items.length === 0) return domainFailure("NOT_FOUND", "Nie znaleziono pasującego zadania.");
  if (result.total !== 1) {
    const candidates: DomainCandidate[] = result.items.map((item) => ({
      id: item.id,
      title: item.title,
      module: "tasks",
      status: item.completed ? "completed" : "open",
      date: item.dueDate ?? undefined,
      context: item.source?.kind,
    }));
    return domainFailure("AMBIGUOUS", "Znaleziono kilka pasujących zadań.", candidates);
  }
  return { taskId: Number(result.items[0].id) };
}

export function getTasksForDate(date: string, today = new Date().toISOString().slice(0, 10)) {
  return loadTaskWorkspace().tasks
    .filter((task) => !task.deleted && task.calendarDate === date)
    .map((task) => toTaskSummary(task, today));
}

export function getPriorityTasks(limit = 5, today = new Date().toISOString().slice(0, 10)) {
  const priorityRank = { high: 0, medium: 1, low: 2 } as const;
  return loadTaskWorkspace().tasks
    .filter((task) => !task.deleted && !task.done)
    .sort((left, right) => (
      priorityRank[left.priority ?? "low"] - priorityRank[right.priority ?? "low"]
      || (left.calendarDate ?? "9999-99-99").localeCompare(right.calendarDate ?? "9999-99-99")
    ))
    .slice(0, Math.max(0, Math.min(20, limit)))
    .map((task) => toTaskSummary(task, today));
}

export function getOverdueTasks(today = new Date().toISOString().slice(0, 10)) {
  return loadTaskWorkspace().tasks
    .filter((task) => !task.deleted && !task.done && Boolean(task.calendarDate && task.calendarDate < today))
    .map((task) => toTaskSummary(task, today));
}

export function getHabitsForDate(date: string): HabitSummary[] {
  return loadTaskWorkspace().habits.map((habit: WorkspaceHabit) => ({
    id: String(habit.id),
    title: habit.name,
    state: habitDayState(habit, date),
    streak: habit.streak,
    time: habit.time ?? null,
  }));
}
