import { loadWorkWorkspace, type WorkTask } from "../../app/data/workWorkspace";
import { normalizeSearchQuery } from "../shared";
import { domainFailure, type DomainCandidate } from "../shared/result";
import { searchWorkItemsSchema } from "./workSchemas";

export function toWorkItemSummary(task: WorkTask) {
  const workspace = loadWorkWorkspace();
  const project = workspace.projects.find((candidate) => candidate.id === task.projectId);
  const company = workspace.companies.find((candidate) => candidate.id === project?.companyId);
  return {
    id: task.id,
    title: task.title,
    completed: task.completed,
    priority: task.priority,
    dueDate: task.dueDate || null,
    projectId: task.projectId,
    projectName: project?.name ?? "Nieznany projekt",
    companyName: company?.name ?? null,
  };
}

export function searchWorkItems(input: unknown) {
  const parsed = searchWorkItemsSchema.safeParse(input);
  if (!parsed.success) return { items: [], total: 0, error: parsed.error.issues[0]?.message };
  const query = normalizeSearchQuery(parsed.data.query);
  const matches = loadWorkWorkspace().tasks
    .filter((task) => parsed.data.includeCompleted || !task.completed)
    .filter((task) => normalizeSearchQuery(task.title).includes(query));
  return { items: matches.slice(0, parsed.data.limit).map(toWorkItemSummary), total: matches.length };
}

export function resolveWorkItemQuery(query: string): { taskId: string } | ReturnType<typeof domainFailure> {
  const result = searchWorkItems({ query, includeCompleted: true, limit: 8 });
  if (result.items.length === 0) return domainFailure("NOT_FOUND", "Nie znaleziono pasującego zadania służbowego.");
  if (result.total !== 1) {
    const candidates: DomainCandidate[] = result.items.map((item) => ({
      id: item.id, title: item.title, module: "work", status: item.completed ? "completed" : "open",
      date: item.dueDate ?? undefined, context: item.projectName,
    }));
    return domainFailure("AMBIGUOUS", "Znaleziono kilka pasujących zadań służbowych.", candidates);
  }
  return { taskId: result.items[0].id };
}

export function getWorkSummary(today = new Date().toISOString().slice(0, 10)) {
  const workspace = loadWorkWorkspace();
  const activeProjectIds = new Set(workspace.projects.filter((project) => project.status === "active").map((project) => project.id));
  const tasks = workspace.tasks.filter((task) => activeProjectIds.has(task.projectId));
  return {
    open: tasks.filter((task) => !task.completed).map(toWorkItemSummary),
    overdue: tasks.filter((task) => !task.completed && task.dueDate && task.dueDate < today).map(toWorkItemSummary),
    activeProjects: workspace.projects.filter((project) => project.status === "active").length,
  };
}
