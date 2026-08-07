import { describe, expect, it } from "vitest";
import {
  createCycle,
  createSessionFromCycleWorkout,
  createWorkoutFromTemplate,
  loadSportPlannerState,
  prepareWorkoutReplan,
  reconcilePastWorkoutOutcomes,
  restoreWorkoutReplanArtifacts,
  SPORT_PLANNER_STORAGE_KEY,
  workoutOutcomeForDate,
  workoutReplanBlockReason,
  type SportPlannerState,
} from "./plannerModel";
import { INITIAL_TEMPLATES, createInitialExercises, templateSections } from "./model";

function makeState() {
  const template = INITIAL_TEMPLATES.find((item) => item.id === "tpl-lower-a")!;
  const cycle = createCycle("Test", "2026-07-27", 1);
  const workout = createWorkoutFromTemplate(template, 1, 0);
  cycle.workouts = [workout];
  const state: SportPlannerState = {
    version: 4,
    templates: [template],
    activeCycle: cycle,
    cycles: [cycle],
    activeCycleId: cycle.id,
    history: [],
    sessions: [],
    workoutOutcomes: {},
  };
  return { state, cycle, workout, template };
}

describe("reconcilePastWorkoutOutcomes", () => {
  it("marks an unresolved past occurrence as missed", () => {
    const { state } = makeState();

    const next = reconcilePastWorkoutOutcomes(state, "2026-07-28");

    expect(next.workoutOutcomes[state.activeCycle!.workouts[0].id].status).toBe("missed");
    expect(next.history).toHaveLength(1);
    expect(next.history[0].date).toBe("2026-07-27");
  });

  it("does not replace an explicitly incomplete session", () => {
    const { state, cycle, workout, template } = makeState();
    const session = createSessionFromCycleWorkout(cycle, workout, template, "incomplete");
    const withIncomplete = {
      ...state,
      sessions: [session],
      history: [{
        id: session.id,
        title: session.title,
        discipline: session.discipline,
        date: session.date,
        durationMinutes: session.durationMinutes,
        status: "incomplete" as const,
      }],
      workoutOutcomes: {
        [workout.id]: {
          status: "incomplete" as const,
          sessionId: session.id,
          updatedAt: "2026-07-27T19:00:00.000Z",
        },
      },
    };

    const next = reconcilePastWorkoutOutcomes(withIncomplete, "2026-07-28");

    expect(next).toBe(withIncomplete);
    expect(next.workoutOutcomes[workout.id].status).toBe("incomplete");
  });
});

describe("safe workout replanning", () => {
  it("allows unresolved and missed workouts but blocks active and recorded executions", () => {
    const { workout } = makeState();

    expect(workoutReplanBlockReason(undefined)).toBeNull();
    expect(workoutReplanBlockReason({ status: "missed", updatedAt: "2026-07-27T20:00:00.000Z" })).toBeNull();
    expect(workoutReplanBlockReason(undefined, true)).toBe("active");
    expect(workoutReplanBlockReason({ status: "completed", updatedAt: "2026-07-27T20:00:00.000Z" })).toBe("completed");
    expect(workoutReplanBlockReason({ status: "incomplete", updatedAt: "2026-07-27T20:00:00.000Z" })).toBe("incomplete");
    expect(workout.id).toBeTruthy();
  });

  it("removes a linked missed outcome, session and history entry as one transaction", () => {
    const { state, cycle, workout, template } = makeState();
    const session = createSessionFromCycleWorkout(cycle, workout, template, "missed");
    const missedState: SportPlannerState = {
      ...state,
      sessions: [session],
      history: [{
        id: session.id,
        title: session.title,
        discipline: session.discipline,
        date: session.date,
        durationMinutes: session.durationMinutes,
        status: "missed",
      }],
      workoutOutcomes: {
        [workout.id]: {
          status: "missed",
          sessionId: session.id,
          updatedAt: "2026-07-27T20:00:00.000Z",
        },
      },
    };

    const prepared = prepareWorkoutReplan(missedState, workout.id);

    expect(prepared.allowed).toBe(true);
    if (!prepared.allowed) throw new Error("Expected a movable missed workout");
    expect(prepared.state.workoutOutcomes[workout.id]).toBeUndefined();
    expect(prepared.state.sessions).toHaveLength(0);
    expect(prepared.state.history).toHaveLength(0);
    expect(prepared.removedArtifacts).toMatchObject({ workoutId: workout.id, outcome: { status: "missed" } });

    const restored = restoreWorkoutReplanArtifacts(prepared.state, prepared.removedArtifacts);
    expect(restored.workoutOutcomes[workout.id]).toEqual(missedState.workoutOutcomes[workout.id]);
    expect(restored.sessions).toEqual([session]);
    expect(restored.history).toEqual(missedState.history);
  });

  it("matches a delayed missed outcome to the linked occurrence date", () => {
    const { state, cycle, workout, template } = makeState();
    cycle.endDate = null;
    const session = {
      ...createSessionFromCycleWorkout(cycle, workout, template, "missed"),
      date: "2026-07-27",
    };
    const outcome = {
      status: "missed" as const,
      sessionId: session.id,
      updatedAt: "2026-07-28T08:00:00.000Z",
    };
    const sessions = [session];

    expect(workoutOutcomeForDate(cycle, outcome, sessions, workout.id, "2026-07-27")).toEqual(outcome);
    expect(workoutOutcomeForDate(cycle, outcome, sessions, workout.id, "2026-07-28")).toBeUndefined();
    expect(state.version).toBe(4);
  });

  it("does not mutate state when an active or completed workout is moved", () => {
    const { state, cycle, workout, template } = makeState();
    const activeSession = createSessionFromCycleWorkout(cycle, workout, template, "in_progress");
    const activeState = { ...state, sessions: [activeSession] };
    const activeResult = prepareWorkoutReplan(activeState, workout.id, null);
    expect(activeResult).toEqual({ allowed: false, state: activeState, reason: "active" });

    const completedOutcome = {
      status: "completed" as const,
      updatedAt: "2026-07-27T20:00:00.000Z",
    };
    const completedState = { ...state, workoutOutcomes: { [workout.id]: completedOutcome } };
    const completedResult = prepareWorkoutReplan(completedState, workout.id);
    expect(completedResult).toEqual({ allowed: false, state: completedState, reason: "completed" });
  });
});

describe("Sport schema v5", () => {
  it("normalizes legacy planner data into canonical exercise and scheduled records", () => {
    const { state, workout, template } = makeState();
    localStorage.setItem(SPORT_PLANNER_STORAGE_KEY, JSON.stringify(state));

    const loaded = loadSportPlannerState();

    expect(loaded.version).toBe(5);
    expect(loaded.storageSchemaVersion).toBe(5);
    expect(loaded.exercises?.map((exercise) => exercise.id)).toEqual(createInitialExercises().map((exercise) => exercise.id));
    const scheduled = loaded.scheduledWorkouts?.find((item) => item.id === workout.id);
    expect(scheduled).toMatchObject({ id: workout.id, templateId: template.id });
    expect(scheduled?.contentSnapshot.flatMap((section) => section.items).map((item) => item.exerciseId)).toEqual(
      templateSections(template).flatMap((section) => section.items).map((item) => item.exerciseId),
    );
    expect(JSON.parse(localStorage.getItem(SPORT_PLANNER_STORAGE_KEY) ?? "{}").storageSchemaVersion).toBe(5);

    localStorage.removeItem(SPORT_PLANNER_STORAGE_KEY);
  });

  it("keeps a scheduled content snapshot when a template changes later", () => {
    const template = INITIAL_TEMPLATES.find((item) => item.id === "tpl-lower-a")!;
    const cycle = createCycle("Snapshot", "2026-07-27", 1);
    const workout = createWorkoutFromTemplate(template, 1, 0);
    const changedTemplate = {
      ...template,
      exercises: template.exercises.map((exercise, index) => index === 0
        ? { ...exercise, sets: [...exercise.sets, ...exercise.sets] }
        : exercise),
    };

    const session = createSessionFromCycleWorkout(cycle, workout, changedTemplate);

    expect(workout.contentSnapshot).toEqual(templateSections(template));
    expect(session.exercises[0]?.sets).toHaveLength(template.exercises[0]?.sets.length ?? 0);
  });
});
