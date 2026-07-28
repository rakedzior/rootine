import { readLocalWorkspace, writeLocalWorkspace } from "./localRepository";

export const TASK_COMPLETION_STORAGE_KEY = "rootine.task-completion.v1";

type TaskWithDone = { id: number; done: boolean };
type TaskCompletionWorkspace = {
  version: 1;
  updatedAt: string;
  completion: Record<string, boolean>;
};

function createEmptyCompletionWorkspace(): TaskCompletionWorkspace {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    completion: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCompletionMap(value: unknown): value is Record<string, boolean> {
  return isRecord(value)
    && Object.entries(value).every(([key, done]) => /^-?\d+$/.test(key) && typeof done === "boolean");
}

function isCompletionWorkspace(value: unknown): value is TaskCompletionWorkspace {
  return isRecord(value)
    && value.version === 1
    && typeof value.updatedAt === "string"
    && isCompletionMap(value.completion);
}

function migrateLegacyCompletion(value: unknown): TaskCompletionWorkspace | null {
  if (!isCompletionMap(value)) return null;
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    completion: value,
  };
}

function loadCompletionWorkspace(): TaskCompletionWorkspace {
  return readLocalWorkspace({
    key: TASK_COMPLETION_STORAGE_KEY,
    fallback: createEmptyCompletionWorkspace,
    validate: isCompletionWorkspace,
    migrate: migrateLegacyCompletion,
  }).workspace;
}

export function hydrateTaskCompletion<T extends TaskWithDone>(tasks: T[]): T[] {
  const completion = loadCompletionWorkspace().completion;
  return tasks.map((task) => Object.prototype.hasOwnProperty.call(completion, String(task.id))
    ? { ...task, done: completion[String(task.id)] }
    : task);
}

export function persistTaskCompletion(id: number, done: boolean) {
  if (typeof window === "undefined") return;
  const workspace = loadCompletionWorkspace();
  const saved = writeLocalWorkspace(TASK_COMPLETION_STORAGE_KEY, {
    ...workspace,
    updatedAt: new Date().toISOString(),
    completion: {
      ...workspace.completion,
      [String(id)]: done,
    },
  });
  if (saved) {
    window.dispatchEvent(new CustomEvent("rootine:task-completion", { detail: { id, done } }));
  }
}
