import { describe, expect, it } from "vitest";
import type { AffairsWorkspace } from "./affairsWorkspace";
import {
  selectCalendarOccurrences,
  type CalendarOccurrenceSources,
} from "./calendarOccurrences";
import type { WorkspaceTask } from "./taskWorkspace";
import type { SportPlannerState } from "../sport/plannerModel";

function emptyAffairs(): AffairsWorkspace {
  return {
    version: 2,
    matters: [],
    oneTimePayments: [],
    payments: [],
    subscriptions: [],
    documents: [],
    vehicles: [],
    vehicleItems: [],
    budgets: [],
  };
}

function emptySport(): SportPlannerState {
  return {
    version: 4,
    templates: [],
    activeCycle: null,
    cycles: [],
    activeCycleId: null,
    history: [],
    sessions: [],
    workoutOutcomes: {},
  };
}

function sources(overrides: Partial<CalendarOccurrenceSources> = {}): CalendarOccurrenceSources {
  return {
    tasks: [],
    sport: emptySport(),
    affairs: emptyAffairs(),
    ...overrides,
  };
}

describe("selectCalendarOccurrences", () => {
  it("deduplicates projected commitments and preserves their canonical source navigation", () => {
    const projectedWorkTask: WorkspaceTask = {
      id: -11,
      text: "Wysłać ofertę",
      done: false,
      view: "7dni",
      calendarDate: "2026-07-30",
      source: {
        kind: "work",
        entity: "project-a/task-a",
        context: "Acme · Strona",
        href: "/praca?firma=acme&projekt=project-a",
      },
    };
    const duplicateProjection: WorkspaceTask = {
      ...projectedWorkTask,
      id: -12,
    };
    const travelTask: WorkspaceTask = {
      id: -21,
      text: "Odprawić się online",
      done: true,
      view: "dzis",
      calendarDate: "2026-07-31",
      source: {
        kind: "travel",
        entity: "trip-a/task-a",
        context: "Lizbona · Portugalia",
        href: "/podroze/trip-a?sekcja=tasks",
      },
    };

    const result = selectCalendarOccurrences(
      sources({ tasks: [projectedWorkTask, duplicateProjection, travelTask] }),
      "2026-07-28",
      "2026-08-02",
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      kind: "task",
      title: "Wysłać ofertę",
      source: {
        kind: "work",
        label: "Praca",
        context: "Acme · Strona",
        href: "/praca?firma=acme&projekt=project-a",
      },
      status: { label: "Do zrobienia", completed: false },
    });
    expect(result[1]).toMatchObject({
      kind: "task",
      source: { kind: "travel", label: "Podróże" },
      status: { label: "Wykonane", completed: true },
    });
  });

  it("does not project Affairs items unless explicitly added to Tasks", () => {
    const affairs: AffairsWorkspace = {
      ...emptyAffairs(),
      oneTimePayments: [{
        id: "invoice",
        title: "Dopłata za energię",
        category: "Rachunki",
        amount: 431.99,
        dueDate: "2026-08-12",
        paid: false,
        paidAt: "",
        note: "",
      }],
      payments: [{
        id: "rent",
        name: "Czynsz",
        category: "Mieszkanie",
        amount: 1_000,
        cadence: "monthly",
        nextDueDate: "2026-07-31",
        automatic: true,
        active: true,
        note: "",
      }],
    };

    const result = selectCalendarOccurrences(
      sources({ affairs }),
      "2026-08-01",
      "2026-09-30",
    );

    expect(result).toEqual([]);
  });

  it("does not project Sport workouts unless explicitly added to Tasks", () => {
    const sport: SportPlannerState = {
      ...emptySport(),
      activeCycle: {
        id: "cycle-a",
        name: "Budowanie bazy",
        startDate: "2026-07-27",
        weeks: 2,
        updatedAt: "2026-07-01T10:00:00.000Z",
        workouts: [{
          id: "workout-a",
          week: 1,
          day: 2,
          title: "Spokojny bieg",
          discipline: "running",
          durationMinutes: 40,
          time: "07:30",
        }],
      },
      sessions: [{
        id: "session-a",
        cycleWorkoutId: "workout-a",
        title: "Spokojny bieg",
        discipline: "running",
        date: "2026-07-29",
        time: "07:45",
        plannedDurationMinutes: 40,
        durationMinutes: 38,
        status: "completed",
        exercises: [],
      }],
      history: [{
        id: "session-a",
        title: "Spokojny bieg",
        discipline: "running",
        date: "2026-07-29",
        durationMinutes: 38,
        status: "completed",
      }],
      workoutOutcomes: {
        "workout-a": {
          status: "completed",
          sessionId: "session-a",
          updatedAt: "2026-07-29T09:00:00.000Z",
        },
      },
    };

    const result = selectCalendarOccurrences(
      sources({ sport }),
      "2026-07-29",
      "2026-07-29",
    );

    expect(result).toEqual([]);
  });

  it("returns an empty list for an invalid range", () => {
    expect(selectCalendarOccurrences(sources(), "2026-08-01", "2026-07-01")).toEqual([]);
    expect(selectCalendarOccurrences(sources(), "not-a-date", "2026-08-01")).toEqual([]);
  });
});
