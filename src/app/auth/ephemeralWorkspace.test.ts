import { afterEach, describe, expect, it } from "vitest";
import { NUTRITION_STORAGE_KEY, type NutritionWorkspace } from "../data/nutritionWorkspace";
import {
  loadTaskWorkspace,
  saveTaskWorkspace,
  TASK_STORAGE_KEY,
  type TaskWorkspace,
} from "../data/taskWorkspace";
import {
  activateEphemeralTestWorkspace,
  deactivateEphemeralTestWorkspaceForTests,
  isEphemeralTestWorkspaceActive,
} from "./ephemeralWorkspace";

describe("ephemeral test workspace", () => {
  afterEach(() => {
    deactivateEphemeralTestWorkspaceForTests();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("isolates demo edits from the real browser storage", () => {
    const realStorage = window.localStorage;
    realStorage.setItem("rootine.real-user.fixture", "keep-me");

    activateEphemeralTestWorkspace();

    expect(isEphemeralTestWorkspaceActive()).toBe(true);
    expect(window.localStorage).not.toBe(realStorage);
    expect(window.localStorage.getItem("rootine.real-user.fixture")).toBeNull();

    const tasks = JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "null") as TaskWorkspace;
    expect(tasks.tasks.length).toBeGreaterThan(5);
    window.localStorage.setItem("rootine.demo-edit", "temporary");

    deactivateEphemeralTestWorkspaceForTests();

    expect(window.localStorage).toBe(realStorage);
    expect(window.localStorage.getItem("rootine.real-user.fixture")).toBe("keep-me");
    expect(window.localStorage.getItem("rootine.demo-edit")).toBeNull();
  });

  it("seeds history and reusable meals for all nutrition subviews", () => {
    activateEphemeralTestWorkspace();

    const nutrition = JSON.parse(
      window.localStorage.getItem(NUTRITION_STORAGE_KEY) ?? "null",
    ) as NutritionWorkspace;

    expect(Object.keys(nutrition.days).length).toBeGreaterThanOrEqual(14);
    expect(Object.keys(nutrition.weightMeasurements).length).toBeGreaterThanOrEqual(6);
    expect(nutrition.customMeals?.length).toBeGreaterThanOrEqual(2);
  });

  it("starts from the same examples after a new hard-refresh-equivalent session", () => {
    activateEphemeralTestWorkspace();
    const original = window.localStorage.getItem(TASK_STORAGE_KEY);
    const edited = JSON.parse(original ?? "null") as TaskWorkspace;
    edited.tasks = [];
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(edited));

    deactivateEphemeralTestWorkspaceForTests();
    activateEphemeralTestWorkspace();

    expect(window.localStorage.getItem(TASK_STORAGE_KEY)).toBe(original);
  });

  it("supports normal task edits during the test session", () => {
    activateEphemeralTestWorkspace();
    const workspace = loadTaskWorkspace();
    const addedTask = {
      ...workspace.tasks[0],
      id: Math.max(...workspace.tasks.map((task) => task.id)) + 1,
      text: "Zadanie dodane podczas demo",
      done: false,
    };

    expect(saveTaskWorkspace({ ...workspace, tasks: [...workspace.tasks, addedTask] })).toBe(true);
    expect(loadTaskWorkspace().tasks).toContainEqual(expect.objectContaining({
      id: addedTask.id,
      text: addedTask.text,
      done: false,
    }));
  });
});
