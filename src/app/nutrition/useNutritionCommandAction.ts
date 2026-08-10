import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useSearchParams } from "react-router";
import type { FoodSuggestion } from "../data/nutritionCatalog";
import type { MealSlot, NutritionEntry, WeightMeasurement } from "../data/nutritionWorkspace";
import { nutritionDateKey } from "../data/nutritionWorkspace";
import { createEntryDraft, type EntryDraft, type WeightDialog } from "./nutritionPresentationModel";

const COMMAND_ACTIONS = ["dodaj-posilek", "dodaj-wode", "dodaj-wage"] as const;
type NutritionCommandAction = typeof COMMAND_ACTIONS[number];

interface NutritionCommandBindings {
  setSelectedDate: Dispatch<SetStateAction<string>>;
  setEntryDraft: Dispatch<SetStateAction<EntryDraft>>;
  setEditingEntry: Dispatch<SetStateAction<{ meal: MealSlot; entry: NutritionEntry } | null>>;
  setSelectedFood: Dispatch<SetStateAction<FoodSuggestion | null>>;
  setEntryErrors: Dispatch<SetStateAction<{ name?: string; amount?: string; calories?: string }>>;
  setCatalogOpen: Dispatch<SetStateAction<boolean>>;
  setEntryDialogOpen: Dispatch<SetStateAction<boolean>>;
  setWaterCustomAmount: Dispatch<SetStateAction<string>>;
  waterCustomInputRef: RefObject<HTMLInputElement | null>;
  weightMeasurements: Record<string, WeightMeasurement>;
  setWeightDraft: Dispatch<SetStateAction<{ date: string; weightKg: string; note: string }>>;
  setWeightError: Dispatch<SetStateAction<string>>;
  setWeightDialog: Dispatch<SetStateAction<WeightDialog>>;
}

function isNutritionCommandAction(value: string | null): value is NutritionCommandAction {
  return COMMAND_ACTIONS.some((action) => action === value);
}

export function parseNutritionDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

export function readInitialNutritionCommand() {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const action = params.get("akcja");
  return {
    action: isNutritionCommandAction(action) ? action : null,
    date: parseNutritionDateParam(params.get("data")),
    title: params.get("tytul")?.trim() ?? "",
  };
}

export function useNutritionCommandAction(bindings: NutritionCommandBindings) {
  const [params, setParams] = useSearchParams();
  const action = params.get("akcja");
  const title = params.get("tytul")?.trim() ?? "";
  const requestedDate = parseNutritionDateParam(params.get("data"));
  const {
    setSelectedDate, setEntryDraft, setEditingEntry, setSelectedFood, setEntryErrors,
    setCatalogOpen, setEntryDialogOpen, setWaterCustomAmount, waterCustomInputRef,
    weightMeasurements, setWeightDraft, setWeightError, setWeightDialog,
  } = bindings;

  useEffect(() => {
    if (!isNutritionCommandAction(action)) return;
    const date = requestedDate ?? nutritionDateKey();
    setSelectedDate(date);

    if (action === "dodaj-posilek") {
      setEntryDraft({ ...createEntryDraft(), name: title });
      setEditingEntry(null);
      setSelectedFood(null);
      setEntryErrors({});
      setCatalogOpen(false);
      setEntryDialogOpen(true);
    } else if (action === "dodaj-wode") {
      const amount = title.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", ".") ?? "";
      if (amount) setWaterCustomAmount(amount);
      window.requestAnimationFrame(() => {
        waterCustomInputRef.current?.scrollIntoView({
          behavior: document.documentElement.dataset.motion === "reduced" ? "auto" : "smooth",
          block: "center",
        });
        waterCustomInputRef.current?.focus({ preventScroll: true });
      });
    } else {
      const existing = weightMeasurements[date];
      const capturedWeight = title.match(/\d+(?:[.,]\d+)?/)?.[0] ?? "";
      setWeightDraft({
        date,
        weightKg: capturedWeight || (existing ? String(existing.weightKg).replace(".", ",") : ""),
        note: existing?.note ?? "",
      });
      setWeightError("");
      setWeightDialog("measurement");
    }

    const nextParams = new URLSearchParams(window.location.search);
    ["akcja", "tytul", "data", "godzina", "priorytet"].forEach((key) => nextParams.delete(key));
    setParams(nextParams, { replace: true });
  }, [
    action, requestedDate, setCatalogOpen, setEditingEntry, setEntryDialogOpen, setEntryDraft,
    setEntryErrors, setParams, setSelectedDate, setSelectedFood, setWaterCustomAmount,
    setWeightDialog, setWeightDraft, setWeightError, title, waterCustomInputRef, weightMeasurements,
  ]);
}
