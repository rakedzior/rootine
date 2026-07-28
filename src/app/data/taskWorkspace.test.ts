import { beforeEach, describe, expect, it } from "vitest";
import { createBrowserWorkspacePayloadStore } from "./indexedDbWorkspaceStore";
import { setWorkspacePayloadStoreForTests } from "./localRepository";
import { projectTaskOccurrences } from "./taskSchedule";
import {
  emptyTaskTrash,
  loadTaskWorkspaceResult,
  purgeTask,
  restoreTask,
  saveTaskWorkspace,
  taskViewForCalendarDate,
  trashTask,
  type TaskWorkspace,
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
});
