/**
 * THESIS: Odżywianie jest dziennym arkuszem budżetu, nie galerią kafli KPI ani katalogiem raportów.
 * OWN-WORLD: Grafitowy rejestr czterech stałych posiłków, dane w DM Mono i jedna precyzyjna niebieska akcja.
 * STORY: Użytkownik wybiera dzień, wyszukuje polski produkt, ustala ilość i od razu widzi bilans posiłku oraz dnia.
 * FIRST VIEWPORT: Szeroki, zawsze widoczny szkielet posiłków stoi obok zwartego budżetu i panelu nawodnienia.
 * FORM: Arkusz składników pogrupowany według posiłków, z ustawieniami osadzonymi przy danych, których dotyczą.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Droplets,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,

  Save,
  Scale,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  DatePicker,
  Input,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  SectionHeader,
  Select,
  uiColors,
} from "../ui";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import {
  calculateNutritionTargets,
  MACRO_MODE_OPTIONS,
  MACRO_PRESET_OPTIONS,
} from "../data/nutritionCalculator";
import {
  OpenFoodFactsSearchError,
  scaleNutrition,
  searchGenericFoods,
  searchOpenFoodFacts,
  type FoodSuggestion,
  type NutritionValues,
} from "../data/nutritionCatalog";
import {
  createEmptyNutritionDay,
  createEmptyNutritionWorkspace,
  createNutritionReviewWorkspace,
  loadNutritionWorkspace,
  NUTRITION_STORAGE_KEY,
  nutritionDateKey,
  saveNutritionWorkspace,
  type MealSlot,
  type NutritionEntry,
  type NutritionWorkspace,
} from "../data/nutritionWorkspace";
import {
  NutritionAnalysis,
  type NutritionAnalysisRange,
} from "../nutrition/NutritionAnalysis";
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
  formatCompactDate,
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
import { CalculatorProfileFields } from "../nutrition/NutritionCalculatorFields";

function nutritionWorkspaceHasHistory(workspace: NutritionWorkspace) {
  return Object.keys(workspace.weightMeasurements).length > 0
    || Object.values(workspace.days).some((day) => (
      day.waterMl > 0 || Object.values(day.entries).some((entries) => entries.length > 0)
    ));
}

export default function Odzywanie() {
  const [initialLoad] = useState(() => {
    const loaded = loadNutritionWorkspace();
    if (loaded.status === "corrupt" || nutritionWorkspaceHasHistory(loaded.workspace)) return loaded;

    const seeded = createNutritionReviewWorkspace(loaded.workspace);
    saveNutritionWorkspace(seeded);
    return { status: "ok" as const, workspace: seeded };
  });
  const [workspace, setWorkspace] = useState(initialLoad.workspace);
  const [loadStatus, setLoadStatus] = useState(initialLoad.status);
  const [savePending, setSavePending] = useState(false);
  const [selectedDate, setSelectedDate] = useState(nutritionDateKey);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(createEntryDraft);
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
  const [weightDraft, setWeightDraft] = useState({ date: nutritionDateKey(), weightKg: "", note: "" });
  const [weightError, setWeightError] = useState("");
  const [analysisRange, setAnalysisRange] = useState<NutritionAnalysisRange>(30);
  const [waterCustomAmount, setWaterCustomAmount] = useState("");
  const [waterEditOpen, setWaterEditOpen] = useState(false);
  const [waterEditDraft, setWaterEditDraft] = useState("");
  const [waterEditError, setWaterEditError] = useState("");
  const [waterCalculatorMode, setWaterCalculatorMode] = useState<"simple" | "advanced">("simple");
  const [waterSimpleWeight, setWaterSimpleWeight] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const [undoEntry, setUndoEntry] = useState<{ meal: MealSlot; entry: NutritionEntry } | null>(null);

  const today = nutritionDateKey();
  const day = workspace.days[selectedDate] ?? createEmptyNutritionDay(selectedDate);
  const dayClosed = Boolean(day.closedAt);
  const allEntries = useMemo(() => Object.values(day.entries).flat(), [day.entries]);
  const totals = useMemo(() => sumEntries(allEntries), [allEntries]);
  const genericResults = useMemo(() => searchGenericFoods(entryDraft.name), [entryDraft.name]);
  const allSuggestions = useMemo(() => {
    const ids = new Set(genericResults.map((item) => item.id));
    return [...genericResults, ...catalogResults.filter((item) => !ids.has(item.id))];
  }, [catalogResults, genericResults]);
  const remoteUnbranded = useMemo(() => catalogResults.filter((item) => !item.brand), [catalogResults]);
  const remoteBranded = useMemo(() => catalogResults.filter((item) => item.brand), [catalogResults]);
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

  useEffect(() => {
    if (loadStatus === "corrupt" || nutritionWorkspaceHasHistory(workspace)) return;
    const seeded = createNutritionReviewWorkspace(workspace);
    setWorkspace(seeded);
    setSavePending(true);
  }, [loadStatus, workspace]);

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
    setGoalDialog(null);
    setGoalError("");
    setCalculatorErrors({});
  }, []);

  const closeWeightDialog = useCallback(() => {
    setWeightDialog(null);
    setWeightError("");
  }, []);

  const openEntryDialog = (meal: MealSlot = "breakfast") => {
    if (dayClosed) return;
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
    setEntryDraft(createEntryDraft(meal));
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
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
    setEntryDraft({
      meal,
      name: entry.name,
      amount: String(entry.amount ?? 100),
      unit: entry.unit ?? "g",
      calories: String(entry.calories),
      protein: String(entry.protein),
      carbs: String(entry.carbs),
      fat: String(entry.fat),
    });
    setSelectedFood(entrySuggestion(entry));
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
    setCatalogOpen(value.trim().length >= 2);
    setCatalogResults([]);
    setCatalogPending(false);
    setCatalogError("");
    setCatalogSearchedQuery("");
    setEntryErrors((current) => ({ ...current, name: undefined }));
  };

  const searchCatalogOnline = () => {
    const query = entryDraft.name.trim();
    if (query.length < 2 || catalogPending || catalogSearchedQuery === query) return;

    catalogRequestRef.current?.abort();
    const controller = new AbortController();
    catalogRequestRef.current = controller;
    setCatalogOpen(true);
    setCatalogPending(true);
    setCatalogResults([]);
    setCatalogError("");

    searchOpenFoodFacts(query, controller.signal)
      .then((results) => {
        if (catalogRequestRef.current !== controller) return;
        setCatalogResults(results);
        setCatalogSearchedQuery(query);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || catalogRequestRef.current !== controller) return;
        setCatalogResults([]);
        if (error instanceof OpenFoodFactsSearchError && error.status === 429) {
          const retry = error.retryAfterSeconds
            ? ` Spróbuj ponownie za ${error.retryAfterSeconds} s.`
            : " Spróbuj ponownie za chwilę.";
          setCatalogError(`Limit wyszukiwania online został osiągnięty.${retry}`);
          return;
        }
        setCatalogError("Baza online jest chwilowo niedostępna. Możesz wybrać produkt podstawowy albo uzupełnić dane ręcznie.");
      })
      .finally(() => {
        if (catalogRequestRef.current === controller) {
          catalogRequestRef.current = null;
          setCatalogPending(false);
        }
      });
  };

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
    updateDay((current) => ({ ...current, waterMl: Math.max(0, Math.min(20_000, current.waterMl + delta)) }));
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
    setGoalDraft({
      calories: String(workspace.goals.calories),
      protein: String(workspace.goals.protein),
      carbs: String(workspace.goals.carbs),
      fat: String(workspace.goals.fat),
      waterMl: String(workspace.goals.waterMl),
    });
    setCalculatorDraft(createCalculatorDraft(workspace.calculatorProfile));
    setMacroDraft(createMacroDraft(workspace.macroConfiguration));
    setCalculationSync({ calories: false, macros: false });
    setCalculatorErrors({});
    setGoalError("");
    if (dialog === "water") {
      setWaterCalculatorMode("simple");
      setWaterSimpleWeight(String(latestWeight?.weightKg ?? workspace.calculatorProfile?.weightKg ?? "").replace(".", ","));
    }
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
    setLoadStatus("missing");
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

  return (
    <ModuleShell
      className="nutrition-module"
      pageWidth="wide"
      ambient={{ scene: "nutrition", progress: workspace.goals.calories > 0 ? totals.calories / workspace.goals.calories : 0, signal: `${allEntries.length}:${day.waterMl}` }}
      header={(
        <PageHeader
          title="Odżywianie"
          description="Dzienny rejestr posiłków, makroskładników i nawodnienia"
          meta={headerMeta}
        />
      )}
    >
      <ModuleMain className="flex min-w-0 flex-1 flex-col overflow-hidden" style={{ background: uiColors.graphiteCanvas, color: uiColors.chalkWhite }}>
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
      ) : (
        <>
          <div className="nutrition-toolbar" style={{ borderColor: uiColors.borderSubtle, background: uiColors.graphiteCanvas }}>
            <div className="nutrition-toolbar__date">
              <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni dzień" onClick={() => setSelectedDate((current) => shiftDate(current, -1))}>
                <ChevronLeft size={14} />
              </Button>
              <DatePicker
                value={selectedDate}
                onChange={(value) => setSelectedDate(value || today)}
                aria-label="Wybrany dzień"
                displayValue={formatDate(selectedDate)}
                fieldClassName="nutrition-date-input"
              />
              <Button variant="ghost" size="sm" iconOnly aria-label="Następny dzień" onClick={() => setSelectedDate((current) => shiftDate(current, 1))}>
                <ChevronRight size={14} />
              </Button>
              {selectedDate !== today && <Button variant="quiet" size="sm" onClick={() => setSelectedDate(today)}>Dzisiaj</Button>}
            </div>
            <div className="nutrition-toolbar__actions">
              <Button variant="quiet" size="sm" leadingIcon={<ChartNoAxesCombined size={13} />} onClick={() => setWeightDialog("analysis")}>
                Analiza
              </Button>
              {day.source === "demo" && <Button variant="quiet" size="sm" disabled={dayClosed} onClick={clearDemoDay}>Wyczyść przykład</Button>}
              <Button
                variant="quiet"
                size="sm"
                className={`nutrition-day-close ${dayClosed ? "is-closed" : ""}`}
                leadingIcon={dayClosed ? <RotateCcw size={12} /> : <CheckCircle2 size={12} />}
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
            </div>
          </div>

          <div className="nutrition-content min-h-0 flex-1 overflow-y-auto px-7 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {dayClosed && (
              <Card tone="input" padding="dense" className="nutrition-closed-notice" role="status">
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>Dzień jest zamknięty. Posiłki i nawodnienie są tylko do odczytu.</span>
                <Button variant="quiet" size="sm" onClick={toggleDayClosed}>Otwórz do edycji</Button>
              </Card>
            )}
            <div className="nutrition-layout w-full">
              <section className="nutrition-meals-panel min-w-0">
                <SectionHeader
                  title="Posiłki"
                  description={`${formatEntryCount(allEntries.length)} · ${formatNumber(totals.calories)} kcal`}
                  action={<Button variant="ghost" size="sm" leadingIcon={<Plus size={12} />} disabled={dayClosed} onClick={() => openEntryDialog()}>Dodaj produkt</Button>}
                />

                <div className="nutrition-meal-list">
                  {MEAL_META.map(({ id, label, icon: Icon }) => {
                    const mealEntries = day.entries[id];
                    const mealTotals = sumEntries(mealEntries);
                    return (
                      <section key={id} className="nutrition-meal-card" aria-labelledby={`meal-${id}`}>
                        <div className="nutrition-meal-card__header">
                          <div className="nutrition-meal-card__identity">
                            <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
                            <h3 id={`meal-${id}`}>{label}</h3>
                            <Badge tone="neutral">{mealEntries.length}</Badge>
                          </div>
                          <div className="nutrition-meal-summary" aria-label={`Podsumowanie ${label}`}>
                            <span className="nutrition-meal-summary__metric is-portion"><small>Porcja</small></span>
                            <span className="nutrition-meal-summary__metric is-protein"><small>B</small>{formatNumber(mealTotals.protein)} g</span>
                            <span className="nutrition-meal-summary__metric is-carbs"><small>W</small>{formatNumber(mealTotals.carbs)} g</span>
                            <span className="nutrition-meal-summary__metric is-fat"><small>T</small>{formatNumber(mealTotals.fat)} g</span>
                            <span className="nutrition-meal-summary__metric is-calories"><small>kcal</small>{formatNumber(mealTotals.calories)}</span>
                          </div>
                          <Button variant="ghost" size="sm" iconOnly disabled={dayClosed} aria-label={`Dodaj produkt do: ${label}`} onClick={() => openEntryDialog(id)}>
                            <Plus size={13} />
                          </Button>
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
                                <span className="nutrition-entry-item__portion">{entry.portion}</span>
                                <span className="nutrition-entry-item__metric">{formatNumber(entry.protein)} g</span>
                                <span className="nutrition-entry-item__metric">{formatNumber(entry.carbs)} g</span>
                                <span className="nutrition-entry-item__metric">{formatNumber(entry.fat)} g</span>
                                <span className="nutrition-entry-item__calories">{formatNumber(entry.calories)} kcal</span>
                                <div className="nutrition-entry-item__actions">
                                  <Button variant="ghost" size="sm" iconOnly disabled={dayClosed} aria-label={`Edytuj ${entry.name}`} onClick={() => openEditDialog(id, entry)}>
                                    <Pencil size={12} />
                                  </Button>
                                  <Button variant="ghost" size="sm" iconOnly disabled={dayClosed} aria-label={`Usuń ${entry.name}`} onClick={() => removeEntry(id, entry.id)}>
                                    <Trash2 size={12} />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="nutrition-meal-card__empty">
                            <span>Nie dodano produktów</span>
                            <Button variant="ghost" size="sm" disabled={dayClosed} onClick={() => openEntryDialog(id)}>Dodaj</Button>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>

                {undoEntry && (
                  <Card tone="input" padding="dense" className="mt-3 flex items-center justify-between gap-3" role="status">
                    <span className="truncate text-[11px]" style={{ color: uiColors.textSecondary }}>Usunięto: {undoEntry.entry.name}</span>
                    <Button variant="ghost" size="sm" disabled={dayClosed} onClick={restoreEntry}>Cofnij</Button>
                  </Card>
                )}
              </section>

              <aside className="nutrition-summary min-w-0">
                <section>
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
                      return (
                        <>
                          <div className="nutrition-budget-card__primary">
                            <div>
                              <span>Kalorie</span>
                              <strong>{formatNumber(totals.calories)} / {formatNumber(calorieGoal)} kcal</strong>
                            </div>
                            <p className={calorieRemaining < 0 ? "is-over" : ""}>
                              {calorieRemaining < 0 ? `Przekroczono o ${formatNumber(Math.abs(calorieRemaining))} kcal` : `Pozostało ${formatNumber(calorieRemaining)} kcal`}
                            </p>
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
                              return (
                                <div key={key} className="nutrition-budget-card__macro">
                                  <div className="nutrition-budget-card__macro-head">
                                    <span>{label}</span>
                                    <strong>{formatNumber(current)} / {formatNumber(goal)} {unit}</strong>
                                  </div>
                                  <p className={remaining < 0 ? "is-over" : ""}>{remaining < 0 ? `Przekroczono o ${formatNumber(Math.abs(remaining))} ${unit}` : `Pozostało ${formatNumber(remaining)} ${unit}`}</p>
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
                </section>

                <section>
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
                        <Droplets size={15} strokeWidth={1.5} />
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
                      </div>
                    </div>
                    {waterEditError && <p className="nutrition-inline-error" role="alert">{waterEditError}</p>}
                    <div
                      className="my-3 h-1 overflow-hidden rounded-full"
                      role="progressbar"
                      aria-label="Nawodnienie"
                      aria-valuemin={0}
                      aria-valuemax={Math.max(workspace.goals.waterMl, day.waterMl, 1)}
                      aria-valuenow={day.waterMl}
                      aria-valuetext={`${formatWater(day.waterMl)} z celu ${formatWater(workspace.goals.waterMl)}${day.waterMl > workspace.goals.waterMl ? `, przekroczono o ${formatWater(day.waterMl - workspace.goals.waterMl)}` : ""}`}
                      style={{ background: uiColors.graphiteInput }}
                    >
                      <div className="h-full w-full origin-left rounded-full transition-transform duration-200" style={{ transform: `scaleX(${Math.min(1, day.waterMl / workspace.goals.waterMl)})`, background: uiColors.precisionBlue }} />
                    </div>
                    <div className="nutrition-water-actions">
                      <div className="nutrition-water-controls">
                        {WATER_AMOUNTS.map((amount) => (
                          <Button key={amount} variant="quiet" size="sm" disabled={dayClosed} onClick={() => changeWater(amount)}>+{amount} ml</Button>
                        ))}
                      </div>
                      <div className="nutrition-water-custom__form">
                        <Input aria-label="Inna ilość wody" type="number" min="1" step="50" placeholder="Własna ilość (ml)" value={waterCustomAmount} onChange={(event) => setWaterCustomAmount(event.target.value)} />
                        <Button variant="ghost" size="sm" disabled={dayClosed || !waterCustomAmount} onClick={addCustomWater}>Dodaj</Button>
                      </div>
                    </div>
                  </Card>
                </section>

                <section>
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
                  <Card tone="panel" padding="default">
                    {latestWeight ? (
                      <div className="nutrition-weight-card nutrition-weight-card--compact">
                        <div className="nutrition-weight-card__primary">
                          <div className="nutrition-weight-card__identity">
                            <Scale size={15} strokeWidth={1.5} />
                            <div>
                              <p>Ostatni pomiar</p>
                              <span>{formatCompactDate(latestWeight.date)}</span>
                            </div>
                          </div>
                          <strong>{formatNumber(latestWeight.weightKg)} kg</strong>
                        </div>
                        <Button variant="quiet" size="sm" fullWidth onClick={openWeightMeasurement}>Zarejestruj wagę</Button>
                      </div>
                    ) : (
                      <div className="nutrition-weight-card nutrition-weight-card--empty">
                        <Scale size={16} strokeWidth={1.5} />
                        <div>
                          <strong>Brak pomiaru</strong>
                          <p>Dodaj wagę, aby rozpocząć śledzenie trendu.</p>
                        </div>
                        <Button variant="quiet" size="sm" onClick={openWeightMeasurement}>Zarejestruj wagę</Button>
                      </div>
                    )}
                    {weightInlineOpen && (
                      <form className="nutrition-weight-inline-form" onSubmit={(event) => { event.preventDefault(); saveWeightMeasurement(event); }}>
                        <div>
                          <label htmlFor="nutrition-inline-weight">Waga (kg)</label>
                          <input
                            id="nutrition-inline-weight"
                            autoFocus
                            inputMode="decimal"
                            type="text"
                            placeholder="np. 81,9"
                            value={weightDraft.weightKg}
                            onChange={(event) => {
                              setWeightDraft((current) => ({ ...current, weightKg: event.target.value.replace(/\./g, ",") }));
                              setWeightError("");
                            }}
                          />
                        </div>
                        <Button type="submit" variant="quiet" size="sm" disabled={dayClosed || !weightDraft.weightKg}>Zapisz</Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setWeightInlineOpen(false);
                            setWeightError("");
                          }}
                        >
                          Anuluj
                        </Button>
                        {weightError && <p role="alert">{weightError}</p>}
                      </form>
                    )}
                  </Card>
                </section>

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
          width={660}
          onClose={closeEntryDialog}
          footer={(
            <>
              <Button variant="ghost" onClick={closeEntryDialog}>Anuluj</Button>
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
                hint={selectedFood
                  ? `Wybrano z ${selectedFood.source === "usda" ? "katalogu produktów podstawowych" : "Open Food Facts"}. Wartości przeliczają się wraz z ilością.`
                  : "Najpierw pokazujemy produkty podstawowe, potem produkty marek."}
                role="combobox"
                aria-autocomplete="list"
                aria-controls="nutrition-food-suggestions"
                aria-expanded={catalogOpen}
                aria-activedescendant={catalogOpen && allSuggestions[activeSuggestion] ? `nutrition-suggestion-${allSuggestions[activeSuggestion].id}` : undefined}
                autoComplete="off"
                data-autofocus
                onFocus={() => setCatalogOpen(entryDraft.name.trim().length >= 2)}
                onBlur={() => setCatalogOpen(false)}
                onKeyDown={handleSearchKeyDown}
                onChange={(event) => changeProductName(event.target.value)}
              />
              {entryDraft.name.trim().length >= 2 && !selectedFood && (
                <div
                  className="mt-1 flex min-h-9 items-center justify-between gap-2"
                  style={{ color: uiColors.textMuted, fontSize: "var(--text-micro)", lineHeight: "var(--leading-snug)" }}
                >
                  <span>Produkty marek pobieramy dopiero na Twoje żądanie.</span>
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    className="shrink-0"
                    disabled={catalogPending || catalogSearchedQuery === entryDraft.name.trim()}
                    leadingIcon={catalogPending ? <LoaderCircle size={13} className="nutrition-search-spinner" /> : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={searchCatalogOnline}
                  >
                    {catalogPending
                      ? "Szukamy…"
                      : catalogSearchedQuery === entryDraft.name.trim()
                        ? "Wyniki pobrane"
                        : "Szukaj online"}
                  </Button>
                </div>
              )}
              {catalogOpen && entryDraft.name.trim().length >= 2 && (
                <div id="nutrition-food-suggestions" className="nutrition-suggestions" role="listbox" aria-label="Podpowiedzi produktów">
                  {renderSuggestionGroup("Produkty podstawowe · USDA", genericResults)}
                  {renderSuggestionGroup("Produkty bez marki · Open Food Facts", remoteUnbranded)}
                  {renderSuggestionGroup("Produkty marek · Open Food Facts", remoteBranded)}
                  {catalogPending && (
                    <div className="nutrition-suggestions__status">
                      <LoaderCircle size={13} className="nutrition-search-spinner" />
                      Szukamy w Open Food Facts…
                    </div>
                  )}
                  {!catalogPending && catalogError && (
                    <div className="nutrition-suggestions__status is-error" role="alert">
                      {catalogError}
                    </div>
                  )}
                  {!catalogPending && !catalogError && !allSuggestions.length && (
                    <div className="nutrition-suggestions__status">
                      {catalogSearchedQuery === entryDraft.name.trim()
                        ? "Nie znaleźliśmy produktu. Wpisz pełną nazwę i uzupełnij wartości ręcznie."
                        : "Brak produktu podstawowego. Wybierz „Szukaj online” albo uzupełnij wartości ręcznie."}
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
            <p className="nutrition-data-attribution">
              Produkty sklepowe:{" "}
              <a href="https://world.openfoodfacts.org/" target="_blank" rel="noreferrer">Open Food Facts (ODbL)</a>.
              {" "}Produkty podstawowe:{" "}
              <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noreferrer">USDA FoodData Central (CC0)</a>.
              Wartości mogą wymagać weryfikacji z etykietą.
            </p>
          </form>
        </Modal>
      )}

      {weightDialog === "measurement" && (
        <Modal
          title="Pomiar masy ciała"
          eyebrow="Masa ciała"
          description="Zapisz jeden pomiar dla wybranego dnia. Ponowny zapis tej samej daty zaktualizuje wartość."
          width={460}
          onClose={closeWeightDialog}
          footer={(
            <>
              <Button variant="ghost" onClick={closeWeightDialog}>Anuluj</Button>
              <Button type="submit" form="weight-measurement-form" variant="primary" leadingIcon={<Save size={13} />}>
                Zapisz pomiar
              </Button>
            </>
          )}
        >
          <form id="weight-measurement-form" className="nutrition-weight-form" onSubmit={saveWeightMeasurement}>
            <Input
              label="Data pomiaru"
              type="date"
              max={today}
              value={weightDraft.date}
              onChange={(event) => {
                const existing = workspace.weightMeasurements[event.target.value];
                setWeightDraft((current) => ({
                  date: event.target.value,
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
            <label className="nutrition-textarea-field">
              <span>Notatka <small>(opcjonalnie)</small></span>
              <textarea
                value={weightDraft.note}
                rows={3}
                placeholder="Np. rano, po treningu…"
                onChange={(event) => setWeightDraft((current) => ({ ...current, note: event.target.value }))}
              />
            </label>
          </form>
        </Modal>
      )}

      {weightDialog === "analysis" && (
        <Modal
          title="Analiza odżywiania"
          eyebrow="Trendy"
          description="Porównaj zapisane posiłki z pomiarami masy w wybranym okresie."
          width={1180}
          bodyClassName="nutrition-analysis-modal"
          onClose={closeWeightDialog}
        >
          <NutritionAnalysis
            endDate={analysisEndDate}
            days={workspace.days}
            goals={workspace.goals}
            weightMeasurements={workspace.weightMeasurements}
            range={analysisRange}
            onRangeChange={setAnalysisRange}
          />
        </Modal>
      )}

      {goalDialog === "nutrition" && (
        <Modal
          title="Cele kalorii i makroskładników"
          eyebrow="Budżet dnia"
          description="Wylicz orientacyjne zapotrzebowanie albo wpisz własne wartości."
          width={860}
          onClose={closeGoalDialog}
          footer={(
            <>
              <Button variant="ghost" onClick={closeGoalDialog}>Anuluj</Button>
              <Button type="submit" form="nutrition-goals-form" variant="primary" leadingIcon={<Save size={13} />}>Zapisz cele</Button>
            </>
          )}
        >
          <form id="nutrition-goals-form" onSubmit={saveNutritionGoals} className="nutrition-goal-form">
            <details className="nutrition-goal-advanced">
              <summary>
                <span>
                  <strong>Wylicz cele automatycznie</strong>
                  <small>Profil dnia, aktywność, wzór Mifflina–St Jeora i konfiguracja makro</small>
                </span>
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <section className="nutrition-calculator-section" aria-labelledby="calorie-calculator-title">
              <div className="nutrition-calculator-heading">
                <div>
                  <h3 id="calorie-calculator-title">Autowyliczenie kalorii</h3>
                  <p>Praca opisuje zwykły dzień; sport dodajemy osobno, żeby go nie liczyć podwójnie.</p>
                </div>
                <span className="nutrition-calculator-method">Mifflin–St Jeor + MET</span>
              </div>
              <CalculatorProfileFields
                draft={calculatorDraft}
                errors={calculatorErrors}
                includeDietGoal
                onChange={changeCalculatorField}
                onAddActivity={addCalculatorActivity}
                onChangeActivity={changeCalculatorActivity}
                onRemoveActivity={removeCalculatorActivity}
              />
              {calculatorResult ? (
                <div className="nutrition-calculation-result" aria-live="polite">
                  <div className="nutrition-calculation-ledger">
                    <div><span>Podstawowa przemiana materii</span><strong>{formatNumber(calculatorResult.bmr)} kcal</strong></div>
                    <div><span>Zwykły dzień i praca</span><strong>{formatNumber(calculatorResult.workDayCalories)} kcal</strong></div>
                    <div><span>Aktywność fizyczna · średnio / dzień</span><strong>+{formatNumber(calculatorResult.sportCalories)} kcal</strong></div>
                    <div><span>Aktywność fizyczna · cały tydzień</span><strong>{formatNumber(calculatorResult.weeklySportCalories)} kcal</strong></div>
                    <div><span>Utrzymanie masy</span><strong>{formatNumber(calculatorResult.maintenanceCalories)} kcal</strong></div>
                    <div><span>Korekta celu diety</span><strong>{calculatorResult.calorieAdjustment >= 0 ? "+" : ""}{formatNumber(calculatorResult.calorieAdjustment)} kcal</strong></div>
                    <div className="is-total"><span>Docelowa kaloryczność</span><strong>{formatNumber(calculatorResult.calorieTarget)} kcal</strong></div>
                  </div>
                  <Button
                    type="button"
                    variant="quiet"
                    aria-pressed={calculationSync.calories}
                    onClick={useCalculatedCalories}
                  >
                    {calculationSync.calories ? "Cel synchronizowany" : "Ustaw i synchronizuj"}
                  </Button>
                </div>
              ) : (
                <div className="nutrition-calculation-empty">
                  Uzupełnij płeć, wiek, wagę i wzrost, aby zobaczyć wynik.
                </div>
              )}
              <p className="nutrition-calculator-note">
                Estymacja dla osób dorosłych, nie diagnoza. Wzór może różnić się od rzeczywistego wydatku energii; obserwuj trend masy i koryguj cel.
                {" "}<a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noreferrer">Równanie Mifflina–St Jeora</a>
                {" · "}<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10818145/" target="_blank" rel="noreferrer">Compendium MET 2024</a>
              </p>
              </section>

              <section className="nutrition-goal-manual" aria-labelledby="macro-calculator-title">
              <div className="nutrition-calculator-heading">
                <div>
                  <h3 id="macro-calculator-title">Konfiguracja makroskładników</h3>
                  <p>Wybierz autowyliczenie pod rodzaj treningu, udziały procentowe albo własne wartości w gramach.</p>
                </div>
              </div>
              <div className="nutrition-macro-config-grid">
                <Select
                  label="Sposób ustawienia"
                  value={macroDraft.mode}
                  options={MACRO_MODE_OPTIONS}
                  onChange={(event) => changeMacroField("mode", event.target.value)}
                />
                {macroDraft.mode === "auto" && (
                  <Select
                    label="Profil"
                    value={macroDraft.preset}
                    options={MACRO_PRESET_OPTIONS}
                    onChange={(event) => changeMacroField("preset", event.target.value)}
                  />
                )}
              </div>
              {macroDraft.mode === "percent" && (
                <div className="nutrition-macro-percent-grid">
                  <Input label="Białko (%)" type="number" min="0" max="100" step="1" value={macroDraft.proteinPercent} onChange={(event) => changeMacroField("proteinPercent", event.target.value)} />
                  <Input label="Węglowodany (%)" type="number" min="0" max="100" step="1" value={macroDraft.carbsPercent} onChange={(event) => changeMacroField("carbsPercent", event.target.value)} />
                  <Input label="Tłuszcze (%)" type="number" min="0" max="100" step="1" value={macroDraft.fatPercent} onChange={(event) => changeMacroField("fatPercent", event.target.value)} />
                </div>
              )}
              {macroDraft.mode === "grams" ? (
                <div className="nutrition-calculation-empty">
                  Wpisz docelowe gramy bezpośrednio w polach „Cele do zapisania” poniżej.
                </div>
              ) : macroPreview ? (
                <div className="nutrition-calculation-result" aria-live="polite">
                  <div className="nutrition-calculation-ledger">
                    <div><span>Białko</span><strong>{formatNumber(macroPreview.protein)} g</strong></div>
                    <div><span>Węglowodany</span><strong>{formatNumber(macroPreview.carbs)} g</strong></div>
                    <div><span>Tłuszcze</span><strong>{formatNumber(macroPreview.fat)} g</strong></div>
                  </div>
                  <Button
                    type="button"
                    variant="quiet"
                    aria-pressed={calculationSync.macros}
                    onClick={useCalculatedMacros}
                  >
                    {calculationSync.macros ? "Makro synchronizowane" : "Ustaw i synchronizuj makro"}
                  </Button>
                </div>
              ) : (
                <div className="nutrition-calculation-empty">
                  {macroDraft.mode === "auto"
                    ? "Uzupełnij profil, wagę i cel kalorii, aby wyliczyć makroskładniki."
                    : "Udziały białka, węglowodanów i tłuszczów muszą razem dawać 100%."}
                </div>
              )}
              {macroDraft.mode === "auto" && (
                <p className="nutrition-calculator-note">
                  Profile sportowe są punktami startowymi. Dla osób aktywnych literatura zwykle wskazuje około 1,4–2,0 g białka/kg/dzień; pozostała energia jest dzielona między tłuszcze i węglowodany.
                  {" "}<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/" target="_blank" rel="noreferrer">ISSN: białko i wysiłek</a>
                </p>
              )}
              </section>
            </details>

            <section className="nutrition-goal-manual" aria-labelledby="saved-goals-title">
              <div className="nutrition-calculator-heading">
                <div>
                  <h3 id="saved-goals-title">Cele do zapisania</h3>
                  <p>Aktywne autowyliczenia aktualizują te pola na bieżąco. Ręczna zmiana wyłącza synchronizację odpowiedniej grupy.</p>
                </div>
              </div>
              <div className="nutrition-goals-grid">
                <Input
                  label="Kalorie"
                  type="number"
                  min="1"
                  step="1"
                  value={goalDraft.calories}
                  hint={calculationSync.calories ? "Synchronizacja z kalkulatorem jest aktywna." : undefined}
                  onChange={(event) => changeGoalDraftField("calories", event.target.value)}
                />
                <Input
                  label="Białko (g)"
                  type="number"
                  min="1"
                  step="1"
                  value={goalDraft.protein}
                  hint={calculationSync.macros ? "Synchronizacja makro jest aktywna." : undefined}
                  onChange={(event) => changeGoalDraftField("protein", event.target.value)}
                />
                <Input
                  label="Węglowodany (g)"
                  type="number"
                  min="1"
                  step="1"
                  value={goalDraft.carbs}
                  hint={calculationSync.macros ? "Synchronizacja makro jest aktywna." : undefined}
                  onChange={(event) => changeGoalDraftField("carbs", event.target.value)}
                />
                <Input
                  label="Tłuszcze (g)"
                  type="number"
                  min="1"
                  step="1"
                  value={goalDraft.fat}
                  hint={calculationSync.macros ? "Synchronizacja makro jest aktywna." : undefined}
                  onChange={(event) => changeGoalDraftField("fat", event.target.value)}
                />
              </div>
            </section>
            {goalError && <p className="mt-3 text-[11px]" role="alert" style={{ color: uiColors.danger }}>{goalError}</p>}
          </form>
        </Modal>
      )}

      {goalDialog === "water" && (
        <Modal
          title="Cel nawodnienia"
          eyebrow="Nawodnienie"
          description="Wylicz orientacyjny cel z profilu dnia albo wpisz własną ilość."
          width={860}
          onClose={closeGoalDialog}
          footer={(
            <>
              <Button variant="ghost" onClick={closeGoalDialog}>Anuluj</Button>
              <Button type="submit" form="water-goal-form" variant="primary" leadingIcon={<Save size={13} />}>Zapisz cel</Button>
            </>
          )}
        >
          <form id="water-goal-form" onSubmit={saveWaterGoal} className="nutrition-goal-form">
            <div className="nutrition-water-calculator-switch" role="group" aria-label="Sposób wyliczenia celu wody">
              <Button type="button" variant={waterCalculatorMode === "simple" ? "primary" : "quiet"} size="sm" aria-pressed={waterCalculatorMode === "simple"} onClick={() => setWaterCalculatorMode("simple")}>Prosty kalkulator</Button>
              <Button type="button" variant={waterCalculatorMode === "advanced" ? "primary" : "quiet"} size="sm" aria-pressed={waterCalculatorMode === "advanced"} onClick={() => setWaterCalculatorMode("advanced")}>Zaawansowany</Button>
            </div>
            {waterCalculatorMode === "simple" ? (
              <section className="nutrition-water-simple-calculator" aria-labelledby="water-simple-calculator-title">
                <div className="nutrition-calculator-heading">
                  <div>
                    <h3 id="water-simple-calculator-title">Rekomendacja dzienna</h3>
                    <p>Orientacyjnie 30–35 ml wody na kilogram masy ciała.</p>
                  </div>
                  <span className="nutrition-calculator-method">30–35 ml / kg</span>
                </div>
                <Input
                  label="Masa ciała (kg)"
                  type="text"
                  inputMode="decimal"
                  value={waterSimpleWeight}
                  placeholder="np. 81,9"
                  onChange={(event) => setWaterSimpleWeight(event.target.value.replace(/\./g, ","))}
                />
                {simpleWaterMin && simpleWaterMax ? (
                  <div className="nutrition-water-simple-result" aria-live="polite">
                    <div>
                      <span>Rekomendowany zakres</span>
                      <strong>{formatWater(simpleWaterMin)} – {formatWater(simpleWaterMax)}</strong>
                    </div>
                    <small>Wybierz własny cel poniżej.</small>
                  </div>
                ) : (
                  <div className="nutrition-calculation-empty">Podaj masę ciała, aby zobaczyć wynik.</div>
                )}
              </section>
            ) : (
            <section className="nutrition-calculator-section" aria-labelledby="water-calculator-title">
              <div className="nutrition-calculator-heading">
                <div>
                  <h3 id="water-calculator-title">Autowyliczenie wody</h3>
                  <p>Waga, metabolizm, charakter pracy i średnia tygodniowa aktywność wpływają na wynik.</p>
                </div>
                <span className="nutrition-calculator-method">1 ml / kcal utrzymania</span>
              </div>
              <CalculatorProfileFields
                draft={calculatorDraft}
                errors={calculatorErrors}
                includeDietGoal={false}
                onChange={changeCalculatorField}
                onAddActivity={addCalculatorActivity}
                onChangeActivity={changeCalculatorActivity}
                onRemoveActivity={removeCalculatorActivity}
              />
              {calculatorResult ? (
                <div className="nutrition-calculation-result" aria-live="polite">
                  <div className="nutrition-calculation-ledger">
                    <div><span>Szacunkowe utrzymanie</span><strong>{formatNumber(calculatorResult.maintenanceCalories)} kcal</strong></div>
                    <div><span>Przelicznik nawodnienia</span><strong>1 ml / kcal</strong></div>
                    <div className="is-total"><span>Orientacyjny cel płynów</span><strong>{formatWater(calculatorResult.waterTargetMl)}</strong></div>
                  </div>
                </div>
              ) : (
                <div className="nutrition-calculation-empty">
                  Uzupełnij płeć, wiek, wagę i wzrost, aby zobaczyć wynik.
                </div>
              )}
              <p className="nutrition-calculator-note">
                To punkt startowy, nie zalecenie medyczne. Estymacja nie zna temperatury, potliwości, ciąży, chorób ani leków; podczas wysiłku potrzeby są indywidualne.
                {" "}<a href="https://efsa.onlinelibrary.wiley.com/doi/abs/10.2903/j.efsa.2010.1459" target="_blank" rel="noreferrer">EFSA: woda</a>
                {" · "}<a href="https://pubmed.ncbi.nlm.nih.gov/22275331/" target="_blank" rel="noreferrer">ograniczenia wzorów</a>
                {" · "}<a href="https://pubmed.ncbi.nlm.nih.gov/17277604/" target="_blank" rel="noreferrer">ACSM: wysiłek i płyny</a>
              </p>
            </section>
            )}

            <section className="nutrition-goal-manual" aria-labelledby="saved-water-title">
              <div className="nutrition-calculator-heading">
                <div>
                  <h3 id="saved-water-title">Cel do zapisania</h3>
                  <p>Szybkie przyciski 150–500 ml pozostaną dostępne przy podsumowaniu dnia.</p>
                </div>
              </div>
              <Input
                label="Cel dzienny (ml)"
                type="number"
                min="250"
                max="20000"
                step="50"
                value={goalDraft.waterMl}
                error={goalError}
                hint={`Obecna wartość: ${formatWater(parseDraftNumber(goalDraft.waterMl))}`}
                onChange={(event) => changeGoalDraftField("waterMl", event.target.value)}
              />
            </section>
          </form>
        </Modal>
      )}
      </ModuleMain>
    </ModuleShell>
  );
}
