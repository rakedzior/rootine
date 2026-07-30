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
  });

  afterEach(() => {
    cleanup();
    fixtures.taskWorkspace.tasks = [];
    fixtures.taskWorkspace.lists = [];
    fixtures.taskWorkspace.tags = [];
    vi.useRealTimers();
  });

  it("does not show direct Sport or Affairs projections", () => {
    render(<Kalendarz />);
    expect(screen.queryByRole("button", { name: /Trening poranny/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Op.*ata urz.*dowa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Czynsz/ })).not.toBeInTheDocument();
    return;

    fireEvent.click(screen.getByRole("button", { name: "Otwórz szczegóły: Trening poranny" }));
    const workoutDetail = screen.getByRole("dialog", { name: "Szczegóły: Trening poranny" });
    expect(workoutDetail).toHaveTextContent("Zaplanowany");
    expect(workoutDetail).toHaveTextContent("Siłownia");
    expect(workoutDetail).toHaveTextContent("Edycja jest dostępna w module Sport");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Otwórz w module Sport" })).toHaveAttribute(
      "href",
      "/sport?widok=cycle&tydzien=1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Zamknij szczegóły" }));
    fireEvent.click(screen.getByRole("button", { name: "Otwórz szczegóły: Opłata urzędowa" }));
    expect(screen.getByRole("dialog", { name: "Szczegóły: Opłata urzędowa" })).toHaveTextContent("431,99");
    expect(screen.getByRole("link", { name: "Otwórz w module Sprawy" })).toHaveAttribute(
      "href",
      "/sprawy?widok=oneTime",
    );

    fireEvent.click(screen.getByRole("button", { name: "Zamknij szczegóły" }));
    fireEvent.click(screen.getByRole("button", { name: "Otwórz szczegóły: Czynsz" }));
    const recurringDetail = screen.getByRole("dialog", { name: "Szczegóły: Czynsz" });
    expect(recurringDetail).toHaveTextContent("Automatyczna");
    expect(recurringDetail).toHaveTextContent("Co miesiąc");
    expect(screen.getByRole("link", { name: "Otwórz w module Sprawy" })).toHaveAttribute(
      "href",
      "/sprawy?widok=payments",
    );
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
      { id: "prywatne", label: "Prywatne", color: "#70B89F" },
      { id: "praca", label: "Praca", color: "#4772FA" },
    ];
    fixtures.taskWorkspace.tags = [
      { id: "dom", label: "dom", color: "#D4AA68" },
      { id: "biuro", label: "biuro", color: "#9B8CE8" },
    ];

    render(<Kalendarz />);
    expect(screen.getByRole("button", { name: "Otwórz szczegóły: Zakupy spożywcze" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Otwórz szczegóły: Wysłać raport" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prywatne1" }));

    expect(screen.getByRole("button", { name: "Otwórz szczegóły: Zakupy spożywcze" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Otwórz szczegóły: Wysłać raport" })).not.toBeInTheDocument();
  });
});
