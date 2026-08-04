import {
  INITIAL_TEMPLATES,
  addDays,
  cloneExercises,
  createInitialExercises,
  createInitialSessions,
  fromDateKey,
  startOfWeekKey,
  templateSections,
  toDateKey,
  type Discipline,
  type Exercise,
  type RunningStage,
  type ScheduledWorkout,
  type TrainingPlan,
  type WorkoutExecution,
  type WorkoutExercise,
  type WorkoutSession,
  type WorkoutTemplate,
} from "./model";
import { DISCIPLINE_META } from "./theme";
import { readLocalWorkspace, writeLocalWorkspace, type LocalLoadResult } from "../data/localRepository";
import { calendarDaysBetween } from "../data/localDate";

export type PlannerView = "today" | "cycle" | "templates" | "exercises" | "history" | "analysis";

export interface CycleWorkout {
  id: string;
  week: number;
  day: number;
  title: string;
  discipline: Discipline;
  durationMinutes: number;
  templateId?: string;
  seriesId?: string;
  time?: string;
  note?: string;
  status?: ScheduledWorkout["status"];
  contentSnapshot?: ScheduledWorkout["contentSnapshot"];
  sourceTemplateVersion?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TrainingCycle {
  id: string;
  name: string;
  startDate: string;
  weeks: number;
  /** Null means that the weekly schedule repeats without an end date. */
  endDate?: string | null;
  repeatWeekly?: boolean;
  workouts: CycleWorkout[];
  updatedAt: string;
}

export interface WorkoutHistoryEntry {
  id: string;
  title: string;
  discipline: Discipline;
  date: string;
  plannedDurationMinutes?: number;
  durationMinutes: number;
  status: "completed" | "incomplete" | "missed";
  templateId?: string;
  completedUnits?: number;
  totalUnits?: number;
  unitKind?: "sets" | "stages";
  volumeKg?: number;
  distanceKm?: number;
  averagePace?: string;
  averageHeartRate?: number;
  rpe?: number;
  pain?: number;
}

export interface WorkoutOutcome {
  status: "completed" | "incomplete" | "missed";
  sessionId?: string;
  updatedAt: string;
}

export interface SportPlannerState {
  version: 4 | 5;
  storageSchemaVersion?: 5;
  templates: WorkoutTemplate[];
  activeCycle: TrainingCycle | null;
  cycles: TrainingCycle[];
  activeCycleId: string | null;
  history: WorkoutHistoryEntry[];
  sessions: WorkoutSession[];
  workoutOutcomes: Record<string, WorkoutOutcome>;
  /** New canonical records. Optional keeps hand-built v4 fixtures compatible. */
  exercises?: Exercise[];
  scheduledWorkouts?: ScheduledWorkout[];
  executions?: WorkoutExecution[];
  recoveryDays?: string[];
}

interface SportPlannerStateV3 {
  version: 3;
  templates: WorkoutTemplate[];
  activeCycle: TrainingCycle | null;
  history: WorkoutHistoryEntry[];
  sessions: WorkoutSession[];
  workoutOutcomes: Record<string, WorkoutOutcome>;
}

interface SportPlannerStateV2 {
  version: 2;
  templates: WorkoutTemplate[];
  activeCycle: TrainingCycle | null;
  history: WorkoutHistoryEntry[];
}

interface SportPlannerStateV1 {
  version: 1;
  templates: WorkoutTemplate[];
  activeCycle: TrainingCycle | null;
}

interface LegacySportState {
  sessions: WorkoutSession[];
  plans: TrainingPlan[];
  templates: WorkoutTemplate[];
}

export const SPORT_PLANNER_STORAGE_KEY = "rootine-sport-planner-v1";
const LEGACY_STORAGE_KEY = "routine-sport-v3";

export const DAY_LABELS = [
  { short: "Pn", full: "Poniedziałek" },
  { short: "Wt", full: "Wtorek" },
  { short: "Śr", full: "Środa" },
  { short: "Cz", full: "Czwartek" },
  { short: "Pt", full: "Piątek" },
  { short: "So", full: "Sobota" },
  { short: "Nd", full: "Niedziela" },
];

const disciplineIds = Object.keys(DISCIPLINE_META) as Discipline[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isDiscipline(value: unknown): value is Discipline {
  return typeof value === "string" && disciplineIds.includes(value as Discipline);
}

function isWorkoutTemplate(value: unknown): value is WorkoutTemplate {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && isDiscipline(value.discipline)
    && typeof value.description === "string"
    && typeof value.durationMinutes === "number"
    && value.durationMinutes > 0
    && Array.isArray(value.exercises);
}

function isCycleWorkout(value: unknown): value is CycleWorkout {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.week === "number"
    && Number.isInteger(value.week)
    && value.week >= 1
    && value.week <= 52
    && typeof value.day === "number"
    && Number.isInteger(value.day)
    && value.day >= 0
    && value.day <= 6
    && typeof value.title === "string"
    && isDiscipline(value.discipline)
    && typeof value.durationMinutes === "number"
    && value.durationMinutes > 0
    && (value.templateId === undefined || typeof value.templateId === "string")
    && (value.seriesId === undefined || typeof value.seriesId === "string")
    && (value.time === undefined || typeof value.time === "string")
    && (value.note === undefined || typeof value.note === "string");
}

function isTrainingCycle(value: unknown): value is TrainingCycle {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.startDate === "string"
    && typeof value.weeks === "number"
    && Number.isInteger(value.weeks)
    && value.weeks >= 1
    && value.weeks <= 52
    && Array.isArray(value.workouts)
    && value.workouts.every((workout) => isCycleWorkout(workout) && workout.week <= (value.weeks as number))
    && (value.endDate === undefined || value.endDate === null || typeof value.endDate === "string")
    && (value.repeatWeekly === undefined || typeof value.repeatWeekly === "boolean")
    && typeof value.updatedAt === "string";
}

function isWorkoutHistoryEntry(value: unknown): value is WorkoutHistoryEntry {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && isDiscipline(value.discipline)
    && typeof value.date === "string"
    && typeof value.durationMinutes === "number"
    && value.durationMinutes > 0
    && (value.status === "completed" || value.status === "incomplete" || value.status === "missed")
    && (value.templateId === undefined || typeof value.templateId === "string")
    && (value.plannedDurationMinutes === undefined || typeof value.plannedDurationMinutes === "number")
    && (value.completedUnits === undefined || typeof value.completedUnits === "number")
    && (value.totalUnits === undefined || typeof value.totalUnits === "number")
    && (value.unitKind === undefined || value.unitKind === "sets" || value.unitKind === "stages")
    && (value.volumeKg === undefined || typeof value.volumeKg === "number")
    && (value.distanceKm === undefined || typeof value.distanceKm === "number")
    && (value.averagePace === undefined || typeof value.averagePace === "string")
    && (value.averageHeartRate === undefined || typeof value.averageHeartRate === "number")
    && (value.rpe === undefined || typeof value.rpe === "number")
    && (value.pain === undefined || typeof value.pain === "number");
}

function isWorkoutSession(value: unknown): value is WorkoutSession {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && isDiscipline(value.discipline)
    && typeof value.date === "string"
    && typeof value.durationMinutes === "number"
    && value.durationMinutes > 0
    && (value.status === "scheduled"
      || value.status === "in_progress"
      || value.status === "completed"
      || value.status === "incomplete"
      || value.status === "missed")
    && Array.isArray(value.exercises)
    && (value.cycleWorkoutId === undefined || typeof value.cycleWorkoutId === "string")
    && (value.plannedDurationMinutes === undefined || typeof value.plannedDurationMinutes === "number");
}

function isWorkoutOutcome(value: unknown): value is WorkoutOutcome {
  return isRecord(value)
    && (value.status === "completed" || value.status === "incomplete" || value.status === "missed")
    && (value.sessionId === undefined || typeof value.sessionId === "string")
    && typeof value.updatedAt === "string";
}

function isSportPlannerState(value: unknown): value is SportPlannerState {
  return isRecord(value)
    && (value.version === 4 || value.version === 5)
    && Array.isArray(value.templates)
    && value.templates.every(isWorkoutTemplate)
    && (value.activeCycle === null || isTrainingCycle(value.activeCycle))
    && Array.isArray(value.cycles)
    && value.cycles.every(isTrainingCycle)
    && (value.activeCycleId === null || typeof value.activeCycleId === "string")
    && Array.isArray(value.history)
    && value.history.every(isWorkoutHistoryEntry)
    && Array.isArray(value.sessions)
    && value.sessions.every(isWorkoutSession)
    && isRecord(value.workoutOutcomes)
    && Object.values(value.workoutOutcomes).every(isWorkoutOutcome);
}

function isSportPlannerStateV2(value: unknown): value is SportPlannerStateV2 {
  return isRecord(value)
    && value.version === 2
    && Array.isArray(value.templates)
    && value.templates.every(isWorkoutTemplate)
    && (value.activeCycle === null || isTrainingCycle(value.activeCycle))
    && Array.isArray(value.history)
    && value.history.every(isWorkoutHistoryEntry);
}

function isSportPlannerStateV1(value: unknown): value is SportPlannerStateV1 {
  return isRecord(value)
    && value.version === 1
    && Array.isArray(value.templates)
    && value.templates.every(isWorkoutTemplate)
    && (value.activeCycle === null || isTrainingCycle(value.activeCycle));
}

function isLegacySportState(value: unknown): value is LegacySportState {
  return isRecord(value)
    && Array.isArray(value.sessions)
    && value.sessions.every((session) => isRecord(session) && typeof session.id === "string" && typeof session.date === "string")
    && Array.isArray(value.plans)
    && value.plans.every((plan) => isRecord(plan) && typeof plan.id === "string" && typeof plan.name === "string")
    && Array.isArray(value.templates)
    && value.templates.every(isWorkoutTemplate);
}

export function createPlannerId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeCycleStart(dateKey: string) {
  return startOfWeekKey(fromDateKey(dateKey));
}

export function cycleWorkoutDate(cycle: TrainingCycle, workout: Pick<CycleWorkout, "week" | "day">) {
  return cycleWeekDate(cycle, workout.week, workout.day);
}

function isSportPlannerStateV3(value: unknown): value is SportPlannerStateV3 {
  return isRecord(value)
    && value.version === 3
    && Array.isArray(value.templates)
    && value.templates.every(isWorkoutTemplate)
    && (value.activeCycle === null || isTrainingCycle(value.activeCycle))
    && Array.isArray(value.history)
    && value.history.every(isWorkoutHistoryEntry)
    && Array.isArray(value.sessions)
    && value.sessions.every(isWorkoutSession)
    && isRecord(value.workoutOutcomes)
    && Object.values(value.workoutOutcomes).every(isWorkoutOutcome)
    && (value.exercises === undefined || Array.isArray(value.exercises))
    && (value.scheduledWorkouts === undefined || Array.isArray(value.scheduledWorkouts))
    && (value.executions === undefined || Array.isArray(value.executions));
}

export function cycleDateRange(cycle: TrainingCycle) {
  return {
    start: cycle.startDate,
    end: cycle.endDate === null ? null : addDays(cycle.startDate, cycle.weeks * 7 - 1),
  };
}

export function isIndefiniteCycle(cycle: TrainingCycle) {
  return cycle.endDate === null;
}

export function cycleWeekCount(cycle: TrainingCycle) {
  return isIndefiniteCycle(cycle) ? 1 : cycle.weeks;
}

export function cycleDayIndex(cycle: TrainingCycle, dateKey: string) {
  const difference = calendarDaysBetween(cycle.startDate, dateKey) ?? 0;
  return ((difference % 7) + 7) % 7;
}

export function isWorkoutScheduledOnDate(
  cycle: TrainingCycle,
  workout: Pick<CycleWorkout, "week" | "day">,
  dateKey: string,
) {
  if (dateKey < cycle.startDate) return false;
  if (cycle.endDate !== null && dateKey > cycleDateRange(cycle).end!) return false;
  return isIndefiniteCycle(cycle)
    ? workout.week === 1 && workout.day === cycleDayIndex(cycle, dateKey)
    : cycleWorkoutDate(cycle, workout) === dateKey;
}

export function createCycle(
  name = "Cykl treningowy",
  startDate = startOfWeekKey(),
  weeks = 12,
  endDate?: string | null,
): TrainingCycle {
  const normalizedStart = normalizeCycleStart(startDate);
  const normalizedWeeks = clampInteger(weeks, 1, 52);
  return {
    id: createPlannerId("cycle"),
    name,
    startDate: normalizedStart,
    weeks: normalizedWeeks,
    endDate: endDate === null ? null : endDate ?? addDays(normalizedStart, normalizedWeeks * 7 - 1),
    repeatWeekly: endDate === null,
    workouts: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createWorkoutFromTemplate(
  template: WorkoutTemplate,
  week: number,
  day: number,
  time = "",
  seriesId?: string,
): CycleWorkout {
  return {
    id: createPlannerId("cycle-workout"),
    week,
    day,
    title: template.name,
    discipline: template.discipline,
    durationMinutes: template.durationMinutes,
    templateId: template.id,
    seriesId,
    time: time || undefined,
    contentSnapshot: templateSections(template),
    sourceTemplateVersion: template.updatedAt ?? template.createdAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function sessionContentFromSnapshot(
  snapshot: ScheduledWorkout["contentSnapshot"],
  template: WorkoutTemplate,
  sessionId: string,
): { exercises: WorkoutExercise[]; stages?: RunningStage[] } {
  const items = snapshot.flatMap((section) => section.items).sort((left, right) => left.order - right.order);
  const exercises = items.flatMap((item, itemIndex) => {
    if (!item.exerciseId) return [];
    const source = template.exercises.find((exercise) => exercise.id === item.id || exercise.exerciseId === item.exerciseId);
    if (!source) return [];
    const parameters = item.parametersOverride;
    const templateSeries = parameters?.series ?? [];
    const setCount = templateSeries.length || parameters?.sets || source.sets.length;
    const plannedReps = parameters?.repRange
      ? Number(parameters.repRange.match(/\d+/)?.[0] ?? 0) || undefined
      : source.sets[0]?.plannedReps;
    return [{
      ...source,
      id: `${sessionId}-exercise-${itemIndex + 1}`,
      restSeconds: parameters?.restSeconds ?? source.restSeconds,
      note: item.note ?? source.note,
      sets: Array.from({ length: setCount }, (_, setIndex) => {
        const series = templateSeries[setIndex];
        const sourceSet = source.sets[setIndex] ?? source.sets[0] ?? { id: `${source.id}-set-${setIndex + 1}`, done: false };
        return {
          ...sourceSet,
          id: `${sessionId}-exercise-${itemIndex + 1}-set-${setIndex + 1}`,
          plannedReps: series?.reps ?? plannedReps,
          plannedWeight: series?.weight ?? sourceSet.plannedWeight,
          plannedSeconds: series?.durationSeconds ?? parameters?.durationSeconds ?? sourceSet.plannedSeconds,
          rir: series?.rir ?? parameters?.rir ?? sourceSet.rir,
          rpe: series?.rpe ?? sourceSet.rpe,
          tempo: series?.tempo ?? parameters?.tempo ?? sourceSet.tempo,
          actualReps: undefined,
          actualSeconds: undefined,
          actualWeight: undefined,
          done: false,
        };
      }),
    } satisfies WorkoutExercise];
  });
  const stages = items.flatMap((item, itemIndex) => {
    if (!item.stageDefinition) return [];
    const source = template.stages?.find((stage) => stage.id === item.stageDefinition?.id);
    return [{
      ...(source ?? {
        id: item.stageDefinition.id,
        label: item.stageDefinition.name,
        kind: item.stageDefinition.kind === "rest" ? "recovery" : item.stageDefinition.kind,
        target: item.stageDefinition.target ?? "",
      }),
      id: `${sessionId}-stage-${itemIndex + 1}`,
      label: item.stageDefinition.name,
      target: item.stageDefinition.target ?? source?.target ?? "",
      done: false,
    } satisfies RunningStage];
  });
  return { exercises, stages: stages.length ? stages : undefined };
}

export function createSessionFromCycleWorkout(
  cycle: TrainingCycle,
  workout: CycleWorkout,
  template?: WorkoutTemplate,
  status: WorkoutSession["status"] = "in_progress",
): WorkoutSession {
  const sessionId = createPlannerId("session");
  const snapshotContent = template && workout.contentSnapshot
    ? sessionContentFromSnapshot(workout.contentSnapshot, template, sessionId)
    : { exercises: template ? cloneExercises(template.exercises, sessionId) : [], stages: template?.stages?.map((stage, index) => ({ ...stage, id: `${sessionId}-stage-${index + 1}`, done: status === "completed" })) };
  return {
    id: sessionId,
    cycleWorkoutId: workout.id,
    title: workout.title,
    discipline: workout.discipline,
    date: cycleWorkoutDate(cycle, workout),
    time: workout.time,
    plannedDurationMinutes: workout.durationMinutes,
    durationMinutes: workout.durationMinutes,
    status,
    planId: cycle.id,
    templateId: workout.templateId,
    note: workout.note,
    exercises: snapshotContent.exercises,
    stages: snapshotContent.stages?.map((stage) => ({ ...stage, done: status === "completed" })),
    startedAt: status === "in_progress" ? Date.now() : undefined,
    completedAt: status === "completed" || status === "incomplete" ? Date.now() : undefined,
  };
}

export function historyEntryFromSession(session: WorkoutSession): WorkoutHistoryEntry | null {
  if (session.status !== "completed" && session.status !== "incomplete" && session.status !== "missed") return null;
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  const stages = session.stages ?? [];
  const usesStages = stages.length > 0;
  const completedUnits = usesStages
    ? stages.filter((stage) => stage.done).length
    : sets.filter((set) => set.done).length;
  const totalUnits = usesStages ? stages.length : sets.length;
  const volumeKg = sets
    .filter((set) => set.done)
    .reduce((sum, set) => (
      sum
      + (set.actualWeight ?? set.plannedWeight ?? 0)
      * (set.actualReps ?? set.plannedReps ?? 0)
    ), 0);
  return {
    id: session.id,
    title: session.title,
    discipline: session.discipline,
    date: session.date,
    plannedDurationMinutes: session.plannedDurationMinutes ?? session.durationMinutes,
    durationMinutes: session.durationMinutes,
    status: session.status,
    templateId: session.templateId,
    completedUnits: totalUnits ? completedUnits : undefined,
    totalUnits: totalUnits || undefined,
    unitKind: totalUnits ? (usesStages ? "stages" : "sets") : undefined,
    volumeKg: volumeKg > 0 ? Math.round(volumeKg) : undefined,
    distanceKm: session.metrics?.distanceKm,
    averagePace: session.metrics?.averagePace,
    averageHeartRate: session.metrics?.averageHeartRate,
    rpe: session.metrics?.rpe,
    pain: session.metrics?.pain,
  };
}

function seedDefaultCycle(templates: WorkoutTemplate[]) {
  const cycle = createCycle("Cykl 12 tygodni", startOfWeekKey(), 12);
  const preferred = [
    { id: "tpl-upper-a", day: 0 },
    { id: "tpl-easy-run", day: 2 },
    { id: "tpl-lower-a", day: 4 },
  ];
  const assignments = preferred
    .map((item) => ({ template: templates.find((template) => template.id === item.id), day: item.day }))
    .filter((item): item is { template: WorkoutTemplate; day: number } => Boolean(item.template));
  if (!assignments.length && templates[0]) assignments.push({ template: templates[0], day: 0 });

  cycle.workouts = Array.from({ length: cycle.weeks }, (_, index) => index + 1)
    .flatMap((week) => assignments.map(({ template, day }) => createWorkoutFromTemplate(
      template,
      week,
      day,
      "",
      `seed-series-${template.id}-${day}`,
    )));
  return cycle;
}

function historyFromSessions(sessions: WorkoutSession[]): WorkoutHistoryEntry[] {
  return sessions
    .map(historyEntryFromSession)
    .filter((entry): entry is WorkoutHistoryEntry => Boolean(entry))
    .sort((left, right) => right.date.localeCompare(left.date));
}

function templateSnapshot(template: WorkoutTemplate | undefined) {
  return template ? templateSections(template) : [];
}

function canonicalScheduledWorkouts(state: SportPlannerState): ScheduledWorkout[] {
  const templates = new Map(state.templates.map((template) => [template.id, template]));
  const existing = new Map((state.scheduledWorkouts ?? []).map((scheduled) => [scheduled.id, scheduled]));
  const outcomes = state.workoutOutcomes;
  const cycles = state.cycles.length ? state.cycles : state.activeCycle ? [state.activeCycle] : [];
  return cycles.flatMap((cycle) => cycle.workouts.map((workout) => {
    const outcome = outcomes[workout.id];
    const persisted = existing.get(workout.id);
    const template = workout.templateId ? templates.get(workout.templateId) : undefined;
    return {
      id: workout.id,
      planId: cycle.id,
      templateId: workout.templateId,
      date: cycleWorkoutDate(cycle, workout),
      scheduledTime: workout.time,
      name: workout.title,
      sportCategory: workout.discipline,
      plannedDuration: workout.durationMinutes,
      status: workout.status ?? persisted?.status
        ?? (outcome?.status === "completed" ? "completed"
          : outcome?.status === "incomplete" ? "started"
            : outcome?.status === "missed" ? "skipped" : "scheduled"),
      contentSnapshot: workout.contentSnapshot ?? persisted?.contentSnapshot ?? templateSnapshot(template),
      sourceTemplateVersion: workout.sourceTemplateVersion ?? persisted?.sourceTemplateVersion ?? template?.updatedAt ?? template?.createdAt,
      notes: workout.note ?? persisted?.notes,
      createdAt: workout.createdAt ?? persisted?.createdAt ?? new Date().toISOString(),
      updatedAt: workout.updatedAt ?? persisted?.updatedAt ?? cycle.updatedAt,
    } satisfies ScheduledWorkout;
  }));
}

function canonicalExecutions(state: SportPlannerState): WorkoutExecution[] {
  if (state.executions?.length) return state.executions;
  const histories = new Map(state.history.map((entry) => [entry.id, entry]));
  return state.sessions
    .filter((session) => Boolean(session.cycleWorkoutId) && (session.status === "completed" || session.status === "incomplete"))
    .map((session) => {
      const history = histories.get(session.id);
      const completedItems = session.exercises.map((exercise) => ({
        scheduledItemId: exercise.id,
        exerciseId: exercise.exerciseId,
        sets: exercise.sets,
        done: exercise.sets.some((set) => set.done),
        note: exercise.note,
      }));
      return {
        scheduledWorkoutId: session.cycleWorkoutId!,
        startedAt: session.startedAt ? new Date(session.startedAt).toISOString() : undefined,
        finishedAt: session.completedAt ? new Date(session.completedAt).toISOString() : undefined,
        actualDuration: session.durationMinutes,
        completedItems,
        resultSummary: {
          completedSets: history?.completedUnits,
          volumeKg: history?.volumeKg,
          distanceKm: history?.distanceKm,
          averagePace: history?.averagePace,
        },
        effortRating: session.metrics?.rpe,
        wellbeingRating: undefined,
        notes: session.note,
      } satisfies WorkoutExecution;
    });
}

function canonicalExercises(state: SportPlannerState): Exercise[] {
  return state.exercises?.length ? state.exercises : createInitialExercises();
}

function enrichPlannerState(state: SportPlannerState): SportPlannerState {
  const cycle = state.activeCycle;
  const sessions = state.sessions.map((session) => {
    if (session.plannedDurationMinutes) return session;
    const planned = cycle?.workouts.find((workout) => workout.id === session.cycleWorkoutId)?.durationMinutes;
    return planned ? { ...session, plannedDurationMinutes: planned } : session;
  });
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const history = state.history.map((entry) => {
    const session = sessionById.get(entry.id);
    const derived = session ? historyEntryFromSession(session) : null;
    return derived
      ? { ...entry, ...derived }
      : { ...entry, plannedDurationMinutes: entry.plannedDurationMinutes ?? entry.durationMinutes };
  });
  const persistedScheduled = new Map((state.scheduledWorkouts ?? []).map((scheduled) => [scheduled.id, scheduled]));
  const templates = new Map(state.templates.map((template) => [template.id, template]));
  const sourceCycles = state.cycles.length ? state.cycles : state.activeCycle ? [state.activeCycle] : [];
  const cycles = sourceCycles.map((currentCycle) => ({
    ...currentCycle,
    workouts: currentCycle.workouts.map((workout) => {
      const template = workout.templateId ? templates.get(workout.templateId) : undefined;
      const persisted = persistedScheduled.get(workout.id);
      return {
        ...workout,
        contentSnapshot: workout.contentSnapshot ?? persisted?.contentSnapshot ?? templateSnapshot(template),
        sourceTemplateVersion: workout.sourceTemplateVersion ?? persisted?.sourceTemplateVersion ?? template?.updatedAt ?? template?.createdAt,
        createdAt: workout.createdAt ?? persisted?.createdAt ?? new Date().toISOString(),
        updatedAt: workout.updatedAt ?? persisted?.updatedAt ?? currentCycle.updatedAt,
      };
    }),
  }));
  const activeCycle = state.activeCycle
    ? cycles.find((currentCycle) => currentCycle.id === state.activeCycle?.id) ?? state.activeCycle
    : null;
  return {
    ...state,
    version: 5,
    storageSchemaVersion: 5,
    activeCycle,
    cycles,
    sessions,
    history,
    exercises: canonicalExercises(state),
    scheduledWorkouts: canonicalScheduledWorkouts({ ...state, activeCycle, cycles, sessions, history }),
    executions: canonicalExecutions({ ...state, sessions, history }),
  };
}

function lastCompletedOccurrenceDate(cycle: TrainingCycle, workout: CycleWorkout, today: string) {
  const daysSinceScheduled = (cycleDayIndex(cycle, today) - workout.day + 7) % 7 || 7;
  return addDays(today, -daysSinceScheduled);
}

/**
 * A planned occurrence is only considered missed once its calendar day has
 * ended. Explicitly completed/incomplete sessions and sessions still in
 * progress are left untouched so recorded work is never silently discarded.
 */
export function reconcilePastWorkoutOutcomes(
  state: SportPlannerState,
  today = toDateKey(new Date()),
): SportPlannerState {
  const cycle = state.activeCycle;
  if (!cycle) return state;

  const sessions = [...state.sessions];
  const outcomes = { ...state.workoutOutcomes };
  let history = [...state.history];
  let changed = false;
  const templates = new Map(state.templates.map((template) => [template.id, template]));

  const markMissed = (workout: CycleWorkout, date: string) => {
    const outcome = outcomes[workout.id];
    const sessionForOccurrence = sessions.find((session) => (
      session.cycleWorkoutId === workout.id && session.date === date
    ));
    const outcomeForOccurrence = isIndefiniteCycle(cycle)
      ? outcome?.updatedAt.slice(0, 10) === date
      : Boolean(outcome);
    if (outcomeForOccurrence || sessionForOccurrence) return;

    const sessionBase = createSessionFromCycleWorkout(
      cycle,
      workout,
      workout.templateId ? templates.get(workout.templateId) : undefined,
      "missed",
    );
    const session = { ...sessionBase, date };
    const historyEntry = historyEntryFromSession(session);
    sessions.push(session);
    if (historyEntry) history = upsertHistoryEntry(history, historyEntry);
    outcomes[workout.id] = {
      status: "missed",
      sessionId: session.id,
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  };

  if (isIndefiniteCycle(cycle)) {
    cycle.workouts
      .filter((workout) => workout.week === 1)
      .forEach((workout) => {
        const occurrenceDate = lastCompletedOccurrenceDate(cycle, workout, today);
        if (occurrenceDate >= cycle.startDate) markMissed(workout, occurrenceDate);
      });
  } else {
    cycle.workouts
      .filter((workout) => cycleWorkoutDate(cycle, workout) < today)
      .forEach((workout) => markMissed(workout, cycleWorkoutDate(cycle, workout)));
  }

  return changed ? { ...state, sessions, history, workoutOutcomes: outcomes } : state;
}

function upsertHistoryEntry(history: WorkoutHistoryEntry[], entry: WorkoutHistoryEntry) {
  return [entry, ...history.filter((item) => item.id !== entry.id)]
    .sort((left, right) => right.date.localeCompare(left.date));
}

function withMigratedSeries(cycle: TrainingCycle | null) {
  if (!cycle) return null;
  return {
    ...cycle,
    workouts: cycle.workouts.map((workout) => ({
      ...workout,
      seriesId: workout.seriesId ?? (workout.templateId
        ? `migrated-series-${workout.templateId}-${workout.day}`
        : undefined),
    })),
  };
}

function migrateLegacyState(legacy: LegacySportState): SportPlannerState {
  const templates = legacy.templates.length ? legacy.templates : INITIAL_TEMPLATES;
  const activePlan = legacy.plans.find((plan) => plan.active) ?? legacy.plans[0];
  const weeks = clampInteger(activePlan?.weeks ?? 12, 1, 52);
  const startDate = startOfWeekKey();
  const cycle = createCycle(activePlan?.name ?? "Bieżący cykl", startDate, weeks);
  const cycleEnd = addDays(startDate, weeks * 7 - 1);

  cycle.workouts = legacy.sessions
    .filter((session) => session.date >= startDate && session.date <= cycleEnd && session.status !== "completed")
    .map((session) => {
      const difference = calendarDaysBetween(startDate, session.date) ?? 0;
      return {
        id: session.id,
        week: Math.floor(difference / 7) + 1,
        day: ((difference % 7) + 7) % 7,
        title: session.title,
        discipline: session.discipline,
        durationMinutes: session.durationMinutes,
        templateId: session.templateId,
        seriesId: session.templateId ? `legacy-series-${session.templateId}-${((difference % 7) + 7) % 7}` : undefined,
        time: session.time,
        note: session.note,
      };
    })
    .filter((workout) => workout.week >= 1 && workout.week <= weeks);

  const activeCycle = cycle.workouts.length ? cycle : seedDefaultCycle(templates);
  return {
    version: 5,
    storageSchemaVersion: 5,
    templates,
    activeCycle,
    cycles: [activeCycle],
    activeCycleId: activeCycle.id,
    history: historyFromSessions(legacy.sessions),
    sessions: legacy.sessions.filter((session) => session.status !== "scheduled"),
    workoutOutcomes: {},
    exercises: createInitialExercises(),
    scheduledWorkouts: canonicalScheduledWorkouts({
      version: 5, storageSchemaVersion: 5, templates, activeCycle, cycles: [activeCycle], activeCycleId: activeCycle.id,
      history: historyFromSessions(legacy.sessions), sessions: legacy.sessions.filter((session) => session.status !== "scheduled"), workoutOutcomes: {},
    }),
    executions: [],
  };
}

export function createDefaultSportPlannerState(): SportPlannerState {
  const templates = INITIAL_TEMPLATES.map((template) => ({
    ...template,
    exercises: cloneExercises(template.exercises, `template-${template.id}`),
    stages: template.stages?.map((stage) => ({ ...stage })),
  }));
  const initialSessions = createInitialSessions();
  const activeCycle = seedDefaultCycle(templates);
  return {
    version: 5,
    storageSchemaVersion: 5,
    templates,
    activeCycle,
    cycles: [activeCycle],
    activeCycleId: activeCycle.id,
    history: historyFromSessions(initialSessions),
    sessions: initialSessions.filter((session) => session.status !== "scheduled"),
    workoutOutcomes: {},
    exercises: createInitialExercises(),
    scheduledWorkouts: [],
    executions: [],
  };
}

function loadLegacySportFallback(): SportPlannerState {
  if (typeof window === "undefined") return createDefaultSportPlannerState();
  try {
    const legacyStored = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyStored) {
      const legacy: unknown = JSON.parse(legacyStored);
      if (isLegacySportState(legacy)) return migrateLegacyState(legacy);
    }
  } catch {
    // A malformed local draft falls back to a safe editable example.
  }
  return createDefaultSportPlannerState();
}

function migratePlannerState(value: unknown): SportPlannerState | null {
  if (isSportPlannerStateV3(value)) {
    const activeCycle = withMigratedSeries(value.activeCycle);
    return {
      version: 5,
      storageSchemaVersion: 5,
      templates: value.templates,
      activeCycle,
      cycles: activeCycle ? [activeCycle] : [],
      activeCycleId: activeCycle?.id ?? null,
      history: value.history,
      sessions: value.sessions,
      workoutOutcomes: value.workoutOutcomes,
      exercises: createInitialExercises(),
      scheduledWorkouts: [],
      executions: [],
    };
  }
  if (isSportPlannerStateV2(value)) {
    const legacy: unknown = (() => {
      try {
        const legacyStored = typeof window !== "undefined" ? window.localStorage.getItem(LEGACY_STORAGE_KEY) : null;
        return legacyStored ? JSON.parse(legacyStored) : null;
      } catch {
        return null;
      }
    })();
    return {
      version: 5,
      storageSchemaVersion: 5,
      templates: value.templates,
      activeCycle: value.activeCycle,
      cycles: value.activeCycle ? [value.activeCycle] : [],
      activeCycleId: value.activeCycle?.id ?? null,
      history: value.history,
      sessions: isLegacySportState(legacy)
        ? legacy.sessions.filter((session) => session.status !== "scheduled")
        : [],
      workoutOutcomes: {},
      exercises: createInitialExercises(),
      scheduledWorkouts: [],
      executions: [],
    };
  }
  if (isSportPlannerStateV1(value)) {
    let history = historyFromSessions(createInitialSessions());
    let sessions: WorkoutSession[] = [];
    try {
      const legacyStored = typeof window !== "undefined" ? window.localStorage.getItem(LEGACY_STORAGE_KEY) : null;
      const legacy: unknown = legacyStored ? JSON.parse(legacyStored) : null;
      if (isLegacySportState(legacy)) {
        history = historyFromSessions(legacy.sessions);
        sessions = legacy.sessions.filter((session) => session.status !== "scheduled");
      }
    } catch {
      // Optional legacy history is ignored when the primary planner can be migrated.
    }
    const activeCycle = withMigratedSeries(value.activeCycle);
    return {
      version: 5,
      storageSchemaVersion: 5,
      templates: value.templates,
      activeCycle,
      cycles: activeCycle ? [activeCycle] : [],
      activeCycleId: activeCycle?.id ?? null,
      history,
      sessions,
      workoutOutcomes: {},
      exercises: createInitialExercises(),
      scheduledWorkouts: [],
      executions: [],
    };
  }
  return null;
}

export function loadSportPlannerStateResult(): LocalLoadResult<SportPlannerState> {
  const result = readLocalWorkspace({
    key: SPORT_PLANNER_STORAGE_KEY,
    fallback: loadLegacySportFallback,
    validate: isSportPlannerState,
    migrate: migratePlannerState,
  });
  return { ...result, workspace: reconcilePastWorkoutOutcomes(enrichPlannerState(result.workspace)) };
}

export function loadSportPlannerState(): SportPlannerState {
  const result = loadSportPlannerStateResult();
  const state = result.workspace;
  let needsPersist = result.status === "migrated";
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(SPORT_PLANNER_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        const record = parsed as { storageSchemaVersion?: unknown; version?: unknown };
        needsPersist = needsPersist || record.storageSchemaVersion !== 5 || record.version !== 5;
      }
    } catch {
      // readLocalWorkspace already retained malformed payloads for recovery.
    }
  }
  if (typeof window !== "undefined" && needsPersist) {
    // Persist the normalized v5 envelope after the first successful read.
    // The repository keeps its recovery copy before replacing an old payload.
    saveSportPlannerState(state);
  }
  return state;
}

export function withActiveCycle(state: SportPlannerState, cycle: TrainingCycle | null): SportPlannerState {
  if (!cycle) return { ...state, activeCycle: null, activeCycleId: null };
  const cycles = state.cycles.some((item) => item.id === cycle.id)
    ? state.cycles.map((item) => item.id === cycle.id ? cycle : item)
    : [cycle, ...state.cycles];
  return { ...state, activeCycle: cycle, activeCycleId: cycle.id, cycles };
}

export function saveSportPlannerState(state: SportPlannerState) {
  return writeLocalWorkspace(SPORT_PLANNER_STORAGE_KEY, state);
}

export function cycleWeekDate(cycle: TrainingCycle, week: number, day: number) {
  return addDays(cycle.startDate, (week - 1) * 7 + day);
}

export function todayCycleWeek(cycle: TrainingCycle) {
  if (isIndefiniteCycle(cycle)) return 1;
  const difference = calendarDaysBetween(cycle.startDate, toDateKey(new Date())) ?? 0;
  return clampInteger(Math.floor(difference / 7) + 1, 1, cycle.weeks);
}
