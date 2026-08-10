/**
 * THESIS: Odżywianie jest spokojnym dziennym bilansem, a każdy posiłek ma czytelną granicę bez zamiany produktów w kafle.
 * OWN-WORLD: Cztery miękkie grafitowe sekcje, dane w DM Mono i oszczędne akcenty kategorii.
 * STORY: Użytkownik wybiera dzień, wyszukuje polski produkt, ustala ilość i od razu widzi bilans posiłku oraz dnia.
 * FIRST VIEWPORT: Cztery posiłki stoją obok trzech równych kart: bilansu, nawodnienia i masy ciała.
 * FORM: Wariant A — SectionSurface dla posiłku, płaskie wiersze produktów i ObjectCard dla samodzielnych podsumowań.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ChartNoAxesCombined, CheckCircle2, ChevronLeft, ChevronRight, Droplets,
  LoaderCircle, Pencil, Plus, RefreshCw, RotateCcw, Save, Settings, Trash2, X,
} from "lucide-react";
import {
  Badge, Button, Card, ConfirmDialog, ContentHeader, DatePicker, Input, Modal, ModuleMain, ModuleShell,
  SectionHeader, SectionSurface, Select, Textarea, uiColors,
} from "../ui";
import { useDraftProtection } from "../ui/hooks/useDraftProtection";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { calculateNutritionTargets } from "../data/nutritionCalculator";
import {
  OpenFoodFactsSearchError,
  foodMatchesQuery,
  scaleNutrition,
  searchGenericFoods,
  searchOpenFoodFacts,
  type FoodSuggestion,
  type NutritionValues,
} from "../data/nutritionCatalog";
import {
  createEmptyNutritionDay,
  createEmptyNutritionWorkspace,
  loadNutritionWorkspace,
  NUTRITION_STORAGE_KEY,
  adjustNutritionWater,
  nutritionDateKey,
  saveNutritionWorkspace,
  type MealSlot,
  type NutritionEntry,
  type NutritionWorkspace,
} from "../data/nutritionWorkspace";
import { upsertCustomMeal, type CustomMeal } from "../data/nutritionMeals";
import { NutritionAnalysis, type NutritionAnalysisRange } from "../nutrition/NutritionAnalysis";
import { recordActivity } from "../experience/activityLog";
import { readModuleMemoryValue, writeModuleMemoryValue } from "../experience/moduleMemory";
import {
  parseNutritionDateParam,
  readInitialNutritionCommand,
  useNutritionCommandAction,
} from "../nutrition/useNutritionCommandAction";
import { NutritionWeightCard } from "../nutrition/NutritionWeightCard";
import { NutritionCustomMeals } from "../nutrition/NutritionCustomMeals";
import { NutritionGoalsDialog, NutritionWaterGoalDialog } from "../nutrition/NutritionGoalDialogs";
import { NutritionSidebar, type NutritionSidebarItem } from "../nutrition/NutritionSidebar";
import {
  NUTRITION_DRAFT_PREFIX,
  draftsMatch,
  readNutritionSessionDraft,
  useNutritionDateQuery,
  type GoalDraftSnapshot,
  type NutritionProtectedDraft,
  type WeightDraftState,
} from "../nutrition/useNutritionPageState";
import "../../styles/nutrition.css";

import {
  MEAL_META,
  NUTRIENT_META,
  WATER_AMOUNTS,
  calculateMacroDraftTargets,
  createCalculatorDraft,
  createEntryDraft,
  createMacroDraft,
  entrySuggestion,
  formatDate,
  formatEntryCount,
  formatNumber,
  formatWater,
  parseCalculatorDraft,
  parseDraftNumber,
  parseMacroDraft,
  shiftDate,
  sumEntries,
  type ActivityDraft,
  type CalculationSyncState,
  type CalculatorDraft,
  type CalculatorErrors,
  type EntryDraft,
  type EntryField,
  type GoalDialog,
  type MacroDraft,
  type WeightDialog,
} from "../nutrition/nutritionPresentationModel";

/** Every Odżywianie subtab is a real URL, so it can be linked, reloaded and shared. */
const VIEW_PATHS: Record<NutritionSidebarItem, string> = {
  today: "/odzywianie",
  meals: "/odzywianie/posilki",
  analysis: "/odzywianie/analiza",
};

export default function Odzywanie() {
  const [initialCommand] = useState(readInitialNutritionCommand);
  const quickAddRequested = initialCommand.action === "dodaj-posilek";
  const [initialLoad] = useState(loadNutritionWorkspace);
  const [workspace, setWorkspace] = useState(initialLoad.workspace);
  const [loadStatus, setLoadStatus] = useState(initialLoad.status);
  const [savePending, setSavePending] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => (
    initialCommand.date
      ? initialCommand.date
      : readModuleMemoryValue(
        "nutrition",
        "selectedDate",
        (value): value is string => typeof value === "string" && parseNutritionDateParam(value) !== undefined,
      ) ?? nutritionDateKey()
  ));
  const [entryDialogOpen, setEntryDialogOpen] = useState(quickAddRequested);
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(() => ({
    ...createEntryDraft(),
    name: quickAddRequested ? initialCommand.title : "",
  }));
  const [entryDraftBaseline, setEntryDraftBaseline] = useState<EntryDraft>(entryDraft);
  const [entryDraftStorageKey, setEntryDraftStorageKey] = useState(
    `${NUTRITION_DRAFT_PREFIX}.entry.${selectedDate}.new.${entryDraft.meal}`,
  );
  const entryDraftPreparedRef = useRef(false);
  const [selectedFood, setSelectedFood] = useState<FoodSuggestion | null>(null);
  const [editingEntry, setEditingEntry] = useState<{ meal: MealSlot; entry: NutritionEntry } | null>(null);
  const [entryErrors, setEntryErrors] = useState<{ name?: string; amount?: string; calories?: string }>({});
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogResults, setCatalogResults] = useState<FoodSuggestion[]>([]);
  const [catalogPending, setCatalogPending] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogSearchedQuery, setCatalogSearchedQuery] = useState("");
  const catalogRequestRef = useRef<AbortController | null>(null);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [goalDialog, setGoalDialog] = useState<GoalDialog>(null);
  const [goalDraft, setGoalDraft] = useState(() => ({
    calories: String(workspace.goals.calories),
    protein: String(workspace.goals.protein),
    carbs: String(workspace.goals.carbs),
    fat: String(workspace.goals.fat),
    waterMl: String(workspace.goals.waterMl),
  }));
  const [calculatorDraft, setCalculatorDraft] = useState(() => createCalculatorDraft(initialLoad.workspace.calculatorProfile));
  const [calculatorErrors, setCalculatorErrors] = useState<CalculatorErrors>({});
  const [macroDraft, setMacroDraft] = useState(() => createMacroDraft(initialLoad.workspace.macroConfiguration));
  const [calculationSync, setCalculationSync] = useState<CalculationSyncState>({
    calories: false,
    macros: false,
  });
  const [goalError, setGoalError] = useState("");
  const [weightDialog, setWeightDialog] = useState<WeightDialog>(null);
  const [weightInlineOpen, setWeightInlineOpen] = useState(false);
  const [weightDraft, setWeightDraft] = useState<WeightDraftState>({ date: nutritionDateKey(), weightKg: "", note: "" });
  const [weightDraftBaseline, setWeightDraftBaseline] = useState<WeightDraftState>(weightDraft);
  const [weightDraftStorageKey, setWeightDraftStorageKey] = useState(
    `${NUTRITION_DRAFT_PREFIX}.weight.${weightDraft.date}`,
  );
  const weightDraftPreparedRef = useRef(false);
  const [weightError, setWeightError] = useState("");
  const [analysisRange, setAnalysisRange] = useState<NutritionAnalysisRange>(7);

  useEffect(() => {
    writeModuleMemoryValue("nutrition", "selectedDate", selectedDate);
  }, [selectedDate]);
  const [waterCustomAmount, setWaterCustomAmount] = useState("");
  const [waterEditOpen, setWaterEditOpen] = useState(false);
  const [waterEditDraft, setWaterEditDraft] = useState("");
  const [waterEditError, setWaterEditError] = useState("");
  const [waterCalculatorMode, setWaterCalculatorMode] = useState<"simple" | "advanced">("simple");
  const [waterSimpleWeight, setWaterSimpleWeight] = useState("");
  const [goalDraftBaseline, setGoalDraftBaseline] = useState<GoalDraftSnapshot>(() => ({
    goalDraft,
    calculatorDraft,
    macroDraft,
    calculationSync,
    waterCalculatorMode,
    waterSimpleWeight,
  }));
  const [goalDraftStorageKey, setGoalDraftStorageKey] = useState(`${NUTRITION_DRAFT_PREFIX}.goals.nutrition`);
  const goalDraftPreparedRef = useRef(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [undoEntry, setUndoEntry] = useState<{ meal: MealSlot; entry: NutritionEntry } | null>(null);
  const waterCustomInputRef = useRef<HTMLInputElement>(null);

  useNutritionCommandAction({
    setSelectedDate, setEntryDraft, setEditingEntry, setSelectedFood, setEntryErrors,
    setCatalogOpen, setEntryDialogOpen, setWaterCustomAmount, waterCustomInputRef,
    weightMeasurements: workspace.weightMeasurements,
    setWeightDraft, setWeightError, setWeightDialog,
  });

  const location = useLocation();
  const navigate = useNavigate();
  const selectNutritionDate = useNutritionDateQuery(setSelectedDate);

  const view: NutritionSidebarItem = location.pathname === VIEW_PATHS.meals
    ? "meals"
    : location.pathname === VIEW_PATHS.analysis
      ? "analysis"
      : "today";
  const customMeals = workspace.customMeals ?? [];

  const today = nutritionDateKey();
  const day = workspace.days[selectedDate] ?? createEmptyNutritionDay(selectedDate);
  const dayClosed = Boolean(day.closedAt);
  const allEntries = useMemo(() => Object.values(day.entries).flat(), [day.entries]);
  const totals = useMemo(() => sumEntries(allEntries), [allEntries]);
  const genericResults = useMemo(() => searchGenericFoods(entryDraft.name), [entryDraft.name]);
  const remoteCatalogResults = useMemo(
    () => catalogResults.filter((item) => foodMatchesQuery(item, entryDraft.name)),
    [catalogResults, entryDraft.name],
  );
  const remoteUnbranded = useMemo(() => remoteCatalogResults.filter((item) => !item.brand), [remoteCatalogResults]);
  const remoteBranded = useMemo(() => remoteCatalogResults.filter((item) => item.brand), [remoteCatalogResults]);
  const allSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return [...genericResults, ...remoteBranded, ...remoteUnbranded].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [genericResults, remoteBranded, remoteUnbranded]);
  const calculatorProfile = useMemo(() => parseCalculatorDraft(calculatorDraft).profile, [calculatorDraft]);
  const calculatorResult = useMemo(
    () => calculatorProfile ? calculateNutritionTargets(calculatorProfile) : null,
    [calculatorProfile],
  );
  const macroPreview = useMemo(() => {
    const calories = parseDraftNumber(goalDraft.calories);
    return calculateMacroDraftTargets(calories, macroDraft, calculatorProfile);
  }, [calculatorProfile, goalDraft.calories, macroDraft]);
  const analysisEndDate = selectedDate > today ? today : selectedDate;
  const weightHistory = useMemo(
    () => Object.values(workspace.weightMeasurements)
      .filter((measurement) => measurement.date <= analysisEndDate)
      .sort((left, right) => left.date.localeCompare(right.date)),
    [analysisEndDate, workspace.weightMeasurements],
  );
  const latestWeight = weightHistory[weightHistory.length - 1];
  const weightTrend7d = useMemo(() => {
    const recentMeasurements = weightHistory.filter((measurement) => measurement.date >= shiftDate(analysisEndDate, -6));
    if (recentMeasurements.length < 2) return null;
    return recentMeasurements.at(-1)!.weightKg - recentMeasurements[0].weightKg;
  }, [analysisEndDate, weightHistory]);
  const simpleWaterWeightValue = parseDraftNumber(waterSimpleWeight);
  const simpleWaterMin = simpleWaterWeightValue >= 20 && simpleWaterWeightValue <= 500
    ? Math.round((simpleWaterWeightValue * 30) / 50) * 50
    : 0;
  const simpleWaterMax = simpleWaterWeightValue >= 20 && simpleWaterWeightValue <= 500
    ? Math.round((simpleWaterWeightValue * 35) / 50) * 50
    : 0;

  useEffect(() => {
    if (!goalDialog) return;

    setGoalDraft((current) => {
      const updates: Partial<typeof current> = {};
      let caloriesForMacros = parseDraftNumber(current.calories);

      if (
        goalDialog === "nutrition"
        && calculationSync.calories
        && calculatorResult
        && calculatorResult.calorieTarget > 0
      ) {
        updates.calories = String(calculatorResult.calorieTarget);
        caloriesForMacros = calculatorResult.calorieTarget;
      }

      if (goalDialog === "nutrition" && calculationSync.macros && macroDraft.mode !== "grams") {
        const targets = calculateMacroDraftTargets(caloriesForMacros, macroDraft, calculatorProfile);
        if (targets) {
          updates.protein = String(targets.protein);
          updates.carbs = String(targets.carbs);
          updates.fat = String(targets.fat);
        }
      }

      const changed = Object.entries(updates).some(([field, value]) => current[field as keyof typeof current] !== value);
      return changed ? { ...current, ...updates } : current;
    });
  }, [
    calculationSync.calories,
    calculationSync.macros,
    calculatorProfile,
    calculatorResult,
    goalDialog,
    goalDraft.calories,
    macroDraft,
  ]);

  useEffect(() => {
    if (!savePending) return;
    const saved = saveNutritionWorkspace(workspace);
    setStorageFailed(!saved);
    if (saved) setLoadStatus("ok");
    setSavePending(false);
  }, [savePending, workspace]);

  useEffect(() => subscribeToLocalWorkspace(NUTRITION_STORAGE_KEY, () => {
    const loaded = loadNutritionWorkspace();
    setWorkspace(loaded.workspace);
    setLoadStatus(loaded.status);
    setSavePending(false);
  }), []);

  useEffect(() => {
    setUndoEntry(null);
  }, [selectedDate]);

  useEffect(() => {
    setActiveSuggestion(0);
  }, [allSuggestions.length, entryDraft.name]);

  useEffect(() => () => catalogRequestRef.current?.abort(), []);

  const closeEntryDialog = useCallback(() => {
    entryDraftPreparedRef.current = false;
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
    setEntryDialogOpen(false);
    setEntryErrors({});
    setEditingEntry(null);
    setSelectedFood(null);
    setCatalogOpen(false);
    setCatalogResults([]);
    setCatalogPending(false);
    setCatalogError("");
    setCatalogSearchedQuery("");
  }, []);

  const closeGoalDialog = useCallback(() => {
    goalDraftPreparedRef.current = false;
    setGoalDialog(null);
    setGoalError("");
    setCalculatorErrors({});
  }, []);

  const closeWeightDialog = useCallback(() => {
    weightDraftPreparedRef.current = false;
    setWeightDialog(null);
    setWeightError("");
  }, []);

  useEffect(() => {
    if (!entryDialogOpen || entryDraftPreparedRef.current) return;
    const baseDraft = entryDraft;
    const storageKey = `${NUTRITION_DRAFT_PREFIX}.entry.${selectedDate}.${editingEntry?.entry.id ?? "new"}.${baseDraft.meal}`;
    entryDraftPreparedRef.current = true;
    setEntryDraftBaseline(baseDraft);
    setEntryDraftStorageKey(storageKey);
    const storedDraft = readNutritionSessionDraft<EntryDraft>(storageKey, "entry");
    if (storedDraft) setEntryDraft(storedDraft);
  }, [editingEntry, entryDialogOpen, entryDraft, selectedDate]);

  useEffect(() => {
    if (weightDialog !== "measurement") {
      weightDraftPreparedRef.current = false;
      return;
    }
    if (weightDraftPreparedRef.current) return;
    const baseDraft = weightDraft;
    const storageKey = `${NUTRITION_DRAFT_PREFIX}.weight.${baseDraft.date}`;
    weightDraftPreparedRef.current = true;
    setWeightDraftBaseline(baseDraft);
    setWeightDraftStorageKey(storageKey);
    const storedDraft = readNutritionSessionDraft<WeightDraftState>(storageKey, "weight");
    if (storedDraft) setWeightDraft(storedDraft);
  }, [weightDialog, weightDraft]);

  const currentGoalDraft = useMemo<GoalDraftSnapshot>(() => ({
    goalDraft,
    calculatorDraft,
    macroDraft,
    calculationSync,
    waterCalculatorMode,
    waterSimpleWeight,
  }), [
    calculationSync,
    calculatorDraft,
    goalDraft,
    macroDraft,
    waterCalculatorMode,
    waterSimpleWeight,
  ]);

  const protectedDraft: NutritionProtectedDraft = entryDialogOpen && entryDraftPreparedRef.current
    ? { kind: "entry", value: entryDraft }
    : weightDialog === "measurement" && weightDraftPreparedRef.current
      ? { kind: "weight", value: weightDraft }
      : goalDialog && goalDraftPreparedRef.current
        ? { kind: "goals", value: currentGoalDraft }
        : { kind: "none" };
  const protectedValue = protectedDraft.kind === "none" ? null : protectedDraft.value;
  const protectedBaselineValue = protectedDraft.kind === "entry"
    ? entryDraftBaseline
    : protectedDraft.kind === "weight"
      ? weightDraftBaseline
      : protectedDraft.kind === "goals"
        ? goalDraftBaseline
        : null;
  const protectedStorageKey = protectedDraft.kind === "entry"
    ? entryDraftStorageKey
    : protectedDraft.kind === "weight"
      ? weightDraftStorageKey
      : protectedDraft.kind === "goals"
        ? goalDraftStorageKey
        : "";
  const discardProtectedDraft = useCallback(() => {
    if (entryDialogOpen) closeEntryDialog();
    else if (weightDialog === "measurement") closeWeightDialog();
    else if (goalDialog) closeGoalDialog();
  }, [closeEntryDialog, closeGoalDialog, closeWeightDialog, entryDialogOpen, goalDialog, weightDialog]);
  const draftProtection = useDraftProtection<EntryDraft | WeightDraftState | GoalDraftSnapshot | null>({
    active: protectedDraft.kind !== "none",
    isDirty: !draftsMatch(protectedValue, protectedBaselineValue),
    draft: protectedValue,
    storageKey: protectedStorageKey,
    onDiscard: discardProtectedDraft,
  });

  const openEntryDialog = (meal: MealSlot = "breakfast") => {
    if (dayClosed) return;
    const baseDraft = createEntryDraft(meal);
    const storageKey = `${NUTRITION_DRAFT_PREFIX}.entry.${selectedDate}.new.${meal}`;
    entryDraftPreparedRef.current = true;
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
    setEntryDraftBaseline(baseDraft);
    setEntryDraftStorageKey(storageKey);
    setEntryDraft(readNutritionSessionDraft<EntryDraft>(storageKey, "entry") ?? baseDraft);
    setEditingEntry(null);
    setSelectedFood(null);
    setEntryErrors({});
    setCatalogOpen(false);
    setCatalogResults([]);
    setCatalogPending(false);
    setCatalogError("");
    setCatalogSearchedQuery("");
    setEntryDialogOpen(true);
  };

  const openEditDialog = (meal: MealSlot, entry: NutritionEntry) => {
    if (dayClosed) return;
    const baseDraft: EntryDraft = {
      meal,
      name: entry.name,
      amount: String(entry.amount ?? 100),
      unit: entry.unit ?? "g",
      calories: String(entry.calories),
      protein: String(entry.protein),
      carbs: String(entry.carbs),
      fat: String(entry.fat),
    };
    const storageKey = `${NUTRITION_DRAFT_PREFIX}.entry.${selectedDate}.${entry.id}.${meal}`;
    entryDraftPreparedRef.current = true;
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
    const storedDraft = readNutritionSessionDraft<EntryDraft>(storageKey, "entry");
    setEntryDraftBaseline(baseDraft);
    setEntryDraftStorageKey(storageKey);
    setEntryDraft(storedDraft ?? baseDraft);
    setSelectedFood(storedDraft ? null : entrySuggestion(entry));
    setEditingEntry({ meal, entry });
    setEntryErrors({});
    setCatalogOpen(false);
    setCatalogResults([]);
    setCatalogPending(false);
    setCatalogError("");
    setCatalogSearchedQuery("");
    setEntryDialogOpen(true);
  };

  const commitWorkspace = (updater: (current: NutritionWorkspace) => NutritionWorkspace) => {
    setWorkspace(updater);
    setSavePending(true);
  };

  const updateDay = (
    updater: (current: ReturnType<typeof createEmptyNutritionDay>) => ReturnType<typeof createEmptyNutritionDay>,
    preserveClosure = false,
  ) => {
    commitWorkspace((current) => {
      const currentDay = current.days[selectedDate] ?? createEmptyNutritionDay(selectedDate);
      if (currentDay.closedAt && !preserveClosure) return current;
      const updatedDay = updater(currentDay);
      return {
        ...current,
        days: {
          ...current.days,
          [selectedDate]: updatedDay,
        },
      };
    });
  };

  const selectSidebarItem = (item: NutritionSidebarItem) => {
    navigate(VIEW_PATHS[item]);
  };

  const saveCustomMeal = (meal: CustomMeal) => {
    commitWorkspace((current) => ({
      ...current,
      customMeals: upsertCustomMeal(current.customMeals ?? [], meal),
    }));
    recordActivity({ moduleId: "nutrition", kind: "save", title: meal.name, detail: "Własny posiłek" });
  };

  const deleteCustomMeal = (id: string) => {
    commitWorkspace((current) => ({
      ...current,
      customMeals: (current.customMeals ?? []).filter((meal) => meal.id !== id),
    }));
  };

  /** Writes into any day, not just the selected one, and leaves every other entry untouched. */
  const addCustomMealEntry = (date: string, slot: MealSlot, entry: NutritionEntry) => {
    commitWorkspace((current) => {
      const targetDay = current.days[date] ?? createEmptyNutritionDay(date);
      if (targetDay.closedAt) return current;
      return {
        ...current,
        days: {
          ...current.days,
          [date]: {
            ...targetDay,
            entries: { ...targetDay.entries, [slot]: [...targetDay.entries[slot], entry] },
          },
        },
      };
    });
    recordActivity({
      moduleId: "nutrition",
      kind: "create",
      title: entry.name,
      detail: `${MEAL_META.find((meal) => meal.id === slot)?.label ?? "Posiłek"} · ${date}`,
    });
  };

  const applyNutritionValues = (values: NutritionValues) => {
    setEntryDraft((current) => ({
      ...current,
      calories: String(values.calories),
      protein: String(values.protein),
      carbs: String(values.carbs),
      fat: String(values.fat),
    }));
  };

  const chooseFood = (food: FoodSuggestion) => {
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
    setCatalogPending(false);
    const values = scaleNutrition(food.per100g, food.defaultAmount);
    setSelectedFood(food);
    setEntryDraft((current) => ({
      ...current,
      name: food.name,
      amount: String(food.defaultAmount),
      unit: food.unit,
      calories: String(values.calories),
      protein: String(values.protein),
      carbs: String(values.carbs),
      fat: String(values.fat),
    }));
    setEntryErrors({});
    setCatalogOpen(false);
  };

  const changeAmount = (value: string) => {
    setEntryDraft((current) => ({ ...current, amount: value }));
    if (selectedFood) applyNutritionValues(scaleNutrition(selectedFood.per100g, parseDraftNumber(value)));
  };

  const changeUnit = (unit: "g" | "ml") => {
    setEntryDraft((current) => ({ ...current, unit }));
  };

  const changeProductName = (value: string) => {
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
    setEntryDraft((current) => ({ ...current, name: value }));
    if (selectedFood?.name !== value) setSelectedFood(null);
    setCatalogOpen(value.trim().length >= 1);
    setCatalogPending(false);
    setCatalogError("");
    setEntryErrors((current) => ({ ...current, name: undefined }));
  };

  const searchCatalog = useCallback((query: string) => {
    if (query.length < 2) return;

    catalogRequestRef.current?.abort();
    const controller = new AbortController();
    catalogRequestRef.current = controller;
    setCatalogOpen(true);
    setCatalogPending(true);
    setCatalogError("");

    searchOpenFoodFacts(query, controller.signal)
      .then((results) => {
        if (catalogRequestRef.current !== controller) return;
        setCatalogResults((current) => {
          const merged = [...results, ...current.filter((item) => foodMatchesQuery(item, query))];
          const seen = new Set<string>();
          return merged.filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
        });
        setCatalogSearchedQuery(query);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || catalogRequestRef.current !== controller) return;
        if (error instanceof OpenFoodFactsSearchError && error.status === 429) {
          const retry = error.retryAfterSeconds
            ? ` Spróbuj ponownie za ${error.retryAfterSeconds} s.`
            : " Spróbuj ponownie za chwilę.";
          setCatalogError(`Limit wyszukiwania został osiągnięty.${retry}`);
          return;
        }
        setCatalogError("Nie udało się pobrać dodatkowych podpowiedzi. Możesz wybrać produkt podstawowy albo uzupełnić dane ręcznie.");
      })
      .finally(() => {
        if (catalogRequestRef.current === controller) {
          catalogRequestRef.current = null;
          setCatalogPending(false);
        }
      });
  }, []);

  useEffect(() => {
    if (!entryDialogOpen) return;
    const query = entryDraft.name.trim();
    if (query.length < 2 || selectedFood?.name === entryDraft.name) return;

    const timeout = window.setTimeout(() => searchCatalog(query), 300);
    return () => {
      window.clearTimeout(timeout);
      catalogRequestRef.current?.abort();
      catalogRequestRef.current = null;
    };
  }, [entryDialogOpen, entryDraft.name, searchCatalog, selectedFood]);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!catalogOpen || !allSuggestions.length) {
      if (event.key === "ArrowDown" && allSuggestions.length) setCatalogOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((current) => (current + 1) % allSuggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((current) => (current - 1 + allSuggestions.length) % allSuggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = allSuggestions[activeSuggestion];
      if (selected) chooseFood(selected);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setCatalogOpen(false);
    }
  };

  const submitEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dayClosed) {
      setEntryErrors({ name: "Ten dzień jest zamknięty. Otwórz go ponownie, aby wprowadzać zmiany." });
      return;
    }
    const name = entryDraft.name.trim();
    const amount = parseDraftNumber(entryDraft.amount);
    const calories = parseDraftNumber(entryDraft.calories);
    const errors = {
      name: name ? undefined : "Podaj nazwę produktu lub dania.",
      amount: amount > 0 ? undefined : "Podaj ilość większą od zera.",
      calories: calories > 0 ? undefined : "Podaj kaloryczność większą od zera.",
    };
    setEntryErrors(errors);
    if (errors.name || errors.amount || errors.calories) return;

    const timestamp = new Date().toISOString();
    const entry: NutritionEntry = {
      id: editingEntry?.entry.id ?? `nutrition-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      portion: `${formatNumber(amount)} ${entryDraft.unit}`,
      amount,
      unit: entryDraft.unit,
      calories,
      protein: parseDraftNumber(entryDraft.protein),
      carbs: parseDraftNumber(entryDraft.carbs),
      fat: parseDraftNumber(entryDraft.fat),
      brand: selectedFood?.brand,
      catalogId: selectedFood?.id,
      catalogSource: selectedFood?.source,
      per100g: selectedFood?.per100g,
      createdAt: editingEntry?.entry.createdAt ?? timestamp,
      updatedAt: editingEntry ? timestamp : undefined,
    };
    updateDay((current) => {
      const entries = { ...current.entries };
      if (editingEntry) {
        entries[editingEntry.meal] = entries[editingEntry.meal].filter((candidate) => candidate.id !== editingEntry.entry.id);
      }
      const targetEntries = entries[entryDraft.meal].filter((candidate) => candidate.id !== entry.id);
      entries[entryDraft.meal] = [...targetEntries, entry];
      return { ...current, entries };
    });
    recordActivity({
      moduleId: "nutrition",
      kind: editingEntry ? "save" : "create",
      title: name,
      detail: `${MEAL_META.find((meal) => meal.id === entryDraft.meal)?.label ?? "Posiłek"} · ${selectedDate}`,
    });
    draftProtection.clearDraft();
    closeEntryDialog();
  };

  const removeEntry = (meal: MealSlot, id: string) => {
    if (dayClosed) return;
    const entry = day.entries[meal].find((candidate) => candidate.id === id);
    if (entry) setUndoEntry({ meal, entry });
    updateDay((current) => ({
      ...current,
      entries: { ...current.entries, [meal]: current.entries[meal].filter((entry) => entry.id !== id) },
    }));
  };

  const restoreEntry = () => {
    if (!undoEntry || dayClosed) return;
    updateDay((current) => ({
      ...current,
      entries: {
        ...current.entries,
        [undoEntry.meal]: [...current.entries[undoEntry.meal], undoEntry.entry],
      },
    }));
    setUndoEntry(null);
  };

  const changeWater = (delta: number) => {
    if (dayClosed) return;
    updateDay((current) => adjustNutritionWater(current, delta));
  };

  const openWaterEdit = () => {
    if (dayClosed) return;
    setWaterEditDraft(String(day.waterMl));
    setWaterEditError("");
    setWaterEditOpen(true);
  };

  const saveWaterEdit = () => {
    const amount = Math.round(parseDraftNumber(waterEditDraft));
    if (!Number.isFinite(amount) || amount < 0 || amount > 20_000) {
      setWaterEditError("Wpisz ilość od 0 do 20 000 ml.");
      return;
    }
    updateDay((current) => ({ ...current, waterMl: amount }));
    setWaterEditOpen(false);
    setWaterEditError("");
  };

  const addCustomWater = () => {
    const amount = Math.round(parseDraftNumber(waterCustomAmount));
    if (amount <= 0) return;
    changeWater(amount);
    setWaterCustomAmount("");
  };

  const toggleDayClosed = () => {
    if (selectedDate > today) return;
    updateDay((current) => ({
      ...current,
      closedAt: current.closedAt ? undefined : new Date().toISOString(),
    }), true);
  };

  const openGoalDialog = (dialog: Exclude<GoalDialog, null>) => {
    const nextGoalDraft = {
      calories: String(workspace.goals.calories),
      protein: String(workspace.goals.protein),
      carbs: String(workspace.goals.carbs),
      fat: String(workspace.goals.fat),
      waterMl: String(workspace.goals.waterMl),
    };
    const nextCalculatorDraft = createCalculatorDraft(workspace.calculatorProfile);
    const nextMacroDraft = createMacroDraft(workspace.macroConfiguration);
    const nextCalculationSync = { calories: false, macros: false };
    const nextWaterCalculatorMode = "simple" as const;
    const nextWaterSimpleWeight = String(
      latestWeight?.weightKg ?? workspace.calculatorProfile?.weightKg ?? "",
    ).replace(".", ",");
    const baseline: GoalDraftSnapshot = {
      goalDraft: nextGoalDraft,
      calculatorDraft: nextCalculatorDraft,
      macroDraft: nextMacroDraft,
      calculationSync: nextCalculationSync,
      waterCalculatorMode: nextWaterCalculatorMode,
      waterSimpleWeight: nextWaterSimpleWeight,
    };
    const storageKey = `${NUTRITION_DRAFT_PREFIX}.goals.${dialog}`;
    const restored = readNutritionSessionDraft<GoalDraftSnapshot>(storageKey, "goals") ?? baseline;
    goalDraftPreparedRef.current = true;
    setGoalDraftBaseline(baseline);
    setGoalDraftStorageKey(storageKey);
    setGoalDraft(restored.goalDraft);
    setCalculatorDraft(restored.calculatorDraft);
    setMacroDraft(restored.macroDraft);
    setCalculationSync(restored.calculationSync);
    setWaterCalculatorMode(restored.waterCalculatorMode);
    setWaterSimpleWeight(restored.waterSimpleWeight);
    setCalculatorErrors({});
    setGoalError("");
    setGoalDialog(dialog);
  };

  const openWeightMeasurement = () => {
    const measurementDate = selectedDate > today ? today : selectedDate;
    const existing = workspace.weightMeasurements[measurementDate];
    setWeightDraft({
      date: measurementDate,
      weightKg: existing ? String(existing.weightKg).replace(".", ",") : "",
      note: existing?.note ?? "",
    });
    setWeightError("");
    setWeightInlineOpen(true);
  };

  const editLatestWeight = () => {
    if (!latestWeight) return;
    const existing = workspace.weightMeasurements[latestWeight.date];
    setWeightDraft({
      date: latestWeight.date,
      weightKg: String(latestWeight.weightKg).replace(".", ","),
      note: existing?.note ?? "",
    });
    setWeightError("");
    setWeightInlineOpen(true);
  };

  const removeLatestWeight = () => {
    if (!latestWeight) return;
    commitWorkspace((current) => {
      const nextMeasurements = { ...current.weightMeasurements };
      delete nextMeasurements[latestWeight.date];
      return { ...current, weightMeasurements: nextMeasurements };
    });
    setWeightInlineOpen(false);
    setWeightError("");
  };

  const saveWeightMeasurement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const weightKg = Number(weightDraft.weightKg.replace(",", "."));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weightDraft.date) || weightDraft.date > today) {
      setWeightError("Wybierz dzisiejszą lub wcześniejszą datę.");
      return;
    }
    if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500) {
      setWeightError("Podaj wagę od 20 do 500 kg.");
      return;
    }

    const now = new Date().toISOString();
    commitWorkspace((current) => {
      const existing = current.weightMeasurements[weightDraft.date];
      return {
        ...current,
        weightMeasurements: {
          ...current.weightMeasurements,
          [weightDraft.date]: {
            date: weightDraft.date,
            weightKg: Math.round(weightKg * 10) / 10,
            note: weightDraft.note.trim() || undefined,
            createdAt: existing?.createdAt ?? now,
            updatedAt: existing ? now : undefined,
          },
        },
      };
    });
    recordActivity({
      moduleId: "nutrition",
      kind: "save",
      title: "Pomiar masy ciała",
      detail: weightDraft.date,
    });
    if (weightDialog === "measurement") {
      draftProtection.clearDraft();
      closeWeightDialog();
    }
    setWeightInlineOpen(false);
    setWeightError("");
  };

  const changeCalculatorField = (field: Exclude<keyof CalculatorDraft, "activities">, value: string) => {
    setCalculatorDraft((current) => ({
      ...current,
      [field]: value,
    }));
    setCalculatorErrors((current) => ({ ...current, [field]: undefined }));
  };

  const addCalculatorActivity = () => {
    const id = `weekly-activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCalculatorDraft((current) => ({
      ...current,
      activities: [...current.activities, {
        id,
        type: "strength",
        intensity: "moderate",
        timesPerWeek: "1",
        minutesPerSession: "45",
      }],
    }));
    setCalculatorErrors((current) => ({ ...current, activities: undefined }));
  };

  const changeCalculatorActivity = (id: string, field: Exclude<keyof ActivityDraft, "id">, value: string) => {
    setCalculatorDraft((current) => ({
      ...current,
      activities: current.activities.map((activity) => activity.id === id ? { ...activity, [field]: value } : activity),
    }));
    setCalculatorErrors((current) => ({ ...current, activities: undefined }));
  };

  const removeCalculatorActivity = (id: string) => {
    setCalculatorDraft((current) => ({
      ...current,
      activities: current.activities.filter((activity) => activity.id !== id),
    }));
    setCalculatorErrors((current) => ({ ...current, activities: undefined }));
  };

  const changeMacroField = (field: keyof MacroDraft, value: string) => {
    setMacroDraft((current) => ({ ...current, [field]: value }));
    setGoalError("");
  };

  const changeGoalDraftField = (
    field: "calories" | "protein" | "carbs" | "fat" | "waterMl",
    value: string,
  ) => {
    setGoalDraft((current) => ({ ...current, [field]: value }));
    if (field === "calories" || field === "protein" || field === "carbs" || field === "fat") {
      const syncGroup = field === "calories" ? "calories" : "macros";
      setCalculationSync((current) => current[syncGroup] ? { ...current, [syncGroup]: false } : current);
    }
    setGoalError("");
  };

  const useCalculatedCalories = () => {
    const parsed = parseCalculatorDraft(calculatorDraft);
    setCalculatorErrors(parsed.errors);
    if (!parsed.profile) return;
    const result = calculateNutritionTargets(parsed.profile);
    if (result.calorieTarget <= 0) {
      setCalculatorErrors((current) => ({ ...current, dietAdjustmentValue: "Korekta daje cel mniejszy lub równy 0 kcal." }));
      return;
    }
    setGoalDraft((current) => ({ ...current, calories: String(result.calorieTarget) }));
    setCalculationSync((current) => ({ ...current, calories: true }));
    setGoalError("");
  };

  const useCalculatedMacros = () => {
    const parsedMacro = parseMacroDraft(macroDraft);
    if (!parsedMacro.configuration) {
      setGoalError(parsedMacro.error ?? "Nie udało się wyliczyć makroskładników.");
      return;
    }
    if (macroDraft.mode === "grams") {
      setGoalError("");
      return;
    }
    if (!macroPreview) {
      setGoalError(macroDraft.mode === "auto"
        ? "Uzupełnij profil, wagę i prawidłowy cel kalorii, aby wyliczyć makroskładniki."
        : "Udziały procentowe muszą razem dawać 100%.");
      return;
    }
    setGoalDraft((current) => ({
      ...current,
      protein: String(macroPreview.protein),
      carbs: String(macroPreview.carbs),
      fat: String(macroPreview.fat),
    }));
    setCalculationSync((current) => ({ ...current, macros: true }));
    setGoalError("");
  };

  const saveNutritionGoals = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = {
      calories: parseDraftNumber(goalDraft.calories),
      protein: parseDraftNumber(goalDraft.protein),
      carbs: parseDraftNumber(goalDraft.carbs),
      fat: parseDraftNumber(goalDraft.fat),
    };
    if (Object.values(next).some((value) => value <= 0)) {
      setGoalError("Każdy cel musi być liczbą większą od zera.");
      return;
    }
    const parsedMacro = parseMacroDraft(macroDraft);
    if (!parsedMacro.configuration) {
      setGoalError(parsedMacro.error ?? "Sprawdź konfigurację makroskładników.");
      return;
    }
    const parsedCalculator = parseCalculatorDraft(calculatorDraft);
    commitWorkspace((current) => ({
      ...current,
      goals: { ...current.goals, ...next },
      calculatorProfile: parsedCalculator.profile ?? current.calculatorProfile,
      macroConfiguration: parsedMacro.configuration ?? current.macroConfiguration,
    }));
    draftProtection.clearDraft();
    closeGoalDialog();
  };

  const saveWaterGoal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const waterMl = parseDraftNumber(goalDraft.waterMl);
    if (waterMl < 250 || waterMl > 20_000) {
      setGoalError("Ustaw cel od 250 do 20 000 ml.");
      return;
    }
    const parsedCalculator = parseCalculatorDraft(calculatorDraft);
    commitWorkspace((current) => ({
      ...current,
      goals: { ...current.goals, waterMl },
      calculatorProfile: waterCalculatorMode === "advanced"
        ? parsedCalculator.profile ?? current.calculatorProfile
        : current.calculatorProfile,
    }));
    draftProtection.clearDraft();
    closeGoalDialog();
  };

  const clearDemoDay = () => {
    if (dayClosed) return;
    commitWorkspace((current) => ({
      ...current,
      days: { ...current.days, [selectedDate]: createEmptyNutritionDay(selectedDate) },
    }));
    setUndoEntry(null);
  };

  const retryLoad = () => {
    const result = loadNutritionWorkspace();
    setLoadStatus(result.status);
    setStorageFailed(false);
    if (result.status === "ok") setWorkspace(result.workspace);
  };

  const startFreshAfterCorruption = () => {
    setWorkspace(createEmptyNutritionWorkspace());
    setLoadStatus("ok");
    setStorageFailed(false);
    setSavePending(true);
  };

  const headerMeta = (
    <>
      {dayClosed && <Badge tone="success">Dzień zamknięty</Badge>}
      {storageFailed && <Badge tone="danger">Brak zapisu lokalnego</Badge>}
      {!storageFailed && loadStatus === "corrupt" && (
        <Badge tone="danger">Zapis wymaga decyzji</Badge>
      )}
    </>
  );

  const renderSuggestionGroup = (label: string, items: FoodSuggestion[]) => {
    if (!items.length) return null;
    return (
      <div className="nutrition-suggestion-group">
        <p className="nutrition-suggestion-group__label">{label}</p>
        {items.map((food) => {
          const index = allSuggestions.findIndex((item) => item.id === food.id);
          const isActive = index === activeSuggestion;
          return (
            <button
              key={food.id}
              id={`nutrition-suggestion-${food.id}`}
              type="button"
              role="option"
              aria-selected={isActive}
              className={`nutrition-suggestion ${isActive ? "is-active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveSuggestion(index)}
              onClick={() => chooseFood(food)}
            >
              <span className="nutrition-suggestion__identity">
                <span className="nutrition-suggestion__name">{food.name}</span>
                <span className="nutrition-suggestion__meta">
                  {food.brand ? `${food.brand} · ` : ""}
                  {food.packageLabel ? `${food.packageLabel} · ` : ""}
                  {formatNumber(food.per100g.calories)} kcal / 100 {food.unit}
                </span>
              </span>
              <span className="nutrition-suggestion__macro">
                B {formatNumber(food.per100g.protein)} · W {formatNumber(food.per100g.carbs)} · T {formatNumber(food.per100g.fat)}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const mobileNavigation = (
    <Select
      compact
      fieldClassName="context-mobile-select"
      aria-label="Widok Odżywiania"
      value={view}
      options={[
        { value: "today", label: "Dzisiaj" },
        { value: "meals", label: "Własne posiłki" },
        { value: "analysis", label: "Analiza" },
      ]}
      onChange={(event) => selectSidebarItem(event.target.value as NutritionSidebarItem)}
    />
  );

  return (
    <ModuleShell
      className="nutrition-module"
      pageWidth="wide"
      contextSidebar={(
        <NutritionSidebar
          active={view}
          mealCount={customMeals.length}
          onSelect={selectSidebarItem}
        />
      )}
    >
      <ModuleMain transitionKey={`${view}:${selectedDate}`} className="nutrition-module-main flex min-w-0 flex-1 flex-col overflow-hidden">
      {loadStatus === "corrupt" ? (
        <div className="nutrition-content min-h-0 flex-1 overflow-y-auto px-7 py-5">
          <Card as="section" tone="panel" padding="spacious" className="mx-auto max-w-[680px]" role="alert">
            <SectionHeader
              title="Nie udało się odczytać lokalnego dziennika"
              description="Nie nadpisaliśmy zapisanych danych. Możesz ponowić odczyt albo świadomie rozpocząć nowy, pusty dziennik."
            />
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="quiet" leadingIcon={<RefreshCw size={13} />} onClick={retryLoad}>
                Spróbuj ponownie
              </Button>
              <Button variant="danger" onClick={startFreshAfterCorruption}>
                Rozpocznij pusty dziennik
              </Button>
            </div>
          </Card>
        </div>
      ) : view === "analysis" ? (
        <>
          <ContentHeader
            headingLevel={1}
            className="nutrition-content-header"
            title="Analiza"
            description="Porównaj zapisane posiłki, nawodnienie i pomiary masy w wybranym okresie"
            mobileNavigation={mobileNavigation}
          />
          <div className="nutrition-content min-h-0 flex-1 overflow-y-auto px-7 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <NutritionAnalysis
              endDate={analysisEndDate}
              days={workspace.days}
              goals={workspace.goals}
              weightMeasurements={workspace.weightMeasurements}
              range={analysisRange}
              onRangeChange={setAnalysisRange}
            />
          </div>
        </>
      ) : view === "meals" ? (
        <NutritionCustomMeals
          meals={customMeals}
          selectedDate={selectedDate}
          isDayClosed={(date) => Boolean(workspace.days[date]?.closedAt)}
          mobileNavigation={mobileNavigation}
          onSave={saveCustomMeal}
          onDelete={deleteCustomMeal}
          onAddToDay={addCustomMealEntry}
        />
      ) : (
        <>
          <ContentHeader
            headingLevel={1}
            className="nutrition-content-header"
            title="Dzienny rejestr"
            description={`${formatEntryCount(allEntries.length)} · ${formatNumber(totals.calories)} / ${formatNumber(workspace.goals.calories)} kcal`}
            meta={headerMeta}
            mobileNavigation={mobileNavigation}
            actions={<>
              <div className="nutrition-date-navigation">
                <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni dzień" onClick={() => selectNutritionDate(shiftDate(selectedDate, -1))}><ChevronLeft size={13} /></Button>
                <DatePicker value={selectedDate} onChange={(value) => selectNutritionDate(value || today)} aria-label="Wybrany dzień" displayValue={formatDate(selectedDate)} fieldClassName="nutrition-date-input" />
                <Button variant="ghost" size="sm" iconOnly aria-label="Następny dzień" onClick={() => selectNutritionDate(shiftDate(selectedDate, 1))}><ChevronRight size={13} /></Button>
                {selectedDate !== today && <Button variant="quiet" size="sm" onClick={() => selectNutritionDate(today)}>Dzisiaj</Button>}
              </div>
              <Button variant="quiet" size="sm" leadingIcon={<ChartNoAxesCombined size={13} />} onClick={() => selectSidebarItem("analysis")}>
                Analiza
              </Button>
              {day.source === "demo" && <Button variant="quiet" size="sm" disabled={dayClosed} onClick={clearDemoDay}>Wyczyść przykład</Button>}
              <Button
                variant="quiet"
                size="sm"
                className={`nutrition-day-close ${dayClosed ? "is-closed" : ""}`}
                leadingIcon={dayClosed ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                aria-pressed={dayClosed}
                aria-label={dayClosed ? "Otwórz ponownie wybrany dzień" : "Zamknij wybrany dzień"}
                disabled={selectedDate > today}
                title={selectedDate > today
                  ? "Nie można zamknąć przyszłego dnia."
                  : dayClosed
                    ? "Dzień jest zamknięty. Kliknij, aby otworzyć go ponownie."
                    : "Oznacz dzień jako wykonany na ekranie Dzisiaj."}
                onClick={toggleDayClosed}
              >
                {dayClosed ? "Otwórz dzień" : "Zamknij dzień"}
              </Button>
              <Button className="ui-button--icon-mobile" variant="primary" leadingIcon={<Plus size={13} />} disabled={dayClosed} onClick={() => openEntryDialog()}>
                <span className="header-action-label">Dodaj produkt</span>
              </Button>
            </>}
          />

          <div className="nutrition-content min-h-0 flex-1 overflow-y-auto px-7 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {dayClosed && (
              <Card tone="input" padding="dense" className="nutrition-closed-notice" role="status">
                <CheckCircle2 size={13} aria-hidden="true" />
                <span>Dzień jest zamknięty. Posiłki i nawodnienie są tylko do odczytu.</span>
                <Button variant="quiet" size="sm" onClick={toggleDayClosed}>Otwórz do edycji</Button>
              </Card>
            )}
            <div className="nutrition-layout w-full">
              <section className="nutrition-meals-panel min-w-0" aria-label="Posiłki">
                {allEntries.length > 0 && (
                  <div className="nutrition-entry-table-header" aria-hidden="true">
                    <span>Produkt</span>
                    <span>Porcja</span>
                    <span>B</span>
                    <span>W</span>
                    <span>T</span>
                    <span>kcal</span>
                    <span>Akcje</span>
                  </div>
                )}

                <div className="nutrition-meal-list">
                  {MEAL_META.map(({ id, label, icon: Icon }) => {
                    const mealEntries = day.entries[id];
                    const mealTotals = sumEntries(mealEntries);
                    return (
                      <SectionSurface key={id} className="nutrition-meal-card" data-meal={id} aria-labelledby={`meal-${id}`}>
                        <div className="nutrition-meal-card__header">
                          <div className="nutrition-meal-card__identity">
                            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                            <h3 id={`meal-${id}`}>{label}</h3>
                            <Badge tone="neutral">{mealEntries.length}</Badge>
                          </div>
                          {mealEntries.length > 0 && (
                            <div className="nutrition-meal-summary" aria-label={`Podsumowanie ${label}`}>
                              <span className="nutrition-meal-summary__metric is-protein"><small>B</small>{formatNumber(mealTotals.protein)} g</span>
                              <span className="nutrition-meal-summary__metric is-carbs"><small>W</small>{formatNumber(mealTotals.carbs)} g</span>
                              <span className="nutrition-meal-summary__metric is-fat"><small>T</small>{formatNumber(mealTotals.fat)} g</span>
                              <span className="nutrition-meal-summary__metric is-calories"><small>kcal</small>{formatNumber(mealTotals.calories)}</span>
                            </div>
                          )}
                          {mealEntries.length > 0 && (
                            <Button variant="ghost" size="sm" leadingIcon={<Plus size={13} />} disabled={dayClosed} aria-label={`Dodaj produkt do: ${label}`} onClick={() => openEntryDialog(id)}>
                              Dodaj
                            </Button>
                          )}
                        </div>

                        {mealEntries.length ? (
                          <div className="nutrition-entry-list">
                            {mealEntries.map((entry) => (
                              <div key={entry.id} className="nutrition-entry-item">
                                <div className="nutrition-entry-item__main">
                                  <span className="nutrition-entry-item__name" title={entry.name}>{entry.name}</span>
                                  {entry.brand && <span className="nutrition-product-brand">{entry.brand}</span>}
                                  <p>{entry.portion} · Białko {formatNumber(entry.protein)} g · Węglowodany {formatNumber(entry.carbs)} g · Tłuszcze {formatNumber(entry.fat)} g</p>
                                </div>
                                <div className="nutrition-entry-item__nutrition" aria-label={`Wartości odżywcze: ${entry.portion}, białko ${formatNumber(entry.protein)} gramów, węglowodany ${formatNumber(entry.carbs)} gramów, tłuszcz ${formatNumber(entry.fat)} gramów, ${formatNumber(entry.calories)} kilokalorii`}>
                                  <span className="nutrition-entry-item__portion">{entry.portion}</span>
                                  <span className="nutrition-entry-item__metric"><small>B</small>{formatNumber(entry.protein)} g</span>
                                  <span className="nutrition-entry-item__metric"><small>W</small>{formatNumber(entry.carbs)} g</span>
                                  <span className="nutrition-entry-item__metric"><small>T</small>{formatNumber(entry.fat)} g</span>
                                  <span className="nutrition-entry-item__calories">{formatNumber(entry.calories)} kcal</span>
                                </div>
                                <div className="nutrition-entry-item__actions">
                                  <Button variant="ghost" size="sm" iconOnly disabled={dayClosed} aria-label={`Edytuj ${entry.name}`} onClick={() => openEditDialog(id, entry)}>
                                    <Pencil size={13} />
                                  </Button>
                                  <Button variant="ghost" size="sm" iconOnly disabled={dayClosed} aria-label={`Usuń ${entry.name}`} onClick={() => removeEntry(id, entry.id)}>
                                    <Trash2 size={13} />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="nutrition-meal-card__empty">
                            <span>Nie dodano produktów</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              leadingIcon={<Plus size={13} />}
                              disabled={dayClosed}
                              onClick={() => openEntryDialog(id)}
                            >
                              Dodaj pierwszy produkt
                            </Button>
                          </div>
                        )}
                      </SectionSurface>
                    );
                  })}
                </div>

                {undoEntry && (
                  <Card tone="input" padding="dense" className="mt-3 flex items-center justify-between gap-3" role="status">
                    <span className="nutrition-undo-entry__label truncate">Usunięto: {undoEntry.entry.name}</span>
                    <Button variant="ghost" size="sm" disabled={dayClosed} onClick={restoreEntry}>Cofnij</Button>
                  </Card>
                )}
              </section>

              <aside className="nutrition-summary min-w-0">
                <SectionSurface elevated padding="default" className="nutrition-summary-card">
                  <SectionHeader
                    title="Bilans dnia"
                    variant="label"
                    action={(
                      <Button variant="ghost" size="sm" iconOnly aria-label="Ustaw cele kalorii i makroskładników" onClick={() => openGoalDialog("nutrition")}>
                        <Settings size={13} />
                      </Button>
                    )}
                  />
                  <Card tone="card" padding="default" className="nutrition-budget-card">
                    {(() => {
                      const calorieGoal = workspace.goals.calories;
                      const calorieRatio = calorieGoal > 0 ? totals.calories / calorieGoal : 0;
                      const calorieRemaining = calorieGoal - totals.calories;
                      const calorieStatus = calorieRemaining < 0
                        ? `Przekroczono o ${formatNumber(Math.abs(calorieRemaining))} kcal`
                        : calorieRatio >= 0.9
                          ? "Blisko celu"
                          : `Pozostało ${formatNumber(calorieRemaining)} kcal`;
                      return (
                        <>
                          <div className="nutrition-budget-card__primary">
                            <div>
                              <span>Kalorie</span>
                              <strong>{formatNumber(totals.calories)} / {formatNumber(calorieGoal)} kcal</strong>
                            </div>
                            <p className={calorieRemaining < 0 ? "is-over" : ""}>{calorieStatus}</p>
                            <div className="nutrition-budget-card__bar" role="progressbar" aria-label="Kalorie" aria-valuemin={0} aria-valuemax={Math.max(calorieGoal, totals.calories, 1)} aria-valuenow={totals.calories}>
                              <i style={{ transform: `scaleX(${Math.min(1, calorieRatio)})` }} />
                            </div>
                          </div>
                          <div className="nutrition-budget-card__macro-list">
                            {NUTRIENT_META.filter(({ key }) => key !== "calories").map(({ key, label, unit, color }) => {
                              const current = totals[key];
                              const goal = workspace.goals[key];
                              const remaining = goal - current;
                              const ratio = goal > 0 ? current / goal : 0;
                              const status = key === "protein"
                                ? ratio >= 1
                                  ? "Cel osiągnięty"
                                  : ratio >= 0.9
                                    ? "Cel prawie osiągnięty"
                                    : `Pozostało ${formatNumber(remaining)} ${unit}`
                                : remaining < 0
                                  ? `Przekroczono o ${formatNumber(Math.abs(remaining))} ${unit}`
                                  : `Pozostało ${formatNumber(remaining)} ${unit}`;
                              return (
                                <div key={key} className="nutrition-budget-card__macro">
                                  <div className="nutrition-budget-card__macro-head">
                                    <span>{label}</span>
                                    <strong>{formatNumber(current)} / {formatNumber(goal)} {unit}</strong>
                                  </div>
                                  <p className={key === "fat" && remaining < 0 ? "is-over" : ""}>{status}</p>
                                  <div className="nutrition-budget-card__bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(goal, current, 1)} aria-valuenow={current}>
                                    <i style={{ transform: `scaleX(${Math.min(1, ratio)})`, background: ratio > 1 ? uiColors.danger : color }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </Card>
                </SectionSurface>

                <SectionSurface elevated padding="default" className="nutrition-summary-card">
                  <SectionHeader
                    title="Nawodnienie"
                    variant="label"
                    action={(
                      <div className="nutrition-section-actions">
                        {!waterEditOpen && (
                          <Button variant="ghost" size="sm" iconOnly disabled={dayClosed} aria-label="Edytuj wypitą wodę" onClick={openWaterEdit}>
                            <Pencil size={13} />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" iconOnly aria-label="Ustaw cel nawodnienia" onClick={() => openGoalDialog("water")}>
                          <Settings size={13} />
                        </Button>
                      </div>
                    )}
                  />
                  <Card tone="panel" padding="default">
                    <div className="nutrition-water-card__summary">
                      <div className="nutrition-water-card__label">
                        <Droplets size={16} strokeWidth={1.5} />
                        <span>Wypita woda</span>
                      </div>
                      <div className="nutrition-water-card__value">
                        {waterEditOpen ? (
                          <div className="nutrition-water-card__editor">
                            <input
                              aria-label="Edytuj wypitą wodę"
                              className="nutrition-inline-number"
                              inputMode="decimal"
                              type="text"
                              value={waterEditDraft}
                              onChange={(event) => {
                                setWaterEditDraft(event.target.value.replace(/\./g, ","));
                                setWaterEditError("");
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") saveWaterEdit();
                                if (event.key === "Escape") setWaterEditOpen(false);
                              }}
                            />
                            <Button variant="ghost" size="sm" iconOnly aria-label="Zapisz ilość wypitej wody" onClick={saveWaterEdit}>
                              <CheckCircle2 size={13} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              iconOnly
                              aria-label="Anuluj edycję wypitej wody"
                              onClick={() => {
                                setWaterEditOpen(false);
                                setWaterEditError("");
                              }}
                            >
                              <X size={13} />
                            </Button>
                          </div>
                        ) : (
                          <strong>{day.waterMl.toLocaleString("pl-PL")} ml / {workspace.goals.waterMl.toLocaleString("pl-PL")} ml</strong>
                        )}
                        {!waterEditOpen && (
                          <span>
                            {day.waterMl >= workspace.goals.waterMl
                              ? day.waterMl === workspace.goals.waterMl
                                ? "Cel osiągnięty"
                                : `Przekroczono o ${(day.waterMl - workspace.goals.waterMl).toLocaleString("pl-PL")} ml`
                              : `Pozostało ${(workspace.goals.waterMl - day.waterMl).toLocaleString("pl-PL")} ml`}
                          </span>
                        )}
                      </div>
                    </div>
                    {waterEditError && <p className="nutrition-inline-error" role="alert">{waterEditError}</p>}
                    <div
                      className="nutrition-water-progress"
                      role="progressbar"
                      aria-label="Nawodnienie"
                      aria-valuemin={0}
                      aria-valuemax={Math.max(workspace.goals.waterMl, day.waterMl, 1)}
                      aria-valuenow={day.waterMl}
                      aria-valuetext={`${formatWater(day.waterMl)} z celu ${formatWater(workspace.goals.waterMl)}${day.waterMl > workspace.goals.waterMl ? `, przekroczono o ${formatWater(day.waterMl - workspace.goals.waterMl)}` : ""}`}
                    >
                      <div className="nutrition-water-progress__fill" style={{ transform: `scaleX(${Math.min(1, day.waterMl / workspace.goals.waterMl)})` }} />
                    </div>
                    <div className="nutrition-water-actions">
                      <div className="nutrition-water-controls">
                        {WATER_AMOUNTS.map((amount) => (
                          <Button key={amount} variant="quiet" size="sm" disabled={dayClosed} onClick={() => changeWater(amount)}>+{amount} ml</Button>
                        ))}
                      </div>
                      <div className="nutrition-water-custom__form">
                        <Input ref={waterCustomInputRef} aria-label="Inna ilość wody" type="number" min="1" step="50" placeholder="Własna ilość (ml)" value={waterCustomAmount} onChange={(event) => setWaterCustomAmount(event.target.value)} />
                        <Button variant="ghost" size="sm" disabled={dayClosed || !waterCustomAmount} onClick={addCustomWater}>Dodaj</Button>
                      </div>
                    </div>
                  </Card>
                </SectionSurface>

                <SectionSurface elevated padding="default" className="nutrition-summary-card">
                  <SectionHeader
                    title="Masa ciała"
                    variant="label"
                    action={(
                      <div className="nutrition-section-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          disabled={dayClosed}
                          aria-label={latestWeight ? "Edytuj ostatni pomiar masy" : "Dodaj pomiar masy"}
                          onClick={latestWeight ? editLatestWeight : openWeightMeasurement}
                        >
                          <Pencil size={13} />
                        </Button>
                        {latestWeight && (
                          <Button variant="ghost" size="sm" iconOnly disabled={dayClosed} aria-label="Usuń ostatni pomiar masy" onClick={removeLatestWeight}>
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </div>
                    )}
                  />
                  <NutritionWeightCard
                    latestWeight={latestWeight} trend7d={weightTrend7d} inlineOpen={weightInlineOpen} draft={weightDraft}
                    error={weightError} disabled={dayClosed} setDraft={setWeightDraft}
                    onRegister={openWeightMeasurement} onSubmit={saveWeightMeasurement}
                    onCancel={() => { setWeightInlineOpen(false); setWeightError(""); }}
                    onClearError={() => setWeightError("")}
                  />
                </SectionSurface>

              </aside>
            </div>
          </div>
        </>
      )}

      {loadStatus !== "corrupt" && entryDialogOpen && (
        <Modal
          title={editingEntry ? "Edytuj produkt" : "Dodaj produkt"}
          eyebrow={editingEntry ? "Korekta wpisu" : "Dziennik żywienia"}
          description={editingEntry
            ? `Zmieniasz wpis z dnia: ${formatDate(selectedDate)}.`
            : `Wpis zostanie dodany do dnia: ${formatDate(selectedDate)}.`}
          width="720px"
          bodyClassName="nutrition-entry-modal__body"
          onClose={draftProtection.requestClose}
          footer={(
            <>
              <Button variant="ghost" onClick={draftProtection.requestClose}>Anuluj</Button>
              <Button
                type="submit"
                form="nutrition-entry-form"
                variant="primary"
                leadingIcon={editingEntry ? <Save size={13} /> : <Plus size={13} />}
              >
                {editingEntry ? "Zapisz zmiany" : "Dodaj do dziennika"}
              </Button>
            </>
          )}
        >
          <form id="nutrition-entry-form" onSubmit={submitEntry} className="space-y-4">
            <Select
              label="Posiłek"
              value={entryDraft.meal}
              onChange={(event) => setEntryDraft((current) => ({ ...current, meal: event.target.value as MealSlot }))}
              options={MEAL_META.map((meal) => ({ value: meal.id, label: meal.label }))}
            />
            <div className="nutrition-food-search">
              <Input
                label="Produkt lub danie"
                placeholder="Zacznij wpisywać, np. ziemniaki albo skyr"
                value={entryDraft.name}
                error={entryErrors.name}
                hint={selectedFood ? "Wartości przeliczają się wraz z ilością." : undefined}
                role="combobox"
                aria-autocomplete="list"
                aria-controls="nutrition-food-suggestions"
                aria-expanded={catalogOpen}
                aria-activedescendant={catalogOpen && allSuggestions[activeSuggestion] ? `nutrition-suggestion-${allSuggestions[activeSuggestion].id}` : undefined}
                autoComplete="off"
                data-autofocus
                onFocus={() => setCatalogOpen(entryDraft.name.trim().length >= 1)}
                onBlur={() => setCatalogOpen(false)}
                onKeyDown={handleSearchKeyDown}
                onChange={(event) => changeProductName(event.target.value)}
              />
              {catalogOpen && entryDraft.name.trim().length >= 1 && (
                <div id="nutrition-food-suggestions" className="nutrition-suggestions" role="listbox" aria-label="Podpowiedzi produktów">
                  {renderSuggestionGroup("Produkty podstawowe", genericResults)}
                  {renderSuggestionGroup("Produkty firmowe", remoteBranded)}
                  {renderSuggestionGroup("Pozostałe produkty", remoteUnbranded)}
                  {catalogPending && (
                    <div className="nutrition-suggestions__status">
                      <LoaderCircle size={13} className="nutrition-search-spinner" />
                      Szukamy dodatkowych podpowiedzi…
                    </div>
                  )}
                  {!catalogPending && catalogError && (
                    <div className="nutrition-suggestions__status is-error" role="alert">
                      {catalogError}
                    </div>
                  )}
                  {!catalogPending && !catalogError && !allSuggestions.length && entryDraft.name.trim().length === 1 && (
                    <div className="nutrition-suggestions__status">
                      Wpisz jeszcze jedną literę, aby poszukać produktów firmowych.
                    </div>
                  )}
                  {!catalogPending && !catalogError && !allSuggestions.length && entryDraft.name.trim().length >= 2 && catalogSearchedQuery === entryDraft.name.trim() && (
                    <div className="nutrition-suggestions__status">
                      Nie znaleźliśmy produktu. Wpisz pełną nazwę i uzupełnij wartości ręcznie.
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="nutrition-amount-grid">
              <Input
                label="Ilość"
                type="number"
                min="0.1"
                step="0.1"
                value={entryDraft.amount}
                error={entryErrors.amount}
                onChange={(event) => changeAmount(event.target.value)}
              />
              <Select
                label="Jednostka"
                value={entryDraft.unit}
                onChange={(event) => changeUnit(event.target.value as "g" | "ml")}
                options={[
                  { value: "g", label: "gramy (g)" },
                  { value: "ml", label: "mililitry (ml)" },
                ]}
              />
            </div>
            <div className="nutrition-entry-form-grid">
              {([
                { key: "calories" as EntryField, label: "Kalorie", placeholder: "0", error: entryErrors.calories },
                { key: "protein" as EntryField, label: "Białko (g)", placeholder: "0" },
                { key: "carbs" as EntryField, label: "Węglowodany (g)", placeholder: "0" },
                { key: "fat" as EntryField, label: "Tłuszcze (g)", placeholder: "0" },
              ]).map((field) => (
                <Input
                  key={field.key}
                  label={field.label}
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder={field.placeholder}
                  value={entryDraft[field.key]}
                  error={field.error}
                  onChange={(event) => {
                    setSelectedFood(null);
                    setEntryDraft((current) => ({ ...current, [field.key]: event.target.value }));
                  }}
                />
              ))}
            </div>
          </form>
        </Modal>
      )}

      {weightDialog === "measurement" && (
        <Modal
          title="Pomiar masy ciała"
          eyebrow="Masa ciała"
          description="Zapisz jeden pomiar dla wybranego dnia. Ponowny zapis tej samej daty zaktualizuje wartość."
          size="sm"
          onClose={draftProtection.requestClose}
          footer={(
            <>
              <Button variant="ghost" onClick={draftProtection.requestClose}>Anuluj</Button>
              <Button type="submit" form="weight-measurement-form" variant="primary" leadingIcon={<Save size={13} />}>
                Zapisz pomiar
              </Button>
            </>
          )}
        >
          <form id="weight-measurement-form" className="nutrition-weight-form" onSubmit={saveWeightMeasurement}>
            <DatePicker
              label="Data pomiaru"
              max={today}
              value={weightDraft.date}
              onChange={(value) => {
                const existing = workspace.weightMeasurements[value];
                setWeightDraft((current) => ({
                  date: value,
                  weightKg: existing ? String(existing.weightKg) : current.weightKg,
                  note: existing?.note ?? current.note,
                }));
                setWeightError("");
              }}
            />
            <Input
              label="Waga (kg)"
              type="number"
              min="20"
              max="500"
              step="0.1"
              inputMode="decimal"
              placeholder="np. 78,4"
              value={weightDraft.weightKg}
              error={weightError}
              hint="Najlepiej mierz się o podobnej porze i w podobnych warunkach."
              data-autofocus
              onChange={(event) => {
                setWeightDraft((current) => ({ ...current, weightKg: event.target.value }));
                setWeightError("");
              }}
            />
            <Textarea
              fieldClassName="nutrition-textarea-field"
              label="Notatka (opcjonalnie)"
              value={weightDraft.note}
              rows={3}
              placeholder="Np. rano, po treningu…"
              onChange={(event) => setWeightDraft((current) => ({ ...current, note: event.target.value }))}
            />
          </form>
        </Modal>
      )}

      {goalDialog === "nutrition" && (
        <NutritionGoalsDialog
          goalDraft={goalDraft}
          goalError={goalError}
          calculatorDraft={calculatorDraft}
          calculatorErrors={calculatorErrors}
          calculatorResult={calculatorResult}
          calculationSync={calculationSync}
          macroDraft={macroDraft}
          macroPreview={macroPreview}
          onChangeGoalField={changeGoalDraftField}
          onChangeCalculatorField={changeCalculatorField}
          onAddActivity={addCalculatorActivity}
          onChangeActivity={changeCalculatorActivity}
          onRemoveActivity={removeCalculatorActivity}
          onChangeMacroField={changeMacroField}
          onUseCalculatedCalories={useCalculatedCalories}
          onUseCalculatedMacros={useCalculatedMacros}
          onClose={draftProtection.requestClose}
          onSubmit={saveNutritionGoals}
        />
      )}

      {goalDialog === "water" && (
        <NutritionWaterGoalDialog
          goalDraft={goalDraft}
          goalError={goalError}
          calculatorDraft={calculatorDraft}
          calculatorErrors={calculatorErrors}
          calculatorResult={calculatorResult}
          waterCalculatorMode={waterCalculatorMode}
          waterSimpleWeight={waterSimpleWeight}
          simpleWaterMin={simpleWaterMin}
          simpleWaterMax={simpleWaterMax}
          onChangeWaterCalculatorMode={setWaterCalculatorMode}
          onChangeWaterSimpleWeight={setWaterSimpleWeight}
          onChangeGoalField={changeGoalDraftField}
          onChangeCalculatorField={changeCalculatorField}
          onAddActivity={addCalculatorActivity}
          onChangeActivity={changeCalculatorActivity}
          onRemoveActivity={removeCalculatorActivity}
          onClose={draftProtection.requestClose}
          onSubmit={saveWaterGoal}
        />
      )}

      {draftProtection.promptOpen && protectedDraft.kind !== "none" && (
        <ConfirmDialog
          title={protectedDraft.kind === "entry"
            ? "Odrzucić zmiany produktu?"
            : protectedDraft.kind === "weight"
              ? "Odrzucić zmiany pomiaru?"
              : "Odrzucić zmiany celów?"}
          description="Niezapisane dane z tego formularza zostaną usunięte."
          confirmLabel="Odrzuć zmiany"
          cancelLabel="Kontynuuj edycję"
          tone="danger"
          onConfirm={draftProtection.confirmDiscard}
          onCancel={draftProtection.keepEditing}
        />
      )}
      </ModuleMain>
    </ModuleShell>
  );
}
