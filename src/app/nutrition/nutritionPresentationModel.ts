import { Apple, Coffee, Moon, Utensils } from "lucide-react";
import { pluralize } from "../formatters";
import { uiColors } from "../ui";
import {
  ACTIVITY_INTENSITY_OPTIONS,
  ACTIVITY_TYPE_OPTIONS,
  calculateMacroTargetsByPercent,
  calculateMacroTargetsByPreset,
  DEFAULT_MACRO_CONFIGURATION,
  DIET_ADJUSTMENT_MODE_OPTIONS,
  EQUATION_VARIANT_OPTIONS,
  MACRO_MODE_OPTIONS,
  MACRO_PRESET_OPTIONS,
  WORK_ACTIVITY_OPTIONS,
  type ActivityIntensity,
  type ActivityType,
  type DietAdjustmentMode,
  type EquationVariant,
  type MacroConfiguration,
  type MacroMode,
  type MacroPreset,
  type NutritionCalculatorProfile,
  type WeeklyActivity,
  type WorkActivity,
} from "../data/nutritionCalculator";
import type { FoodSuggestion } from "../data/nutritionCatalog";
import {
  nutritionDateKey,
  type MealSlot,
  type NutritionEntry,
} from "../data/nutritionWorkspace";

export const MEAL_META = [
  { id: "breakfast" as const, label: "Śniadanie", icon: Coffee },
  { id: "lunch" as const, label: "Obiad", icon: Utensils },
  { id: "dinner" as const, label: "Kolacja", icon: Moon },
  { id: "snack" as const, label: "Przekąski", icon: Apple },
];

export const NUTRIENT_META = [
  { key: "calories" as const, label: "Kalorie", color: uiColors.categorySky },
  { key: "protein" as const, label: "Białko", unit: "g", color: uiColors.categoryTeal },
  { key: "carbs" as const, label: "Węglowodany", unit: "g", color: uiColors.categorySand },
  { key: "fat" as const, label: "Tłuszcze", unit: "g", color: uiColors.categoryRose },
];

export const WATER_AMOUNTS = [150, 250, 330, 500];

export type EntryField = "calories" | "protein" | "carbs" | "fat";
export type GoalDialog = "nutrition" | "water" | null;
/** Analysis is a route of its own; the only weight surface left as a dialog is the measurement. */
export type WeightDialog = "measurement" | null;

export interface EntryDraft {
  meal: MealSlot;
  name: string;
  amount: string;
  unit: "g" | "ml";
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

export interface CalculatorDraft {
  equationVariant: string;
  age: string;
  weightKg: string;
  heightCm: string;
  workActivity: string;
  activities: ActivityDraft[];
  dietAdjustmentMode: string;
  dietAdjustmentValue: string;
}

export interface ActivityDraft {
  id: string;
  type: string;
  intensity: string;
  timesPerWeek: string;
  minutesPerSession: string;
}

export interface MacroDraft {
  mode: string;
  preset: string;
  proteinPercent: string;
  carbsPercent: string;
  fatPercent: string;
}

export interface CalculationSyncState {
  calories: boolean;
  macros: boolean;
}

export type CalculatorErrorField = "equationVariant" | "age" | "weightKg" | "heightCm" | "workActivity" | "activities" | "dietAdjustmentMode" | "dietAdjustmentValue";
export type CalculatorErrors = Partial<Record<CalculatorErrorField, string>>;

export const createEntryDraft = (meal: MealSlot = "breakfast"): EntryDraft => ({
  meal,
  name: "",
  amount: "100",
  unit: "g",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
});

export function createCalculatorDraft(profile?: NutritionCalculatorProfile): CalculatorDraft {
  return {
    equationVariant: profile?.equationVariant ?? "",
    age: profile ? String(profile.age) : "",
    weightKg: profile ? String(profile.weightKg) : "",
    heightCm: profile ? String(profile.heightCm) : "",
    workActivity: profile?.workActivity ?? "desk",
    activities: profile?.activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      intensity: activity.intensity,
      timesPerWeek: String(activity.timesPerWeek),
      minutesPerSession: String(activity.minutesPerSession),
    })) ?? [],
    dietAdjustmentMode: profile?.dietAdjustmentMode ?? "percent",
    dietAdjustmentValue: profile ? String(profile.dietAdjustmentValue) : "0",
  };
}

export function createMacroDraft(configuration: MacroConfiguration = DEFAULT_MACRO_CONFIGURATION): MacroDraft {
  return {
    mode: configuration.mode,
    preset: configuration.preset,
    proteinPercent: String(configuration.proteinPercent),
    carbsPercent: String(configuration.carbsPercent),
    fatPercent: String(configuration.fatPercent),
  };
}

export function parseCalculatorDraft(draft: CalculatorDraft): { errors: CalculatorErrors; profile?: NutritionCalculatorProfile } {
  const errors: CalculatorErrors = {};
  const age = Number(draft.age.replace(",", "."));
  const weightKg = Number(draft.weightKg.replace(",", "."));
  const heightCm = Number(draft.heightCm.replace(",", "."));
  const equationVariant = draft.equationVariant as EquationVariant;
  const workActivity = draft.workActivity as WorkActivity;
  const dietAdjustmentMode = draft.dietAdjustmentMode as DietAdjustmentMode;
  const dietAdjustmentValue = Number(draft.dietAdjustmentValue.replace(",", "."));
  const activities: WeeklyActivity[] = draft.activities.map((activity) => ({
    id: activity.id,
    type: activity.type as ActivityType,
    intensity: activity.intensity as ActivityIntensity,
    timesPerWeek: Number(activity.timesPerWeek.replace(",", ".")),
    minutesPerSession: Number(activity.minutesPerSession.replace(",", ".")),
  }));

  if (!EQUATION_VARIANT_OPTIONS.some((option) => option.value === equationVariant)) errors.equationVariant = "Wybierz płeć.";
  if (!Number.isFinite(age) || age < 18 || age > 100) errors.age = "Podaj wiek od 18 do 100 lat.";
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) errors.weightKg = "Podaj wagę od 30 do 300 kg.";
  if (!Number.isFinite(heightCm) || heightCm < 120 || heightCm > 230) errors.heightCm = "Podaj wzrost od 120 do 230 cm.";
  if (!WORK_ACTIVITY_OPTIONS.some((option) => option.value === workActivity)) errors.workActivity = "Wybierz charakter pracy.";
  if (activities.some((activity) => (
    !ACTIVITY_TYPE_OPTIONS.some((option) => option.value === activity.type)
    || !ACTIVITY_INTENSITY_OPTIONS.some((option) => option.value === activity.intensity)
    || !Number.isFinite(activity.timesPerWeek) || activity.timesPerWeek < 1 || activity.timesPerWeek > 14
    || !Number.isFinite(activity.minutesPerSession) || activity.minutesPerSession < 5 || activity.minutesPerSession > 360
  ))) errors.activities = "Każda aktywność wymaga rodzaju, intensywności, 1–14 treningów tygodniowo i 5–360 minut.";
  if (!DIET_ADJUSTMENT_MODE_OPTIONS.some((option) => option.value === dietAdjustmentMode)) errors.dietAdjustmentMode = "Wybierz sposób korekty.";
  const adjustmentLimit = dietAdjustmentMode === "percent" ? 40 : 2000;
  if (!Number.isFinite(dietAdjustmentValue) || Math.abs(dietAdjustmentValue) > adjustmentLimit) {
    errors.dietAdjustmentValue = dietAdjustmentMode === "percent"
      ? "Podaj wartość od −40% do +40%."
      : "Podaj wartość od −2000 do +2000 kcal.";
  }

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    profile: {
      equationVariant,
      age,
      weightKg,
      heightCm,
      workActivity,
      activities,
      dietAdjustmentMode,
      dietAdjustmentValue,
    } satisfies NutritionCalculatorProfile,
  };
}

export function parseMacroDraft(draft: MacroDraft): { error?: string; configuration?: MacroConfiguration } {
  const mode = draft.mode as MacroMode;
  const preset = draft.preset as MacroPreset;
  const proteinPercent = Number(draft.proteinPercent.replace(",", "."));
  const carbsPercent = Number(draft.carbsPercent.replace(",", "."));
  const fatPercent = Number(draft.fatPercent.replace(",", "."));
  if (!MACRO_MODE_OPTIONS.some((option) => option.value === mode)) return { error: "Wybierz sposób konfiguracji makroskładników." };
  if (mode === "auto" && !MACRO_PRESET_OPTIONS.some((option) => option.value === preset)) return { error: "Wybierz profil autowyliczenia." };
  if (mode === "percent") {
    if ([proteinPercent, carbsPercent, fatPercent].some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      return { error: "Każdy udział procentowy musi mieścić się w zakresie 0–100%." };
    }
    if (Math.abs(proteinPercent + carbsPercent + fatPercent - 100) > 0.01) {
      return { error: "Białko, węglowodany i tłuszcze muszą razem dawać 100%." };
    }
  }
  return {
    configuration: {
      mode,
      preset,
      proteinPercent: Number.isFinite(proteinPercent) ? proteinPercent : DEFAULT_MACRO_CONFIGURATION.proteinPercent,
      carbsPercent: Number.isFinite(carbsPercent) ? carbsPercent : DEFAULT_MACRO_CONFIGURATION.carbsPercent,
      fatPercent: Number.isFinite(fatPercent) ? fatPercent : DEFAULT_MACRO_CONFIGURATION.fatPercent,
    },
  };
}

export function calculateMacroDraftTargets(
  calories: number,
  draft: MacroDraft,
  profile?: NutritionCalculatorProfile,
) {
  if (!Number.isFinite(calories) || calories <= 0) return null;
  if (draft.mode === "auto") {
    if (!profile || !MACRO_PRESET_OPTIONS.some((option) => option.value === draft.preset)) return null;
    return calculateMacroTargetsByPreset(calories, profile.weightKg, draft.preset as MacroPreset);
  }
  if (draft.mode === "percent") {
    const proteinPercent = Number(draft.proteinPercent.replace(",", "."));
    const carbsPercent = Number(draft.carbsPercent.replace(",", "."));
    const fatPercent = Number(draft.fatPercent.replace(",", "."));
    return calculateMacroTargetsByPercent(calories, proteinPercent, carbsPercent, fatPercent);
  }
  return null;
}

export function shiftDate(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return nutritionDateKey(date);
}

export function formatDate(dateKey: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

export function formatCompactDate(dateKey: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

export function sumEntries(entries: NutritionEntry[]) {
  return entries.reduce((totals, entry) => ({
    calories: totals.calories + entry.calories,
    protein: totals.protein + entry.protein,
    carbs: totals.carbs + entry.carbs,
    fat: totals.fat + entry.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

export function parseDraftNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function formatNumber(value: number) {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 1 });
}

export function formatWater(value: number) {
  if (value >= 1000) return `${(value / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 2 })} l`;
  return `${value.toLocaleString("pl-PL")} ml`;
}

export function formatEntryCount(count: number) {
  return pluralize(count, "produkt", "produkty", "produktów");
}

export function entrySuggestion(entry: NutritionEntry): FoodSuggestion | null {
  if (!entry.per100g || !entry.catalogId || !entry.catalogSource) return null;
  return {
    id: entry.catalogId,
    name: entry.name,
    brand: entry.brand,
    source: entry.catalogSource,
    defaultAmount: entry.amount ?? 100,
    unit: entry.unit ?? "g",
    per100g: entry.per100g,
  };
}
