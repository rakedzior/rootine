import { scaleNutrition, type NutritionValues } from "./nutritionCatalog";

/**
 * A single component of a saved meal. Nutrition is always kept per 100 g/ml so the
 * amount stays editable: every displayed value is derived, never stored twice.
 */
export interface CustomMealIngredient {
  id: string;
  name: string;
  brand?: string;
  amount: number;
  unit: "g" | "ml";
  per100g: NutritionValues;
  catalogId?: string;
  catalogSource?: "usda" | "openfoodfacts";
}

/**
 * A dish the user eats often, saved once and re-added in seconds. Not a recipe:
 * there are no steps, only what went in and how much came out.
 */
export interface CustomMeal {
  id: string;
  name: string;
  ingredients: CustomMealIngredient[];
  /**
   * Weight of the finished dish. It legitimately differs from the sum of the
   * ingredients (water boils off, rice takes water on), so the user sets it.
   */
  totalWeightG?: number;
  servings?: number;
  createdAt: string;
  updatedAt?: string;
}

export type CustomMealAmountMode = "servings" | "grams";

export interface CustomMealSelection {
  mode: CustomMealAmountMode;
  value: number;
}

const EMPTY_VALUES: NutritionValues = { calories: 0, protein: 0, carbs: 0, fat: 0 };

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function roundNutritionValues(values: NutritionValues): NutritionValues {
  return {
    calories: round(values.calories),
    protein: round(values.protein),
    carbs: round(values.carbs),
    fat: round(values.fat),
  };
}

export function scaleNutritionValues(values: NutritionValues, factor: number): NutritionValues {
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 0;
  return roundNutritionValues({
    calories: values.calories * safeFactor,
    protein: values.protein * safeFactor,
    carbs: values.carbs * safeFactor,
    fat: values.fat * safeFactor,
  });
}

export function createCustomMealId(kind: "meal" | "ingredient") {
  return `nutrition-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function customMealIngredientValues(ingredient: CustomMealIngredient): NutritionValues {
  return scaleNutrition(ingredient.per100g, ingredient.amount);
}

export function customMealTotals(meal: Pick<CustomMeal, "ingredients">): NutritionValues {
  return roundNutritionValues(meal.ingredients.reduce((totals, ingredient) => {
    const values = customMealIngredientValues(ingredient);
    return {
      calories: totals.calories + values.calories,
      protein: totals.protein + values.protein,
      carbs: totals.carbs + values.carbs,
      fat: totals.fat + values.fat,
    };
  }, EMPTY_VALUES));
}

/**
 * Millilitres count as grams here. It keeps a dish weighable even when a liquid
 * ingredient is measured by volume, and the user can always override the result.
 */
export function customMealIngredientWeight(meal: Pick<CustomMeal, "ingredients">) {
  return round(meal.ingredients.reduce((total, ingredient) => total + ingredient.amount, 0));
}

export function customMealWeight(meal: Pick<CustomMeal, "ingredients" | "totalWeightG">) {
  return meal.totalWeightG && meal.totalWeightG > 0
    ? meal.totalWeightG
    : customMealIngredientWeight(meal);
}

export function customMealPer100g(meal: Pick<CustomMeal, "ingredients" | "totalWeightG">) {
  const weight = customMealWeight(meal);
  if (weight <= 0) return null;
  return scaleNutritionValues(customMealTotals(meal), 100 / weight);
}

export function customMealPerServing(meal: Pick<CustomMeal, "ingredients" | "servings">) {
  if (!meal.servings || meal.servings <= 0) return null;
  return scaleNutritionValues(customMealTotals(meal), 1 / meal.servings);
}

/** How many grams of the finished dish the selection stands for, or null when unknown. */
export function customMealSelectionGrams(meal: CustomMeal, selection: CustomMealSelection) {
  if (!Number.isFinite(selection.value) || selection.value <= 0) return null;
  const weight = customMealWeight(meal);
  if (selection.mode === "grams") return weight > 0 ? selection.value : null;
  if (!meal.servings || meal.servings <= 0 || weight <= 0) return null;
  return round((weight * selection.value) / meal.servings);
}

export function customMealSelectionValues(meal: CustomMeal, selection: CustomMealSelection) {
  if (!Number.isFinite(selection.value) || selection.value <= 0) return null;
  const totals = customMealTotals(meal);
  if (selection.mode === "servings") {
    if (!meal.servings || meal.servings <= 0) return null;
    return scaleNutritionValues(totals, selection.value / meal.servings);
  }
  const weight = customMealWeight(meal);
  if (weight <= 0) return null;
  return scaleNutritionValues(totals, selection.value / weight);
}

export function upsertCustomMeal(meals: CustomMeal[], meal: CustomMeal): CustomMeal[] {
  return meals.some((candidate) => candidate.id === meal.id)
    ? meals.map((candidate) => candidate.id === meal.id ? meal : candidate)
    : [...meals, meal];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNutritionValues(value: unknown): value is NutritionValues {
  return isRecord(value)
    && isFiniteNonNegative(value.calories)
    && isFiniteNonNegative(value.protein)
    && isFiniteNonNegative(value.carbs)
    && isFiniteNonNegative(value.fat);
}

function isCustomMealIngredient(value: unknown): value is CustomMealIngredient {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && (value.brand === undefined || typeof value.brand === "string")
    && isFiniteNonNegative(value.amount)
    && (value.unit === "g" || value.unit === "ml")
    && isNutritionValues(value.per100g)
    && (value.catalogId === undefined || typeof value.catalogId === "string")
    && (value.catalogSource === undefined || value.catalogSource === "usda" || value.catalogSource === "openfoodfacts");
}

export function isCustomMeal(value: unknown): value is CustomMeal {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && Array.isArray(value.ingredients)
    && value.ingredients.every(isCustomMealIngredient)
    && (value.totalWeightG === undefined || isFiniteNonNegative(value.totalWeightG))
    && (value.servings === undefined || isFiniteNonNegative(value.servings))
    && typeof value.createdAt === "string"
    && (value.updatedAt === undefined || typeof value.updatedAt === "string");
}

export function isCustomMealList(value: unknown): value is CustomMeal[] {
  return Array.isArray(value) && value.every(isCustomMeal);
}

/** Keeps every meal that still reads as one and silently drops the rest. */
export function normalizeCustomMeals(value: unknown): CustomMeal[] {
  return Array.isArray(value) ? value.filter(isCustomMeal) : [];
}
