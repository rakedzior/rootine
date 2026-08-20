import {
  AFFAIRS_STORAGE_KEY,
  loadAffairsWorkspace,
  type AffairsWorkspace,
} from "./affairsWorkspace";
import { isLocalDateKey, shiftLocalDateKey } from "./localDate";
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
  cycleWorkoutDate,
  isIndefiniteCycle,
  isWorkoutScheduledOnDate,
  loadSportPlannerState,
  SPORT_PLANNER_STORAGE_KEY,
  type SportPlannerState,
} from "../sport/plannerModel";
import { TRAVEL_STORAGE_KEY } from "./travelWorkspace";
import { WORK_STORAGE_KEY } from "./workWorkspace";
import { DISCIPLINE_META } from "../sport/theme";

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
  subtype: "matter" | "one_time_payment" | "recurring_payment" | "subscription";
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

export function selectTaskCalendarOccurrences(
  tasks: readonly WorkspaceTask[],
  rangeStart: string,
  rangeEnd: string,
): TaskCalendarOccurrence[] {
  if (
    !isLocalDateKey(rangeStart)
    || !isLocalDateKey(rangeEnd)
    || rangeEnd < rangeStart
  ) return [];

  return selectTaskOccurrences(tasks, rangeStart, rangeEnd);
}

function sportStatus(
  state: SportPlannerState,
  workoutId: string,
  date: string,
): CalendarOccurrenceStatus {
  const session = state.sessions.find((candidate) => (
    candidate.cycleWorkoutId === workoutId && candidate.date === date
  ));
  const storedOutcome = state.workoutOutcomes[workoutId];
  const outcome = session?.status ?? (
    storedOutcome && storedOutcome.updatedAt.slice(0, 10) === date
      ? storedOutcome.status
      : undefined
  );
  if (outcome === "completed") return { key: "completed", label: "Wykonane", completed: true };
  if (outcome === "in_progress") return { key: "in_progress", label: "W trakcie", completed: false };
  if (outcome === "missed") return { key: "missed", label: "Pominięte", completed: false };
  if (outcome === "incomplete") return { key: "incomplete", label: "Niedokończone", completed: false };
  return { key: "scheduled", label: "Zaplanowane", completed: false };
}

function selectSportOccurrences(
  state: SportPlannerState,
  rangeStart: string,
  rangeEnd: string,
): SportCalendarOccurrence[] {
  const cycle = state.activeCycle;
  if (!cycle) return [];
  const dates: string[] = [];
  for (let date = rangeStart; date <= rangeEnd; date = shiftLocalDateKey(date, 1)) {
    dates.push(date);
  }
  return cycle.workouts.flatMap((workout) => {
    const occurrenceDates = isIndefiniteCycle(cycle)
      ? dates.filter((date) => isWorkoutScheduledOnDate(cycle, workout, date))
      : [cycleWorkoutDate(cycle, workout)].filter((date) => date >= rangeStart && date <= rangeEnd);
    return occurrenceDates.map((date) => ({
      kind: "sport" as const,
      key: `sport:${workout.id}@${date}`,
      calendarDate: date,
      title: workout.title,
      time: workout.time,
      source: {
        kind: "sport" as const,
        label: "Sport",
        context: cycle.name,
        href: `/sport?widok=cycle&tydzien=${workout.week}`,
      },
      status: sportStatus(state, workout.id, date),
      metadata: [`${workout.durationMinutes} min`, DISCIPLINE_META[workout.discipline].label],
      entityId: workout.id,
    }));
  });
}

function selectAffairOccurrences(
  workspace: AffairsWorkspace,
  rangeStart: string,
  rangeEnd: string,
): AffairCalendarOccurrence[] {
  const inRange = (date: string) => isLocalDateKey(date) && date >= rangeStart && date <= rangeEnd;
  const matters: AffairCalendarOccurrence[] = workspace.matters
    .filter((matter) => inRange(matter.dueDate))
    .map((matter) => ({
      kind: "affair",
      subtype: "matter",
      key: `affairs:${encodeURIComponent(matter.id)}/matter@${matter.dueDate}`,
      calendarDate: matter.dueDate,
      title: matter.title,
      time: matter.time,
      source: { kind: "affairs", label: "Pozostałe", context: "Sprawy", href: "/sprawy?widok=all" },
      status: matter.status === "done"
        ? { key: "completed", label: "Wykonane", completed: true }
        : matter.status === "waiting"
          ? { key: "waiting", label: "Oczekuje", completed: false }
          : { key: "scheduled", label: "Do załatwienia", completed: false },
      metadata: [matter.category],
      entityId: matter.id,
    }));
  const oneTimePayments: AffairCalendarOccurrence[] = workspace.oneTimePayments
    .filter((payment) => inRange(payment.dueDate))
    .map((payment) => ({
      kind: "affair",
      subtype: "one_time_payment",
      key: `affairs:${encodeURIComponent(payment.id)}/one-time@${payment.dueDate}`,
      calendarDate: payment.dueDate,
      title: payment.title,
      source: { kind: "affairs", label: "Pozostałe", context: "Płatności jednorazowe", href: "/sprawy?widok=finance-one-time" },
      status: payment.paid
        ? { key: "completed", label: "Opłacone", completed: true }
        : { key: "scheduled", label: "Do opłacenia", completed: false },
      metadata: [payment.category],
      entityId: payment.id,
      amount: payment.amount,
    }));
  const recurringPayments: AffairCalendarOccurrence[] = workspace.payments
    .filter((payment) => payment.active && inRange(payment.nextDueDate))
    .map((payment) => ({
      kind: "affair",
      subtype: "recurring_payment",
      key: `affairs:${encodeURIComponent(payment.id)}/recurring@${payment.nextDueDate}`,
      calendarDate: payment.nextDueDate,
      title: payment.name,
      source: { kind: "affairs", label: "Pozostałe", context: "Płatności cykliczne", href: "/sprawy?widok=finance-recurring" },
      status: payment.automatic
        ? { key: "automatic", label: "Automatyczne", completed: false }
        : { key: "scheduled", label: "Do opłacenia", completed: false },
      metadata: [payment.category],
      entityId: payment.id,
      amount: payment.amount,
      automatic: payment.automatic,
    }));
  const subscriptions: AffairCalendarOccurrence[] = workspace.subscriptions
    .filter((subscription) => subscription.active && inRange(subscription.nextBillingDate))
    .map((subscription) => ({
      kind: "affair",
      subtype: "subscription",
      key: `affairs:${encodeURIComponent(subscription.id)}/subscription@${subscription.nextBillingDate}`,
      calendarDate: subscription.nextBillingDate,
      title: subscription.name,
      source: { kind: "affairs", label: "Pozostałe", context: "Subskrypcje", href: "/sprawy?widok=finance-recurring" },
      status: subscription.renewal === "automatic"
        ? { key: "automatic", label: "Automatyczne", completed: false }
        : { key: "scheduled", label: "Do odnowienia", completed: false },
      metadata: [subscription.category],
      entityId: subscription.id,
      amount: subscription.amount,
      automatic: subscription.renewal === "automatic",
    }));
  return [...matters, ...oneTimePayments, ...recurringPayments, ...subscriptions];
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
    ...selectTaskCalendarOccurrences(sources.tasks, rangeStart, rangeEnd),
    ...selectSportOccurrences(sources.sport, rangeStart, rangeEnd),
    ...selectAffairOccurrences(sources.affairs, rangeStart, rangeEnd),
  ].forEach((occurrence) => {
    if (!deduplicated.has(occurrence.key)) deduplicated.set(occurrence.key, occurrence);
  });

  return [...deduplicated.values()].sort((left, right) => (
    left.calendarDate.localeCompare(right.calendarDate)
    || (left.time ?? "").localeCompare(right.time ?? "")
    || left.key.localeCompare(right.key)
  ));
}
