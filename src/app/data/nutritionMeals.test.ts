import { describe, expect, it } from "vitest";
import {
  customMealPer100g,
  customMealPerServing,
  customMealSelectionGrams,
  customMealSelectionValues,
  customMealTotals,
  customMealWeight,
  isCustomMealList,
  normalizeCustomMeals,
  upsertCustomMeal,
  type CustomMeal,
} from "./nutritionMeals";

function meal(overrides: Partial<CustomMeal> = {}): CustomMeal {
  return {
    id: "meal-1",
    name: "Owsianka proteinowa",
    ingredients: [
      {
        id: "ingredient-1",
        name: "Płatki owsiane",
        amount: 80,
        unit: "g",
        per100g: { calories: 380, protein: 13, carbs: 68, fat: 6 },
      },
      {
        id: "ingredient-2",
        name: "Mleko 2%",
        amount: 250,
        unit: "ml",
        per100g: { calories: 50, protein: 3.4, carbs: 4.8, fat: 2 },
      },
    ],
    createdAt: "2026-08-07T08:00:00.000Z",
    ...overrides,
  };
}

describe("customMealTotals", () => {
  it("sums the scaled values of every ingredient", () => {
    expect(customMealTotals(meal())).toEqual({
      calories: 429,
      protein: 18.9,
      carbs: 66.4,
      fat: 9.8,
    });
  });

  it("reports zeros for a meal without ingredients", () => {
    expect(customMealTotals({ ingredients: [] })).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe("customMealWeight", () => {
  it("falls back to the summed ingredient weight", () => {
    expect(customMealWeight(meal())).toBe(330);
  });

  it("prefers the declared weight of the finished dish", () => {
    expect(customMealWeight(meal({ totalWeightG: 300 }))).toBe(300);
  });
});

describe("customMealPer100g", () => {
  it("uses the declared dish weight, not the ingredient sum", () => {
    expect(customMealPer100g(meal({ totalWeightG: 300 }))?.calories).toBe(143);
  });

  it("returns null when the dish has no weight", () => {
    expect(customMealPer100g({ ingredients: [] })).toBeNull();
  });
});

describe("customMealPerServing", () => {
  it("divides the totals by the declared servings", () => {
    expect(customMealPerServing(meal({ servings: 2 }))).toEqual({
      calories: 214.5,
      protein: 9.5,
      carbs: 33.2,
      fat: 4.9,
    });
  });

  it("returns null without servings", () => {
    expect(customMealPerServing(meal())).toBeNull();
  });
});

describe("customMealSelectionValues", () => {
  it("scales by grams of the finished dish", () => {
    expect(customMealSelectionValues(meal({ totalWeightG: 300 }), { mode: "grams", value: 150 })).toEqual({
      calories: 214.5,
      protein: 9.5,
      carbs: 33.2,
      fat: 4.9,
    });
  });

  it("scales by servings", () => {
    expect(customMealSelectionValues(meal({ servings: 3 }), { mode: "servings", value: 1 })?.calories).toBe(143);
  });

  it("refuses a servings selection when the meal declares none", () => {
    expect(customMealSelectionValues(meal(), { mode: "servings", value: 1 })).toBeNull();
  });

  it("refuses a non-positive amount", () => {
    expect(customMealSelectionValues(meal(), { mode: "grams", value: 0 })).toBeNull();
  });
});

describe("customMealSelectionGrams", () => {
  it("converts servings into grams of the finished dish", () => {
    expect(customMealSelectionGrams(meal({ totalWeightG: 300, servings: 2 }), { mode: "servings", value: 1 })).toBe(150);
  });

  it("returns the entered grams unchanged", () => {
    expect(customMealSelectionGrams(meal(), { mode: "grams", value: 210 })).toBe(210);
  });
});

describe("upsertCustomMeal", () => {
  it("replaces a meal with the same id instead of appending it", () => {
    const renamed = meal({ name: "Owsianka z bananem" });
    const result = upsertCustomMeal([meal()], renamed);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Owsianka z bananem");
  });

  it("appends a meal with a new id", () => {
    expect(upsertCustomMeal([meal()], meal({ id: "meal-2" }))).toHaveLength(2);
  });
});

describe("custom meal validation", () => {
  it("accepts a stored list", () => {
    expect(isCustomMealList([meal()])).toBe(true);
  });

  it("rejects a meal with a broken ingredient", () => {
    const broken = { ...meal(), ingredients: [{ id: "x", name: "x", amount: 10, unit: "kg", per100g: {} }] };
    expect(isCustomMealList([broken])).toBe(false);
  });

  it("drops unreadable meals while keeping the readable ones", () => {
    expect(normalizeCustomMeals([meal(), { id: "broken" }, null])).toHaveLength(1);
  });
});
