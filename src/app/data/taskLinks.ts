import {
  loadTaskWorkspace,
  saveTaskWorkspace,
  taskViewForCalendarDate,
  type TaskPriority,
  type WorkspaceTask,
} from "./taskWorkspace";
import type { CommitmentSourceKind, CommitmentTaskSource } from "./commitmentRepository";

export type ExternalTaskInput = {
  source: Omit<CommitmentTaskSource, "managed">;
  text: string;
  done?: boolean;
  calendarDate?: string;
  date?: string;
  time?: string;
  endTime?: string;
  priority?: TaskPriority;
  list?: string;
  tags?: string[];
  notes?: string;
};

export type ExternalTaskResult =
  | { status: "added"; task: WorkspaceTask }
  | { status: "exists"; task: WorkspaceTask }
  | { status: "save-failed" };

function externalTaskId(kind: CommitmentSourceKind, entity: string): number {
  const value = `${kind}\u0000${entity}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return -(Math.abs(hash) + 1);
}

export function addExternalTask(input: ExternalTaskInput): ExternalTaskResult {
  const workspace = loadTaskWorkspace();
  const existing = workspace.tasks.find((task) => (
    task.source?.kind === input.source.kind
    && task.source.entity === input.source.entity
  ));
  if (existing) return { status: "exists", task: existing };

  const task: WorkspaceTask = {
    id: externalTaskId(input.source.kind, input.source.entity),
    text: input.text,
    done: input.done ?? false,
    view: input.calendarDate ? taskViewForCalendarDate(input.calendarDate) : "skrzynka",
    source: { ...input.source, managed: "native" },
    ...(input.calendarDate ? { calendarDate: input.calendarDate } : {}),
    ...(input.date ? { date: input.date } : {}),
    ...(input.time ? { time: input.time } : {}),
    ...(input.endTime ? { endTime: input.endTime } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.list ? { list: input.list } : {}),
    ...(input.tags ? { tags: [...input.tags] } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };

  const saved = saveTaskWorkspace({
    ...workspace,
    tasks: [...workspace.tasks, task],
  });
  return saved ? { status: "added", task } : { status: "save-failed" };
}
