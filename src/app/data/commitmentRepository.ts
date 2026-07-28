import {
  loadTravelWorkspace,
  saveTravelWorkspace,
  type TravelTask,
  type TravelTrip,
  type TravelWorkspace,
} from "./travelWorkspace";
import {
  loadWorkWorkspace,
  saveWorkWorkspace,
  type WorkProject,
  type WorkTask,
  type WorkTaskPriority,
  type WorkWorkspace,
} from "./workWorkspace";
import type { TaskPriority, WorkspaceTask } from "./taskWorkspace";

export type CommitmentSourceKind = "work" | "travel";

export type CommitmentTaskSource = {
  kind: CommitmentSourceKind;
  entity: string;
  context: string;
  href: string;
};

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
    return kind === "work"
      ? parsed.pathname === "/praca"
      : /^\/podroze\/[^/]+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isCommitmentTaskSource(value: unknown): value is CommitmentTaskSource {
  return isRecord(value)
    && (value.kind === "work" || value.kind === "travel")
    && typeof value.entity === "string"
    && isValidEntity(value.entity)
    && typeof value.context === "string"
    && value.context.trim().length > 0
    && typeof value.href === "string"
    && isInternalSourceHref(value.kind, value.href);
}

function encodeEntity(parentId: string, taskId: string): string {
  return `${encodeURIComponent(parentId)}/${encodeURIComponent(taskId)}`;
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
  if (!isIsoCalendarDate(dueDate)) return "skrzynka";
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
  return "skrzynka";
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
    ...(priority ? { priority } : {}),
    list: "praca",
    tags: ["praca"],
    view: "skrzynka",
    ...calendarFields(task.dueDate, referenceDate),
    source: {
      kind: "work",
      entity,
      context: workContext(workspace, project),
      href: `/praca?firma=${encodeURIComponent(project.companyId)}&projekt=${encodeURIComponent(project.id)}`,
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
    view: "skrzynka",
    ...calendarFields(task.dueDate, referenceDate),
    source: {
      kind: "travel",
      entity,
      context: travelContext(trip),
      href: `/podroze/${encodeURIComponent(trip.id)}?sekcja=tasks`,
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
    return project ? [projectWorkTask(workspaces.work, project, task, referenceDate)] : [];
  });

  const travelTasks = workspaces.travel.trips
    .filter((trip) => trip.status !== "completed" && trip.archivedAt === null)
    .flatMap((trip) => trip.tasks.map((task) => projectTravelTask(trip, task, referenceDate)));

  return [...workTasks, ...travelTasks];
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
    if (
      task.title === title
      && task.completed === completed
      && task.priority === priority
      && task.dueDate === dueDate
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
  return tasks.filter((task) => task.source === undefined);
}
