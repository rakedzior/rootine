import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskWorkspace } from "../data/taskWorkspace";
import Kalendarz from "./Kalendarz";

const fixtures = vi.hoisted(() => ({
  taskWorkspace: {
    version: 2 as const,
    updatedAt: "2026-07-29T08:00:00.000Z",
    tasks: [],
    habits: [],
    lists: [],
    tags: [],
  } as TaskWorkspace,
  sport: {
    version: 3 as const,
    templates: [],
    activeCycle: {
      id: "cycle-test",
      name: "Cykl testowy",
      startDate: "2026-07-27",
      weeks: 1,
      updatedAt: "2026-07-01T08:00:00.000Z",
      workouts: [{
        id: "training-test",
        week: 1,
        day: 2,
        title: "Trening poranny",
        discipline: "strength" as const,
        durationMinutes: 55,
        time: "08:00",
      }],
    },
    history: [],
    sessions: [],
    workoutOutcomes: {},
  },
  affairs: {
    version: 2 as const,
    matters: [],
    oneTimePayments: [{
      id: "payment-once",
      title: "Opłata urzędowa",
      category: "Urzędy",
      amount: 431.99,
      dueDate: "2026-07-30",
      paid: false,
      paidAt: "",
      note: "",
    }],
    payments: [{
      id: "payment-repeat",
      name: "Czynsz",
      category: "Mieszkanie",
      amount: 1_000,
      cadence: "monthly" as const,
      nextDueDate: "2026-07-31",
      automatic: true,
      active: true,
      note: "",
    }],
    subscriptions: [],
    documents: [],
    vehicles: [],
    vehicleItems: [],
    budgets: [],
  },
}));

vi.mock("../data/taskWorkspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/taskWorkspace")>();
  return {
    ...actual,
    loadTaskWorkspace: () => fixtures.taskWorkspace,
    saveTaskWorkspace: () => true,
  };
});

vi.mock("../data/calendarOccurrences", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/calendarOccurrences")>();
  return {
    ...actual,
    loadCalendarOccurrenceSources: () => ({
      tasks: [],
      sport: fixtures.sport,
      affairs: fixtures.affairs,
    }),
  };
});

vi.mock("../data/localRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/localRepository")>();
  return {
    ...actual,
    subscribeToLocalWorkspace: () => () => undefined,
  };
});

describe("Kalendarz canonical occurrences integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 29, 10, 0));
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    fixtures.taskWorkspace.tasks = [];
    fixtures.taskWorkspace.lists = [];
    fixtures.taskWorkspace.tags = [];
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("shows only task records and excludes Sport and Affairs projections", () => {
    fixtures.taskWorkspace.tasks = [{
      id: 99,
      text: "Zadanie na dziś",
      done: false,
      view: "dzis",
      calendarDate: "2026-07-29",
    }];

    render(<Kalendarz />);
    expect(screen.getByRole("button", { name: /Zadanie na dziś/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Trening poranny/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Opłata urzędowa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Czynsz/ })).not.toBeInTheDocument();
  });

  it("selects today when the calendar opens", () => {
    render(<Kalendarz />);

    expect(screen.getByRole("gridcell", { name: /29 lipiec 2026/ })).toHaveClass("is-selected");
  });

  it("filters calendar tasks from the context sidebar", () => {
    fixtures.taskWorkspace.tasks = [
      {
        id: 1,
        text: "Zakupy spożywcze",
        done: false,
        view: "dzis",
        calendarDate: "2026-07-29",
        list: "prywatne",
        tags: ["dom"],
      },
      {
        id: 2,
        text: "Wysłać raport",
        done: false,
        view: "dzis",
        calendarDate: "2026-07-29",
        list: "praca",
        tags: ["biuro"],
      },
    ];
    fixtures.taskWorkspace.lists = [
      { id: "prywatne", label: "Prywatne", color: "#79A8A4" },
      { id: "praca", label: "Praca", color: "#7FA6C9" },
    ];
    fixtures.taskWorkspace.tags = [
      { id: "dom", label: "dom", color: "#B9A171" },
      { id: "biuro", label: "biuro", color: "#7D7FA8" },
    ];

    render(<Kalendarz />);
    expect(screen.getByRole("button", { name: "Otwórz szczegóły: Zakupy spożywcze" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Otwórz szczegóły: Wysłać raport" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Listy" }));
    fireEvent.click(screen.getByRole("button", { name: "Prywatne1" }));

    expect(screen.getByRole("button", { name: "Otwórz szczegóły: Zakupy spożywcze" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Otwórz szczegóły: Wysłać raport" })).not.toBeInTheDocument();
  });

  it("opens as Wszystkie and switches every other subview to the list", () => {
    fixtures.taskWorkspace.tasks = [
      {
        id: 1,
        text: "Zadanie dziś",
        done: false,
        view: "dzis",
        calendarDate: "2026-07-29",
      },
      {
        id: 2,
        text: "Zadanie jutro",
        done: false,
        view: "jutro",
        calendarDate: "2026-07-30",
      },
      {
        id: 3,
        text: "Bez terminu",
        done: false,
        view: "bezterminu",
      },
      {
        id: 4,
        text: "Ukończone",
        done: true,
        view: "dzis",
        calendarDate: "2026-07-29",
      },
    ];

    render(<Kalendarz />);
    expect(screen.getByRole("button", { name: /Otw.*Zadanie dziś/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Otw.*Zadanie jutro/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Otw.*Ukończone/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Wszystkie/ })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: /^Jutro/ }));

    expect(window.location.pathname).toBe("/zadania");
    expect(window.location.search).toBe("?widok=jutro");
    expect(window.localStorage.getItem("rootine.tasks.view-mode.v1")).toBe("list");
    expect(JSON.parse(window.localStorage.getItem("rootine.tasks.sidebar.v2") ?? "{}")).toMatchObject({
      taskView: "jutro",
      listFilter: null,
      tagFilter: null,
    });
  });

  it("sends the undated chip to the undated list view", () => {
    fixtures.taskWorkspace.tasks = [{
      id: 10,
      text: "Bez daty",
      done: false,
      view: "bezterminu",
    }];

    render(<Kalendarz />);
    fireEvent.click(screen.getByRole("button", { name: "Bez terminu · 1" }));

    expect(window.location.pathname).toBe("/zadania");
    expect(window.location.search).toBe("?widok=bezterminu");
    expect(JSON.parse(window.localStorage.getItem("rootine.tasks.sidebar.v2") ?? "{}")).toMatchObject({
      taskView: "bezterminu",
      listFilter: null,
      tagFilter: null,
    });
  });
});
