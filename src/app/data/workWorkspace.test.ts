import { beforeEach, describe, expect, it } from "vitest";
import { createBrowserWorkspacePayloadStore } from "./indexedDbWorkspaceStore";
import { setWorkspacePayloadStoreForTests } from "./localRepository";
import {
  loadWorkWorkspaceResult,
  saveWorkWorkspace,
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
        color: "#4772FA",
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
        createdAt: "2026-07-28T08:00:00.000Z",
      }],
    }));

    const result = loadWorkWorkspaceResult();

    expect(result.status).toBe("migrated");
    expect(result.workspace.version).toBe(2);
    expect(result.workspace.tasks[0]).not.toHaveProperty("linkedTask");
    expect(saveWorkWorkspace(result.workspace)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(WORK_STORAGE_KEY) ?? "{}").version).toBe(2);
  });
});
