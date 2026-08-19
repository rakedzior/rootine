import {
  DEFAULT_MACRO_CONFIGURATION,
  isNutritionCalculatorProfile,
  normalizeMacroConfiguration,
  normalizeNutritionCalculatorProfile,
  type MacroConfiguration,
  type NutritionCalculatorProfile,
} from "./nutritionCalculator";
import { isCustomMealList, normalizeCustomMeals, type CustomMeal } from "./nutritionMeals";
import { readLocalWorkspace, writeLocalWorkspace } from "./localRepository";

export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";

export interface NutritionEntry {
  id: string;
  name: string;
  portion: string;
  amount?: number;
  unit?: "g" | "ml";
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  brand?: string;
  catalogId?: string;
  catalogSource?: "usda" | "openfoodfacts";
  per100g?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface NutritionDay {
  date: string;
  waterMl: number;
  source: "user" | "demo";
  closedAt?: string;
  entries: Record<MealSlot, NutritionEntry[]>;
}

export interface NutritionGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
}

export interface WeightMeasurement {
  date: string;
  weightKg: number;
  note?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BodyMeasurement {
  id: string;
  date: string;
  type: string;
  valueCm: number;
  note?: string;
  createdAt: string;
}

export interface NutritionWorkspace {
  version: 6;
  updatedAt: string;
  goals: NutritionGoals;
  calculatorProfile?: NutritionCalculatorProfile;
  macroConfiguration: MacroConfiguration;
  weightMeasurements: Record<string, WeightMeasurement>;
  bodyMeasurements?: Record<string, BodyMeasurement[]>;
  /** Saved dishes the user re-adds to a day. Optional so journals written before them stay valid. */
  customMeals?: CustomMeal[];
  days: Record<string, NutritionDay>;
}

export interface NutritionLoadResult {
  status: "ok" | "missing" | "corrupt";
  workspace: NutritionWorkspace;
}

export const NUTRITION_STORAGE_KEY = "rootine.nutrition-workspace.v1";
const WORKSPACE_VERSION = 6 as const;

export const DEFAULT_NUTRITION_GOALS: NutritionGoals = {
  calories: 2300,
  protein: 150,
  carbs: 270,
  fat: 75,
  waterMl: 2000,
};

export function nutritionDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createEmptyNutritionDay(date: string): NutritionDay {
  return {
    date,
    waterMl: 0,
    source: "user",
    entries: { breakfast: [], lunch: [], snack: [], dinner: [] },
  };
}

export function adjustNutritionWater(day: NutritionDay, deltaMl: number): NutritionDay {
  return {
    ...day,
    waterMl: Math.max(0, Math.min(20_000, day.waterMl + deltaMl)),
  };
}

export function createEmptyNutritionWorkspace(): NutritionWorkspace {
  return {
    version: WORKSPACE_VERSION,
    updatedAt: new Date(0).toISOString(),
    goals: { ...DEFAULT_NUTRITION_GOALS },
    macroConfiguration: { ...DEFAULT_MACRO_CONFIGURATION },
    weightMeasurements: {},
    bodyMeasurements: {},
    customMeals: [],
    days: {},
  };
}

function sampleDateKey(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return nutritionDateKey(date);
}

function sampleEntry(
  date: string,
  meal: MealSlot,
  name: string,
  portion: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  index: number,
): NutritionEntry {
  return {
    id: `nutrition-sample-${date}-${meal}-${index}`,
    name,
    portion,
    calories,
    protein,
    carbs,
    fat,
    createdAt: `${date}T08:00:00.000Z`,
  };
}

/**
 * Provides a believable first view for an empty local journal so the daily
 * balance and analysis have useful history to work with. Entries are stored
 * as regular user data; there is no separate presentation state or marker.
 */
export function createNutritionReviewWorkspace(base: NutritionWorkspace): NutritionWorkspace {
  const days = Object.fromEntries(
    Array.from({ length: 14 }, (_, index) => {
      const offset = index - 13;
      const date = sampleDateKey(offset);
      const variation = index % 3;
      const breakfast = [
        sampleEntry(date, "breakfast", "Owsianka z bananem i masłem orzechowym", "420 g", 486 + variation * 18, 19 + variation, 67 + variation * 3, 15 + variation, 0),
      ];
      const lunch = [
        sampleEntry(date, "lunch", "Kurczak z ryżem i warzywami", "480 g", 672 + variation * 24, 48 + variation * 2, 75 + variation * 3, 17 + variation, 0),
      ];
      const snack = [
        sampleEntry(date, "snack", "Skyr z owocami", "200 g", 214 + variation * 12, 22 + variation, 24 + variation * 2, 4 + variation, 0),
      ];
      const dinner = [
        sampleEntry(date, "dinner", "Kanapki z twarożkiem i warzywami", "360 g", 508 + variation * 20, 31 + variation, 51 + variation * 2, 16 + variation, 0),
      ];
      return [date, {
        date,
        waterMl: 1880 + ((index * 145) % 620),
        source: "user" as const,
        entries: { breakfast, lunch, snack, dinner },
      } satisfies NutritionDay];
    }),
  );

  const weightMeasurements = Object.fromEntries(
    [-13, -10, -7, -4, -1, 0].map((offset, index) => {
      const date = sampleDateKey(offset);
      return [date, {
        date,
        weightKg: Math.round((82.4 - index * 0.18) * 10) / 10,
        note: undefined,
        createdAt: `${date}T07:30:00.000Z`,
      } satisfies WeightMeasurement];
    }),
  );

  return {
    ...base,
    calculatorProfile: base.calculatorProfile ?? {
      equationVariant: "male",
      age: 31,
      weightKg: 81.5,
      heightCm: 180,
      workActivity: "desk",
      activities: [
        { id: "sample-strength", type: "strength", intensity: "moderate", timesPerWeek: 3, minutesPerSession: 50 },
        { id: "sample-walk", type: "walking", intensity: "moderate", timesPerWeek: 5, minutesPerSession: 35 },
      ],
      dietAdjustmentMode: "percent",
      dietAdjustmentValue: 0,
    },
    weightMeasurements,
    bodyMeasurements: base.bodyMeasurements ?? {},
    days,
    updatedAt: new Date().toISOString(),
  };
}

export function createDemoNutritionDay(date: string): NutritionDay {
  const createdAt = new Date().toISOString();
  return {
    date,
    waterMl: 1250,
    source: "demo",
    entries: {
      breakfast: [
        { id: `demo-oatmeal-${date}`, name: "Owsianka z owocami", portion: "1 miska", calories: 390, protein: 16, carbs: 62, fat: 9, createdAt },
        { id: `demo-eggs-${date}`, name: "Jajka sadzone", portion: "2 szt.", calories: 180, protein: 14, carbs: 1, fat: 13, createdAt },
      ],
      lunch: [
        { id: `demo-chicken-${date}`, name: "Kurczak z ryżem", portion: "420 g", calories: 610, protein: 45, carbs: 68, fat: 15, createdAt },
        { id: `demo-salad-${date}`, name: "Sałatka warzywna", portion: "180 g", calories: 110, protein: 3, carbs: 12, fat: 6, createdAt },
      ],
      snack: [
        { id: `demo-yogurt-${date}`, name: "Jogurt grecki", portion: "180 g", calories: 160, protein: 18, carbs: 10, fat: 4, createdAt },
        { id: `demo-nuts-${date}`, name: "Orzechy włoskie", portion: "25 g", calories: 180, protein: 5, carbs: 6, fat: 16, createdAt },
      ],
      dinner: [],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function safePositiveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeOptionalPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeEntry(value: unknown): NutritionEntry | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const per100g = isRecord(value.per100g) ? {
    calories: safeNumber(value.per100g.calories),
    protein: safeNumber(value.per100g.protein),
    carbs: safeNumber(value.per100g.carbs),
    fat: safeNumber(value.per100g.fat),
  } : undefined;
  return {
    id: value.id,
    name: value.name,
    portion: typeof value.portion === "string" ? value.portion : "1 porcja",
    amount: safeOptionalPositiveNumber(value.amount),
    unit: value.unit === "ml" ? "ml" : value.unit === "g" ? "g" : undefined,
    calories: safeNumber(value.calories),
    protein: safeNumber(value.protein),
    carbs: safeNumber(value.carbs),
    fat: safeNumber(value.fat),
    brand: typeof value.brand === "string" ? value.brand : undefined,
    catalogId: typeof value.catalogId === "string" ? value.catalogId : undefined,
    catalogSource: value.catalogSource === "usda" || value.catalogSource === "openfoodfacts" ? value.catalogSource : undefined,
    per100g,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

function normalizeDay(date: string, value: unknown, legacy = false): NutritionDay {
  const fallback = createEmptyNutritionDay(date);
  if (!isRecord(value) || !isRecord(value.entries)) return fallback;
  const entries = value.entries;
  const normalizeMeal = (meal: MealSlot) => {
    const mealEntries = entries[meal];
    return Array.isArray(mealEntries)
      ? mealEntries.map((entry: unknown) => normalizeEntry(entry)).filter((entry): entry is NutritionEntry => Boolean(entry))
      : [];
  };
  const normalizedEntries = {
    breakfast: normalizeMeal("breakfast"),
    lunch: normalizeMeal("lunch"),
    snack: normalizeMeal("snack"),
    dinner: normalizeMeal("dinner"),
  };
  const flattened = Object.values(normalizedEntries).flat();
  const inferredDemo = flattened.length > 0 && flattened.every((entry) => entry.id.startsWith("demo-"));
  return {
    date,
    waterMl: legacy ? safeNumber(value.water) * 250 : safeNumber(value.waterMl),
    source: value.source === "demo" || inferredDemo ? "demo" : "user",
    closedAt: typeof value.closedAt === "string" ? value.closedAt : undefined,
    entries: normalizedEntries,
  };
}

function normalizeWeightMeasurement(date: string, value: unknown): WeightMeasurement | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !isRecord(value)
    || typeof value.weightKg !== "number"
    || !Number.isFinite(value.weightKg)
    || value.weightKg < 20
    || value.weightKg > 500
  ) return null;

  return {
    date,
    weightKg: value.weightKg,
    note: typeof value.note === "string" ? value.note : undefined,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

function normalizeBodyMeasurements(value: unknown): Record<string, BodyMeasurement[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([type, measurements]) => {
      const normalized = Array.isArray(measurements)
        ? measurements.flatMap((measurement) => {
          if (!isRecord(measurement) || typeof measurement.id !== "string" || typeof measurement.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(measurement.date) || typeof measurement.type !== "string" || typeof measurement.valueCm !== "number" || !Number.isFinite(measurement.valueCm) || measurement.valueCm <= 0 || measurement.valueCm > 300) return [];
          return [{
            id: measurement.id,
            date: measurement.date,
            type: measurement.type,
            valueCm: measurement.valueCm,
            note: typeof measurement.note === "string" ? measurement.note : undefined,
            createdAt: typeof measurement.createdAt === "string" ? measurement.createdAt : new Date(0).toISOString(),
          } satisfies BodyMeasurement];
        })
        : [];
      return [type, normalized] as const;
    }),
  );
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNutritionValues(value: unknown): value is NutritionEntry["per100g"] {
  return isRecord(value)
    && isFiniteNonNegative(value.calories)
    && isFiniteNonNegative(value.protein)
    && isFiniteNonNegative(value.carbs)
    && isFiniteNonNegative(value.fat);
}

function isNutritionEntry(value: unknown): value is NutritionEntry {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.portion === "string"
    && (value.amount === undefined || isFiniteNonNegative(value.amount))
    && (value.unit === undefined || value.unit === "g" || value.unit === "ml")
    && isFiniteNonNegative(value.calories)
    && isFiniteNonNegative(value.protein)
    && isFiniteNonNegative(value.carbs)
    && isFiniteNonNegative(value.fat)
    && (value.brand === undefined || typeof value.brand === "string")
    && (value.catalogId === undefined || typeof value.catalogId === "string")
    && (value.catalogSource === undefined || value.catalogSource === "usda" || value.catalogSource === "openfoodfacts")
    && (value.per100g === undefined || isNutritionValues(value.per100g))
    && typeof value.createdAt === "string"
    && (value.updatedAt === undefined || typeof value.updatedAt === "string");
}

function isNutritionDay(date: string, value: unknown): value is NutritionDay {
  if (!isRecord(value) || value.date !== date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (!isFiniteNonNegative(value.waterMl) || (value.source !== "user" && value.source !== "demo")) return false;
  if (value.closedAt !== undefined && typeof value.closedAt !== "string") return false;
  const entries = value.entries;
  if (!isRecord(entries)) return false;
  return (["breakfast", "lunch", "snack", "dinner"] as const).every((meal) => (
    Array.isArray(entries[meal]) && entries[meal].every(isNutritionEntry)
  ));
}

function isNutritionGoals(value: unknown): value is NutritionGoals {
  return isRecord(value)
    && ["calories", "protein", "carbs", "fat", "waterMl"].every((key) => (
      typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] > 0
    ));
}

function isMacroConfiguration(value: unknown): value is MacroConfiguration {
  if (!isRecord(value)) return false;
  const normalized = normalizeMacroConfiguration(value);
  return value.mode === normalized.mode
    && value.preset === normalized.preset
    && value.proteinPercent === normalized.proteinPercent
    && value.carbsPercent === normalized.carbsPercent
    && value.fatPercent === normalized.fatPercent;
}

export function isNutritionWorkspace(value: unknown): value is NutritionWorkspace {
  return isRecord(value)
    && value.version === WORKSPACE_VERSION
    && typeof value.updatedAt === "string"
    && isNutritionGoals(value.goals)
    && (value.calculatorProfile === undefined || isNutritionCalculatorProfile(value.calculatorProfile))
    && isMacroConfiguration(value.macroConfiguration)
    && isRecord(value.weightMeasurements)
    && Object.entries(value.weightMeasurements).every(([date, measurement]) => normalizeWeightMeasurement(date, measurement) !== null)
    && (value.bodyMeasurements === undefined || isRecord(value.bodyMeasurements))
    && (value.customMeals === undefined || isCustomMealList(value.customMeals))
    && isRecord(value.days)
    && Object.entries(value.days).every(([date, day]) => isNutritionDay(date, day));
}

function migrateNutritionWorkspace(value: unknown): NutritionWorkspace | null {
  if (
    !isRecord(value)
    || ![1, 2, 3, 4, 5].includes(value.version as number)
    || !isRecord(value.goals)
    || !isRecord(value.days)
  ) {
    return null;
  }
  const fallback = createEmptyNutritionWorkspace();
  const legacy = value.version === 1;
  const goals: NutritionGoals = {
    calories: safePositiveNumber(value.goals.calories, fallback.goals.calories),
    protein: safePositiveNumber(value.goals.protein, fallback.goals.protein),
    carbs: safePositiveNumber(value.goals.carbs, fallback.goals.carbs),
    fat: safePositiveNumber(value.goals.fat, fallback.goals.fat),
    waterMl: legacy
      ? safePositiveNumber(value.goals.water, fallback.goals.waterMl / 250) * 250
      : safePositiveNumber(value.goals.waterMl, fallback.goals.waterMl),
  };
  const days = Object.fromEntries(
    Object.entries(value.days).map(([date, day]) => [date, normalizeDay(date, day, legacy)]),
  );
  const storedWeightMeasurements = isRecord(value.weightMeasurements) ? value.weightMeasurements : {};
  const weightMeasurements = Object.fromEntries(
    Object.entries(storedWeightMeasurements)
      .map(([date, measurement]) => [date, normalizeWeightMeasurement(date, measurement)] as const)
      .filter((entry): entry is readonly [string, WeightMeasurement] => Boolean(entry[1])),
  );
  return {
    version: WORKSPACE_VERSION,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : fallback.updatedAt,
    goals,
    calculatorProfile: normalizeNutritionCalculatorProfile(value.calculatorProfile),
    macroConfiguration: normalizeMacroConfiguration(value.macroConfiguration),
    weightMeasurements,
    bodyMeasurements: normalizeBodyMeasurements(value.bodyMeasurements),
    customMeals: normalizeCustomMeals(value.customMeals),
    days,
  };
}

export function loadNutritionWorkspace(): NutritionLoadResult {
  const result = readLocalWorkspace({
    key: NUTRITION_STORAGE_KEY,
    fallback: createEmptyNutritionWorkspace,
    validate: isNutritionWorkspace,
    migrate: migrateNutritionWorkspace,
  });
  return {
    status: result.status === "migrated" ? "ok" : result.status,
    workspace: result.workspace,
  };
}

export function saveNutritionWorkspace(workspace: NutritionWorkspace) {
  return writeLocalWorkspace(NUTRITION_STORAGE_KEY, {
    ...workspace,
    version: WORKSPACE_VERSION,
    updatedAt: new Date().toISOString(),
  });
}
