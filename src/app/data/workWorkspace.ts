const STORAGE_KEY = "rootine.work-workspace.v1";
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
      color: "#4772FA",
    },
    {
      id: "company-atlas",
      name: "Atlas",
      description: "Stała współpraca",
      color: "#70B89F",
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

function cloneDefaultWorkspace(): WorkWorkspace {
  return {
    ...DEFAULT_WORKSPACE,
    companies: DEFAULT_WORKSPACE.companies.map((company) => ({ ...company })),
    projects: DEFAULT_WORKSPACE.projects.map((project) => ({ ...project })),
    tasks: DEFAULT_WORKSPACE.tasks.map((task) => ({ ...task })),
  };
}

export function createWorkId(prefix: "company" | "project" | "task"): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
}

export function loadWorkWorkspace(): WorkWorkspace {
  const fallback = cloneDefaultWorkspace();
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<WorkWorkspace>;
    if (
      parsed.version !== WORKSPACE_VERSION
      || !Array.isArray(parsed.companies)
      || !Array.isArray(parsed.projects)
      || !Array.isArray(parsed.tasks)
      || !parsed.companies.every(isCompany)
      || !parsed.projects.every(isProject)
      || !parsed.tasks.every(isTask)
    ) return fallback;
    return parsed as WorkWorkspace;
  } catch {
    return fallback;
  }
}

export function saveWorkWorkspace(workspace: WorkWorkspace): boolean {
  if (typeof window === "undefined") return false;
  const next: WorkWorkspace = {
    ...workspace,
    version: WORKSPACE_VERSION,
    updatedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
