import { beforeEach, describe, expect, it } from "vitest";
import { GENERIC_FOODS, scaleNutrition } from "../../app/data/nutritionCatalog";
import { createEmptyNutritionWorkspace, loadNutritionWorkspace } from "../../app/data/nutritionWorkspace";
import { resetDomainTestStorage } from "../testSupport";
import { clearMealDraftsForTests, commitMealDraft, createMealDraft } from "./nutritionService";

describe("nutrition domain service", () => {
  beforeEach(() => {
    resetDomainTestStorage();
    clearMealDraftsForTests();
    window.localStorage.setItem("rootine.nutrition-workspace.v1", JSON.stringify(createEmptyNutritionWorkspace()));
  });

  it("rejects a meal ingredient without a catalog-backed nutrient source", () => {
    const result = createMealDraft({
      date: "2026-08-02",
      meal: "lunch",
      ingredients: [{ catalogId: "invented-chicken", amount: 200, unit: "g", calories: 999 }],
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected validation to fail");
    expect(result.code).toBe("NOT_FOUND");
  });

  it("derives macros from the selected product and commits the confirmed draft", async () => {
    const food = GENERIC_FOODS[0];
    const amount = 175;
    const draftResult = createMealDraft({
      date: "2026-08-02",
      meal: "lunch",
      ingredients: [{ catalogId: food.id, amount, unit: food.unit }],
    });
    expect(draftResult.success).toBe(true);
    if (!draftResult.success) throw new Error("Expected draft to succeed");
    expect(draftResult.draft.totals).toEqual(scaleNutrition(food.per100g, amount));

    const committed = await commitMealDraft({ draftId: draftResult.draft.id });
    expect(committed.success).toBe(true);
    const entry = loadNutritionWorkspace().workspace.days["2026-08-02"].entries.lunch[0];
    expect(entry.catalogId).toBe(food.id);
    expect({ calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat })
      .toEqual(scaleNutrition(food.per100g, amount));
  });
});
