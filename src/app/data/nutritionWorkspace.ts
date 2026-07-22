export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";

export interface NutritionEntry {
  id: string;
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: string;
  updatedAt?: string;
}

export interface NutritionDay {
  date: string;
  water: number;
  source: "user" | "demo";
  entries: Record<MealSlot, NutritionEntry[]>;
}

export interface NutritionGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water: number;
}

export interface NutritionWorkspace {
  version: 1;
  updatedAt: string;
  goals: NutritionGoals;
  days: Record<string, NutritionDay>;
}

export interface NutritionLoadResult {
  status: "ok" | "missing" | "corrupt";
  workspace: NutritionWorkspace;
}

const STORAGE_KEY = "rootine.nutrition-workspace.v1";
const WORKSPACE_VERSION = 1 as const;

export const DEFAULT_NUTRITION_GOALS: NutritionGoals = {
  calories: 2300,
  protein: 150,
  carbs: 270,
  fat: 75,
  water: 8,
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
    water: 0,
    source: "user",
    entries: { breakfast: [], lunch: [], snack: [], dinner: [] },
  };
}

export function createEmptyNutritionWorkspace(): NutritionWorkspace {
  return {
    version: WORKSPACE_VERSION,
    updatedAt: new Date(0).toISOString(),
    goals: { ...DEFAULT_NUTRITION_GOALS },
    days: {},
  };
}

export function createDemoNutritionDay(date: string): NutritionDay {
  const createdAt = new Date().toISOString();
  return {
    date,
    water: 5,
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

function normalizeEntry(value: unknown): NutritionEntry | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  return {
    id: value.id,
    name: value.name,
    portion: typeof value.portion === "string" ? value.portion : "1 porcja",
    calories: safeNumber(value.calories),
    protein: safeNumber(value.protein),
    carbs: safeNumber(value.carbs),
    fat: safeNumber(value.fat),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

function normalizeDay(date: string, value: unknown): NutritionDay {
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
    water: safeNumber(value.water),
    source: value.source === "demo" || inferredDemo ? "demo" : "user",
    entries: normalizedEntries,
  };
}

export function loadNutritionWorkspace(): NutritionLoadResult {
  const fallback = createEmptyNutritionWorkspace();
  if (typeof window === "undefined") return { status: "missing", workspace: fallback };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { status: "missing", workspace: fallback };
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed) || parsed.version !== WORKSPACE_VERSION || !isRecord(parsed.goals) || !isRecord(parsed.days)) {
      return { status: "corrupt", workspace: fallback };
    }
    const goals: NutritionGoals = {
      calories: safePositiveNumber(parsed.goals.calories, fallback.goals.calories),
      protein: safePositiveNumber(parsed.goals.protein, fallback.goals.protein),
      carbs: safePositiveNumber(parsed.goals.carbs, fallback.goals.carbs),
      fat: safePositiveNumber(parsed.goals.fat, fallback.goals.fat),
      water: safePositiveNumber(parsed.goals.water, fallback.goals.water),
    };
    const days = Object.fromEntries(Object.entries(parsed.days).map(([date, value]) => [date, normalizeDay(date, value)]));
    return {
      status: "ok",
      workspace: {
        version: WORKSPACE_VERSION,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : fallback.updatedAt,
        goals,
        days,
      },
    };
  } catch {
    return { status: "corrupt", workspace: fallback };
  }
}

export function saveNutritionWorkspace(workspace: NutritionWorkspace) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...workspace,
      version: WORKSPACE_VERSION,
      updatedAt: new Date().toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
}
