import {
  WORK_STORAGE_KEY,
  createWorkId,
  loadWorkWorkspace,
  saveWorkWorkspace,
  setWorkTasksCompletionState,
  type WorkTask,
  type WorkWorkspace,
} from "../../app/data/workWorkspace";
import { domainFailure } from "../shared";
import { commitDomainMutation } from "../shared/mutation";
import type { DomainMutationResult } from "../shared/result";
import { createWorkspaceUndo } from "../shared/workspaceUndo";
import { completeWorkItemSchema, createWorkItemSchema } from "./workSchemas";

function replaceWorkTask(workspace: WorkWorkspace, value: WorkTask | null, id: string): WorkWorkspace {
  return {
    ...workspace,
    tasks: value === null
      ? workspace.tasks.filter((task) => task.id !== id)
      : workspace.tasks.map((task) => task.id === id ? value : task),
  };
}

function workTaskUndo(before: WorkTask | null, after: WorkTask | null, id: string, message: string) {
  return createWorkspaceUndo({
    storageKey: WORK_STORAGE_KEY, read: loadWorkWorkspace, save: saveWorkWorkspace,
    select: (workspace) => workspace.tasks.find((task) => task.id === id) ?? null,
    apply: (workspace, value) => replaceWorkTask(workspace, value, id),
    expected: after, restore: before, message,
  });
}

export async function createWorkItem(input: unknown): Promise<DomainMutationResult<WorkTask>> {
  const parsed = createWorkItemSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowe zadanie służbowe.");
  const workspace = loadWorkWorkspace();
  const project = workspace.projects.find((candidate) => candidate.id === parsed.data.projectId);
  if (!project || project.status !== "active") return domainFailure("NOT_FOUND", "Aktywny projekt nie istnieje.");
  if (parsed.data.parentId) {
    const parent = workspace.tasks.find((task) => task.id === parsed.data.parentId);
    if (!parent || parent.projectId !== project.id) return domainFailure("NOT_FOUND", "Zadanie nadrzędne nie istnieje w tym projekcie.");
  }
  const task: WorkTask = {
    id: createWorkId("task"), projectId: project.id, parentId: parsed.data.parentId,
    title: parsed.data.title, completed: false, priority: parsed.data.priority,
    dueDate: parsed.data.dueDate, createdAt: new Date().toISOString(),
  };
  const next = { ...workspace, tasks: [...workspace.tasks, task] };
  return commitDomainMutation({
    entityId: task.id, storageKey: WORK_STORAGE_KEY,
    event: { type: "work.item_created", domain: "work", entityId: task.id, payload: { title: task.title, projectId: task.projectId } },
    save: () => saveWorkWorkspace(next), read: loadWorkWorkspace,
    verify: (current) => current.tasks.some((candidate) => candidate.id === task.id),
    selectSnapshot: (current) => current.tasks.find((candidate) => candidate.id === task.id) ?? task,
    message: "Utworzono zadanie służbowe.",
    compensation: workTaskUndo(null, task, task.id, "Cofnięto utworzenie zadania służbowego."),
  });
}

export async function setWorkItemCompletion(input: unknown): Promise<DomainMutationResult<WorkTask>> {
  const parsed = completeWorkItemSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy identyfikator.");
  const workspace = loadWorkWorkspace();
  const before = workspace.tasks.find((task) => task.id === parsed.data.taskId);
  if (!before) return domainFailure("NOT_FOUND", "Zadanie służbowe nie istnieje.");
  if (before.completed === parsed.data.completed) return domainFailure("CONFLICT", "Zadanie ma już wybrany status.");
  const after = { ...before, completed: parsed.data.completed };
  const next = setWorkTasksCompletionState(workspace, [before.id], after.completed);
  return commitDomainMutation({
    entityId: before.id, storageKey: WORK_STORAGE_KEY,
    event: { type: "work.item_completed", domain: "work", entityId: before.id, payload: { completed: after.completed, projectId: after.projectId } },
    save: () => saveWorkWorkspace(next), read: loadWorkWorkspace,
    verify: (current) => current.tasks.some((task) => task.id === before.id && task.completed === after.completed),
    selectSnapshot: (current) => current.tasks.find((task) => task.id === before.id) ?? after,
    message: after.completed ? "Oznaczono zadanie służbowe jako wykonane." : "Cofnięto wykonanie zadania służbowego.",
    compensation: workTaskUndo(before, after, before.id, after.completed ? "Cofnięto wykonanie zadania służbowego." : "Przywrócono wykonanie zadania służbowego."),
  });
}

export const completeWorkItem = (taskId: string) => setWorkItemCompletion({ taskId, completed: true });
export const uncompleteWorkItem = (taskId: string) => setWorkItemCompletion({ taskId, completed: false });
