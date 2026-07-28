import { beforeEach, describe, expect, it, vi } from "vitest";

describe("nutrition workspace persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("quarantines corrupt data and blocks fallback autosave until user input", async () => {
    const nutrition = await import("./nutritionWorkspace");
    const repository = await import("./localRepository");
    const corruptRaw = "{broken-json";
    window.localStorage.setItem(nutrition.NUTRITION_STORAGE_KEY, corruptRaw);

    const loaded = nutrition.loadNutritionWorkspace();
    expect(loaded.status).toBe("corrupt");
    expect(nutrition.saveNutritionWorkspace(loaded.workspace)).toBe(true);
    expect(window.localStorage.getItem(nutrition.NUTRITION_STORAGE_KEY)).toBe(corruptRaw);
    expect(repository.listLocalRecoveryRecords()).toHaveLength(1);

    window.dispatchEvent(new Event("input", { bubbles: true }));
    expect(nutrition.saveNutritionWorkspace({
      ...loaded.workspace,
      goals: { ...loaded.workspace.goals, calories: 2450 },
    })).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(nutrition.NUTRITION_STORAGE_KEY) ?? "{}").goals.calories).toBe(2450);
  });

  it("migrates the legacy water-in-glasses schema without losing goals", async () => {
    const nutrition = await import("./nutritionWorkspace");
    window.localStorage.setItem(nutrition.NUTRITION_STORAGE_KEY, JSON.stringify({
      version: 1,
      updatedAt: "2024-01-01T00:00:00.000Z",
      goals: { calories: 2100, protein: 130, carbs: 240, fat: 70, water: 8 },
      days: {},
    }));

    const loaded = nutrition.loadNutritionWorkspace();
    expect(loaded.status).toBe("ok");
    expect(loaded.workspace).toMatchObject({
      version: 6,
      goals: { calories: 2100, protein: 130, carbs: 240, fat: 70, waterMl: 2000 },
    });
  });

  it("rejects malformed current nested entries instead of silently dropping them", async () => {
    const nutrition = await import("./nutritionWorkspace");
    const workspace = nutrition.createEmptyNutritionWorkspace();
    window.localStorage.setItem(nutrition.NUTRITION_STORAGE_KEY, JSON.stringify({
      ...workspace,
      days: {
        "2026-07-28": {
          date: "2026-07-28",
          waterMl: 0,
          source: "user",
          entries: { breakfast: [{ id: "bad" }], lunch: [], snack: [], dinner: [] },
        },
      },
    }));

    expect(nutrition.loadNutritionWorkspace().status).toBe("corrupt");
  });
});
