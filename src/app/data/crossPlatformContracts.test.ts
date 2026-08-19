import { describe, expect, it } from "vitest";
import manifest from "../../../contracts/manifest.json";
import taskFixture from "../../../contracts/fixtures/task-workspace-v2.json";
import nutritionFixture from "../../../contracts/fixtures/nutrition-workspace-v6.json";
import notesFixture from "../../../contracts/fixtures/notes-workspace-v1.json";
import productFixture from "../../../contracts/fixtures/nutrition-product.json";
import { isTaskWorkspace, TASK_STORAGE_KEY } from "./taskWorkspace";
import { isNutritionWorkspace, NUTRITION_STORAGE_KEY } from "./nutritionWorkspace";
import { isNotesWorkspace, NOTES_STORAGE_KEY } from "./notesWorkspace";

describe("cross-platform contract fixtures", () => {
  it("keeps the manifest aligned with current web storage keys and versions", () => {
    expect(manifest.contractVersion).toBe(1);
    expect(manifest.workspaces.map((workspace) => [workspace.storageKey, workspace.domainVersion])).toEqual([
      [TASK_STORAGE_KEY, 2],
      [NUTRITION_STORAGE_KEY, 6],
      [NOTES_STORAGE_KEY, 1],
    ]);
    expect(manifest.sync.applyRpc).toBe("rootine_apply_workspace_snapshot");
    expect(manifest.sync.conflictStrategy).toBe("compare-and-swap");
  });

  it("accepts the task fixture with the production task validator", () => {
    expect(isTaskWorkspace(taskFixture)).toBe(true);
  });

  it("accepts the nutrition fixture with the production nutrition validator", () => {
    expect(isNutritionWorkspace(nutritionFixture)).toBe(true);
  });

  it("accepts the notes fixture with the production notes validator", () => {
    expect(isNotesWorkspace(notesFixture)).toBe(true);
  });

  it("keeps the normalized barcode fixture safe for both clients", () => {
    expect(productFixture.source).toBe("openfoodfacts");
    expect(productFixture.barcode).toMatch(/^\d{8,14}$/);
    expect(Object.values(productFixture.per100g).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });
});
