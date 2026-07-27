export type EquationVariant = "female" | "male";
export type WorkActivity = "desk" | "light" | "standing" | "physical" | "heavy";
export type ActivityType = "strength" | "running" | "cycling" | "swimming" | "walking" | "team" | "yoga" | "martial-arts" | "other";
export type ActivityIntensity = "light" | "moderate" | "intense";
export type DietAdjustmentMode = "percent" | "kcal";
export type MacroMode = "auto" | "percent" | "grams";
export type MacroPreset = "balanced" | "strength" | "cut" | "endurance";

export interface WeeklyActivity {
  id: string;
  type: ActivityType;
  intensity: ActivityIntensity;
  timesPerWeek: number;
  minutesPerSession: number;
}

export interface NutritionCalculatorProfile {
  equationVariant: EquationVariant;
  age: number;
  weightKg: number;
  heightCm: number;
  workActivity: WorkActivity;
  activities: WeeklyActivity[];
  dietAdjustmentMode: DietAdjustmentMode;
  dietAdjustmentValue: number;
}

export interface MacroConfiguration {
  mode: MacroMode;
  preset: MacroPreset;
  proteinPercent: number;
  carbsPercent: number;
  fatPercent: number;
}

export interface MacroTargets {
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionCalculation {
  bmr: number;
  workDayCalories: number;
  weeklySportCalories: number;
  sportCalories: number;
  maintenanceCalories: number;
  calorieAdjustment: number;
  calorieTarget: number;
  waterTargetMl: number;
}

export const EQUATION_VARIANT_OPTIONS = [
  { value: "female", label: "Kobieta" },
  { value: "male", label: "Mężczyzna" },
];

export const WORK_ACTIVITY_OPTIONS = [
  { value: "desk", label: "Praca siedząca · mało ruchu", factor: 1.2 },
  { value: "light", label: "Głównie siedząca · regularne chodzenie", factor: 1.3 },
  { value: "standing", label: "Stojąca lub chodzona", factor: 1.4 },
  { value: "physical", label: "Praca fizyczna", factor: 1.55 },
  { value: "heavy", label: "Ciężka praca fizyczna", factor: 1.7 },
] satisfies Array<{ value: WorkActivity; label: string; factor: number }>;

export const ACTIVITY_TYPE_OPTIONS = [
  { value: "strength", label: "Siłownia / trening siłowy", met: { light: 3.5, moderate: 5, intense: 6 } },
  { value: "running", label: "Bieganie", met: { light: 6, moderate: 8, intense: 10 } },
  { value: "cycling", label: "Rower", met: { light: 4, moderate: 6.8, intense: 10 } },
  { value: "swimming", label: "Pływanie", met: { light: 4.5, moderate: 6, intense: 9 } },
  { value: "walking", label: "Marsz / spacer", met: { light: 2.8, moderate: 3.8, intense: 5 } },
  { value: "team", label: "Sport zespołowy", met: { light: 5, moderate: 7, intense: 9 } },
  { value: "yoga", label: "Joga / mobility", met: { light: 2.5, moderate: 3, intense: 4 } },
  { value: "martial-arts", label: "Sporty walki", met: { light: 5, moderate: 7.5, intense: 10 } },
  { value: "other", label: "Inna aktywność", met: { light: 3, moderate: 5, intense: 8 } },
] satisfies Array<{ value: ActivityType; label: string; met: Record<ActivityIntensity, number> }>;

export const ACTIVITY_INTENSITY_OPTIONS = [
  { value: "light", label: "Lekka" },
  { value: "moderate", label: "Umiarkowana" },
  { value: "intense", label: "Intensywna" },
];

export const DIET_ADJUSTMENT_MODE_OPTIONS = [
  { value: "percent", label: "Procent względem utrzymania" },
  { value: "kcal", label: "Stała liczba kcal" },
];

export const MACRO_MODE_OPTIONS = [
  { value: "auto", label: "Autowyliczenie z wagi i celu kcal" },
  { value: "percent", label: "Procent kalorii" },
  { value: "grams", label: "Twarde wartości w gramach" },
];

export const MACRO_PRESET_OPTIONS = [
  { value: "balanced", label: "Zbilansowane · 1,6 g białka/kg", proteinPerKg: 1.6, fatPerKg: 0.9 },
  { value: "strength", label: "Trening siłowy · 1,8 g białka/kg", proteinPerKg: 1.8, fatPerKg: 0.9 },
  { value: "cut", label: "Redukcja · 2,0 g białka/kg", proteinPerKg: 2, fatPerKg: 0.8 },
  { value: "endurance", label: "Wytrzymałość · 1,6 g białka/kg", proteinPerKg: 1.6, fatPerKg: 0.8 },
] satisfies Array<{ value: MacroPreset; label: string; proteinPerKg: number; fatPerKg: number }>;

export const DEFAULT_MACRO_CONFIGURATION: MacroConfiguration = {
  mode: "grams",
  preset: "balanced",
  proteinPercent: 25,
  carbsPercent: 45,
  fatPercent: 30,
};

const workActivityById = Object.fromEntries(WORK_ACTIVITY_OPTIONS.map((option) => [option.value, option])) as Record<WorkActivity, typeof WORK_ACTIVITY_OPTIONS[number]>;
const activityTypeById = Object.fromEntries(ACTIVITY_TYPE_OPTIONS.map((option) => [option.value, option])) as Record<ActivityType, typeof ACTIVITY_TYPE_OPTIONS[number]>;
const macroPresetById = Object.fromEntries(MACRO_PRESET_OPTIONS.map((option) => [option.value, option])) as Record<MacroPreset, typeof MACRO_PRESET_OPTIONS[number]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step;
}

function isWeeklyActivity(value: unknown): value is WeeklyActivity {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string"
    && ACTIVITY_TYPE_OPTIONS.some((option) => option.value === value.type)
    && ACTIVITY_INTENSITY_OPTIONS.some((option) => option.value === value.intensity)
    && typeof value.timesPerWeek === "number" && value.timesPerWeek >= 1 && value.timesPerWeek <= 14
    && typeof value.minutesPerSession === "number" && value.minutesPerSession >= 5 && value.minutesPerSession <= 360
  );
}

export function isNutritionCalculatorProfile(value: unknown): value is NutritionCalculatorProfile {
  if (!isRecord(value)) return false;
  return (
    (value.equationVariant === "female" || value.equationVariant === "male")
    && typeof value.age === "number" && value.age >= 18 && value.age <= 100
    && typeof value.weightKg === "number" && value.weightKg >= 30 && value.weightKg <= 300
    && typeof value.heightCm === "number" && value.heightCm >= 120 && value.heightCm <= 230
    && WORK_ACTIVITY_OPTIONS.some((option) => option.value === value.workActivity)
    && Array.isArray(value.activities) && value.activities.every(isWeeklyActivity)
    && (value.dietAdjustmentMode === "percent" || value.dietAdjustmentMode === "kcal")
    && typeof value.dietAdjustmentValue === "number"
    && (
      (value.dietAdjustmentMode === "percent" && value.dietAdjustmentValue >= -40 && value.dietAdjustmentValue <= 40)
      || (value.dietAdjustmentMode === "kcal" && value.dietAdjustmentValue >= -2000 && value.dietAdjustmentValue <= 2000)
    )
  );
}

export function normalizeNutritionCalculatorProfile(value: unknown): NutritionCalculatorProfile | undefined {
  if (isNutritionCalculatorProfile(value)) return value;
  if (!isRecord(value)) return undefined;

  const legacyBaseValid = (
    (value.equationVariant === "female" || value.equationVariant === "male")
    && typeof value.age === "number" && value.age >= 18 && value.age <= 100
    && typeof value.weightKg === "number" && value.weightKg >= 30 && value.weightKg <= 300
    && typeof value.heightCm === "number" && value.heightCm >= 120 && value.heightCm <= 230
    && WORK_ACTIVITY_OPTIONS.some((option) => option.value === value.workActivity)
  );
  if (!legacyBaseValid) return undefined;

  const legacySportMinutes = typeof value.sportMinutes === "number" ? value.sportMinutes : 0;
  const legacySportIntensity = typeof value.sportIntensity === "string" ? value.sportIntensity : "none";
  const activities: WeeklyActivity[] = legacySportMinutes > 0 && legacySportIntensity !== "none" ? [{
    id: "legacy-weekly-activity",
    type: legacySportIntensity === "light" ? "walking" : "other",
    intensity: legacySportIntensity === "intense" ? "intense" : "moderate",
    timesPerWeek: 7,
    minutesPerSession: Math.min(360, Math.max(5, legacySportMinutes)),
  }] : [];
  const legacyGoalAdjustments: Record<string, number> = {
    "loss-gentle": -10,
    "loss-standard": -15,
    maintain: 0,
    "gain-gentle": 5,
    "gain-standard": 10,
  };

  return {
    equationVariant: value.equationVariant as EquationVariant,
    age: value.age as number,
    weightKg: value.weightKg as number,
    heightCm: value.heightCm as number,
    workActivity: value.workActivity as WorkActivity,
    activities,
    dietAdjustmentMode: "percent",
    dietAdjustmentValue: legacyGoalAdjustments[String(value.dietGoal)] ?? 0,
  };
}

export function normalizeMacroConfiguration(value: unknown): MacroConfiguration {
  if (!isRecord(value)) return { ...DEFAULT_MACRO_CONFIGURATION };
  const mode = MACRO_MODE_OPTIONS.some((option) => option.value === value.mode) ? value.mode as MacroMode : DEFAULT_MACRO_CONFIGURATION.mode;
  const preset = MACRO_PRESET_OPTIONS.some((option) => option.value === value.preset) ? value.preset as MacroPreset : DEFAULT_MACRO_CONFIGURATION.preset;
  const safePercent = (candidate: unknown, fallback: number) => (
    typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 && candidate <= 100 ? candidate : fallback
  );
  const proteinPercent = safePercent(value.proteinPercent, DEFAULT_MACRO_CONFIGURATION.proteinPercent);
  const carbsPercent = safePercent(value.carbsPercent, DEFAULT_MACRO_CONFIGURATION.carbsPercent);
  const fatPercent = safePercent(value.fatPercent, DEFAULT_MACRO_CONFIGURATION.fatPercent);
  if (mode === "percent" && Math.abs(proteinPercent + carbsPercent + fatPercent - 100) > 0.01) {
    return { ...DEFAULT_MACRO_CONFIGURATION, mode: "percent" };
  }
  return { mode, preset, proteinPercent, carbsPercent, fatPercent };
}

/**
 * Energy:
 * - Resting energy expenditure: Mifflin–St Jeor equation.
 * - Weekly activities: net MET cost averaged across seven days, so resting 1 MET is not counted twice.
 *
 * Water:
 * - A transparent product estimate: 1 ml per estimated maintenance kcal.
 * - This shortcut has limited precision and is not a clinical prescription.
 */
export function calculateNutritionTargets(profile: NutritionCalculatorProfile): NutritionCalculation {
  const equationOffset = profile.equationVariant === "male" ? 5 : -161;
  const bmr = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + equationOffset;
  const workDayCalories = bmr * workActivityById[profile.workActivity].factor;
  const weeklySportCalories = profile.activities.reduce((sum, activity) => {
    const met = activityTypeById[activity.type].met[activity.intensity];
    const hoursPerWeek = activity.timesPerWeek * activity.minutesPerSession / 60;
    return sum + Math.max(0, met - 1) * profile.weightKg * hoursPerWeek;
  }, 0);
  const sportCalories = weeklySportCalories / 7;
  const maintenanceCalories = workDayCalories + sportCalories;
  const calorieAdjustment = profile.dietAdjustmentMode === "percent"
    ? maintenanceCalories * profile.dietAdjustmentValue / 100
    : profile.dietAdjustmentValue;
  const calorieTarget = roundTo(maintenanceCalories + calorieAdjustment, 10);
  const waterTargetMl = roundTo(maintenanceCalories, 50);

  return {
    bmr: roundTo(bmr, 1),
    workDayCalories: roundTo(workDayCalories, 1),
    weeklySportCalories: roundTo(weeklySportCalories, 1),
    sportCalories: roundTo(sportCalories, 1),
    maintenanceCalories: roundTo(maintenanceCalories, 10),
    calorieAdjustment: roundTo(calorieAdjustment, 1),
    calorieTarget,
    waterTargetMl,
  };
}

export function calculateMacroTargetsByPreset(calories: number, weightKg: number, preset: MacroPreset): MacroTargets | null {
  const configuration = macroPresetById[preset];
  const protein = roundTo(weightKg * configuration.proteinPerKg, 1);
  const fat = roundTo(weightKg * configuration.fatPerKg, 1);
  const remainingCalories = calories - protein * 4 - fat * 9;
  if (remainingCalories <= 0) return null;
  return { protein, carbs: roundTo(remainingCalories / 4, 1), fat };
}

export function calculateMacroTargetsByPercent(
  calories: number,
  proteinPercent: number,
  carbsPercent: number,
  fatPercent: number,
): MacroTargets | null {
  if (Math.abs(proteinPercent + carbsPercent + fatPercent - 100) > 0.01) return null;
  return {
    protein: roundTo(calories * proteinPercent / 100 / 4, 1),
    carbs: roundTo(calories * carbsPercent / 100 / 4, 1),
    fat: roundTo(calories * fatPercent / 100 / 9, 1),
  };
}
