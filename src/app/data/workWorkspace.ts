import { readLocalWorkspace, writeLocalWorkspace, type LocalLoadResult } from "./localRepository";
import { normalizeTaxonomyColor, TAXONOMY_COLORS } from "./taxonomyPalette";

export const WORK_STORAGE_KEY = "rootine.work-workspace.v1";
const WORKSPACE_VERSION = 3 as const;

export type WorkProjectStatus = "active" | "paused" | "completed";
export type WorkTaskPriority = "none" | "low" | "medium" | "high";
export type WorkTaskStatus = "todo" | "in_progress" | "blocked" | "waiting" | "completed";

export type WorkCompany = {
  id: string;
  name: string;
  description: string;
  color: string;
  archived?: boolean;
};

export type WorkProject = {
  id: string;
  companyId: string;
  name: string;
  description: string;
  status: WorkProjectStatus;
  startDate?: string;
  endDate?: string;
  note?: string;
};

export type WorkLinkedTaskSchedule = {
  allDay: boolean;
  startTime: string;
  endTime?: string;
  reminderMinutes?: number;
  recurrence?: "daily" | "weekly" | "monthly" | "yearly";
  completedDates?: string[];
  completedAtByDate?: Record<string, string>;
  timezone: string;
};

export type WorkLinkedTaskDetails = {
  originTaskId: number;
  view: string;
  time?: string;
  endTime?: string;
  notes?: string;
  tags?: string[];
  list?: string;
  subtasks?: Array<{ id: number; text: string; done: boolean }>;
  comments?: Array<{ id: number; author: string; text: string; time: string }>;
  schedule?: WorkLinkedTaskSchedule;
};

export function withCanonicalWorkTime(
  linkedTask: WorkLinkedTaskDetails | undefined,
  dueTime: string,
): WorkLinkedTaskDetails | undefined {
  if (!linkedTask) return undefined;
  return {
    ...linkedTask,
    time: dueTime || undefined,
    endTime: dueTime && linkedTask.endTime && linkedTask.endTime > dueTime ? linkedTask.endTime : undefined,
    schedule: linkedTask.schedule
      ? {
          ...linkedTask.schedule,
          allDay: !dueTime,
          startTime: dueTime,
          endTime: dueTime && linkedTask.schedule.endTime && linkedTask.schedule.endTime > dueTime
            ? linkedTask.schedule.endTime
            : undefined,
        }
      : undefined,
  };
}

export type WorkTask = {
  id: string;
  companyId?: string;
  projectId: string;
  parentId: string | null;
  title: string;
  completed: boolean;
  status?: WorkTaskStatus;
  priority: WorkTaskPriority;
  startDate?: string;
  dueDate: string;
  /** Optional local wall-clock time for a dated Work task. */
  dueTime?: string;
  note?: string;
  createdAt: string;
  updatedAt?: string;
  linkedTask?: WorkLinkedTaskDetails;
};

export type WorkWorkspace = {
  version: typeof WORKSPACE_VERSION;
  updatedAt: string;
  companies: WorkCompany[];
  projects: WorkProject[];
  tasks: WorkTask[];
};

type LegacyWorkTask = Omit<WorkTask, "dueDate" | "updatedAt"> & {
  dueDate?: string;
  startDate?: string;
  deadline?: string;
  updatedAt?: string;
};

type LegacyWorkWorkspace = Omit<WorkWorkspace, "version" | "tasks"> & {
  version: 1 | 2;
  tasks: LegacyWorkTask[];
};

const DEFAULT_WORKSPACE: WorkWorkspace = {
  version: WORKSPACE_VERSION,
  updatedAt: new Date(0).toISOString(),
  companies: [
    {
      id: "company-studio",
      name: "Studio North",
      description: "Projekty produktowe i komunikacja",
      color: TAXONOMY_COLORS.sky,
    },
    {
      id: "company-atlas",
      name: "Atlas",
      description: "Stała współpraca",
      color: TAXONOMY_COLORS.teal,
    },
  ],
  projects: [
    {
      id: "project-redesign",
      companyId: "company-studio",
      name: "Nowa strona",
      description: "Przygotowanie i wdrożenie nowej strony produktowej.",
      status: "active",
    },
    {
      id: "project-launch",
      companyId: "company-studio",
      name: "Kampania startowa",
      description: "Materiały potrzebne przed publikacją produktu.",
      status: "active",
    },
    {
      id: "project-quarterly",
      companyId: "company-atlas",
      name: "Przegląd kwartalny",
      description: "Podsumowanie wyników i plan kolejnego kwartału.",
      status: "paused",
    },
  ],
  tasks: [
    {
      id: "task-research",
      projectId: "project-redesign",
      parentId: null,
      title: "Zebrać materiały wejściowe",
      completed: true,
      priority: "medium",
      dueDate: "",
      createdAt: "2026-07-20T08:00:00.000Z",
    },
    {
      id: "task-structure",
      projectId: "project-redesign",
      parentId: null,
      title: "Przygotować strukturę strony",
      completed: false,
      priority: "high",
      dueDate: "2026-07-30",
      createdAt: "2026-07-21T08:00:00.000Z",
    },
    {
      id: "task-homepage",
      projectId: "project-redesign",
      parentId: "task-structure",
      title: "Strona główna",
      completed: false,
      priority: "high",
      dueDate: "2026-07-29",
      createdAt: "2026-07-21T09:00:00.000Z",
    },
    {
      id: "task-hero",
      projectId: "project-redesign",
      parentId: "task-homepage",
      title: "Doprecyzować sekcję otwierającą",
      completed: false,
      priority: "medium",
      dueDate: "",
      createdAt: "2026-07-21T10:00:00.000Z",
    },
    {
      id: "task-offer",
      projectId: "project-redesign",
      parentId: "task-structure",
      title: "Opis oferty",
      completed: true,
      priority: "low",
      dueDate: "",
      createdAt: "2026-07-21T11:00:00.000Z",
    },
    {
      id: "task-copy",
      projectId: "project-redesign",
      parentId: null,
      title: "Uzupełnić treści",
      completed: false,
      priority: "medium",
      dueDate: "2026-08-02",
      createdAt: "2026-07-22T08:00:00.000Z",
    },
    {
      id: "task-launch-plan",
      projectId: "project-launch",
      parentId: null,
      title: "Rozpisać plan publikacji",
      completed: false,
      priority: "high",
      dueDate: "2026-08-04",
      createdAt: "2026-07-23T08:00:00.000Z",
    },
    {
      id: "task-quarter-data",
      projectId: "project-quarterly",
      parentId: null,
      title: "Zebrać dane z ostatnich trzech miesięcy",
      completed: false,
      priority: "medium",
      dueDate: "",
      createdAt: "2026-07-24T08:00:00.000Z",
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCompany(value: unknown): value is WorkCompany {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.description === "string"
    && typeof value.color === "string"
    && (value.archived === undefined || typeof value.archived === "boolean");
}

function isProject(value: unknown): value is WorkProject {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.companyId === "string"
    && typeof value.name === "string"
    && typeof value.description === "string"
    && ["active", "paused", "completed"].includes(String(value.status))
    && (value.startDate === undefined || typeof value.startDate === "string")
    && (value.endDate === undefined || typeof value.endDate === "string")
    && (value.note === undefined || typeof value.note === "string");
}

function isClockTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isLinkedTaskSchedule(value: unknown): value is WorkLinkedTaskSchedule {
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
    && (value.recurrence === undefined
      || ["daily", "weekly", "monthly", "yearly"].includes(String(value.recurrence)))
    && (value.completedDates === undefined
      || (Array.isArray(value.completedDates)
        && value.completedDates.every((date) => typeof date === "string")
        && new Set(value.completedDates).size === value.completedDates.length))
    && (value.completedAtByDate === undefined
      || (isRecord(value.completedAtByDate)
        && Object.entries(value.completedAtByDate).every(([date, timestamp]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && isTimestamp(timestamp))))
    && typeof value.timezone === "string"
    && value.timezone.trim().length > 0;
}

function isLinkedTaskDetails(value: unknown): value is WorkLinkedTaskDetails {
  return isRecord(value)
    && typeof value.originTaskId === "number"
    && Number.isSafeInteger(value.originTaskId)
    && typeof value.view === "string"
    && value.view.trim().length > 0
    && (value.time === undefined || typeof value.time === "string")
    && (value.endTime === undefined || typeof value.endTime === "string")
    && (value.notes === undefined || typeof value.notes === "string")
    && (value.tags === undefined
      || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")))
    && (value.list === undefined || typeof value.list === "string")
    && (value.subtasks === undefined
      || (Array.isArray(value.subtasks) && value.subtasks.every((subtask) => isRecord(subtask)
        && typeof subtask.id === "number"
        && typeof subtask.text === "string"
        && typeof subtask.done === "boolean")))
    && (value.comments === undefined
      || (Array.isArray(value.comments) && value.comments.every((comment) => isRecord(comment)
        && typeof comment.id === "number"
        && typeof comment.author === "string"
        && typeof comment.text === "string"
        && typeof comment.time === "string")))
    && (value.schedule === undefined || isLinkedTaskSchedule(value.schedule));
}

function isTask(value: unknown): value is WorkTask {
  return isRecord(value)
    && typeof value.id === "string"
    && (value.companyId === undefined || typeof value.companyId === "string")
    && typeof value.projectId === "string"
    && (value.parentId === null || typeof value.parentId === "string")
    && typeof value.title === "string"
    && typeof value.completed === "boolean"
    && (value.status === undefined || ["todo", "in_progress", "blocked", "waiting", "completed"].includes(String(value.status)))
    && ["none", "low", "medium", "high"].includes(String(value.priority))
    && (value.dueDate === undefined || typeof value.dueDate === "string")
    && (value.dueTime === undefined || (typeof value.dueTime === "string" && (value.dueTime === "" || isClockTime(value.dueTime))))
    && (value.startDate === undefined || typeof value.startDate === "string")
    && (value.deadline === undefined || typeof value.deadline === "string")
    && (value.note === undefined || typeof value.note === "string")
    && typeof value.createdAt === "string"
    && (value.updatedAt === undefined || typeof value.updatedAt === "string")
    && (value.linkedTask === undefined || isLinkedTaskDetails(value.linkedTask));
}

function hasWorkspaceShape(value: unknown): value is Omit<WorkWorkspace, "version"> & { version: number } {
  return isRecord(value)
    && typeof value.version === "number"
    && typeof value.updatedAt === "string"
    && Array.isArray(value.companies)
    && value.companies.every(isCompany)
    && Array.isArray(value.projects)
    && value.projects.every(isProject)
    && Array.isArray(value.tasks)
    && value.tasks.every(isTask);
}

function isWorkspace(value: unknown): value is WorkWorkspace {
  return hasWorkspaceShape(value)
    && value.version === WORKSPACE_VERSION
    && value.tasks.every((task) => typeof task.dueDate === "string");
}

function migrateLegacyWorkspace(value: unknown): WorkWorkspace | null {
  if (!hasWorkspaceShape(value) || (value.version !== 1 && value.version !== 2)) return null;
  const legacy = value as LegacyWorkWorkspace;
  return {
    ...legacy,
    version: WORKSPACE_VERSION,
    companies: legacy.companies.map((company) => ({ ...company, archived: company.archived ?? false })),
    projects: legacy.projects.map((project) => ({ ...project })),
    tasks: legacy.tasks.map((task) => {
      const { startDate, deadline, ...current } = task;
      return {
        ...current,
        dueDate: current.dueDate || deadline || startDate || "",
      };
    }),
  };
}

export function createDefaultWorkWorkspace(): WorkWorkspace {
  return {
    ...DEFAULT_WORKSPACE,
    companies: DEFAULT_WORKSPACE.companies.map((company) => ({ ...company, archived: false })),
    projects: DEFAULT_WORKSPACE.projects.map((project) => ({ ...project })),
    tasks: DEFAULT_WORKSPACE.tasks.map((task) => ({ ...task })),
  };
}

export function createEmptyWorkWorkspace(): WorkWorkspace {
  return {
    version: WORKSPACE_VERSION,
    updatedAt: new Date(0).toISOString(),
    companies: [],
    projects: [],
    tasks: [],
  };
}

export function createWorkId(prefix: "company" | "project" | "task"): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
}

export function setWorkTasksCompletionState(
  workspace: WorkWorkspace,
  taskIds: readonly string[],
  completed: boolean,
): WorkWorkspace {
  const ids = new Set(taskIds);
  return {
    ...workspace,
    tasks: workspace.tasks.map((task) => ids.has(task.id)
      ? { ...task, completed, status: completed ? "completed" : "todo" }
      : task),
  };
}

export function loadWorkWorkspaceResult(): LocalLoadResult<WorkWorkspace> {
  const result = readLocalWorkspace({
    key: WORK_STORAGE_KEY,
    fallback: createEmptyWorkWorkspace,
    validate: isWorkspace,
    migrate: migrateLegacyWorkspace,
  });
  return {
    ...result,
    workspace: {
      ...result.workspace,
      companies: result.workspace.companies.map((company) => ({
        ...company,
        color: normalizeTaxonomyColor(company.color),
      })),
    },
  };
}

export function loadWorkWorkspace(): WorkWorkspace {
  return loadWorkWorkspaceResult().workspace;
}

export function saveWorkWorkspace(workspace: WorkWorkspace): boolean {
  const next: WorkWorkspace = {
    ...workspace,
    version: WORKSPACE_VERSION,
    updatedAt: new Date().toISOString(),
  };
  return writeLocalWorkspace(WORK_STORAGE_KEY, next);
}
