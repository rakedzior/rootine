import { calendarDaysBetween } from "../../app/data/localDate";
import {
  SPORT_PLANNER_STORAGE_KEY,
  createPlannerId,
  createSessionFromCycleWorkout,
  cycleWorkoutDate,
  historyEntryFromSession,
  isIndefiniteCycle,
  isWorkoutScheduledOnDate,
  loadSportPlannerState,
  saveSportPlannerState,
  withActiveCycle,
  type CycleWorkout,
  type SportPlannerState,
  type TrainingCycle,
  type WorkoutHistoryEntry,
  type WorkoutOutcome,
} from "../../app/sport/plannerModel";
import type { WorkoutSession } from "../../app/sport/model";
import { domainFailure } from "../shared";
import { commitDomainMutation } from "../shared/mutation";
import type { DomainMutationResult } from "../shared/result";
import { createWorkspaceUndo } from "../shared/workspaceUndo";
import { createWorkoutSchema, rescheduleWorkoutSchema, workoutOccurrenceSchema } from "./sportSchemas";

type WorkoutCompletionSlice = {
  outcome: WorkoutOutcome | null;
  session: WorkoutSession | null;
  history: WorkoutHistoryEntry | null;
};

function findCycle(state: SportPlannerState, cycleId: string) {
  return state.cycles.find((cycle) => cycle.id === cycleId)
    ?? (state.activeCycle?.id === cycleId ? state.activeCycle : null);
}

function replaceCycle(state: SportPlannerState, cycle: TrainingCycle) {
  return state.activeCycleId === cycle.id ? withActiveCycle(state, cycle) : {
    ...state,
    cycles: state.cycles.map((candidate) => candidate.id === cycle.id ? cycle : candidate),
  };
}

function completionSlice(state: SportPlannerState, workoutId: string): WorkoutCompletionSlice {
  const outcome = state.workoutOutcomes[workoutId] ?? null;
  const sessionId = outcome?.sessionId;
  return {
    outcome,
    session: sessionId ? state.sessions.find((session) => session.id === sessionId) ?? null : null,
    history: sessionId ? state.history.find((entry) => entry.id === sessionId) ?? null : null,
  };
}

function applyCompletionSlice(state: SportPlannerState, workoutId: string, value: WorkoutCompletionSlice | null) {
  const previous = completionSlice(state, workoutId);
  const sessions = state.sessions.filter((session) => session.id !== previous.session?.id);
  const history = state.history.filter((entry) => entry.id !== previous.history?.id);
  const workoutOutcomes = { ...state.workoutOutcomes };
  delete workoutOutcomes[workoutId];
  if (value?.outcome) workoutOutcomes[workoutId] = value.outcome;
  if (value?.session) sessions.push(value.session);
  if (value?.history) history.unshift(value.history);
  return { ...state, sessions, history, workoutOutcomes };
}

export async function completeWorkout(input: unknown): Promise<DomainMutationResult<WorkoutCompletionSlice>> {
  const parsed = workoutOccurrenceSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy trening.");
  const state = loadSportPlannerState();
  const cycle = state.activeCycle;
  const workout = cycle?.workouts.find((candidate) => candidate.id === parsed.data.workoutId);
  if (!cycle || !workout || !isWorkoutScheduledOnDate(cycle, workout, parsed.data.date)) {
    return domainFailure("NOT_FOUND", "Nie znaleziono tego wystąpienia treningu.");
  }
  if (isIndefiniteCycle(cycle)) {
    return domainFailure("CONFLICT", "Obecny model sportu nie zapisuje wyników osobno dla wystąpień cyklu bezterminowego.");
  }
  const before = completionSlice(state, workout.id);
  if (before.outcome?.status === "completed") return domainFailure("CONFLICT", "Trening jest już wykonany.");
  const template = state.templates.find((candidate) => candidate.id === workout.templateId);
  const session = createSessionFromCycleWorkout(cycle, workout, template, "completed");
  const history = historyEntryFromSession(session);
  if (!history) return domainFailure("VALIDATION", "Nie udało się utworzyć historii treningu.");
  const outcome: WorkoutOutcome = { status: "completed", sessionId: session.id, updatedAt: new Date().toISOString() };
  const after: WorkoutCompletionSlice = { outcome, session, history };
  const next = applyCompletionSlice(state, workout.id, after);
  const compensation = createWorkspaceUndo({
    storageKey: SPORT_PLANNER_STORAGE_KEY, read: loadSportPlannerState, save: saveSportPlannerState,
    select: (current) => completionSlice(current, workout.id),
    apply: (current, value) => applyCompletionSlice(current, workout.id, value),
    expected: after, restore: before,
    message: "Cofnięto wykonanie treningu.",
  });
  return commitDomainMutation({
    entityId: workout.id, storageKey: SPORT_PLANNER_STORAGE_KEY,
    event: { type: "sport.workout_completed", domain: "sport", entityId: workout.id, payload: { workoutId: workout.id, date: parsed.data.date } },
    save: () => saveSportPlannerState(next), read: loadSportPlannerState,
    verify: (current) => current.workoutOutcomes[workout.id]?.status === "completed" && current.workoutOutcomes[workout.id]?.sessionId === session.id,
    selectSnapshot: (current) => completionSlice(current, workout.id),
    message: "Oznaczono trening jako wykonany.", compensation,
  });
}

function workoutPosition(cycle: TrainingCycle, date: string) {
  const difference = calendarDaysBetween(cycle.startDate, date);
  if (difference === null || difference < 0) return null;
  const week = Math.floor(difference / 7) + 1;
  const day = difference % 7;
  if (!cycle.repeatWeekly && week > cycle.weeks) return null;
  return { week: cycle.repeatWeekly ? ((week - 1) % cycle.weeks) + 1 : week, day };
}

function workoutUndo(cycleId: string, before: CycleWorkout | null, after: CycleWorkout | null, id: string, message: string) {
  return createWorkspaceUndo({
    storageKey: SPORT_PLANNER_STORAGE_KEY, read: loadSportPlannerState, save: saveSportPlannerState,
    select: (state) => findCycle(state, cycleId)?.workouts.find((workout) => workout.id === id) ?? null,
    apply: (state, value) => {
      const cycle = findCycle(state, cycleId);
      if (!cycle) return state;
      const workouts = value === null
        ? cycle.workouts.filter((workout) => workout.id !== id)
        : cycle.workouts.some((workout) => workout.id === id)
          ? cycle.workouts.map((workout) => workout.id === id ? value : workout)
          : [...cycle.workouts, value];
      return replaceCycle(state, { ...cycle, workouts, updatedAt: new Date().toISOString() });
    },
    expected: after, restore: before, message,
  });
}

export async function rescheduleWorkout(input: unknown): Promise<DomainMutationResult<CycleWorkout>> {
  const parsed = rescheduleWorkoutSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy termin.");
  const state = loadSportPlannerState();
  const cycle = state.activeCycle;
  const before = cycle?.workouts.find((workout) => workout.id === parsed.data.workoutId);
  if (!cycle || !before) return domainFailure("NOT_FOUND", "Trening nie istnieje w aktywnym cyklu.");
  if (isIndefiniteCycle(cycle)) {
    return domainFailure("CONFLICT", "Pojedynczego wystąpienia cyklu bezterminowego nie można bezpiecznie przenieść w obecnym modelu danych.");
  }
  const position = workoutPosition(cycle, parsed.data.date);
  if (!position) return domainFailure("VALIDATION", "Data jest poza zakresem cyklu.");
  const previousDate = cycleWorkoutDate(cycle, before);
  if (previousDate === parsed.data.date) return domainFailure("CONFLICT", "Trening jest już zaplanowany na ten dzień.");
  const after = { ...before, ...position };
  const nextCycle = { ...cycle, workouts: cycle.workouts.map((workout) => workout.id === before.id ? after : workout), updatedAt: new Date().toISOString() };
  const next = replaceCycle(state, nextCycle);
  return commitDomainMutation({
    entityId: before.id, storageKey: SPORT_PLANNER_STORAGE_KEY,
    event: { type: "sport.workout_rescheduled", domain: "sport", entityId: before.id, payload: { previousDate, nextDate: parsed.data.date } },
    save: () => saveSportPlannerState(next), read: loadSportPlannerState,
    verify: (current) => {
      const saved = findCycle(current, cycle.id)?.workouts.find((workout) => workout.id === before.id);
      return Boolean(saved && saved.week === after.week && saved.day === after.day);
    },
    selectSnapshot: (current) => findCycle(current, cycle.id)?.workouts.find((workout) => workout.id === before.id) ?? after,
    message: "Przeniesiono trening.", compensation: workoutUndo(cycle.id, before, after, before.id, "Przywrócono poprzedni termin treningu."),
  });
}

export async function createWorkout(input: unknown): Promise<DomainMutationResult<CycleWorkout>> {
  const parsed = createWorkoutSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy trening.");
  const state = loadSportPlannerState();
  const cycle = findCycle(state, parsed.data.cycleId);
  if (!cycle) return domainFailure("NOT_FOUND", "Cykl treningowy nie istnieje.");
  if (isIndefiniteCycle(cycle)) {
    return domainFailure("CONFLICT", "Dodanie pojedynczego treningu do cyklu bezterminowego wymaga jawnej decyzji o serii.");
  }
  const position = workoutPosition(cycle, parsed.data.date);
  if (!position) return domainFailure("VALIDATION", "Data jest poza zakresem cyklu.");
  const workout: CycleWorkout = {
    id: createPlannerId("cycle-workout"), ...position, title: parsed.data.title,
    discipline: parsed.data.discipline, durationMinutes: parsed.data.durationMinutes,
    time: parsed.data.time, note: parsed.data.note,
  };
  const nextCycle = { ...cycle, workouts: [...cycle.workouts, workout], updatedAt: new Date().toISOString() };
  const next = replaceCycle(state, nextCycle);
  return commitDomainMutation({
    entityId: workout.id, storageKey: SPORT_PLANNER_STORAGE_KEY,
    event: { type: "sport.workout_created", domain: "sport", entityId: workout.id, payload: { title: workout.title, date: parsed.data.date } },
    save: () => saveSportPlannerState(next), read: loadSportPlannerState,
    verify: (current) => Boolean(findCycle(current, cycle.id)?.workouts.some((candidate) => candidate.id === workout.id)),
    selectSnapshot: (current) => findCycle(current, cycle.id)?.workouts.find((candidate) => candidate.id === workout.id) ?? workout,
    message: "Utworzono trening.", compensation: workoutUndo(cycle.id, null, workout, workout.id, "Cofnięto utworzenie treningu."),
  });
}
