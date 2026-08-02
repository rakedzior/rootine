import { beforeEach, describe, expect, it } from "vitest";
import { loadTaskWorkspace, type TaskWorkspace } from "../../app/data/taskWorkspace";
import { domainUndoManager } from "../shared/undoManager";
import { resetDomainTestStorage } from "../testSupport";
import { resolveTaskQuery } from "./taskQueries";
import { completeTask } from "./taskService";

const workspace: TaskWorkspace = {
  version: 2,
  updatedAt: "2026-08-02T08:00:00.000Z",
  tasks: [
    { id: 1, text: "Wysłać raport", done: false, view: "dzis", calendarDate: "2026-08-02", priority: "high" },
    { id: 2, text: "Wysłać raport kwartalny", done: false, view: "jutro", calendarDate: "2026-08-03" },
  ],
  habits: [],
  lists: [],
  tags: [],
};

describe("task domain service", () => {
  beforeEach(() => {
    resetDomainTestStorage();
    window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify(workspace));
  });

  it("returns candidates instead of guessing when a title is ambiguous", () => {
    const result = resolveTaskQuery("wysłać raport");
    expect("success" in result && result.success).toBe(false);
    expect("code" in result ? result.code : undefined).toBe("AMBIGUOUS");
    expect("candidates" in result ? result.candidates : []).toHaveLength(2);
  });

  it("persists a completion and undoes it through a domain compensation", async () => {
    const completed = await completeTask({ taskId: 1 });
    expect(completed.success).toBe(true);
    expect(loadTaskWorkspace().tasks.find((task) => task.id === 1)?.done).toBe(true);
    if (!completed.success) throw new Error("Expected task completion to succeed");

    const undone = await domainUndoManager.undo(completed.undoToken);
    expect(undone.success).toBe(true);
    expect(loadTaskWorkspace().tasks.find((task) => task.id === 1)?.done).toBe(false);
  });
});
