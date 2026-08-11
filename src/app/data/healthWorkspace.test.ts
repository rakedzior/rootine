import { describe, expect, it } from "vitest";
import {
  createDefaultHealthWorkspace,
  isHealthWorkspace,
  setHealthEntryCompletionState,
} from "./healthWorkspace";

describe("health workspace", () => {
  it("starts with useful health reminders and a valid local shape", () => {
    const workspace = createDefaultHealthWorkspace();

    expect(isHealthWorkspace(workspace)).toBe(true);
    expect(workspace.entries.map((entry) => entry.kind)).toEqual([
      "appointment",
      "examination",
      "prescription",
      "vaccination",
    ]);
  });

  it("completes and reopens a health reminder without changing its identity", () => {
    const workspace = createDefaultHealthWorkspace();
    const entry = workspace.entries[0];

    const completed = setHealthEntryCompletionState(workspace, entry.id, true);
    expect(completed.entries.find((candidate) => candidate.id === entry.id)).toMatchObject({
      id: entry.id,
      status: "done",
    });

    const reopened = setHealthEntryCompletionState(completed, entry.id, false);
    expect(reopened.entries.find((candidate) => candidate.id === entry.id)).toMatchObject({
      id: entry.id,
      status: "open",
    });
  });

  it("rejects malformed workspace data", () => {
    expect(isHealthWorkspace({ version: 1, entries: [], updatedAt: 42 })).toBe(false);
    expect(isHealthWorkspace({ version: 2, entries: [], updatedAt: "2026-08-11" })).toBe(false);
  });
});
