const STORAGE_KEY = "rootine.task-completion.v1";

type TaskWithDone = { id: number; done: boolean };

function readCompletionMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === "object" ? parsed as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

export function hydrateTaskCompletion<T extends TaskWithDone>(tasks: T[]): T[] {
  const completion = readCompletionMap();
  return tasks.map((task) => Object.prototype.hasOwnProperty.call(completion, String(task.id))
    ? { ...task, done: completion[String(task.id)] }
    : task);
}

export function persistTaskCompletion(id: number, done: boolean) {
  if (typeof window === "undefined") return;
  const completion = readCompletionMap();
  completion[String(id)] = done;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(completion));
    window.dispatchEvent(new CustomEvent("rootine:task-completion", { detail: { id, done } }));
  } catch {
    // Storage may be unavailable in private browsing; in-memory UI state still works.
  }
}
