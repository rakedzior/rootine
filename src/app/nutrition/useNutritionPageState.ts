import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router";
import { readSessionDraft } from "../ui/hooks/useDraftProtection";
import type {
  CalculationSyncState,
  CalculatorDraft,
  EntryDraft,
  MacroDraft,
} from "./nutritionPresentationModel";
import { parseNutritionDateParam } from "./useNutritionCommandAction";

export type WeightDraftState = { date: string; weightKg: string; note: string };

export interface GoalDraftSnapshot {
  goalDraft: {
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
    waterMl: string;
  };
  calculatorDraft: CalculatorDraft;
  macroDraft: MacroDraft;
  calculationSync: CalculationSyncState;
  waterCalculatorMode: "simple" | "advanced";
  waterSimpleWeight: string;
}

export type NutritionProtectedDraft =
  | { kind: "entry"; value: EntryDraft }
  | { kind: "weight"; value: WeightDraftState }
  | { kind: "goals"; value: GoalDraftSnapshot }
  | { kind: "none" };

export const NUTRITION_DRAFT_PREFIX = "rootine.draft.nutrition.v1";

export function draftsMatch(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function readNutritionSessionDraft<T>(storageKey: string, kind: Exclude<NutritionProtectedDraft["kind"], "none">) {
  const stored = readSessionDraft<T | NutritionProtectedDraft>(storageKey);
  if (!stored || typeof stored !== "object" || !("kind" in stored)) return stored as T | null;
  return stored.kind === kind ? stored.value as T : null;
}

export function useNutritionDateQuery(
  selectedDate: string,
  setSelectedDate: Dispatch<SetStateAction<string>>,
) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rawDate = params.get("data");
    if (rawDate === null) return;
    const requestedDate = parseNutritionDateParam(rawDate);
    if (requestedDate) {
      if (requestedDate !== selectedDate) setSelectedDate(requestedDate);
      return;
    }
    params.delete("data");
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate, selectedDate, setSelectedDate]);

  return useCallback((date: string) => {
    const params = new URLSearchParams(location.search);
    params.set("data", date);
    navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);
}
