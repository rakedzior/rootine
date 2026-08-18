import { beforeEach, describe, expect, it } from "vitest";
import { createBrowserWorkspacePayloadStore } from "./indexedDbWorkspaceStore";
import { setWorkspacePayloadStoreForTests } from "./localRepository";
import {
  createDefaultWorkWorkspace,
  loadWorkWorkspaceResult,
  saveWorkWorkspace,
  setWorkTasksCompletionState,
  WORK_STORAGE_KEY,
} from "./workWorkspace";

describe("work workspace", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setWorkspacePayloadStoreForTests(createBrowserWorkspacePayloadStore(undefined));
  });

  it("migrates version-one workspaces before linked global task data is used", () => {
    window.localStorage.setItem(WORK_STORAGE_KEY, JSON.stringify({
      version: 1,
      updatedAt: "2026-07-28T08:00:00.000Z",
      companies: [{
        id: "company-a",
        name: "Acme",
        description: "",
        color: "#7FA6C9",
      }],
      projects: [{
        id: "project-a",
        companyId: "company-a",
        name: "Launch",
        description: "",
        status: "active",
      }],
      tasks: [{
        id: "task-a",
        projectId: "project-a",
        parentId: null,
        title: "Przygotować ofertę",
        completed: false,
        priority: "high",
        dueDate: "2026-07-29",
        startDate: "2026-07-20",
        createdAt: "2026-07-28T08:00:00.000Z",
      }],
    }));

    const result = loadWorkWorkspaceResult();

    expect(result.status).toBe("migrated");
    expect(result.workspace.version).toBe(3);
    expect(result.workspace.tasks[0]).not.toHaveProperty("linkedTask");
    expect(result.workspace.tasks[0]).not.toHaveProperty("startDate");
    expect(saveWorkWorkspace(result.workspace)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(WORK_STORAGE_KEY) ?? "{}").version).toBe(3);
  });

  it("shares one immutable completion mutation for single and cascaded work tasks", () => {
    const loaded = createDefaultWorkWorkspace();
    const workspace = {
      ...loaded,
      tasks: loaded.tasks.map((task) => ({ ...task, completed: false })),
    };
    const ids = workspace.tasks.slice(0, 2).map((task) => task.id);
    const untouched = workspace.tasks.find((task) => !ids.includes(task.id));

    const next = setWorkTasksCompletionState(workspace, ids, true);

    expect(next.tasks.filter((task) => ids.includes(task.id)).every((task) => task.completed)).toBe(true);
    if (untouched) expect(next.tasks.find((task) => task.id === untouched.id)).toBe(untouched);
    expect(workspace.tasks.filter((task) => ids.includes(task.id)).some((task) => !task.completed)).toBe(true);
  });
});
