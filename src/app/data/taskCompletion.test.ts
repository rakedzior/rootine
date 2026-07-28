import { beforeEach, describe, expect, it, vi } from "vitest";

describe("task completion repository", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("migrates the legacy completion map", async () => {
    const completion = await import("./taskCompletion");
    window.localStorage.setItem(completion.TASK_COMPLETION_STORAGE_KEY, JSON.stringify({ "7": true }));

    expect(completion.hydrateTaskCompletion([{ id: 7, done: false }])).toEqual([{ id: 7, done: true }]);
  });

  it("retains corrupt source data until a real user mutation", async () => {
    const completion = await import("./taskCompletion");
    const raw = "{broken";
    window.localStorage.setItem(completion.TASK_COMPLETION_STORAGE_KEY, raw);

    expect(completion.hydrateTaskCompletion([{ id: 3, done: false }])).toEqual([{ id: 3, done: false }]);
    completion.persistTaskCompletion(3, true);
    expect(window.localStorage.getItem(completion.TASK_COMPLETION_STORAGE_KEY)).toBe(raw);

    window.dispatchEvent(new Event("pointerup", { bubbles: true }));
    completion.persistTaskCompletion(3, true);
    expect(JSON.parse(window.localStorage.getItem(completion.TASK_COMPLETION_STORAGE_KEY) ?? "{}").completion["3"]).toBe(true);
  });
});
