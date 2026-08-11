/* eslint-disable react-refresh/only-export-components -- The external-store API and its provider form one versioned persistence boundary. */
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { loadTaskWorkspace } from "../data/taskWorkspace";
import type { AppModuleId } from "../moduleRegistry";

const ACTIVITY_STORAGE_KEY = "rootine.activity-log.v1";
const VERSION = 1 as const;
const RETENTION_DAYS = 60;
const MAX_EVENTS = 500;

export type ActivityKind = "create" | "complete" | "reopen" | "reschedule" | "move" | "delete" | "status" | "save";

export type ActivityEvent = {
  id: string;
  version: typeof VERSION;
  occurredAt: string;
  moduleId: AppModuleId;
  kind: ActivityKind;
  title: string;
  detail?: string;
};

type ActivityInput = Omit<ActivityEvent, "id" | "version" | "occurredAt"> & { occurredAt?: string };

let cache: ActivityEvent[] | null = null;
const subscribers = new Set<() => void>();

function isActivityEvent(value: unknown): value is ActivityEvent {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ActivityEvent>;
  return item.version === VERSION
    && typeof item.id === "string"
    && typeof item.occurredAt === "string"
    && typeof item.moduleId === "string"
    && typeof item.kind === "string"
    && typeof item.title === "string";
}

function retentionCutoff() {
  return Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

function loadEvents() {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(ACTIVITY_STORAGE_KEY) ?? "[]");
    cache = Array.isArray(parsed)
      ? parsed.filter(isActivityEvent).filter((event) => Date.parse(event.occurredAt) >= retentionCutoff()).slice(0, MAX_EVENTS)
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(events: ActivityEvent[]) {
  cache = events;
  try {
    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Activity history is optional and must never block the primary action.
  }
  subscribers.forEach((listener) => listener());
}

export function recordActivity(input: ActivityInput) {
  if (typeof window === "undefined") return;
  const event: ActivityEvent = {
    ...input,
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    version: VERSION,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
  const events = [event, ...loadEvents()]
    .filter((item) => Date.parse(item.occurredAt) >= retentionCutoff())
    .slice(0, MAX_EVENTS);
  persist(events);
}

function subscribe(listener: () => void) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function getSnapshot() {
  return loadEvents();
}

export function resetActivityLogCacheForWorkspaceSwitch() {
  cache = null;
  subscribers.forEach((listener) => listener());
}

const SERVER_SNAPSHOT: ActivityEvent[] = [];

export function useActivityLog() {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

export function ActivityLogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const handleTaskCompletion = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number; done?: boolean }>).detail;
      if (typeof detail?.id !== "number" || typeof detail.done !== "boolean") return;
      const task = loadTaskWorkspace().tasks.find((item) => item.id === detail.id);
      recordActivity({
        moduleId: "tasks",
        kind: detail.done ? "complete" : "reopen",
        title: task?.text ?? "Zadanie",
        detail: detail.done ? "Oznaczono jako wykonane" : "Przywrócono do planu",
      });
    };
    window.addEventListener("rootine:task-completion", handleTaskCompletion);
    return () => window.removeEventListener("rootine:task-completion", handleTaskCompletion);
  }, []);

  return children;
}

export const ACTIVITY_LOG_STORAGE_KEY = ACTIVITY_STORAGE_KEY;
export const ACTIVITY_LOG_RETENTION_DAYS = RETENTION_DAYS;
