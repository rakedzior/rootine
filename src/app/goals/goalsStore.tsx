import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type GoalStatus = "planned" | "active" | "paused" | "completed" | "archived";
export type GoalHealth = "ontrack" | "risk";
export type GoalPriority = "high" | "medium" | "low";
export type GoalProgressMode = "numeric" | "milestones" | "regularity" | "manual";
export type GoalRegularityMode = "streak" | "frequency";
export type GoalRegularityPeriod = "day" | "week" | "month";
export type GoalIconKey = "laptop" | "no-smoking" | "activity" | "languages" | "piggy-bank" | "dumbbell" | "trophy" | "sparkles" | "target";

export type GoalCategory = {
  id: string;
  label: string;
  color: string;
  iconKey: string;
};

export type GoalMilestone = {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
  weight: number;
};

export type GoalProgressEntry = {
  id: string;
  date: string;
  value: number;
  kind: "absolute" | "delta";
  note: string;
  createdAt: string;
};

export type Goal = {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  iconKey: GoalIconKey;
  customIcon?: string;
  color: string;
  status: GoalStatus;
  health: GoalHealth;
  priority: GoalPriority;
  startDate: string;
  dueDate: string;
  progressMode: GoalProgressMode;
  regularityMode?: GoalRegularityMode;
  frequencyTarget?: number;
  frequencyPeriod?: GoalRegularityPeriod;
  initialValue: number;
  targetValue: number;
  unit: string;
  manualProgress: number;
  milestones: GoalMilestone[];
  progressEntries: GoalProgressEntry[];
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type GoalDraft = Omit<Goal, "id" | "createdAt" | "updatedAt" | "milestones" | "progressEntries"> & {
  milestones?: GoalMilestone[];
  progressEntries?: GoalProgressEntry[];
};

const STORAGE_KEY = "routine.goals.v1";
const STORE_VERSION = 1;
const nowIso = () => new Date().toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const INITIAL_CATEGORIES: GoalCategory[] = [
  { id: "sport", label: "Sport", color: "#70B89F", iconKey: "dumbbell" },
  { id: "health", label: "Zdrowie", color: "#CF777C", iconKey: "heart" },
  { id: "work", label: "Praca", color: "#4772FA", iconKey: "briefcase" },
  { id: "finance", label: "Finanse", color: "#D4AA68", iconKey: "wallet" },
  { id: "growth", label: "Rozwój", color: "#9B8CE8", iconKey: "languages" },
  { id: "relationships", label: "Relacje", color: "#9B8CE8", iconKey: "users" },
  { id: "personal", label: "Sprawy osobiste", color: "#A0A0A0", iconKey: "circle" },
];

const milestone = (id: string, title: string, dueDate: string, done = false, weight = 1): GoalMilestone => ({ id, title, dueDate, done, weight });
const entry = (id: string, date: string, value: number, note: string, kind: GoalProgressEntry["kind"] = "absolute"): GoalProgressEntry => ({ id, date, value, note, kind, createdAt: `${date}T12:00:00.000Z` });
const createdAt = "2026-07-01T09:00:00.000Z";

const SEED_GOALS: Goal[] = [
  {
    id: "rehab-app", title: "Stworzyć aplikację do rehabilitacji", description: "Zaprojektować i wydać pierwszą wersję aplikacji wspierającej rehabilitację.",
    categoryId: "work", iconKey: "laptop", color: "#4772FA", status: "active", health: "ontrack", priority: "high",
    startDate: "2026-06-01", dueDate: "2027-03-31", progressMode: "milestones", initialValue: 0, targetValue: 12, unit: "kamieni milowych", manualProgress: 0,
    milestones: [
      milestone("m-app-1", "Badanie potrzeb użytkowników", "2026-06-15", true),
      milestone("m-app-2", "Makiety i architektura informacji", "2026-06-30", true),
      milestone("m-app-3", "Prototyp interaktywny", "2026-07-15", true),
      milestone("m-app-4", "MVP — główne funkcje aplikacji", "2026-08-15"),
      milestone("m-app-5", "Moduł rehabilitacji kolana", "2026-09-15"),
      milestone("m-app-6", "Integracja z zegarkami", "2026-10-15"),
      milestone("m-app-7", "Panel specjalisty", "2026-11-15"),
      milestone("m-app-8", "Testy dostępności", "2026-12-10"),
      milestone("m-app-9", "Płatności", "2027-01-10"),
      milestone("m-app-10", "Beta testy", "2027-02-01"),
      milestone("m-app-11", "Publikacja w sklepach", "2027-03-01"),
      milestone("m-app-12", "Retrospektywa wydania", "2027-03-31"),
    ],
    progressEntries: [],
    note: "Skupić się najpierw na modułach rehabilitacji kolana i integracji z zegarkami.", createdAt, updatedAt: createdAt,
  },
  {
    id: "quit-smoking", title: "Rzucić palenie", description: "Utrzymać 90 dni bez papierosów.",
    categoryId: "health", iconKey: "no-smoking", color: "#70B89F", status: "active", health: "ontrack", priority: "high",
    startDate: "2026-06-01", dueDate: "2026-10-15", progressMode: "regularity", regularityMode: "streak", frequencyTarget: 1, frequencyPeriod: "day", initialValue: 0, targetValue: 90, unit: "dni", manualProgress: 0,
    milestones: [milestone("m-smoke-1", "60 dni bez papierosa", "2026-08-20")],
    progressEntries: [entry("p-smoke-1", "2026-07-21", 45, "45 dni bez papierosa")],
    note: "Po każdym pełnym tygodniu zapisać, co najbardziej pomogło utrzymać rytm.", createdAt, updatedAt: createdAt,
  },
  {
    id: "knee", title: "Wrócić do pełnej sprawności kolana", description: "Odbudować siłę, stabilność i pełny zakres ruchu.",
    categoryId: "sport", iconKey: "activity", color: "#D4AA68", status: "active", health: "risk", priority: "high",
    startDate: "2026-04-01", dueDate: "2026-09-30", progressMode: "numeric", initialValue: 0, targetValue: 100, unit: "% sprawności", manualProgress: 0,
    milestones: [milestone("m-knee-1", "Pełny zakres ruchu bez bólu", "2026-08-10")],
    progressEntries: [entry("p-knee-1", "2026-07-21", 72, "Pomiar kontrolny u fizjoterapeuty")],
    note: "Umówić kontrolę z fizjoterapeutą i wrócić do trzech krótkich sesji tygodniowo.", createdAt, updatedAt: createdAt,
  },
  {
    id: "spanish", title: "Nauczyć się hiszpańskiego na poziomie B2", description: "Swobodnie rozmawiać i czytać teksty na poziomie B2.",
    categoryId: "growth", iconKey: "languages", color: "#9B8CE8", status: "active", health: "ontrack", priority: "medium",
    startDate: "2026-05-01", dueDate: "2027-06-30", progressMode: "milestones", initialValue: 0, targetValue: 10, unit: "kamieni milowych", manualProgress: 0,
    milestones: [
      milestone("m-es-1", "Poziom A1", "2026-05-31", true), milestone("m-es-2", "Poziom A2", "2026-06-30", true),
      milestone("m-es-3", "1000 aktywnych słów", "2026-07-10", true), milestone("m-es-4", "Pierwsza rozmowa 15 min", "2026-07-20", true),
      milestone("m-es-5", "Swobodna rozmowa przez 30 minut", "2026-09-30"), milestone("m-es-6", "Poziom B1", "2026-12-31"),
      milestone("m-es-7", "Przeczytana książka", "2027-02-28"), milestone("m-es-8", "Egzamin próbny", "2027-04-30"),
      milestone("m-es-9", "Konwersacje bez przygotowania", "2027-05-31"), milestone("m-es-10", "Egzamin B2", "2027-06-30"),
    ],
    progressEntries: [], note: "Dwie konwersacje tygodniowo i codziennie 15 minut powtórek słownictwa.", createdAt, updatedAt: createdAt,
  },
  {
    id: "savings", title: "Zaoszczędzić 50 000 PLN", description: "Zbudować poduszkę finansową i kapitał na rozwój produktu.",
    categoryId: "finance", iconKey: "piggy-bank", color: "#D4AA68", status: "active", health: "ontrack", priority: "medium",
    startDate: "2026-01-01", dueDate: "2026-12-31", progressMode: "numeric", initialValue: 0, targetValue: 50000, unit: "PLN", manualProgress: 0,
    milestones: [milestone("m-save-1", "Przekroczyć próg 25 000 PLN", "2026-08-31")],
    progressEntries: [entry("p-save-1", "2026-07-01", 18320, "Stan oszczędności po czerwcowym przelewie")],
    note: "Automatyczny przelew wykonać w dniu wpływu wynagrodzenia.", createdAt, updatedAt: createdAt,
  },
  {
    id: "half-marathon", title: "Przebiec półmaraton", description: "Przygotować się do pierwszego półmaratonu.",
    categoryId: "sport", iconKey: "dumbbell", color: "#70B89F", status: "paused", health: "ontrack", priority: "medium",
    startDate: "2026-06-01", dueDate: "2026-10-18", progressMode: "numeric", initialValue: 0, targetValue: 14, unit: "tygodni planu", manualProgress: 0,
    milestones: [milestone("m-run-1", "Długi bieg 12 km", "2026-08-09")], progressEntries: [entry("p-run-1", "2026-07-01", 4, "Ukończone cztery tygodnie planu")],
    note: "Cel wstrzymany do czasu zgody fizjoterapeuty.", createdAt, updatedAt: createdAt,
  },
  {
    id: "product-course", title: "Ukończyć kurs zarządzania produktem", description: "Ukończyć wszystkie moduły i odebrać certyfikat.",
    categoryId: "growth", iconKey: "trophy", color: "#70B89F", status: "completed", health: "ontrack", priority: "low",
    startDate: "2026-03-01", dueDate: "2026-06-30", progressMode: "manual", initialValue: 0, targetValue: 100, unit: "%", manualProgress: 100,
    milestones: [milestone("m-course-1", "Certyfikat ukończenia", "2026-06-30", true)], progressEntries: [],
    note: "Podsumowanie kursu zapisane w notatkach.", createdAt, updatedAt: createdAt,
  },
  {
    id: "portugal", title: "Zorganizować wyjazd do Portugalii", description: "Zaplanować tygodniowy wyjazd do Portugalii.",
    categoryId: "personal", iconKey: "sparkles", color: "#4772FA", status: "planned", health: "ontrack", priority: "low",
    startDate: "2026-09-01", dueDate: "2027-04-30", progressMode: "milestones", initialValue: 0, targetValue: 6, unit: "kroków", manualProgress: 0,
    milestones: [milestone("m-trip-1", "Wybrać termin i kierunek", "2026-09-15"), milestone("m-trip-2", "Kupić loty", "2026-10-31"), milestone("m-trip-3", "Zarezerwować noclegi", "2026-12-31")],
    progressEntries: [], note: "Rozpocząć planowanie po zamknięciu bieżącego projektu.", createdAt, updatedAt: createdAt,
  },
];

export function getGoalCurrentValue(goal: Goal): number {
  let current = goal.initialValue;
  [...goal.progressEntries]
    .sort((a, b) => `${a.date}-${a.createdAt}`.localeCompare(`${b.date}-${b.createdAt}`))
    .forEach((progress) => { current = progress.kind === "absolute" ? progress.value : current + progress.value; });
  return current;
}

export function getRegularityTarget(goal: Goal): number {
  if (goal.progressMode !== "regularity" || goal.regularityMode !== "frequency") return goal.targetValue;
  const [startYear, startMonth, startDay] = goal.startDate.split("-").map(Number);
  const [dueYear, dueMonth, dueDay] = goal.dueDate.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const due = Date.UTC(dueYear, dueMonth - 1, dueDay);
  if (!Number.isFinite(start) || !Number.isFinite(due)) return Math.max(1, goal.frequencyTarget ?? 1);
  const days = Math.max(1, Math.ceil((due - start) / 86_400_000) + 1);
  const periods = goal.frequencyPeriod === "month" ? Math.ceil(days / 30.44) : goal.frequencyPeriod === "week" ? Math.ceil(days / 7) : days;
  return Math.max(1, goal.frequencyTarget ?? 1) * periods;
}

export function getGoalProgress(goal: Goal): number {
  if (goal.progressMode === "milestones") {
    const totalWeight = goal.milestones.reduce((sum, item) => sum + item.weight, 0);
    if (!totalWeight) return 0;
    return Math.round((goal.milestones.filter((item) => item.done).reduce((sum, item) => sum + item.weight, 0) / totalWeight) * 100);
  }
  if (goal.progressMode === "manual") {
    const value = goal.progressEntries.length ? getGoalCurrentValue(goal) : goal.manualProgress;
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  const target = goal.progressMode === "regularity" ? getRegularityTarget(goal) : goal.targetValue;
  if (!target) return 0;
  return Math.max(0, Math.min(100, Math.round((getGoalCurrentValue(goal) / target) * 100)));
}

export function getGoalMetric(goal: Goal): string {
  if (goal.progressMode === "milestones") return `${goal.milestones.filter((item) => item.done).length} z ${goal.milestones.length} kamieni milowych`;
  if (goal.progressMode === "manual") return `${getGoalProgress(goal)}% realizacji`;
  const current = getGoalCurrentValue(goal).toLocaleString("pl-PL");
  const targetValue = goal.progressMode === "regularity" ? getRegularityTarget(goal) : goal.targetValue;
  const target = targetValue.toLocaleString("pl-PL");
  if (goal.progressMode === "regularity") {
    if (goal.regularityMode === "frequency") {
      const period = goal.frequencyPeriod === "month" ? "miesiąc" : goal.frequencyPeriod === "week" ? "tydzień" : "dzień";
      return `${current} / ${target} wykonań · ${goal.frequencyTarget ?? 1}× / ${period}`;
    }
    return `${current} dni z ${target}`;
  }
  return `${current} / ${target} ${goal.unit}`.trim();
}

type GoalsStoreValue = {
  goals: Goal[];
  categories: GoalCategory[];
  storageFailed: boolean;
  createGoal: (draft: GoalDraft) => string;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => Goal | null;
  restoreGoal: (goal: Goal) => void;
  duplicateGoal: (id: string) => string | null;
  addProgress: (goalId: string, draft: Omit<GoalProgressEntry, "id" | "createdAt">) => void;
  updateProgress: (goalId: string, progressId: string, patch: Partial<GoalProgressEntry>) => void;
  deleteProgress: (goalId: string, progressId: string) => void;
  addMilestone: (goalId: string, draft: Omit<GoalMilestone, "id">) => void;
  updateMilestone: (goalId: string, milestoneId: string, patch: Partial<GoalMilestone>) => void;
  deleteMilestone: (goalId: string, milestoneId: string) => void;
  createCategory: (draft: Omit<GoalCategory, "id">) => void;
  updateCategory: (id: string, patch: Partial<GoalCategory>) => void;
  deleteCategory: (id: string) => void;
  importStore: (raw: string) => boolean;
  exportStore: () => string;
};

const GoalsStoreContext = createContext<GoalsStoreValue | null>(null);

function withoutLegacyModules(goal: Goal): Goal {
  const cleanGoal = { ...goal, color: normalizePaletteColor(goal.color) } as Goal & { modules?: unknown };
  delete cleanGoal.modules;
  return cleanGoal;
}

function normalizeCategory(category: GoalCategory): GoalCategory {
  const color = normalizePaletteColor(category.color);
  return color === category.color ? category : { ...category, color };
}

function normalizePaletteColor(color: string): string {
  const numericColor = color.startsWith("#") ? Number.parseInt(color.slice(1), 16) : Number.NaN;
  return numericColor === 0xc77dbb ? "#9B8CE8" : color;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isGoalCategory(value: unknown): value is GoalCategory {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.label === "string"
    && typeof value.color === "string"
    && typeof value.iconKey === "string";
}

function isGoal(value: unknown): value is Goal {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.categoryId === "string"
    && typeof value.status === "string"
    && typeof value.health === "string"
    && typeof value.priority === "string"
    && typeof value.startDate === "string"
    && typeof value.dueDate === "string"
    && typeof value.progressMode === "string"
    && Array.isArray(value.milestones)
    && Array.isArray(value.progressEntries);
}

function readInitialStore(): { goals: Goal[]; categories: GoalCategory[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { goals: SEED_GOALS, categories: INITIAL_CATEGORIES };
    const parsed = JSON.parse(raw) as { version?: number; goals?: Goal[]; categories?: GoalCategory[] };
    if (
      parsed.version !== STORE_VERSION
      || !Array.isArray(parsed.goals)
      || !Array.isArray(parsed.categories)
      || !parsed.goals.every(isGoal)
      || !parsed.categories.every(isGoalCategory)
    ) throw new Error("Invalid store");
    return { goals: parsed.goals.map(withoutLegacyModules), categories: parsed.categories.map(normalizeCategory) };
  } catch {
    return { goals: SEED_GOALS, categories: INITIAL_CATEGORIES };
  }
}

export function GoalsProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(readInitialStore, []);
  const [goals, setGoals] = useState<Goal[]>(initial.goals);
  const [categories, setCategories] = useState<GoalCategory[]>(initial.categories);
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORE_VERSION, goals, categories }));
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  }, [goals, categories]);

  const value = useMemo<GoalsStoreValue>(() => ({
    goals,
    categories,
    storageFailed,
    createGoal: (draft) => {
      const id = uid();
      const stamp = nowIso();
      setGoals((current) => [...current, { ...draft, id, milestones: draft.milestones ?? [], progressEntries: draft.progressEntries ?? [], createdAt: stamp, updatedAt: stamp }]);
      return id;
    },
    updateGoal: (id, patch) => setGoals((current) => current.map((goal) => goal.id === id ? { ...goal, ...patch, id: goal.id, updatedAt: nowIso() } : goal)),
    deleteGoal: (id) => {
      const deleted = goals.find((goal) => goal.id === id) ?? null;
      setGoals((current) => current.filter((goal) => goal.id !== id));
      return deleted;
    },
    restoreGoal: (goal) => setGoals((current) => current.some((item) => item.id === goal.id) ? current : [...current, goal]),
    duplicateGoal: (id) => {
      const source = goals.find((goal) => goal.id === id);
      if (!source) return null;
      const duplicateId = uid();
      const stamp = nowIso();
      setGoals((current) => [...current, { ...source, id: duplicateId, title: `${source.title} — kopia`, status: "planned", milestones: source.milestones.map((item) => ({ ...item, id: uid(), done: false })), progressEntries: [], createdAt: stamp, updatedAt: stamp }]);
      return duplicateId;
    },
    addProgress: (goalId, draft) => setGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, progressEntries: [...goal.progressEntries, { ...draft, id: uid(), createdAt: nowIso() }], updatedAt: nowIso() } : goal)),
    updateProgress: (goalId, progressId, patch) => setGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, progressEntries: goal.progressEntries.map((item) => item.id === progressId ? { ...item, ...patch, id: item.id } : item), updatedAt: nowIso() } : goal)),
    deleteProgress: (goalId, progressId) => setGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, progressEntries: goal.progressEntries.filter((item) => item.id !== progressId), updatedAt: nowIso() } : goal)),
    addMilestone: (goalId, draft) => setGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, milestones: [...goal.milestones, { ...draft, id: uid() }], updatedAt: nowIso() } : goal)),
    updateMilestone: (goalId, milestoneId, patch) => setGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, milestones: goal.milestones.map((item) => item.id === milestoneId ? { ...item, ...patch, id: item.id } : item), updatedAt: nowIso() } : goal)),
    deleteMilestone: (goalId, milestoneId) => setGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, milestones: goal.milestones.filter((item) => item.id !== milestoneId), updatedAt: nowIso() } : goal)),
    createCategory: (draft) => setCategories((current) => [...current, { ...draft, id: uid() }]),
    updateCategory: (id, patch) => setCategories((current) => current.map((category) => category.id === id ? { ...category, ...patch, id: category.id } : category)),
    deleteCategory: (id) => {
      if (id === "personal") return;
      setCategories((current) => current.filter((category) => category.id !== id));
      setGoals((current) => current.map((goal) => goal.categoryId === id ? { ...goal, categoryId: "personal", updatedAt: nowIso() } : goal));
    },
    importStore: (raw) => {
      try {
        const parsed = JSON.parse(raw) as { goals?: Goal[]; categories?: GoalCategory[] };
        if (
          !Array.isArray(parsed.goals)
          || !Array.isArray(parsed.categories)
          || !parsed.goals.every(isGoal)
          || !parsed.categories.every(isGoalCategory)
        ) return false;
        setGoals(parsed.goals.map(withoutLegacyModules));
        setCategories(parsed.categories.map(normalizeCategory));
        return true;
      } catch { return false; }
    },
    exportStore: () => JSON.stringify({ version: STORE_VERSION, exportedAt: nowIso(), goals, categories }, null, 2),
  }), [goals, categories, storageFailed]);

  return <GoalsStoreContext.Provider value={value}>{children}</GoalsStoreContext.Provider>;
}

export function useGoalsStore() {
  const context = useContext(GoalsStoreContext);
  if (!context) throw new Error("useGoalsStore must be used inside GoalsProvider");
  return context;
}
