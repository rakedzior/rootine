import {
  loadTravelWorkspace,
  saveTravelWorkspace,
  type TravelTask,
  type TravelTrip,
  type TravelWorkspace,
} from "./travelWorkspace";
import {
  createWorkId,
  loadWorkWorkspace,
  saveWorkWorkspace,
  type WorkLinkedTaskDetails,
  type WorkProject,
  type WorkTask,
  type WorkTaskPriority,
  type WorkWorkspace,
} from "./workWorkspace";
import type { TaskPriority, WorkspaceTask } from "./taskWorkspace";

export type CommitmentSourceKind = "work" | "travel" | "sport" | "goals" | "affairs" | "notes";

export type CommitmentTaskSource = {
  kind: CommitmentSourceKind;
  entity: string;
  context: string;
  href: string;
  originTaskId?: number;
  managed?: "projection" | "native";
};

export type WorkTaskAssignmentResult =
  | { status: "ok"; entity: string }
  | { status: "invalid-project" | "unsupported-source" | "save-failed" };

type ProjectionWorkspaces = {
  work: WorkWorkspace;
  travel: TravelWorkspace;
};

type CommitmentBaseline = {
  kind: CommitmentSourceKind;
  entity: string;
  text: string;
  done: boolean;
  dueDate: string;
  priority?: TaskPriority;
};

const projectionBaselines = new Map<string, CommitmentBaseline>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidEntity(value: string): boolean {
  const parts = value.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  try {
    return parts.every((part) => decodeURIComponent(part).trim().length > 0);
  } catch {
    return false;
  }
}

function isInternalSourceHref(kind: CommitmentSourceKind, value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || /[\r\n]/.test(value)) return false;
  try {
    const parsed = new URL(value, "https://rootine.local");
    if (parsed.origin !== "https://rootine.local") return false;
    if (kind === "work") return parsed.pathname === "/praca";
    if (kind === "travel") return /^\/podroze\/[^/]+$/.test(parsed.pathname);
    if (kind === "sport") return parsed.pathname === "/sport";
    if (kind === "goals") return parsed.pathname === "/cele" || /^\/cele\/[^/]+$/.test(parsed.pathname);
    if (kind === "affairs") return parsed.pathname === "/sprawy";
    return parsed.pathname === "/notatki";
  } catch {
    return false;
  }
}

export function isCommitmentTaskSource(value: unknown): value is CommitmentTaskSource {
  return isRecord(value)
    && ["work", "travel", "sport", "goals", "affairs", "notes"].includes(String(value.kind))
    && typeof value.entity === "string"
    && isValidEntity(value.entity)
    && typeof value.context === "string"
    && value.context.trim().length > 0
    && typeof value.href === "string"
    && isInternalSourceHref(value.kind as CommitmentSourceKind, value.href)
    && (value.originTaskId === undefined
      || (typeof value.originTaskId === "number" && Number.isSafeInteger(value.originTaskId)))
    && (value.managed === undefined || value.managed === "projection" || value.managed === "native");
}

function encodeEntity(parentId: string, taskId: string): string {
  return `${encodeURIComponent(parentId)}/${encodeURIComponent(taskId)}`;
}

function decodeEntity(entity: string): [parentId: string, taskId: string] | null {
  const parts = entity.split("/");
  if (parts.length !== 2) return null;
  try {
    const parentId = decodeURIComponent(parts[0]);
    const taskId = decodeURIComponent(parts[1]);
    return parentId && taskId ? [parentId, taskId] : null;
  } catch {
    return null;
  }
}

/**
 * Source commitments deliberately occupy the negative half of the safe-integer
 * range. Native task IDs are positive timestamps/counters, so the two domains
 * remain distinct without maintaining an additional identity table.
 */
export function commitmentTaskId(kind: CommitmentSourceKind, entity: string): number {
  const value = `${kind}\u0000${entity}`;
  let hash = 14_695_981_039_346_656_037n;
  const prime = 1_099_511_628_211n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  const safePositive = Number(hash % BigInt(Number.MAX_SAFE_INTEGER - 1)) + 1;
  return -safePositive;
}

function isIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function viewForDueDate(dueDate: string, referenceDate: Date): string {
  if (!isIsoCalendarDate(dueDate)) return "bezterminu";
  const [year, month, day] = dueDate.split("-").map(Number);
  const targetDay = Date.UTC(year, month - 1, day);
  const referenceDay = Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const dayDifference = Math.round((targetDay - referenceDay) / 86_400_000);
  if (dayDifference <= 0) return "dzis";
  if (dayDifference === 1) return "jutro";
  if (dayDifference <= 7) return "7dni";
  if (dayDifference <= 30) return "30dni";
  return "wszystkie";
}

function calendarFields(dueDate: string, referenceDate: Date) {
  if (!isIsoCalendarDate(dueDate)) return dueDate ? { date: dueDate } : {};
  return {
    calendarDate: dueDate,
    date: dueDate,
    view: viewForDueDate(dueDate, referenceDate),
  };
}

function workPriority(priority: WorkTaskPriority): TaskPriority | undefined {
  return priority === "none" ? undefined : priority;
}

function workContext(
  workspace: WorkWorkspace,
  project: WorkProject,
): string {
  const company = workspace.companies.find((candidate) => candidate.id === project.companyId);
  return company ? `${company.name} · ${project.name}` : project.name;
}

function linkedTaskProjectionFields(task: WorkTask): Partial<WorkspaceTask> {
  const linked = task.linkedTask;
  if (!linked) return {};
  return {
    time: linked.time,
    endTime: linked.endTime,
    notes: linked.notes,
    subtasks: linked.subtasks?.map((subtask) => ({ ...subtask })),
    comments: linked.comments?.map((comment) => ({ ...comment })),
    schedule: linked.schedule
      ? {
          ...linked.schedule,
          completedDates: linked.schedule.completedDates
            ? [...linked.schedule.completedDates]
            : undefined,
        }
      : undefined,
  };
}

function baselineKey(kind: CommitmentSourceKind, entity: string): string {
  return `${kind}\u0000${entity}`;
}

function captureBaseline(baseline: CommitmentBaseline) {
  projectionBaselines.set(baselineKey(baseline.kind, baseline.entity), baseline);
}

function projectWorkTask(
  workspace: WorkWorkspace,
  project: WorkProject,
  task: WorkTask,
  referenceDate: Date,
): WorkspaceTask {
  const entity = encodeEntity(project.id, task.id);
  const priority = workPriority(task.priority);
  captureBaseline({
    kind: "work",
    entity,
    text: task.title,
    done: task.completed,
    dueDate: task.dueDate,
    priority,
  });
  return {
    id: commitmentTaskId("work", entity),
    text: task.title,
    done: task.completed,
    ...linkedTaskProjectionFields(task),
    ...(priority ? { priority } : {}),
    list: "praca",
    tags: ["praca"],
    view: task.linkedTask?.view ?? "bezterminu",
    ...calendarFields(task.dueDate, referenceDate),
    source: {
      kind: "work",
      entity,
      context: workContext(workspace, project),
      href: `/praca?firma=${encodeURIComponent(project.companyId)}&projekt=${encodeURIComponent(project.id)}`,
      originTaskId: task.linkedTask?.originTaskId,
      managed: "projection",
    },
  };
}

function travelContext(trip: TravelTrip): string {
  return trip.destination ? `${trip.name} · ${trip.destination}` : trip.name;
}

function projectTravelTask(
  trip: TravelTrip,
  task: TravelTask,
  referenceDate: Date,
): WorkspaceTask {
  const entity = encodeEntity(trip.id, task.id);
  captureBaseline({
    kind: "travel",
    entity,
    text: task.title,
    done: task.completed,
    dueDate: task.dueDate,
  });
  return {
    id: commitmentTaskId("travel", entity),
    text: task.title,
    done: task.completed,
    view: "bezterminu",
    ...calendarFields(task.dueDate, referenceDate),
    source: {
      kind: "travel",
      entity,
      context: travelContext(trip),
      href: `/podroze/${encodeURIComponent(trip.id)}?sekcja=tasks`,
      originTaskId: task.linkedTask?.originTaskId,
      managed: "projection",
    },
  };
}

export function projectCommitments(
  workspaces: ProjectionWorkspaces = {
    work: loadWorkWorkspace(),
    travel: loadTravelWorkspace(),
  },
  referenceDate = new Date(),
): WorkspaceTask[] {
  projectionBaselines.clear();
  const activeProjects = new Map(
    workspaces.work.projects
      .filter((project) => project.status === "active")
      .map((project) => [project.id, project]),
  );
  const workTasks = workspaces.work.tasks.flatMap((task) => {
    const project = activeProjects.get(task.projectId);
    return project && task.linkedTask
      ? [projectWorkTask(workspaces.work, project, task, referenceDate)]
      : [];
  });

  const travelTasks = workspaces.travel.trips
    .filter((trip) => trip.status !== "completed" && trip.archivedAt === null)
    .flatMap((trip) => trip.tasks
      .filter((task) => task.linkedTask)
      .map((task) => projectTravelTask(trip, task, referenceDate)));

  return [...workTasks, ...travelTasks];
}

export function linkedWorkTaskOriginIds(workspace = loadWorkWorkspace()): Set<number> {
  return new Set(workspace.tasks.flatMap((task) => (
    task.linkedTask ? [task.linkedTask.originTaskId] : []
  )));
}

function taskPriorityForWork(priority: TaskPriority | undefined): WorkTaskPriority {
  return priority ?? "none";
}

function linkedDetailsFromTask(task: WorkspaceTask): WorkLinkedTaskDetails {
  return {
    originTaskId: task.id,
    view: task.view,
    time: task.time,
    endTime: task.endTime,
    notes: task.notes,
    tags: task.tags ? [...task.tags] : undefined,
    list: task.list,
    subtasks: task.subtasks?.map((subtask) => ({ ...subtask })),
    comments: task.comments?.map((comment) => ({ ...comment })),
    schedule: task.schedule
      ? {
          ...task.schedule,
          completedDates: task.schedule.completedDates
            ? [...task.schedule.completedDates]
            : undefined,
        }
      : undefined,
  };
}

function updateLinkedDetailsFromTask(
  linkedTask: WorkLinkedTaskDetails,
  task: WorkspaceTask,
): WorkLinkedTaskDetails {
  return {
    ...linkedTask,
    view: task.view,
    time: task.time,
    endTime: task.endTime,
    notes: task.notes,
    subtasks: task.subtasks?.map((subtask) => ({ ...subtask })),
    comments: task.comments?.map((comment) => ({ ...comment })),
    schedule: task.schedule
      ? {
          ...task.schedule,
          completedDates: task.schedule.completedDates
            ? [...task.schedule.completedDates]
            : undefined,
        }
      : undefined,
  };
}

export function workProjectIdForTask(task: WorkspaceTask): string | null {
  if (task.source?.kind !== "work") return null;
  return decodeEntity(task.source.entity)?.[0] ?? null;
}

/**
 * Work remains canonical for assigned tasks. linkedTask preserves the global
 * task details that Work does not edit, while originTaskId makes retries and
 * cross-workspace recovery idempotent.
 */
export function assignTaskToWorkProject(
  task: WorkspaceTask,
  projectId: string,
): WorkTaskAssignmentResult {
  if (task.source?.kind === "travel") return { status: "unsupported-source" };
  const workspace = loadWorkWorkspace();
  const project = workspace.projects.find((candidate) => (
    candidate.id === projectId && candidate.status === "active"
  ));
  if (!project) return { status: "invalid-project" };

  const sourceEntity = task.source?.kind === "work" ? decodeEntity(task.source.entity) : null;
  const sourceTaskId = sourceEntity?.[1];
  const existing = sourceTaskId
    ? workspace.tasks.find((candidate) => candidate.id === sourceTaskId)
    : workspace.tasks.find((candidate) => candidate.linkedTask?.originTaskId === task.id);
  if (task.source?.kind === "work" && !existing) return { status: "unsupported-source" };

  const workTaskId = existing?.id ?? createWorkId("task");
  const nextTask: WorkTask = {
    id: workTaskId,
    projectId,
    parentId: existing?.projectId === projectId ? existing.parentId : null,
    title: task.text,
    completed: task.done,
    priority: taskPriorityForWork(task.priority),
    dueDate: task.calendarDate ?? "",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    linkedTask: existing?.linkedTask
      ? updateLinkedDetailsFromTask(existing.linkedTask, task)
      : linkedDetailsFromTask(task),
  };
  const nextWorkspace: WorkWorkspace = {
    ...workspace,
    tasks: existing
      ? workspace.tasks.map((candidate) => candidate.id === existing.id ? nextTask : candidate)
      : [...workspace.tasks, nextTask],
  };

  if (!saveWorkWorkspace(nextWorkspace)) return { status: "save-failed" };
  return { status: "ok", entity: encodeEntity(project.id, workTaskId) };
}

function mapProjectedByKind(tasks: WorkspaceTask[], kind: CommitmentSourceKind) {
  return new Map(
    tasks
      .filter((task) => task.source?.kind === kind)
      .map((task) => [task.source!.entity, task]),
  );
}

function candidateDueDate(candidate: WorkspaceTask, baseline: CommitmentBaseline): string {
  if (candidate.calendarDate !== undefined) return candidate.calendarDate;
  if (candidate.date === baseline.dueDate) return baseline.dueDate;
  return "";
}

function applyWorkEdits(
  workspace: WorkWorkspace,
  projected: Map<string, WorkspaceTask>,
): { workspace: WorkWorkspace; changed: boolean } {
  let changed = false;
  const tasks = workspace.tasks.map((task) => {
    const entity = encodeEntity(task.projectId, task.id);
    const candidate = projected.get(entity);
    const baseline = projectionBaselines.get(baselineKey("work", entity));
    if (!candidate || !baseline) return task;
    const candidatePriority: WorkTaskPriority = candidate.priority ?? "none";
    const baselinePriority: WorkTaskPriority = baseline.priority ?? "none";
    const projectedDueDate = candidateDueDate(candidate, baseline);
    const title = candidate.text !== baseline.text ? candidate.text : task.title;
    const completed = candidate.done !== baseline.done ? candidate.done : task.completed;
    const priority = candidatePriority !== baselinePriority ? candidatePriority : task.priority;
    const dueDate = projectedDueDate !== baseline.dueDate ? projectedDueDate : task.dueDate;
    const linkedTask = task.linkedTask
      ? updateLinkedDetailsFromTask(task.linkedTask, candidate)
      : undefined;
    if (
      task.title === title
      && task.completed === completed
      && task.priority === priority
      && task.dueDate === dueDate
      && JSON.stringify(task.linkedTask) === JSON.stringify(linkedTask)
    ) {
      return task;
    }
    changed = true;
    return {
      ...task,
      title,
      completed,
      priority,
      dueDate,
      ...(linkedTask ? { linkedTask } : {}),
    };
  });
  return {
    workspace: changed ? { ...workspace, tasks } : workspace,
    changed,
  };
}

function applyTravelEdits(
  workspace: TravelWorkspace,
  projected: Map<string, WorkspaceTask>,
): { workspace: TravelWorkspace; changed: boolean } {
  let changed = false;
  const trips = workspace.trips.map((trip) => {
    let tripChanged = false;
    const tasks = trip.tasks.map((task) => {
      const entity = encodeEntity(trip.id, task.id);
      const candidate = projected.get(entity);
      const baseline = projectionBaselines.get(baselineKey("travel", entity));
      if (!candidate || !baseline) return task;
      const projectedDueDate = candidateDueDate(candidate, baseline);
      const title = candidate.text !== baseline.text ? candidate.text : task.title;
      const completed = candidate.done !== baseline.done ? candidate.done : task.completed;
      const dueDate = projectedDueDate !== baseline.dueDate ? projectedDueDate : task.dueDate;
      if (
        task.title === title
        && task.completed === completed
        && task.dueDate === dueDate
      ) {
        return task;
      }
      changed = true;
      tripChanged = true;
      return {
        ...task,
        title,
        completed,
        dueDate,
      };
    });
    return tripChanged ? { ...trip, tasks } : trip;
  });
  return {
    workspace: changed ? { ...workspace, trips } : workspace,
    changed,
  };
}

function refreshBaselines(
  projected: Map<string, WorkspaceTask>,
  kind: CommitmentSourceKind,
) {
  projected.forEach((candidate, entity) => {
    const key = baselineKey(kind, entity);
    const baseline = projectionBaselines.get(key);
    if (!baseline) return;
    projectionBaselines.set(key, {
      ...baseline,
      text: candidate.text,
      done: candidate.done,
      dueDate: candidateDueDate(candidate, baseline),
      ...(kind === "work" ? { priority: candidate.priority } : {}),
    });
  });
}

export function propagateCommitmentEdits(tasks: WorkspaceTask[]): boolean {
  const workProjection = mapProjectedByKind(tasks, "work");
  const travelProjection = mapProjectedByKind(tasks, "travel");
  const workResult = applyWorkEdits(loadWorkWorkspace(), workProjection);
  const travelResult = applyTravelEdits(loadTravelWorkspace(), travelProjection);
  const workSaved = !workResult.changed || saveWorkWorkspace(workResult.workspace);
  const travelSaved = !travelResult.changed || saveTravelWorkspace(travelResult.workspace);
  if (workSaved) refreshBaselines(workProjection, "work");
  if (travelSaved) refreshBaselines(travelProjection, "travel");
  return workSaved && travelSaved;
}

export function stripProjectedCommitments(tasks: WorkspaceTask[]): WorkspaceTask[] {
  return tasks.filter((task) => {
    const source = task.source;
    if (!source) return true;
    if (source.managed === "projection") return false;
    // Migrate projections written by older versions before the managed marker existed.
    if (source.managed === undefined && task.id < 0 && (source.kind === "work" || source.kind === "travel")) return false;
    return true;
  });
}

export function commitmentSourceLabel(kind: CommitmentSourceKind): string {
  return {
    work: "Praca",
    travel: "Podróże",
    sport: "Sport",
    goals: "Cele",
    affairs: "Sprawy",
    notes: "Notatki",
  }[kind];
}
