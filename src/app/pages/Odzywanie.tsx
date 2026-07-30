/**
 * THESIS: Odżywianie jest dziennym arkuszem budżetu, nie galerią kafli KPI ani katalogiem raportów.
 * OWN-WORLD: Grafitowy rejestr czterech stałych posiłków, dane w DM Mono i jedna precyzyjna niebieska akcja.
 * STORY: Użytkownik wybiera dzień, wyszukuje polski produkt, ustala ilość i od razu widzi bilans posiłku oraz dnia.
 * FIRST VIEWPORT: Szeroki, zawsze widoczny szkielet posiłków stoi obok zwartego budżetu i panelu nawodnienia.
 * FORM: Arkusz składników pogrupowany według posiłków, z ustawieniami osadzonymi przy danych, których dotyczą.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  CalendarDays,
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
  createDemoNutritionDay,
  createEmptyNutritionDay,
  createEmptyNutritionWorkspace,
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

export default function Odzywanie() {
  const [initialLoad] = useState(loadNutritionWorkspace);
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
    water: false,
  });
  const [goalError, setGoalError] = useState("");
  const [weightDialog, setWeightDialog] = useState<WeightDialog>(null);
  const [weightDraft, setWeightDraft] = useState({ date: nutritionDateKey(), weightKg: "" });
  const [weightError, setWeightError] = useState("");
  const [analysisRange, setAnalysisRange] = useState<NutritionAnalysisRange>(30);
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
  const previousWeight = weightHistory[weightHistory.length - 2];
  const latestWeightChange = latestWeight && previousWeight
    ? latestWeight.weightKg - previousWeight.weightKg
    : null;

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

      if (goalDialog === "water" && calculationSync.water && calculatorResult) {
        updates.waterMl = String(calculatorResult.waterTargetMl);
      }

      const changed = Object.entries(updates).some(([field, value]) => current[field as keyof typeof current] !== value);
      return changed ? { ...current, ...updates } : current;
    });
  }, [
    calculationSync.calories,
    calculationSync.macros,
    calculationSync.water,
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
    setCalculationSync({ calories: false, macros: false, water: false });
    setCalculatorErrors({});
    setGoalError("");
    setGoalDialog(dialog);
  };

  const openWeightMeasurement = () => {
    const measurementDate = selectedDate > today ? today : selectedDate;
    const existing = workspace.weightMeasurements[measurementDate];
    const suggestedWeight = existing?.weightKg
      ?? latestWeight?.weightKg
      ?? workspace.calculatorProfile?.weightKg;
    setWeightDraft({
      date: measurementDate,
      weightKg: suggestedWeight ? String(suggestedWeight) : "",
    });
    setWeightError("");
    setWeightDialog("measurement");
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
            createdAt: existing?.createdAt ?? now,
            updatedAt: existing ? now : undefined,
          },
        },
      };
    });
    closeWeightDialog();
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
    const syncGroup = field === "calories" ? "calories" : field === "waterMl" ? "water" : "macros";
    setCalculationSync((current) => current[syncGroup] ? { ...current, [syncGroup]: false } : current);
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

  const useCalculatedWater = () => {
    const parsed = parseCalculatorDraft(calculatorDraft);
    setCalculatorErrors(parsed.errors);
    if (!parsed.profile) return;
    const result = calculateNutritionTargets(parsed.profile);
    setGoalDraft((current) => ({ ...current, waterMl: String(result.waterTargetMl) }));
    setCalculationSync((current) => ({ ...current, water: true }));
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
      calculatorProfile: parsedCalculator.profile ?? current.calculatorProfile,
    }));
    closeGoalDialog();
  };

  const loadDemoDay = () => {
    if (dayClosed) return;
    commitWorkspace((current) => ({
      ...current,
      days: { ...current.days, [selectedDate]: createDemoNutritionDay(selectedDate) },
    }));
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
      header={(
        <PageHeader
          title="Odżywianie"
          description="Dzienny rejestr posiłków, makroskładników i nawodnienia"
          meta={headerMeta}
          actions={loadStatus !== "corrupt" ? (
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Plus size={13} />}
              disabled={dayClosed}
              title={dayClosed ? "Otwórz dzień, aby dodać produkt." : undefined}
              onClick={() => openEntryDialog()}
            >
              Dodaj produkt
            </Button>
          ) : undefined}
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
          <div className="nutrition-toolbar flex flex-wrap items-center justify-between gap-3 border-b px-7 py-3" style={{ borderColor: uiColors.borderSubtle, background: uiColors.graphiteCanvas }}>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni dzień" onClick={() => setSelectedDate((current) => shiftDate(current, -1))}>
                <ChevronLeft size={14} />
              </Button>
              {/* A toolbar sits among custom-styled controls, so it uses the shared DatePicker.
                  The native <Input type="date"> widget stays in modal forms, where the OS
                  picker is an advantage on touch devices. */}
              <DatePicker
                value={selectedDate}
                onChange={(value) => setSelectedDate(value || today)}
                aria-label="Wybrany dzień"
                fieldClassName="nutrition-date-input"
              />
              <Button variant="ghost" size="sm" iconOnly aria-label="Następny dzień" onClick={() => setSelectedDate((current) => shiftDate(current, 1))}>
                <ChevronRight size={14} />
              </Button>
              {selectedDate !== today && <Button variant="quiet" size="sm" onClick={() => setSelectedDate(today)}>Dzisiaj</Button>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <CalendarDays size={13} style={{ color: uiColors.textMuted }} />
              <span className="capitalize" style={{ color: uiColors.textSecondary, fontSize: "var(--text-meta)" }}>{formatDate(selectedDate)}</span>
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
              <section className="min-w-0">
                <SectionHeader
                  title="Rejestr posiłków"
                  description={`${formatEntryCount(allEntries.length)} · ${formatNumber(totals.calories)} kcal`}
                  action={<Button variant="ghost" size="sm" leadingIcon={<Plus size={12} />} disabled={dayClosed} onClick={() => openEntryDialog()}>Dodaj</Button>}
                />

                {allEntries.length === 0 && (
                  <div className="nutrition-empty-day-note">
                    <span>Każdy posiłek jest gotowy na pierwszy produkt.</span>
                    <Button variant="ghost" size="sm" disabled={dayClosed} onClick={loadDemoDay}>Wczytaj przykład</Button>
                  </div>
                )}

                <Card padding="none" tone="panel" className="overflow-hidden">
                  <div className="nutrition-ledger-scroll overflow-x-auto [scrollbar-width:thin]">
                    <table className="nutrition-ledger-table">
                      <caption className="sr-only">Produkty i makroskładniki dla dnia {formatDate(selectedDate)}</caption>
                      <colgroup>
                        <col className="nutrition-col-product" />
                        <col className="nutrition-col-portion" />
                        <col className="nutrition-col-calories" />
                        <col className="nutrition-col-protein" />
                        <col className="nutrition-col-carbs" />
                        <col className="nutrition-col-fat" />
                        <col className="nutrition-col-actions" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th scope="col">Produkt</th>
                          <th scope="col">Porcja</th>
                          <th scope="col">Kalorie</th>
                          <th scope="col">Białko</th>
                          <th scope="col">Węglowodany</th>
                          <th scope="col">Tłuszcze</th>
                          <th scope="col"><span className="sr-only">Akcje</span></th>
                        </tr>
                      </thead>

                      {MEAL_META.map(({ id, label, icon: Icon }) => {
                        const mealEntries = day.entries[id];
                        const mealTotals = sumEntries(mealEntries);
                        return (
                          <tbody key={id} className="nutrition-meal-group">
                            <tr className="nutrition-meal-header">
                              <th id={`meal-${id}`} scope="rowgroup" colSpan={2} className="nutrition-meal-title-cell">
                                <div className="nutrition-meal-title">
                                  <Icon size={13} strokeWidth={1.5} style={{ color: uiColors.textSecondary }} />
                                  <span className="text-[12px] font-semibold" style={{ color: uiColors.chalkWhite }}>{label}</span>
                                  <Badge tone="neutral">{mealEntries.length}</Badge>
                                </div>
                              </th>
                              <td className="nutrition-meal-total-cell" data-label="Kcal" aria-label={`Kalorie: ${formatNumber(mealTotals.calories)} kilokalorii`}>
                                {formatNumber(mealTotals.calories)} kcal
                              </td>
                              <td className="nutrition-meal-total-cell" data-label="B" aria-label={`Białko: ${formatNumber(mealTotals.protein)} gramów`}>
                                {formatNumber(mealTotals.protein)} g
                              </td>
                              <td className="nutrition-meal-total-cell" data-label="W" aria-label={`Węglowodany: ${formatNumber(mealTotals.carbs)} gramów`}>
                                {formatNumber(mealTotals.carbs)} g
                              </td>
                              <td className="nutrition-meal-total-cell" data-label="T" aria-label={`Tłuszcze: ${formatNumber(mealTotals.fat)} gramów`}>
                                {formatNumber(mealTotals.fat)} g
                              </td>
                              <td className="nutrition-meal-action-cell">
                                <Button variant="ghost" size="sm" iconOnly disabled={dayClosed} aria-label={`Dodaj produkt: ${label}`} onClick={() => openEntryDialog(id)}>
                                  <Plus size={12} />
                                </Button>
                              </td>
                            </tr>

                            {mealEntries.length ? mealEntries.map((entry) => (
                              <tr key={entry.id} className="nutrition-entry-record">
                                <td className="nutrition-product-cell" data-label="Produkt">
                                  <span className="nutrition-product-identity">
                                    <span className="truncate text-[12px] font-medium" title={entry.name} style={{ color: uiColors.textSecondary }}>{entry.name}</span>
                                    {entry.brand && <span className="nutrition-product-brand">{entry.brand}</span>}
                                  </span>
                                </td>
                                <td className="nutrition-portion-cell" data-label="Porcja">
                                  <span className="truncate" title={entry.portion}>{entry.portion}</span>
                                </td>
                                <td className="nutrition-number-cell" data-label="Kalorie">{formatNumber(entry.calories)}</td>
                                <td className="nutrition-number-cell" data-label="Białko">{formatNumber(entry.protein)} g</td>
                                <td className="nutrition-number-cell" data-label="Węglowodany">{formatNumber(entry.carbs)} g</td>
                                <td className="nutrition-number-cell" data-label="Tłuszcze">{formatNumber(entry.fat)} g</td>
                                <td className="nutrition-entry-actions">
                                  <Button variant="ghost" size="sm" iconOnly disabled={dayClosed} aria-label={`Edytuj ${entry.name}`} onClick={() => openEditDialog(id, entry)}>
                                    <Pencil size={12} />
                                  </Button>
                                  <Button variant="ghost" size="sm" iconOnly disabled={dayClosed} aria-label={`Usuń ${entry.name}`} onClick={() => removeEntry(id, entry.id)}>
                                    <Trash2 size={12} />
                                  </Button>
                                </td>
                              </tr>
                            )) : (
                              <tr className="nutrition-empty-record">
                                <td colSpan={7} className="nutrition-empty-cell">
                                  <span>Nie dodano jeszcze produktów</span>
                                  <Button variant="ghost" size="sm" disabled={dayClosed} onClick={() => openEntryDialog(id)}>Dodaj produkt</Button>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        );
                      })}
                    </table>
                  </div>
                </Card>
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
                    title="Budżet dnia"
                    variant="label"
                    action={(
                      <Button variant="ghost" size="sm" iconOnly aria-label="Ustaw cele kalorii i makroskładników" onClick={() => openGoalDialog("nutrition")}>
                        <Settings size={13} />
                      </Button>
                    )}
                  />
                  <Card tone="card" padding="default">
                    <div className="space-y-4">
                      {NUTRIENT_META.map(({ key, label, unit, color }) => {
                        const current = totals[key];
                        const goal = workspace.goals[key];
                        const ratio = goal > 0 ? current / goal : 0;
                        const remaining = goal - current;
                        return (
                          <div key={key}>
                            <div className="mb-1.5 flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-medium" style={{ color: uiColors.textSecondary }}>{label}</p>
                                <p className="mt-0.5" style={{ color: remaining < 0 ? uiColors.danger : uiColors.textMuted, fontSize: "var(--text-micro)" }}>
                                  {remaining < 0 ? `Przekroczono o ${formatNumber(Math.abs(remaining))} ${unit ?? "kcal"}` : `Pozostało ${formatNumber(remaining)} ${unit ?? "kcal"}`}
                                </p>
                              </div>
                              <span className="flex-shrink-0" style={{ color: ratio > 1 ? uiColors.danger : uiColors.chalkWhite, fontFamily: "var(--font-data)", fontSize: "var(--text-meta)" }}>
                                {formatNumber(current)} / {formatNumber(goal)}
                              </span>
                            </div>
                            <div
                              className="h-1.5 overflow-hidden rounded-full"
                              role="progressbar"
                              aria-label={label}
                              aria-valuemin={0}
                              aria-valuemax={Math.max(goal, current, 1)}
                              aria-valuenow={current}
                              aria-valuetext={`${formatNumber(current)} z celu ${formatNumber(goal)} ${unit ?? "kcal"}${current > goal ? `, przekroczono o ${formatNumber(current - goal)}` : ""}`}
                              style={{ background: uiColors.graphiteInput }}
                            >
                              <div className="h-full w-full origin-left rounded-full transition-transform duration-200" style={{ transform: `scaleX(${Math.min(1, ratio)})`, background: ratio > 1 ? uiColors.danger : color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </section>

                <section>
                  <SectionHeader
                    title="Nawodnienie"
                    variant="label"
                    action={(
                      <Button variant="ghost" size="sm" iconOnly aria-label="Ustaw cel nawodnienia" onClick={() => openGoalDialog("water")}>
                        <Settings size={13} />
                      </Button>
                    )}
                  />
                  <Card tone="panel" padding="default">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Droplets size={15} strokeWidth={1.5} style={{ color: uiColors.precisionBlueText }} />
                        <div>
                          <p className="text-[12px] font-medium" style={{ color: uiColors.textSecondary }}>Wypita woda</p>
                          <p className="mt-0.5" style={{ color: uiColors.textMuted, fontSize: "var(--text-micro)" }}>Cel: {formatWater(workspace.goals.waterMl)}</p>
                        </div>
                      </div>
                      <span className="font-semibold" style={{ color: uiColors.precisionBlueText, fontFamily: "var(--font-data)", fontSize: "var(--text-title)" }}>{formatWater(day.waterMl)}</span>
                    </div>
                    <div
                      className="my-3 h-1.5 overflow-hidden rounded-full"
                      role="progressbar"
                      aria-label="Nawodnienie"
                      aria-valuemin={0}
                      aria-valuemax={Math.max(workspace.goals.waterMl, day.waterMl, 1)}
                      aria-valuenow={day.waterMl}
                      aria-valuetext={`${formatWater(day.waterMl)} z celu ${formatWater(workspace.goals.waterMl)}${day.waterMl > workspace.goals.waterMl ? `, przekroczono o ${formatWater(day.waterMl - workspace.goals.waterMl)}` : ""}`}
                      style={{ background: uiColors.graphiteInput }}
                    >
                      <div className="h-full w-full origin-left rounded-full transition-transform duration-200" style={{ transform: `scaleX(${Math.min(1, day.waterMl / workspace.goals.waterMl)})`, background: uiColors.precisionBlueText }} />
                    </div>
                    <div className="nutrition-water-controls">
                      {WATER_AMOUNTS.map((amount) => (
                        <Button key={amount} variant="quiet" size="sm" disabled={dayClosed} onClick={() => changeWater(amount)}>+{amount} ml</Button>
                      ))}
                    </div>
                    <Button className="mt-2" variant="ghost" size="sm" fullWidth disabled={dayClosed || day.waterMl === 0} onClick={() => changeWater(-250)}>
                      Odejmij 250 ml
                    </Button>
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
                          aria-label="Dodaj lub popraw pomiar masy ciała"
                          onClick={openWeightMeasurement}
                        >
                          <Plus size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label="Analizuj dietę i masę ciała"
                          onClick={() => setWeightDialog("analysis")}
                        >
                          <ChartNoAxesCombined size={13} />
                        </Button>
                      </div>
                    )}
                  />
                  <Card tone="input" padding="default">
                    {latestWeight ? (
                      <div className="nutrition-weight-card">
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
                        <div className="nutrition-weight-card__change">
                          <span>Zmiana od poprzedniego pomiaru</span>
                          <strong>
                            {latestWeightChange === null
                              ? "—"
                              : `${latestWeightChange > 0 ? "+" : ""}${formatNumber(latestWeightChange)} kg`}
                          </strong>
                        </div>
                        <p>
                          {previousWeight
                            ? `Poprzedni wpis: ${formatCompactDate(previousWeight.date)}`
                            : "Dodaj kolejny pomiar, aby zobaczyć zmianę."}
                        </p>
                      </div>
                    ) : (
                      <div className="nutrition-weight-card nutrition-weight-card--empty">
                        <Scale size={16} strokeWidth={1.5} />
                        <div>
                          <strong>Brak pomiaru</strong>
                          <p>Dodaj wagę, aby rozpocząć śledzenie trendu.</p>
                        </div>
                        <Button variant="quiet" size="sm" onClick={openWeightMeasurement}>Dodaj wagę</Button>
                      </div>
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
          </form>
        </Modal>
      )}

      {weightDialog === "analysis" && (
        <Modal
          title="Analiza diety i masy"
          eyebrow="Trendy"
          description="Porównaj zapisane posiłki z pomiarami masy w wybranym okresie."
          width={920}
          onClose={closeWeightDialog}
          footer={<Button variant="ghost" onClick={closeWeightDialog}>Zamknij</Button>}
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
                  <Button
                    type="button"
                    variant="quiet"
                    aria-pressed={calculationSync.water}
                    onClick={useCalculatedWater}
                  >
                    {calculationSync.water ? "Cel synchronizowany" : "Ustaw i synchronizuj"}
                  </Button>
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
                hint={calculationSync.water
                  ? "Synchronizacja z kalkulatorem jest aktywna."
                  : `Obecna wartość: ${formatWater(parseDraftNumber(goalDraft.waterMl))}`}
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
