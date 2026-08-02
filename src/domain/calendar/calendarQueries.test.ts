import { describe, expect, it } from "vitest";
import type { TaskCalendarOccurrence } from "../../app/data/calendarOccurrences";
import { findCalendarConflicts } from "./calendarQueries";

function occurrence(
  id: number,
  time: string | undefined,
  endTime?: string,
): TaskCalendarOccurrence {
  const date = "2026-08-03";
  return {
    kind: "task",
    key: `task:${id}@${date}`,
    calendarDate: date,
    title: `Zadanie ${id}`,
    time,
    endTime,
    source: { kind: "task", label: "Zadania", href: "/zadania" },
    status: { key: "scheduled", label: "Do zrobienia", completed: false },
    metadata: [],
    task: {
      id,
      text: `Zadanie ${id}`,
      done: false,
      view: "7dni",
      calendarDate: date,
      time,
      endTime,
      occurrence: { key: `${id}@${date}`, sourceTaskId: id, date, virtual: false },
    },
  };
}

describe("findCalendarConflicts", () => {
  it("groups transitively overlapping timed occurrences", () => {
    const conflicts = findCalendarConflicts([
      occurrence(1, "09:00", "10:00"),
      occurrence(2, "09:30", "10:30"),
      occurrence(3, "10:15", "11:00"),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      date: "2026-08-03",
      startTime: "09:00",
      endTime: "11:00",
      kind: "overlap",
    });
    expect(conflicts[0].occurrences).toHaveLength(3);
  });

  it("treats touching boundaries and all-day entries as non-conflicting", () => {
    expect(findCalendarConflicts([
      occurrence(1, "09:00", "10:00"),
      occurrence(2, "10:00", "11:00"),
      occurrence(3, undefined),
    ])).toEqual([]);
  });

  it("detects equal starts even when no end time is known", () => {
    expect(findCalendarConflicts([
      occurrence(1, "09:00"),
      occurrence(2, "09:00"),
    ])).toMatchObject([{ kind: "same_start", startTime: "09:00", endTime: null }]);
  });
});
