import { readLocalWorkspace, writeLocalWorkspace, type LocalLoadResult } from "./localRepository";

export const WORK_STORAGE_KEY = "rootine.work-workspace.v1";
const WORKSPACE_VERSION = 1 as const;

export type WorkProjectStatus = "active" | "paused" | "completed";
export type WorkTaskPriority = "none" | "low" | "medium" | "high";

export type WorkCompany = {
  id: string;
  name: string;
  description: string;
  color: string;
};

export type WorkProject = {
  id: string;
  companyId: string;
  name: string;
  description: string;
  status: WorkProjectStatus;
};

export type WorkTask = {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  completed: boolean;
  priority: WorkTaskPriority;
  dueDate: string;
  createdAt: string;
};

export type WorkWorkspace = {
  version: typeof WORKSPACE_VERSION;
  updatedAt: string;
  companies: WorkCompany[];
  projects: WorkProject[];
  tasks: WorkTask[];
};

const DEFAULT_WORKSPACE: WorkWorkspace = {
  version: WORKSPACE_VERSION,
  updatedAt: new Date(0).toISOString(),
  companies: [
    {
      id: "company-studio",
      name: "Studio North",
      description: "Projekty produktowe i komunikacja",
      color: "#7FA6C9",
    },
    {
      id: "company-atlas",
      name: "Atlas",
      description: "Stała współpraca",
      color: "#79A8A4",
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
    && typeof value.color === "string";
}

function isProject(value: unknown): value is WorkProject {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.companyId === "string"
    && typeof value.name === "string"
    && typeof value.description === "string"
    && ["active", "paused", "completed"].includes(String(value.status));
}

function isTask(value: unknown): value is WorkTask {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.projectId === "string"
    && (value.parentId === null || typeof value.parentId === "string")
    && typeof value.title === "string"
    && typeof value.completed === "boolean"
    && ["none", "low", "medium", "high"].includes(String(value.priority))
    && typeof value.dueDate === "string"
    && typeof value.createdAt === "string";
}

function isWorkspace(value: unknown): value is WorkWorkspace {
  return isRecord(value)
    && value.version === WORKSPACE_VERSION
    && typeof value.updatedAt === "string"
    && Array.isArray(value.companies)
    && value.companies.every(isCompany)
    && Array.isArray(value.projects)
    && value.projects.every(isProject)
    && Array.isArray(value.tasks)
    && value.tasks.every(isTask);
}

function cloneDefaultWorkspace(): WorkWorkspace {
  return {
    ...DEFAULT_WORKSPACE,
    companies: DEFAULT_WORKSPACE.companies.map((company) => ({ ...company })),
    projects: DEFAULT_WORKSPACE.projects.map((project) => ({ ...project })),
    tasks: DEFAULT_WORKSPACE.tasks.map((task) => ({ ...task })),
  };
}

function normalizeCompanyColor(color: string): string {
  const normalized = color.toUpperCase();
  if (normalized === "#4772FA" || normalized === "#809AF4") return "#7FA6C9";
  if (normalized === "#70B89F") return "#79A8A4";
  if (normalized === "#D4AA68") return "#B9A171";
  if (normalized === "#CF777C") return "#BC8EA5";
  if (normalized === "#A0A0A0") return "#8793A1";
  return color;
}

export function createWorkId(prefix: "company" | "project" | "task"): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
}

export function loadWorkWorkspaceResult(): LocalLoadResult<WorkWorkspace> {
  const result = readLocalWorkspace({
    key: WORK_STORAGE_KEY,
    fallback: cloneDefaultWorkspace,
    validate: isWorkspace,
  });
  return {
    ...result,
    workspace: {
      ...result.workspace,
      companies: result.workspace.companies.map((company) => ({
        ...company,
        color: normalizeCompanyColor(company.color),
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
