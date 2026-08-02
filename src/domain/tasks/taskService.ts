import {
  TASK_STORAGE_KEY,
  loadTaskWorkspace,
  saveTaskWorkspace,
  setHabitCompletionOnDate,
  setTaskDoneState,
  taskViewForCalendarDate,
  type TaskWorkspace,
  type WorkspaceHabit,
  type WorkspaceTask,
} from "../../app/data/taskWorkspace";
import { setTaskOccurrenceCompletion } from "../../app/data/taskSchedule";
import { isHabitPausedOnDate } from "../../app/data/taskWorkspace";
import { domainFailure } from "../shared";
import { commitDomainMutation } from "../shared/mutation";
import type { DomainMutationResult } from "../shared/result";
import { createWorkspaceUndo } from "../shared/workspaceUndo";
import {
  createTaskSchema,
  habitCompletionSchema,
  rescheduleTaskSchema,
  taskCompletionSchema,
  taskPrioritySchema,
} from "./taskSchemas";

function replaceTask(workspace: TaskWorkspace, value: WorkspaceTask | null, taskId: number): TaskWorkspace {
  return {
    ...workspace,
    tasks: value === null
      ? workspace.tasks.filter((task) => task.id !== taskId)
      : workspace.tasks.map((task) => task.id === taskId ? value : task),
  };
}

function replaceHabit(workspace: TaskWorkspace, value: WorkspaceHabit | null, habitId: number): TaskWorkspace {
  return {
    ...workspace,
    habits: value === null
      ? workspace.habits.filter((habit) => habit.id !== habitId)
      : workspace.habits.map((habit) => habit.id === habitId ? value : habit),
  };
}

function taskUndo(before: WorkspaceTask, after: WorkspaceTask, message: string) {
  return createWorkspaceUndo({
    storageKey: TASK_STORAGE_KEY,
    read: loadTaskWorkspace,
    save: saveTaskWorkspace,
    select: (workspace) => workspace.tasks.find((task) => task.id === after.id) ?? null,
    apply: (workspace, value) => replaceTask(workspace, value, after.id),
    expected: after,
    restore: before,
    message,
  });
}

function habitUndo(before: WorkspaceHabit, after: WorkspaceHabit, message: string) {
  return createWorkspaceUndo({
    storageKey: TASK_STORAGE_KEY,
    read: loadTaskWorkspace,
    save: saveTaskWorkspace,
    select: (workspace) => workspace.habits.find((habit) => habit.id === after.id) ?? null,
    apply: (workspace, value) => replaceHabit(workspace, value, after.id),
    expected: after,
    restore: before,
    message,
  });
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw";
}

function nextTaskId(workspace: TaskWorkspace) {
  const used = new Set(workspace.tasks.map((task) => task.id));
  let id = Date.now();
  while (used.has(id)) id += 1;
  return id;
}

export async function createTask(input: unknown): Promise<DomainMutationResult<WorkspaceTask>> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowe dane zadania.");
  const workspace = loadTaskWorkspace();
  const id = nextTaskId(workspace);
  const date = parsed.data.date;
  const task: WorkspaceTask = {
    id,
    text: parsed.data.title,
    done: false,
    view: date ? taskViewForCalendarDate(date) : "skrzynka",
    calendarDate: date,
    date,
    time: parsed.data.time,
    priority: parsed.data.priority,
    list: parsed.data.listId,
    tags: parsed.data.tagIds,
    notes: parsed.data.notes,
    schedule: date ? {
      allDay: !parsed.data.time,
      startTime: parsed.data.time ?? "00:00",
      timezone: parsed.data.timezone ?? localTimezone(),
    } : undefined,
  };
  const next = { ...workspace, tasks: [...workspace.tasks, task] };
  const archived = { ...task, deleted: true };
  const compensation = createWorkspaceUndo({
    storageKey: TASK_STORAGE_KEY,
    read: loadTaskWorkspace,
    save: saveTaskWorkspace,
    select: (current) => current.tasks.find((candidate) => candidate.id === id) ?? null,
    apply: (current, value) => replaceTask(current, value, id),
    expected: task,
    restore: archived,
    message: "Cofnięto utworzenie zadania; rekord przeniesiono do kosza.",
  });
  return commitDomainMutation({
    entityId: String(id),
    storageKey: TASK_STORAGE_KEY,
    event: { type: "task.created", domain: "tasks", entityId: String(id), payload: { title: task.text, dueDate: date ?? null } },
    save: () => saveTaskWorkspace(next),
    read: loadTaskWorkspace,
    verify: (current) => current.tasks.some((candidate) => candidate.id === id && candidate.text === task.text),
    selectSnapshot: (current) => current.tasks.find((candidate) => candidate.id === id) ?? task,
    message: "Utworzono zadanie.",
    compensation,
  });
}

async function setTaskCompleted(input: unknown, completed: boolean): Promise<DomainMutationResult<WorkspaceTask>> {
  const parsed = taskCompletionSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy identyfikator zadania.");
  const workspace = loadTaskWorkspace();
  const before = workspace.tasks.find((task) => task.id === parsed.data.taskId);
  if (!before || before.deleted) return domainFailure("NOT_FOUND", "Zadanie nie istnieje.");

  const after = parsed.data.occurrenceDate
    ? setTaskOccurrenceCompletion(before, parsed.data.occurrenceDate, completed)
    : setTaskDoneState(before, completed);
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return domainFailure("CONFLICT", completed ? "Zadanie jest już wykonane." : "Zadanie jest już niewykonane.");
  }
  const next = replaceTask(workspace, after, before.id);
  const type = completed ? "task.completed" as const : "task.uncompleted" as const;
  return commitDomainMutation({
    entityId: String(before.id),
    storageKey: TASK_STORAGE_KEY,
    event: {
      type,
      domain: "tasks",
      entityId: String(before.id),
      payload: parsed.data.occurrenceDate
        ? { completed, occurrenceDate: parsed.data.occurrenceDate }
        : { completed },
    },
    save: () => saveTaskWorkspace(next),
    read: loadTaskWorkspace,
    verify: (current) => JSON.stringify(current.tasks.find((task) => task.id === before.id)) === JSON.stringify(after),
    selectSnapshot: (current) => current.tasks.find((task) => task.id === before.id) ?? after,
    message: completed ? "Oznaczono zadanie jako wykonane." : "Cofnięto wykonanie zadania.",
    compensation: taskUndo(before, after, completed ? "Cofnięto wykonanie zadania." : "Przywrócono wykonanie zadania."),
  });
}

export const completeTask = (input: unknown) => setTaskCompleted(input, true);
export const uncompleteTask = (input: unknown) => setTaskCompleted(input, false);

export async function rescheduleTask(input: unknown): Promise<DomainMutationResult<WorkspaceTask>> {
  const parsed = rescheduleTaskSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy termin.");
  const workspace = loadTaskWorkspace();
  const before = workspace.tasks.find((task) => task.id === parsed.data.taskId);
  if (!before || before.deleted) return domainFailure("NOT_FOUND", "Zadanie nie istnieje.");
  const previousDate = before.calendarDate ?? null;
  const after: WorkspaceTask = {
    ...before,
    calendarDate: parsed.data.date,
    date: parsed.data.date,
    view: taskViewForCalendarDate(parsed.data.date),
    time: parsed.data.time,
    endTime: undefined,
    schedule: {
      allDay: !parsed.data.time,
      startTime: parsed.data.time ?? "00:00",
      timezone: parsed.data.timezone ?? before.schedule?.timezone ?? localTimezone(),
    },
  };
  const next = replaceTask(workspace, after, before.id);
  return commitDomainMutation({
    entityId: String(before.id), storageKey: TASK_STORAGE_KEY,
    event: { type: "task.rescheduled", domain: "tasks", entityId: String(before.id), payload: { previousDate, nextDate: parsed.data.date } },
    save: () => saveTaskWorkspace(next), read: loadTaskWorkspace,
    verify: (current) => current.tasks.some((task) => task.id === before.id && task.calendarDate === parsed.data.date && task.time === parsed.data.time),
    selectSnapshot: (current) => current.tasks.find((task) => task.id === before.id) ?? after,
    message: "Zmieniono termin zadania.",
    compensation: taskUndo(before, after, "Przywrócono poprzedni termin zadania."),
  });
}

export async function setTaskPriority(input: unknown): Promise<DomainMutationResult<WorkspaceTask>> {
  const parsed = taskPrioritySchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy priorytet.");
  const workspace = loadTaskWorkspace();
  const before = workspace.tasks.find((task) => task.id === parsed.data.taskId);
  if (!before || before.deleted) return domainFailure("NOT_FOUND", "Zadanie nie istnieje.");
  if (before.priority === parsed.data.priority) return domainFailure("CONFLICT", "Zadanie ma już ten priorytet.");
  const after = { ...before, priority: parsed.data.priority };
  const next = replaceTask(workspace, after, before.id);
  return commitDomainMutation({
    entityId: String(before.id), storageKey: TASK_STORAGE_KEY,
    event: { type: "task.priority_changed", domain: "tasks", entityId: String(before.id), payload: { previousPriority: before.priority ?? null, nextPriority: after.priority } },
    save: () => saveTaskWorkspace(next), read: loadTaskWorkspace,
    verify: (current) => current.tasks.some((task) => task.id === before.id && task.priority === after.priority),
    selectSnapshot: (current) => current.tasks.find((task) => task.id === before.id) ?? after,
    message: "Zmieniono priorytet zadania.", compensation: taskUndo(before, after, "Przywrócono poprzedni priorytet zadania."),
  });
}

async function setHabitCompleted(input: unknown, completed: boolean): Promise<DomainMutationResult<WorkspaceHabit>> {
  const parsed = habitCompletionSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowe dane nawyku.");
  const workspace = loadTaskWorkspace();
  const before = workspace.habits.find((habit) => habit.id === parsed.data.habitId);
  if (!before) return domainFailure("NOT_FOUND", "Nawyk nie istnieje.");
  const today = new Date().toISOString().slice(0, 10);
  if (parsed.data.date > today) return domainFailure("VALIDATION", "Nie można oznaczyć nawyku w przyszłości.");
  if (isHabitPausedOnDate(before, parsed.data.date)) return domainFailure("CONFLICT", "Nawyk jest tego dnia wstrzymany.");
  const after = setHabitCompletionOnDate(before, parsed.data.date, completed);
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return domainFailure("CONFLICT", completed ? "Nawyk jest już wykonany." : "Nawyk jest już niewykonany.");
  }
  const next = replaceHabit(workspace, after, before.id);
  const type = completed ? "habit.completed" as const : "habit.uncompleted" as const;
  return commitDomainMutation({
    entityId: String(before.id), storageKey: TASK_STORAGE_KEY,
    event: { type, domain: "habits", entityId: String(before.id), payload: { date: parsed.data.date, completed } },
    save: () => saveTaskWorkspace(next), read: loadTaskWorkspace,
    verify: (current) => JSON.stringify(current.habits.find((habit) => habit.id === before.id)) === JSON.stringify(after),
    selectSnapshot: (current) => current.habits.find((habit) => habit.id === before.id) ?? after,
    message: completed ? "Oznaczono nawyk jako wykonany." : "Cofnięto wykonanie nawyku.",
    compensation: habitUndo(before, after, completed ? "Cofnięto wykonanie nawyku." : "Przywrócono wykonanie nawyku."),
  });
}

export const completeHabit = (input: unknown) => setHabitCompleted(input, true);
export const uncompleteHabit = (input: unknown) => setHabitCompleted(input, false);
