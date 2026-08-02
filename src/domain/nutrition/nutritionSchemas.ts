import { z } from "zod";
import { isLocalDateKey } from "../../app/data/localDate";

export const mealSlotSchema = z.enum(["breakfast", "lunch", "snack", "dinner"]);
export const nutritionDateSchema = z.string().refine(isLocalDateKey, "Nieprawidłowa data.");

export const addWaterSchema = z.object({
  date: nutritionDateSchema,
  amountMl: z.number().int().min(1).max(5_000),
});

export const foodSearchSchema = z.object({
  query: z.string().trim().min(2).max(120),
  limit: z.number().int().min(1).max(10).default(8),
});

export const mealIngredientSchema = z.object({
  catalogId: z.string().trim().min(1).max(200),
  amount: z.number().positive().max(10_000),
  unit: z.enum(["g", "ml"]),
});

export const createMealDraftSchema = z.object({
  date: nutritionDateSchema,
  meal: mealSlotSchema,
  ingredients: z.array(mealIngredientSchema).min(1).max(30),
});

export const updateMealDraftSchema = z.object({
  draftId: z.string().trim().min(1).max(200),
  ingredients: z.array(mealIngredientSchema).min(1).max(30),
});

export const commitMealDraftSchema = z.object({
  draftId: z.string().trim().min(1).max(200),
});
