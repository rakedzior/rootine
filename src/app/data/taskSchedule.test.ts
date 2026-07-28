import { describe, expect, it } from "vitest";
import {
  dueTaskReminders,
  projectTaskOccurrences,
  setTaskOccurrenceCompletion,
  taskStartInstant,
} from "./taskSchedule";
import type { WorkspaceTask } from "./taskWorkspace";

function recurringTask(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
  return {
    id: 42,
    text: "Rozliczenie",
    done: false,
    view: "skrzynka",
    calendarDate: "2026-01-31",
    time: "09:00",
    schedule: {
      allDay: false,
      startTime: "09:00",
      recurrence: "monthly",
      reminderMinutes: 30,
      timezone: "Europe/Warsaw",
    },
    ...overrides,
  };
}

describe("task recurrence projection", () => {
  it("anchors monthly recurrence to the source day across short months", () => {
    const task = recurringTask();

    const occurrences = projectTaskOccurrences([task], "2026-01-01", "2026-04-30");

    expect(occurrences.map((occurrence) => occurrence.calendarDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(occurrences[0].id).toBe(task.id);
    expect(occurrences.slice(1).every((occurrence) => occurrence.id < 0 && !Number.isInteger(occurrence.id))).toBe(true);
    expect(task).toEqual(recurringTask());
  });

  it("returns to leap day after clamping yearly recurrence", () => {
    const task = recurringTask({
      calendarDate: "2024-02-29",
      schedule: {
        allDay: true,
        startTime: "",
        recurrence: "yearly",
        timezone: "Europe/Warsaw",
      },
    });

    expect(
      projectTaskOccurrences([task], "2024-01-01", "2028-12-31")
        .map((occurrence) => occurrence.calendarDate),
    ).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("projects daily dates through DST without millisecond drift", () => {
    const task = recurringTask({
      calendarDate: "2026-03-27",
      schedule: {
        allDay: false,
        startTime: "09:00",
        recurrence: "daily",
        timezone: "Europe/Warsaw",
      },
    });

    expect(
      projectTaskOccurrences([task], "2026-03-27", "2026-03-31")
        .map((occurrence) => occurrence.calendarDate),
    ).toEqual([
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
    ]);
  });

  it("stores completion on a virtual occurrence without completing its source", () => {
    const task = recurringTask();

    const completed = setTaskOccurrenceCompletion(task, "2026-02-28", true);
    const projected = projectTaskOccurrences([completed], "2026-01-01", "2026-02-28");

    expect(completed.done).toBe(false);
    expect(completed.schedule?.completedDates).toEqual(["2026-02-28"]);
    expect(projected.map((occurrence) => occurrence.done)).toEqual([false, true]);
    expect(setTaskOccurrenceCompletion(completed, "2026-02-28", false).schedule?.completedDates).toEqual([]);
  });
});

describe("task reminders", () => {
  it("converts DST gaps and overlaps deterministically in the saved timezone", () => {
    expect(taskStartInstant("2026-03-29", "02:30", "Europe/Warsaw")?.toISOString())
      .toBe("2026-03-29T01:30:00.000Z");
    expect(taskStartInstant("2026-10-25", "02:30", "Europe/Warsaw")?.toISOString())
      .toBe("2026-10-25T00:30:00.000Z");
  });

  it("finds the reminder for a virtual month-end occurrence", () => {
    const reminders = dueTaskReminders(
      [recurringTask()],
      new Date("2026-02-28T07:29:00.000Z"),
      new Date("2026-02-28T07:31:00.000Z"),
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      taskId: 42,
      occurrenceDate: "2026-02-28",
      taskText: "Rozliczenie",
    });
    expect(reminders[0].startsAt.toISOString()).toBe("2026-02-28T08:00:00.000Z");
    expect(reminders[0].triggersAt.toISOString()).toBe("2026-02-28T07:30:00.000Z");
  });

  it("does not remind for completed or all-day occurrences", () => {
    const completed = setTaskOccurrenceCompletion(recurringTask(), "2026-02-28", true);
    const allDay = recurringTask({
      id: 43,
      schedule: {
        allDay: true,
        startTime: "",
        recurrence: "monthly",
        reminderMinutes: 30,
        timezone: "Europe/Warsaw",
      },
    });

    expect(dueTaskReminders(
      [completed, allDay],
      new Date("2026-02-28T07:29:00.000Z"),
      new Date("2026-02-28T07:31:00.000Z"),
    )).toEqual([]);
  });
});
