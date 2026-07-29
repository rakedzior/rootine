import {
  AFFAIRS_STORAGE_KEY,
  loadAffairsWorkspace,
  type AffairsWorkspace,
} from "./affairsWorkspace";
import { isLocalDateKey } from "./localDate";
import {
  loadTaskWorkspace,
  TASK_STORAGE_KEY,
  type WorkspaceTask,
} from "./taskWorkspace";
import {
  projectTaskOccurrences,
  type TaskOccurrence,
} from "./taskSchedule";
import { commitmentSourceLabel } from "./commitmentRepository";
import {
  loadSportPlannerState,
  SPORT_PLANNER_STORAGE_KEY,
  type SportPlannerState,
} from "../sport/plannerModel";
import { TRAVEL_STORAGE_KEY } from "./travelWorkspace";
import { WORK_STORAGE_KEY } from "./workWorkspace";

export const CALENDAR_SOURCE_STORAGE_KEYS = [
  TASK_STORAGE_KEY,
  WORK_STORAGE_KEY,
  TRAVEL_STORAGE_KEY,
  SPORT_PLANNER_STORAGE_KEY,
  AFFAIRS_STORAGE_KEY,
] as const;

export type CalendarOccurrenceSourceKind =
  | "task"
  | "work"
  | "travel"
  | "sport"
  | "affairs"
  | "goals"
  | "notes";

export type CalendarOccurrenceStatusKey =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "incomplete"
  | "missed"
  | "waiting"
  | "automatic";

export type CalendarOccurrenceSource = {
  kind: CalendarOccurrenceSourceKind;
  label: string;
  context?: string;
  href: string;
};

export type CalendarOccurrenceStatus = {
  key: CalendarOccurrenceStatusKey;
  label: string;
  completed: boolean;
};

type CalendarOccurrenceBase = {
  key: string;
  calendarDate: string;
  title: string;
  time?: string;
  endTime?: string;
  source: CalendarOccurrenceSource;
  status: CalendarOccurrenceStatus;
  metadata: string[];
};

export type TaskCalendarOccurrence = CalendarOccurrenceBase & {
  kind: "task";
  task: TaskOccurrence;
};

export type SportCalendarOccurrence = CalendarOccurrenceBase & {
  kind: "sport";
  entityId: string;
};

export type AffairCalendarOccurrence = CalendarOccurrenceBase & {
  kind: "affair";
  subtype: "matter" | "one_time_payment" | "recurring_payment";
  entityId: string;
  amount?: number;
  automatic?: boolean;
};

export type CalendarOccurrence =
  | TaskCalendarOccurrence
  | SportCalendarOccurrence
  | AffairCalendarOccurrence;

export type CalendarOccurrenceSources = {
  tasks: readonly WorkspaceTask[];
  sport: SportPlannerState;
  affairs: AffairsWorkspace;
};

function taskSource(task: TaskOccurrence): CalendarOccurrenceSource {
  if (task.source) {
    return {
      kind: task.source.kind,
      label: commitmentSourceLabel(task.source.kind),
      context: task.source.context,
      href: task.source.href,
    };
  }
  return {
    kind: "task",
    label: "Zadania",
    context: task.list,
    href: "/zadania",
  };
}

function taskOccurrenceKey(task: TaskOccurrence): string {
  return task.source
    ? `${task.source.kind}:${task.source.entity}@${task.calendarDate}`
    : `task:${task.occurrence.key}`;
}

function selectTaskOccurrences(
  tasks: readonly WorkspaceTask[],
  rangeStart: string,
  rangeEnd: string,
): TaskCalendarOccurrence[] {
  return projectTaskOccurrences(tasks, rangeStart, rangeEnd)
    .filter((task) => !task.deleted)
    .map((task) => ({
      kind: "task",
      key: taskOccurrenceKey(task),
      calendarDate: task.calendarDate,
      title: task.text,
      time: task.time,
      endTime: task.endTime,
      source: taskSource(task),
      status: task.done
        ? { key: "completed", label: "Wykonane", completed: true }
        : { key: "scheduled", label: "Do zrobienia", completed: false },
      metadata: [
        ...(task.occurrence.virtual ? ["Cykliczne"] : []),
        ...(task.priority ? [`Priorytet: ${task.priority}`] : []),
      ],
      task,
    }));
}


export function loadCalendarOccurrenceSources(): CalendarOccurrenceSources {
  return {
    tasks: loadTaskWorkspace().tasks,
    sport: loadSportPlannerState(),
    affairs: loadAffairsWorkspace(),
  };
}

export function selectCalendarOccurrences(
  sources: CalendarOccurrenceSources,
  rangeStart: string,
  rangeEnd: string,
): CalendarOccurrence[] {
  if (
    !isLocalDateKey(rangeStart)
    || !isLocalDateKey(rangeEnd)
    || rangeEnd < rangeStart
  ) return [];

  const deduplicated = new Map<string, CalendarOccurrence>();
  [
    ...selectTaskOccurrences(sources.tasks, rangeStart, rangeEnd),
  ].forEach((occurrence) => {
    if (!deduplicated.has(occurrence.key)) deduplicated.set(occurrence.key, occurrence);
  });

  return [...deduplicated.values()].sort((left, right) => (
    left.calendarDate.localeCompare(right.calendarDate)
    || (left.time ?? "").localeCompare(right.time ?? "")
    || left.key.localeCompare(right.key)
  ));
}
