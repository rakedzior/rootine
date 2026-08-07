import { Check, Circle, CircleAlert, CircleDot, Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import { formatShortDate, pluralForm } from "../formatters";
import type {
  WorkProjectStatus,
  WorkTask,
  WorkTaskPriority,
  WorkTaskStatus,
} from "../data/workWorkspace";

export const COMPANY_COLORS = ["#7FA6C9", "#79A8A4", "#8793A1"];

const LEGACY_COMPANY_COLOR_MAP: Record<string, string> = {
  "#B9A171": "#79A8A4",
  "#7D7FA8": "#8793A1",
  "#BC8EA5": "#8793A1",
};

export function normalizeCompanyColor(color: string): string {
  const normalized = color.toUpperCase();
  if (COMPANY_COLORS.includes(normalized)) return normalized;
  return LEGACY_COMPANY_COLOR_MAP[normalized] ?? COMPANY_COLORS[0];
}

export const PROJECT_STATUS_LABELS: Record<WorkProjectStatus, string> = {
  active: "Aktywny",
  paused: "Wstrzymany",
  completed: "Zakończony",
};

export const PROJECT_STATUS_ORDER: WorkProjectStatus[] = ["active", "paused", "completed"];

export const TASK_STATUS_LABELS: Record<WorkTaskStatus, string> = {
  todo: "Do zrobienia",
  in_progress: "W trakcie",
  blocked: "Zablokowane",
  waiting: "Oczekuje",
  completed: "Ukończone",
};

export const TASK_STATUS_ORDER: WorkTaskStatus[] = ["todo", "in_progress", "blocked", "waiting", "completed"];

export const PRIORITY_LABELS: Record<WorkTaskPriority, string> = {
  none: "Bez priorytetu",
  low: "Niski",
  medium: "Średni",
  high: "Wysoki",
};

export const PRIORITY_ORDER: WorkTaskPriority[] = ["none", "low", "medium", "high"];

export type WorkView = "today" | "week" | "active" | "untimed" | "unassigned" | "archive" | "company" | "project";
export type TaskStatusFilter = WorkTaskStatus | "all";
export type PriorityFilter = WorkTaskPriority | "all";
export type CompanyProjectStatusFilter = WorkProjectStatus | "all";
export type CompanyProjectSort = "name" | "progress" | "endDate";
export type ActiveTaskSort = "dueDate" | "priority" | "company" | "project" | "updated";

export type EditorState =
  | { kind: "company"; mode: "add" | "edit"; id?: string }
  | { kind: "project"; mode: "add" | "edit"; id?: string }
  | { kind: "task"; mode: "add" | "edit"; id?: string; parentId?: string | null };

export type DeleteState = {
  kind: "company" | "project" | "task";
  id: string;
  name: string;
};

export type CompletionUndo = {
  label: string;
  previous: Array<{ id: string; completed: boolean; status?: WorkTaskStatus }>;
};

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type EditorDraft = {
  name: string;
  description: string;
  note: string;
  color: string;
  companyId: string;
  projectId: string;
  parentId: string;
  projectStatus: WorkProjectStatus;
  taskStatus: WorkTaskStatus;
  priority: WorkTaskPriority;
  startDate: string;
  endDate: string;
};

export const EMPTY_DRAFT: EditorDraft = {
  name: "",
  description: "",
  note: "",
  color: COMPANY_COLORS[0],
  companyId: "",
  projectId: "",
  parentId: "",
  projectStatus: "active",
  taskStatus: "todo",
  priority: "none",
  startDate: "",
  endDate: "",
};

export function formatProjectCount(count: number): string {
  return `${count} ${countWord(count, "projekt", "projekty", "projektów")}`;
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromKey(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function addDays(value: string, amount: number): string {
  const date = dateFromKey(value) ?? new Date();
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

export function formatDate(value: string): string {
  if (!value) return "Bez terminu";
  const formatted = formatShortDate(value);
  return formatted === "—" ? value : formatted;
}

export function formatLongDate(value: string): string {
  const date = dateFromKey(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

export function formatDateRange(startDate = "", endDate = ""): string {
  if (startDate && endDate) return `${formatDate(startDate)} → ${formatDate(endDate)}`;
  if (startDate) return `od ${formatDate(startDate)}`;
  if (endDate) return `do ${formatDate(endDate)}`;
  return "Bez terminu";
}

export function taskCountLabel(count: number): string {
  return countWord(count, "zadanie", "zadania", "zadań");
}

export function subtaskCountLabel(count: number): string {
  return countWord(count, "podzadanie", "podzadania", "podzadań");
}

export function countWord(count: number, one: string, few: string, many: string): string {
  return pluralForm(count, one, few, many);
}

export function completedTaskLabel(count: number): string {
  return pluralForm(count, "ukończone", "ukończone", "ukończonych");
}

export function openTaskLabel(count: number): string {
  return countWord(count, "otwarte", "otwarte", "otwartych");
}

export function formatTaskCount(count: number): string {
  return `${count} ${taskCountLabel(count)}`;
}

export function formatOpenTaskCount(count: number): string {
  return `${count} ${openTaskLabel(count)}`;
}

export function formatProjectProgress(count: { total: number; completed: number; open: number }): string {
  return `${count.completed} ${completedTaskLabel(count.completed)} z ${count.total} · ${count.open} ${openTaskLabel(count.open)}`;
}

export function formatSubtaskProgress(completed: number, total: number): string {
  return `${completed}/${total}`;
}

export function collectTaskDescendantRows(
  tasks: WorkTask[],
  parentId: string,
  depth = 1,
  visited = new Set<string>(),
): Array<{ task: WorkTask; depth: number }> {
  return tasks
    .filter((task) => task.parentId === parentId && !visited.has(task.id))
    .flatMap((task) => {
      visited.add(task.id);
      return [{ task, depth }, ...collectTaskDescendantRows(tasks, task.id, depth + 1, visited)];
    });
}

export function getTaskStatus(task: WorkTask): WorkTaskStatus {
  if (task.completed) return "completed";
  return task.status && task.status !== "completed" ? task.status : "todo";
}

export function isTaskOpen(task: WorkTask): boolean {
  return getTaskStatus(task) !== "completed";
}

export function taskAnchorDate(task: WorkTask): string {
  return task.dueDate;
}

export function relativeDateLabel(value: string, today = localDateKey()): string {
  if (!value) return "Bez terminu";
  const valueDate = dateFromKey(value);
  const todayDate = dateFromKey(today);
  if (!valueDate || !todayDate) return formatDate(value);
  if (value === today) return "Dziś";
  if (value === addDays(today, 1)) return "Jutro";
  if (value < today) {
    const days = Math.max(1, Math.round((todayDate.getTime() - valueDate.getTime()) / 86_400_000));
    return `${days} ${countWord(days, "dzień", "dni", "dni")} po terminie`;
  }
  const days = Math.max(1, Math.round((valueDate.getTime() - todayDate.getTime()) / 86_400_000));
  return `za ${days} ${countWord(days, "dzień", "dni", "dni")}`;
}

export function collectTaskBranch(tasks: WorkTask[], taskId: string): Set<string> {
  const branch = new Set([taskId]);
  let changed = true;
  while (changed) {
    changed = false;
    tasks.forEach((task) => {
      if (task.parentId && branch.has(task.parentId) && !branch.has(task.id)) {
        branch.add(task.id);
        changed = true;
      }
    });
  }
  return branch;
}

export function taskDepth(task: WorkTask, tasks: WorkTask[]): number {
  let depth = 0;
  let parentId = task.parentId;
  const visited = new Set<string>();
  while (parentId && depth < 32 && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = tasks.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    depth += 1;
    parentId = parent.parentId;
  }
  return depth;
}

export function getInitialWorkLocation(): { view: WorkView; companyId: string; projectId: string; search: string } {
  if (typeof window === "undefined") return { view: "today", companyId: "", projectId: "", search: "" };
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("widok");
  const hasProject = Boolean(params.get("projekt"));
  const hasCompany = Boolean(params.get("firma"));
  const view: WorkView = hasProject
    ? "project"
    : hasCompany
      ? "company"
      : requested === "bezterminu"
        ? "untimed"
        : requested === "week" || requested === "active" || requested === "unassigned" || requested === "archive"
          ? requested
          : "today";
  return {
    view,
    companyId: params.get("firma") ?? "",
    projectId: params.get("projekt") ?? "",
    search: params.get("q") ?? "",
  };
}

export function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pl-PL");
}

export function projectStatusTone(status: WorkProjectStatus): "primary" | "warning" | "success" {
  if (status === "paused") return "warning";
  if (status === "completed") return "success";
  return "primary";
}

export function taskStatusTone(status: WorkTaskStatus): string {
  return `work-task-status--${status}`;
}

export function taskStatusIcon(status: WorkTaskStatus): ReactNode {
  if (status === "in_progress") return <CircleDot size={11} aria-hidden="true" />;
  if (status === "blocked") return <CircleAlert size={11} aria-hidden="true" />;
  if (status === "waiting") return <Clock3 size={11} aria-hidden="true" />;
  if (status === "completed") return <Check size={11} aria-hidden="true" />;
  return <Circle size={11} aria-hidden="true" />;
}
