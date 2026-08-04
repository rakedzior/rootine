import { beforeEach, describe, expect, it } from "vitest";
import { createBrowserWorkspacePayloadStore } from "./indexedDbWorkspaceStore";
import { setWorkspacePayloadStoreForTests } from "./localRepository";
import { projectTaskOccurrences } from "./taskSchedule";
import {
  emptyTaskTrash,
  getHabitCurrentStreak,
  habitDayState,
  isHabitScheduledOnDate,
  loadTaskWorkspaceResult,
  purgeTask,
  restoreTask,
  saveTaskWorkspace,
  setTaskDoneState,
  setHabitCompletionOnDate,
  taskViewForCalendarDate,
  trashTask,
  type TaskWorkspace,
  type WorkspaceHabit,
} from "./taskWorkspace";

describe("task workspace", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setWorkspacePayloadStoreForTests(createBrowserWorkspacePayloadStore(undefined));
  });

  it("migrates version-one timed tasks to an explicit schedule", () => {
    window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify({
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      tasks: [{
        id: 1,
        text: "Spotkanie",
        done: false,
        view: "dzis",
        calendarDate: "2026-07-28",
        time: "09:00",
        endTime: "10:00",
      }],
      habits: [],
      lists: [],
      tags: [],
    }));

    const result = loadTaskWorkspaceResult();

    expect(result.status).toBe("migrated");
    expect(result.workspace.tasks[0].schedule).toMatchObject({
      allDay: false,
      startTime: "09:00",
      endTime: "10:00",
    });
  });

  it("round-trips reminder, recurrence, timezone, and same-day duration", () => {
    const workspace = {
      version: 2,
      updatedAt: "",
      tasks: [{
        id: 72,
        text: "Przegląd",
        done: false,
        view: "dzis",
        calendarDate: "2026-07-28",
        time: "09:00",
        endTime: "10:30",
        schedule: {
          allDay: false,
          startTime: "09:00",
          endTime: "10:30",
          reminderMinutes: 30,
          recurrence: "monthly",
          completedDates: ["2026-08-28"],
          timezone: "Europe/Warsaw",
        },
      }],
      habits: [],
      lists: [],
      tags: [],
    } satisfies TaskWorkspace;

    expect(saveTaskWorkspace(workspace)).toBe(true);
    expect(loadTaskWorkspaceResult().workspace.tasks.find((task) => task.id === 72)?.schedule).toEqual({
      allDay: false,
      startTime: "09:00",
      endTime: "10:30",
      reminderMinutes: 30,
      recurrence: "monthly",
      completedDates: ["2026-08-28"],
      timezone: "Europe/Warsaw",
    });
  });

  it("never serializes runtime recurrence projections as source tasks", () => {
    const source = {
      id: 88,
      text: "Raport cykliczny",
      done: false,
      view: "dzis",
      calendarDate: "2026-07-31",
      time: "09:00",
      schedule: {
        allDay: false,
        startTime: "09:00",
        recurrence: "monthly",
        timezone: "Europe/Warsaw",
      },
    } satisfies TaskWorkspace["tasks"][number];
    const projected = projectTaskOccurrences([source], "2026-07-01", "2026-09-30");
    const workspace = {
      version: 2,
      updatedAt: "",
      tasks: projected,
      habits: [],
      lists: [],
      tags: [],
    } satisfies TaskWorkspace;

    expect(saveTaskWorkspace(workspace)).toBe(true);

    const persisted = JSON.parse(window.localStorage.getItem("rootine.task-workspace.v1") ?? "{}");
    expect(persisted.tasks).toHaveLength(1);
    expect(persisted.tasks[0]).toMatchObject({ id: 88, calendarDate: "2026-07-31" });
    expect(persisted.tasks[0]).not.toHaveProperty("occurrence");
  });

  it("quarantines impossible same-day duration ranges", () => {
    window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify({
      version: 2,
      updatedAt: "2026-01-01T00:00:00.000Z",
      tasks: [{
        id: 73,
        text: "Błędny przedział",
        done: false,
        view: "dzis",
        schedule: {
          allDay: false,
          startTime: "11:00",
          endTime: "10:00",
          timezone: "Europe/Warsaw",
        },
      }],
      habits: [],
      lists: [],
      tags: [],
    }));

    expect(loadTaskWorkspaceResult().status).toBe("corrupt");
  });

  it("rejects malformed nested source metadata instead of accepting a partial source", () => {
    window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify({
      version: 2,
      updatedAt: "2026-01-01T00:00:00.000Z",
      tasks: [{
        id: -12,
        text: "Broken projection",
        done: false,
        view: "dzis",
        source: {
          kind: "work",
          entity: "project/task",
          context: 42,
          href: "/praca",
        },
      }],
      habits: [],
      lists: [],
      tags: [],
    }));

    expect(loadTaskWorkspaceResult().status).toBe("corrupt");
  });

  it("rejects protocol-relative source links", () => {
    window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify({
      version: 2,
      updatedAt: "2026-01-01T00:00:00.000Z",
      tasks: [{
        id: -12,
        text: "Unsafe projection",
        done: false,
        view: "dzis",
        source: {
          kind: "travel",
          entity: "trip/task",
          context: "Trip",
          href: "//example.com/podroze/trip",
        },
      }],
      habits: [],
      lists: [],
      tags: [],
    }));

    expect(loadTaskWorkspaceResult().status).toBe("corrupt");
  });

  it("calculates task views by calendar date rather than DST-sensitive milliseconds", () => {
    const springReference = new Date(2026, 2, 28, 23, 30);
    const autumnReference = new Date(2026, 9, 24, 23, 30);

    expect(taskViewForCalendarDate("2026-03-29", springReference)).toBe("jutro");
    expect(taskViewForCalendarDate("2026-10-25", autumnReference)).toBe("jutro");
    expect(taskViewForCalendarDate("2026-04-20", new Date(2026, 3, 1))).toBe("30dni");
    expect(taskViewForCalendarDate("2026-05-15", new Date(2026, 3, 1))).toBe("wszystkie");
  });

  it("supports trash, restore, purge, and empty-trash commands", () => {
    const workspace = {
      version: 2,
      updatedAt: "",
      tasks: [
        { id: 1, text: "A", done: false, view: "dzis" },
        { id: 2, text: "B", done: false, view: "dzis", deleted: true },
      ],
      habits: [],
      lists: [],
      tags: [],
    } satisfies TaskWorkspace;

    const trashed = trashTask(workspace, 1);
    expect(trashed.tasks.find((task) => task.id === 1)?.deleted).toBe(true);
    expect(restoreTask(trashed, 1).tasks.find((task) => task.id === 1)?.deleted).toBe(false);
    expect(purgeTask(trashed, 2).tasks.map((task) => task.id)).toEqual([1]);
    expect(emptyTaskTrash(trashed).tasks).toEqual([]);
  });

  it("shares an idempotent task completion transition with domain services", () => {
    const task = { id: 99, text: "Test", done: false, view: "dzis" };
    const completed = setTaskDoneState(task, true);

    expect(completed).toEqual({ ...task, done: true });
    expect(setTaskDoneState(completed, true)).toBe(completed);
    expect(task.done).toBe(false);
  });

  it("schedules habits on selected weekdays and counts streaks by planned days", () => {
    const habit: WorkspaceHabit = {
      id: 1,
      name: "Czytanie",
      streak: 0,
      done: false,
      completedDates: ["2026-07-27", "2026-07-29"],
      schedule: { type: "weekly", weekdays: [1, 3], interval: 1, startDate: "2026-07-27" },
    };

    expect(isHabitScheduledOnDate(habit, "2026-07-28")).toBe(false);
    expect(isHabitScheduledOnDate(habit, "2026-07-29")).toBe(true);
    expect(getHabitCurrentStreak(habit, "2026-07-29")).toBe(2);
  });

  it("keeps paused days out of the streak and allows correcting history", () => {
    const habit: WorkspaceHabit = {
      id: 2,
      name: "Spacer",
      streak: 0,
      done: false,
      completedDates: ["2026-07-27", "2026-07-30"],
      schedule: { type: "daily", startDate: "2026-07-25" },
      pausePeriods: [{ startDate: "2026-07-28", endDate: "2026-07-29" }],
    };

    expect(habitDayState(habit, "2026-07-28")).toBe("paused");
    expect(getHabitCurrentStreak(habit, "2026-07-30")).toBe(2);
    const corrected = setHabitCompletionOnDate(habit, "2026-07-26", true);
    expect(corrected.completedDates).toContain("2026-07-26");
    const historical = setHabitCompletionOnDate(habit, "2026-07-24", true);
    expect(habitDayState(historical, "2026-07-24")).toBe("completed");
  });
});
