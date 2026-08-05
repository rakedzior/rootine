import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { latestTaskActivityDate } from "./TaskSummaryModel";
import type { Task } from "./taskPageModel";

afterEach(cleanup);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    text: "Zadanie testowe",
    done: false,
    view: "dzis",
    calendarDate: "2026-07-20",
    ...overrides,
  };
}

describe("TaskSummaryReport range defaults", () => {
  it("anchors the first report period to the latest dated activity", () => {
    expect(latestTaskActivityDate([
      task({ calendarDate: "2026-07-20" }),
      task({ id: 2, calendarDate: "2026-07-29" }),
    ], "2026-08-05")).toBe("2026-07-29");
  });

  it("uses the recorded completion day when it is later than the planned day", () => {
    expect(latestTaskActivityDate([
      task({ done: true, completedAt: "2026-08-05T10:15:00.000Z" }),
    ], "2026-08-05")).toBe("2026-08-05");
  });
});
