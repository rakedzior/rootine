import {
  AFFAIRS_STORAGE_KEY,
  advancePaymentDate,
  loadAffairsWorkspace,
  type AffairsWorkspace,
  type PaymentCadence,
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
  cycleWorkoutDate,
  loadSportPlannerState,
  SPORT_PLANNER_STORAGE_KEY,
  type SportPlannerState,
} from "../sport/plannerModel";
import { DISCIPLINE_META } from "../sport/theme";
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

const CADENCE_LABELS: Record<PaymentCadence, string> = {
  monthly: "Co miesiąc",
  quarterly: "Co kwartał",
  yearly: "Co rok",
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

function sportStatus(
  status: "scheduled" | "in_progress" | "completed" | "incomplete" | "missed",
): CalendarOccurrenceStatus {
  const label = {
    scheduled: "Zaplanowany",
    in_progress: "Trwający",
    completed: "Wykonany",
    incomplete: "Niedokończony",
    missed: "Pominięty",
  }[status];
  return { key: status, label, completed: status === "completed" };
}

function selectSportOccurrences(
  state: SportPlannerState,
  rangeStart: string,
  rangeEnd: string,
): SportCalendarOccurrence[] {
  const occurrences: SportCalendarOccurrence[] = [];
  const cycle = state.activeCycle;
  const sessionsByWorkout = new Map(
    state.sessions
      .filter((session) => session.cycleWorkoutId)
      .map((session) => [session.cycleWorkoutId!, session]),
  );

  if (cycle) {
    for (const workout of cycle.workouts) {
      const calendarDate = cycleWorkoutDate(cycle, workout);
      if (calendarDate < rangeStart || calendarDate > rangeEnd) continue;
      const outcome = state.workoutOutcomes[workout.id];
      const session = outcome?.sessionId
        ? state.sessions.find((candidate) => candidate.id === outcome.sessionId)
        : sessionsByWorkout.get(workout.id);
      const status = session?.status ?? outcome?.status ?? "scheduled";
      occurrences.push({
        kind: "sport",
        key: `sport:cycle:${cycle.id}/${workout.id}`,
        calendarDate,
        title: workout.title,
        time: session?.time ?? workout.time,
        source: {
          kind: "sport",
          label: "Sport",
          context: `${cycle.name} · tydzień ${workout.week}`,
          href: `/sport?widok=cycle&tydzien=${workout.week}`,
        },
        status: sportStatus(status),
        metadata: [
          DISCIPLINE_META[workout.discipline].label,
          `${workout.durationMinutes} min`,
        ],
        entityId: workout.id,
      });
    }
  }

  const cycleWorkoutIds = new Set(cycle?.workouts.map((workout) => workout.id) ?? []);
  for (const session of state.sessions) {
    if (
      session.cycleWorkoutId
      || cycleWorkoutIds.has(session.id)
      || session.date < rangeStart
      || session.date > rangeEnd
    ) continue;
    occurrences.push({
      kind: "sport",
      key: `sport:session:${session.id}`,
      calendarDate: session.date,
      title: session.title,
      time: session.time,
      source: {
        kind: "sport",
        label: "Sport",
        context: session.location || "Trening poza aktywnym cyklem",
        href: session.status === "completed" || session.status === "incomplete" || session.status === "missed"
          ? "/sport?widok=history"
          : "/sport",
      },
      status: sportStatus(session.status),
      metadata: [
        DISCIPLINE_META[session.discipline].label,
        `${session.plannedDurationMinutes ?? session.durationMinutes} min`,
      ],
      entityId: session.id,
    });
  }

  const sessionIds = new Set(state.sessions.map((session) => session.id));
  for (const entry of state.history) {
    if (
      sessionIds.has(entry.id)
      || entry.date < rangeStart
      || entry.date > rangeEnd
    ) continue;
    occurrences.push({
      kind: "sport",
      key: `sport:history:${entry.id}`,
      calendarDate: entry.date,
      title: entry.title,
      source: {
        kind: "sport",
        label: "Sport",
        context: "Historia treningów",
        href: "/sport?widok=history",
      },
      status: sportStatus(entry.status),
      metadata: [
        DISCIPLINE_META[entry.discipline].label,
        `${entry.plannedDurationMinutes ?? entry.durationMinutes} min`,
      ],
      entityId: entry.id,
    });
  }

  return occurrences;
}

function recurringDates(
  nextDueDate: string,
  cadence: PaymentCadence,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  if (!isLocalDateKey(nextDueDate) || nextDueDate > rangeEnd) return [];
  const dates: string[] = [];
  let candidate = nextDueDate;
  for (let iteration = 0; candidate <= rangeEnd && iteration < 1_000; iteration += 1) {
    if (candidate >= rangeStart) dates.push(candidate);
    const next = advancePaymentDate(candidate, cadence);
    if (next <= candidate) break;
    candidate = next;
  }
  return dates;
}

function selectAffairOccurrences(
  workspace: AffairsWorkspace,
  rangeStart: string,
  rangeEnd: string,
): AffairCalendarOccurrence[] {
  const matters: AffairCalendarOccurrence[] = workspace.matters
    .filter((matter) => isLocalDateKey(matter.dueDate) && matter.dueDate >= rangeStart && matter.dueDate <= rangeEnd)
    .map((matter) => ({
      kind: "affair",
      subtype: "matter",
      key: `affairs:matter:${matter.id}`,
      entityId: matter.id,
      calendarDate: matter.dueDate,
      title: matter.title,
      source: {
        kind: "affairs",
        label: "Sprawy",
        context: matter.category,
        href: "/sprawy?widok=matters",
      },
      status: matter.status === "done"
        ? { key: "completed", label: "Załatwione", completed: true }
        : matter.status === "waiting"
          ? { key: "waiting", label: "Oczekuje", completed: false }
          : { key: "scheduled", label: "Do zrobienia", completed: false },
      metadata: [
        matter.priority === "high" ? "Wysoki priorytet" : "Zwykły priorytet",
      ],
    }));

  const oneTimePayments: AffairCalendarOccurrence[] = workspace.oneTimePayments
    .filter((payment) => isLocalDateKey(payment.dueDate) && payment.dueDate >= rangeStart && payment.dueDate <= rangeEnd)
    .map((payment) => ({
      kind: "affair",
      subtype: "one_time_payment",
      key: `affairs:one-time:${payment.id}`,
      entityId: payment.id,
      calendarDate: payment.dueDate,
      title: payment.title,
      source: {
        kind: "affairs",
        label: "Sprawy",
        context: payment.category,
        href: "/sprawy?widok=oneTime",
      },
      status: payment.paid
        ? { key: "completed", label: "Opłacone", completed: true }
        : { key: "scheduled", label: "Do opłacenia", completed: false },
      metadata: ["Płatność jednorazowa"],
      amount: payment.amount,
    }));

  const recurringPayments: AffairCalendarOccurrence[] = workspace.payments
    .filter((payment) => payment.active)
    .flatMap((payment) => recurringDates(payment.nextDueDate, payment.cadence, rangeStart, rangeEnd)
      .map((calendarDate) => ({
        kind: "affair" as const,
        subtype: "recurring_payment" as const,
        key: `affairs:recurring:${payment.id}@${calendarDate}`,
        entityId: payment.id,
        calendarDate,
        title: payment.name,
        source: {
          kind: "affairs" as const,
          label: "Sprawy",
          context: payment.category,
          href: "/sprawy?widok=payments",
        },
        status: payment.automatic
          ? { key: "automatic" as const, label: "Automatyczna", completed: false }
          : { key: "scheduled" as const, label: "Do opłacenia", completed: false },
        metadata: [CADENCE_LABELS[payment.cadence]],
        amount: payment.amount,
        automatic: payment.automatic,
      })));

  return [...matters, ...oneTimePayments, ...recurringPayments];
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
