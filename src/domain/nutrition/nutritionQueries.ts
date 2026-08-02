import {
  createEmptyNutritionDay,
  loadNutritionWorkspace,
  type MealSlot,
  type NutritionDay,
  type NutritionEntry,
} from "../../app/data/nutritionWorkspace";
import { searchGenericFoods, type FoodSuggestion } from "../../app/data/nutritionCatalog";
import { foodSearchSchema } from "./nutritionSchemas";

const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

export function isNutritionSampleEntry(entry: Pick<NutritionEntry, "id">) {
  return entry.id.startsWith("nutrition-sample-") || entry.id.startsWith("demo-");
}

function entriesOf(day: NutritionDay) {
  return MEAL_SLOTS.flatMap((meal) => day.entries[meal]);
}

function isSeededWorkspace() {
  const days = Object.values(loadNutritionWorkspace().workspace.days);
  const entries = days.flatMap(entriesOf);
  return entries.length > 0 && entries.every(isNutritionSampleEntry);
}

export function searchFoodProducts(input: unknown): { items: FoodSuggestion[]; total: number; error?: string } {
  const parsed = foodSearchSchema.safeParse(input);
  if (!parsed.success) return { items: [], total: 0, error: parsed.error.issues[0]?.message };
  const items = searchGenericFoods(parsed.data.query, parsed.data.limit).map((food) => ({
    id: food.id,
    name: food.name,
    ...(food.brand ? { brand: food.brand } : {}),
    source: food.source,
    defaultAmount: food.defaultAmount,
    unit: food.unit,
    per100g: { ...food.per100g },
  }));
  return { items, total: items.length };
}

export function getNutritionSummary(date: string) {
  const workspace = loadNutritionWorkspace().workspace;
  const day = workspace.days[date] ?? createEmptyNutritionDay(date);
  const allEntries = entriesOf(day);
  const sampleDataIgnored = allEntries.length > 0 && allEntries.every(isNutritionSampleEntry);
  const entries = sampleDataIgnored ? [] : allEntries.filter((entry) => !isNutritionSampleEntry(entry));
  const totals = entries.reduce((sum, entry) => ({
    calories: sum.calories + entry.calories,
    protein: sum.protein + entry.protein,
    carbs: sum.carbs + entry.carbs,
    fat: sum.fat + entry.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return {
    date,
    totals,
    remainingCalories: Math.max(0, workspace.goals.calories - totals.calories),
    goals: workspace.goals,
    waterMl: sampleDataIgnored ? 0 : day.waterMl,
    closed: Boolean(day.closedAt),
    sampleDataIgnored,
  };
}

export function getWaterSummary(date: string) {
  const summary = getNutritionSummary(date);
  return {
    date,
    waterMl: summary.waterMl,
    goalMl: summary.goals.waterMl,
    remainingMl: Math.max(0, summary.goals.waterMl - summary.waterMl),
    sampleDataIgnored: summary.sampleDataIgnored,
  };
}

export function getRecentMeals(limit = 10) {
  const workspace = loadNutritionWorkspace().workspace;
  return Object.values(workspace.days)
    .sort((left, right) => right.date.localeCompare(left.date))
    .flatMap((day) => MEAL_SLOTS.flatMap((meal) => day.entries[meal]
      .filter((entry) => !isNutritionSampleEntry(entry))
      .map((entry) => ({
        id: entry.id,
        date: day.date,
        meal,
        name: entry.name,
        amount: entry.amount ?? null,
        unit: entry.unit ?? null,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        catalogId: entry.catalogId ?? null,
      }))))
    .slice(0, Math.max(0, Math.min(30, limit)));
}

export function getBodySummary() {
  const workspace = loadNutritionWorkspace().workspace;
  if (isSeededWorkspace()) {
    return { latestWeight: null, latestMeasurements: [], sampleDataIgnored: true };
  }
  const latestWeight = Object.values(workspace.weightMeasurements)
    .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
  const latestMeasurements = Object.entries(workspace.bodyMeasurements ?? {}).flatMap(([type, values]) => {
    const latest = [...values].sort((left, right) => right.date.localeCompare(left.date))[0];
    return latest ? [{ ...latest, type }] : [];
  });
  return {
    latestWeight: latestWeight
      ? { date: latestWeight.date, value: latestWeight.weightKg, unit: "kg" as const }
      : null,
    latestMeasurements: latestMeasurements.map((measurement) => ({
      type: measurement.type,
      date: measurement.date,
      value: measurement.valueCm,
      unit: "cm" as const,
    })),
    sampleDataIgnored: false,
  };
}
