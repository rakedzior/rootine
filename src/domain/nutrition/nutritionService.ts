import {
  NUTRITION_STORAGE_KEY,
  adjustNutritionWater,
  createEmptyNutritionDay,
  loadNutritionWorkspace,
  saveNutritionWorkspace,
  type MealSlot,
  type NutritionDay,
  type NutritionEntry,
  type NutritionWorkspace,
} from "../../app/data/nutritionWorkspace";
import {
  GENERIC_FOODS,
  scaleNutrition,
  type FoodSuggestion,
} from "../../app/data/nutritionCatalog";
import { createDomainId, domainFailure } from "../shared";
import { commitDomainMutation } from "../shared/mutation";
import type { DomainCandidate, DomainMutationResult } from "../shared/result";
import { createWorkspaceUndo } from "../shared/workspaceUndo";
import {
  addWaterSchema,
  commitMealDraftSchema,
  createMealDraftSchema,
  updateMealDraftSchema,
} from "./nutritionSchemas";

export interface MealDraftIngredient {
  catalogId: string;
  name: string;
  brand?: string;
  amount: number;
  unit: "g" | "ml";
  source: "usda" | "openfoodfacts";
  nutrition: FoodSuggestion["per100g"];
}

interface StoredMealDraftIngredient extends MealDraftIngredient {
  per100g: FoodSuggestion["per100g"];
}

export interface MealDraft {
  id: string;
  date: string;
  meal: MealSlot;
  ingredients: MealDraftIngredient[];
  totals: FoodSuggestion["per100g"];
  createdAt: string;
  expiresAt: string;
}

interface StoredMealDraft extends Omit<MealDraft, "ingredients"> {
  ingredients: StoredMealDraftIngredient[];
}

type MealDraftResult =
  | { success: true; draft: MealDraft }
  | { success: false; code: "NOT_FOUND" | "AMBIGUOUS" | "VALIDATION"; message: string; candidates: DomainCandidate[] };

const draftStore = new Map<string, StoredMealDraft>();
const DRAFT_TTL_MS = 30 * 60 * 1000;

function pruneDrafts() {
  const now = Date.now();
  draftStore.forEach((draft, id) => {
    if (Date.parse(draft.expiresAt) <= now) draftStore.delete(id);
  });
}

function availableFoods(): FoodSuggestion[] {
  const saved = Object.values(loadNutritionWorkspace().workspace.days)
    .flatMap((day) => Object.values(day.entries).flat())
    .filter((entry): entry is NutritionEntry & Required<Pick<NutritionEntry, "catalogId" | "catalogSource" | "per100g" | "amount" | "unit">> => (
      Boolean(entry.catalogId && entry.catalogSource && entry.per100g && entry.amount && entry.unit)
    ))
    .map((entry) => ({
      id: entry.catalogId,
      name: entry.name,
      brand: entry.brand,
      source: entry.catalogSource,
      defaultAmount: entry.amount,
      unit: entry.unit,
      per100g: entry.per100g,
    }));
  const unique = new Map<string, FoodSuggestion>();
  [...GENERIC_FOODS, ...saved].forEach((food) => unique.set(food.id, food));
  return [...unique.values()];
}

function buildDraftIngredient(input: { catalogId: string; amount: number; unit: "g" | "ml" }): StoredMealDraftIngredient | null {
  const food = availableFoods().find((candidate) => candidate.id === input.catalogId);
  if (!food || food.unit !== input.unit) return null;
  return {
    catalogId: food.id,
    name: food.name,
    brand: food.brand,
    amount: input.amount,
    unit: input.unit,
    source: food.source,
    per100g: { ...food.per100g },
    nutrition: scaleNutrition(food.per100g, input.amount),
  };
}

function draftTotals(ingredients: StoredMealDraftIngredient[]) {
  return ingredients.reduce((sum, ingredient) => ({
    calories: Math.round((sum.calories + ingredient.nutrition.calories) * 10) / 10,
    protein: Math.round((sum.protein + ingredient.nutrition.protein) * 10) / 10,
    carbs: Math.round((sum.carbs + ingredient.nutrition.carbs) * 10) / 10,
    fat: Math.round((sum.fat + ingredient.nutrition.fat) * 10) / 10,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function materializeIngredients(inputs: Array<{ catalogId: string; amount: number; unit: "g" | "ml" }>): MealDraftResult | StoredMealDraftIngredient[] {
  const ingredients = inputs.map(buildDraftIngredient);
  const missingIndex = ingredients.findIndex((ingredient) => ingredient === null);
  if (missingIndex !== -1) {
    const input = inputs[missingIndex];
    const sameId = availableFoods().filter((food) => food.id === input.catalogId);
    return {
      success: false,
      code: sameId.length > 1 ? "AMBIGUOUS" : "NOT_FOUND",
      message: sameId.length > 0
        ? "Jednostka nie pasuje do zapisanego produktu."
        : "Nie znaleziono produktu z potwierdzonymi wartościami odżywczymi.",
      candidates: sameId.map((food) => ({ id: food.id, title: food.name, module: "nutrition", context: `${food.defaultAmount} ${food.unit}` })),
    };
  }
  return ingredients.filter((ingredient): ingredient is StoredMealDraftIngredient => ingredient !== null);
}

function toPublicDraft(draft: StoredMealDraft): MealDraft {
  return {
    ...draft,
    ingredients: draft.ingredients.map(({ per100g: _per100g, ...ingredient }) => ingredient),
  };
}

export function createMealDraft(input: unknown): MealDraftResult {
  const parsed = createMealDraftSchema.safeParse(input);
  if (!parsed.success) return { ...domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy szkic posiłku."), code: "VALIDATION" };
  const ingredients = materializeIngredients(parsed.data.ingredients);
  if (!Array.isArray(ingredients)) return ingredients;
  const createdAt = new Date();
  const draft: StoredMealDraft = {
    id: createDomainId("meal-draft"),
    date: parsed.data.date,
    meal: parsed.data.meal,
    ingredients,
    totals: draftTotals(ingredients),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + DRAFT_TTL_MS).toISOString(),
  };
  pruneDrafts();
  draftStore.set(draft.id, draft);
  return { success: true, draft: toPublicDraft(draft) };
}

export function updateMealDraft(input: unknown): MealDraftResult {
  const parsed = updateMealDraftSchema.safeParse(input);
  if (!parsed.success) return { ...domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy szkic posiłku."), code: "VALIDATION" };
  pruneDrafts();
  const current = draftStore.get(parsed.data.draftId);
  if (!current) return { success: false, code: "NOT_FOUND", message: "Szkic posiłku wygasł lub nie istnieje.", candidates: [] };
  const ingredients = materializeIngredients(parsed.data.ingredients);
  if (!Array.isArray(ingredients)) return ingredients;
  const next = { ...current, ingredients, totals: draftTotals(ingredients) };
  draftStore.set(next.id, next);
  return { success: true, draft: toPublicDraft(next) };
}

function replaceDay(workspace: NutritionWorkspace, value: NutritionDay | null, date: string): NutritionWorkspace {
  const days = { ...workspace.days };
  if (value) days[date] = value;
  else delete days[date];
  return { ...workspace, days, updatedAt: new Date().toISOString() };
}

export async function addWater(input: unknown): Promise<DomainMutationResult<NutritionDay>> {
  const parsed = addWaterSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowa ilość wody.");
  const workspace = loadNutritionWorkspace().workspace;
  const before = workspace.days[parsed.data.date] ?? createEmptyNutritionDay(parsed.data.date);
  if (before.closedAt) return domainFailure("CONFLICT", "Ten dzień żywieniowy jest zamknięty.");
  const nextMl = before.waterMl + parsed.data.amountMl;
  if (nextMl > 20_000) return domainFailure("VALIDATION", "Łączna ilość wody nie może przekroczyć 20 000 ml.");
  const after = { ...adjustNutritionWater(before, parsed.data.amountMl), source: "user" as const };
  const next = replaceDay(workspace, after, parsed.data.date);
  const undo = createWorkspaceUndo({
    storageKey: NUTRITION_STORAGE_KEY,
    read: () => loadNutritionWorkspace().workspace,
    save: saveNutritionWorkspace,
    select: (current) => current.days[parsed.data.date] ?? null,
    apply: (current, value) => replaceDay(current, value, parsed.data.date),
    expected: after,
    restore: before,
    message: "Cofnięto dodanie wody.",
  });
  return commitDomainMutation({
    entityId: `water:${parsed.data.date}`, storageKey: NUTRITION_STORAGE_KEY,
    event: { type: "nutrition.water_added", domain: "nutrition", entityId: `water:${parsed.data.date}`, payload: { date: parsed.data.date, previousMl: before.waterMl, nextMl, addedMl: parsed.data.amountMl } },
    save: () => saveNutritionWorkspace(next), read: () => loadNutritionWorkspace().workspace,
    verify: (current) => current.days[parsed.data.date]?.waterMl === nextMl,
    selectSnapshot: (current) => current.days[parsed.data.date] ?? after,
    message: `Dodano ${parsed.data.amountMl} ml wody.`, compensation: undo,
  });
}

export async function commitMealDraft(input: unknown): Promise<DomainMutationResult<NutritionDay>> {
  const parsed = commitMealDraftSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy identyfikator szkicu.");
  pruneDrafts();
  const draft = draftStore.get(parsed.data.draftId);
  if (!draft) return domainFailure("NOT_FOUND", "Szkic posiłku wygasł lub nie istnieje.");
  const workspace = loadNutritionWorkspace().workspace;
  const before = workspace.days[draft.date] ?? createEmptyNutritionDay(draft.date);
  if (before.closedAt) return domainFailure("CONFLICT", "Ten dzień żywieniowy jest zamknięty.");
  const createdAt = new Date().toISOString();
  const entries: NutritionEntry[] = draft.ingredients.map((ingredient, index) => ({
    id: createDomainId(`meal-${index + 1}`),
    name: ingredient.name,
    brand: ingredient.brand,
    portion: `${ingredient.amount} ${ingredient.unit}`,
    amount: ingredient.amount,
    unit: ingredient.unit,
    catalogId: ingredient.catalogId,
    catalogSource: ingredient.source,
    per100g: { ...ingredient.per100g },
    ...ingredient.nutrition,
    createdAt,
  }));
  const after: NutritionDay = {
    ...before,
    source: "user",
    entries: { ...before.entries, [draft.meal]: [...before.entries[draft.meal], ...entries] },
  };
  const next = replaceDay(workspace, after, draft.date);
  const compensation = createWorkspaceUndo({
    storageKey: NUTRITION_STORAGE_KEY,
    read: () => loadNutritionWorkspace().workspace,
    save: saveNutritionWorkspace,
    select: (current) => current.days[draft.date] ?? null,
    apply: (current, value) => replaceDay(current, value, draft.date),
    expected: after,
    restore: before,
    message: "Cofnięto zapis posiłku.",
  });
  const result = await commitDomainMutation({
    entityId: draft.id, storageKey: NUTRITION_STORAGE_KEY,
    event: { type: "nutrition.meal_committed", domain: "nutrition", entityId: draft.id, payload: { date: draft.date, meal: draft.meal, entryCount: entries.length } },
    save: () => saveNutritionWorkspace(next), read: () => loadNutritionWorkspace().workspace,
    verify: (current) => entries.every((entry) => current.days[draft.date]?.entries[draft.meal].some((saved) => saved.id === entry.id)),
    selectSnapshot: (current) => current.days[draft.date] ?? after,
    message: "Zapisano posiłek z potwierdzonymi wartościami odżywczymi.", compensation,
  });
  if (result.success) draftStore.delete(draft.id);
  return result;
}

export function clearMealDraftsForTests() {
  draftStore.clear();
}
