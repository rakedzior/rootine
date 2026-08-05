import { readLocalWorkspace, writeLocalWorkspace } from "./localRepository";

export const TASK_COMPLETION_STORAGE_KEY = "rootine.task-completion.v1";

export type TaskCompletionRecord = { done: boolean; completedAt?: string };
type TaskWithDone = { id: number; done: boolean; completedAt?: string };
type LegacyCompletionMap = Record<string, boolean>;
type CompletionMap = Record<string, TaskCompletionRecord>;
type TaskCompletionWorkspace = {
  version: 2;
  updatedAt: string;
  completion: CompletionMap;
};

function createEmptyCompletionWorkspace(): TaskCompletionWorkspace {
  return {
    version: 2,
    updatedAt: new Date(0).toISOString(),
    completion: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLegacyCompletionMap(value: unknown): value is LegacyCompletionMap {
  return isRecord(value)
    && Object.entries(value).every(([key, done]) => /^-?\d+$/.test(key) && typeof done === "boolean");
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isCompletionMap(value: unknown): value is CompletionMap {
  return isRecord(value)
    && Object.entries(value).every(([key, record]) => (
      /^-?\d+$/.test(key)
      && isRecord(record)
      && typeof record.done === "boolean"
      && (record.completedAt === undefined || isTimestamp(record.completedAt))
    ));
}

function isCompletionWorkspace(value: unknown): value is TaskCompletionWorkspace {
  return isRecord(value)
    && value.version === 2
    && typeof value.updatedAt === "string"
    && isCompletionMap(value.completion);
}

function migrateLegacyCompletion(value: unknown): TaskCompletionWorkspace | null {
  const legacyMap = isLegacyCompletionMap(value)
    ? value
    : isRecord(value) && value.version === 1 && isLegacyCompletionMap(value.completion)
      ? value.completion
      : null;
  if (!legacyMap) return null;
  return {
    version: 2,
    updatedAt: new Date(0).toISOString(),
    completion: Object.fromEntries(
      Object.entries(legacyMap).map(([id, done]) => [id, { done }]),
    ),
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
  return tasks.map((task) => {
    const record = completion[String(task.id)];
    if (!record) return task;
    const hydrated = { ...task, done: record.done };
    return record.completedAt ? { ...hydrated, completedAt: record.completedAt } : hydrated;
  });
}

export function persistTaskCompletion(id: number, done: boolean, completedAt = done ? new Date().toISOString() : undefined) {
  if (typeof window === "undefined") return;
  const workspace = loadCompletionWorkspace();
  const record: TaskCompletionRecord = {
    done,
    ...(completedAt ? { completedAt } : {}),
  };
  const saved = writeLocalWorkspace(TASK_COMPLETION_STORAGE_KEY, {
    ...workspace,
    updatedAt: new Date().toISOString(),
    completion: {
      ...workspace.completion,
      [String(id)]: record,
    },
  });
  if (saved) {
    window.dispatchEvent(new CustomEvent("rootine:task-completion", { detail: { id, done } }));
  }
}
