import { calendarDaysBetween, isLocalDateKey } from "../data/localDate";

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

export const GOALS_STORE_VERSION = 1;

export const GOAL_ACCENT_OPTIONS = [
  { value: "#7FA6C9", label: "Błękit" },
  { value: "#79A8A4", label: "Morskie szkło" },
  { value: "#B9A171", label: "Piasek" },
  { value: "#9B8CE8", label: "Fiolet" },
  { value: "#BC8EA5", label: "Róż" },
  { value: "#8793A1", label: "Neutralny" },
] as const;

const GOAL_ACCENT_VALUES = new Set<string>(GOAL_ACCENT_OPTIONS.map((option) => option.value));
const DEFAULT_GOAL_ACCENT = GOAL_ACCENT_OPTIONS[0].value;

export function normalizeGoalAccentColor(color: string) {
  const normalized = color.toUpperCase();
  if (GOAL_ACCENT_VALUES.has(normalized)) return normalized;
  if (normalized === "#4772FA" || normalized === "#3E63DA" || normalized === "#809AF4") return "#7FA6C9";
  if (normalized === "#70B89F") return "#79A8A4";
  if (normalized === "#D4AA68") return "#B9A171";
  if (normalized === "#C77DBB") return "#9B8CE8";
  if (normalized === "#CF777C") return "#BC8EA5";
  if (normalized === "#A0A0A0") return "#8793A1";
  return DEFAULT_GOAL_ACCENT;
}

export const INITIAL_CATEGORIES: GoalCategory[] = [
  { id: "sport", label: "Sport", color: "#79A8A4", iconKey: "dumbbell" },
  { id: "health", label: "Zdrowie", color: "#9B8CE8", iconKey: "heart" },
  { id: "work", label: "Praca", color: "#7FA6C9", iconKey: "briefcase" },
  { id: "finance", label: "Finanse", color: "#B9A171", iconKey: "wallet" },
  { id: "growth", label: "Rozwój", color: "#9B8CE8", iconKey: "languages" },
  { id: "relationships", label: "Relacje", color: "#BC8EA5", iconKey: "users" },
  { id: "personal", label: "Sprawy osobiste", color: "#8793A1", iconKey: "circle" },
];

const milestone = (id: string, title: string, dueDate: string, done = false, weight = 1): GoalMilestone => ({ id, title, dueDate, done, weight });
const entry = (id: string, date: string, value: number, note: string, kind: GoalProgressEntry["kind"] = "absolute"): GoalProgressEntry => ({ id, date, value, note, kind, createdAt: `${date}T12:00:00.000Z` });
const createdAt = "2026-07-01T09:00:00.000Z";

const SEED_GOALS: Goal[] = [
  {
    id: "rehab-app", title: "Stworzyć aplikację do rehabilitacji", description: "Zaprojektować i wydać pierwszą wersję aplikacji wspierającej rehabilitację.",
    categoryId: "work", iconKey: "laptop", color: "#7FA6C9", status: "active", health: "ontrack", priority: "high",
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
    categoryId: "health", iconKey: "no-smoking", color: "#79A8A4", status: "active", health: "ontrack", priority: "high",
    startDate: "2026-06-01", dueDate: "2026-10-15", progressMode: "regularity", regularityMode: "streak", frequencyTarget: 1, frequencyPeriod: "day", initialValue: 0, targetValue: 90, unit: "dni", manualProgress: 0,
    milestones: [milestone("m-smoke-1", "60 dni bez papierosa", "2026-08-20")],
    progressEntries: [entry("p-smoke-1", "2026-07-21", 45, "45 dni bez papierosa")],
    note: "Po każdym pełnym tygodniu zapisać, co najbardziej pomogło utrzymać rytm.", createdAt, updatedAt: createdAt,
  },
  {
    id: "knee", title: "Wrócić do pełnej sprawności kolana", description: "Odbudować siłę, stabilność i pełny zakres ruchu.",
    categoryId: "sport", iconKey: "activity", color: "#B9A171", status: "active", health: "risk", priority: "high",
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
    categoryId: "finance", iconKey: "piggy-bank", color: "#B9A171", status: "active", health: "ontrack", priority: "medium",
    startDate: "2026-01-01", dueDate: "2026-12-31", progressMode: "numeric", initialValue: 0, targetValue: 50000, unit: "PLN", manualProgress: 0,
    milestones: [milestone("m-save-1", "Przekroczyć próg 25 000 PLN", "2026-08-31")],
    progressEntries: [entry("p-save-1", "2026-07-01", 18320, "Stan oszczędności po czerwcowym przelewie")],
    note: "Automatyczny przelew wykonać w dniu wpływu wynagrodzenia.", createdAt, updatedAt: createdAt,
  },
  {
    id: "half-marathon", title: "Przebiec półmaraton", description: "Przygotować się do pierwszego półmaratonu.",
    categoryId: "sport", iconKey: "dumbbell", color: "#79A8A4", status: "paused", health: "ontrack", priority: "medium",
    startDate: "2026-06-01", dueDate: "2026-10-18", progressMode: "numeric", initialValue: 0, targetValue: 14, unit: "tygodni planu", manualProgress: 0,
    milestones: [milestone("m-run-1", "Długi bieg 12 km", "2026-08-09")], progressEntries: [entry("p-run-1", "2026-07-01", 4, "Ukończone cztery tygodnie planu")],
    note: "Cel wstrzymany do czasu zgody fizjoterapeuty.", createdAt, updatedAt: createdAt,
  },
  {
    id: "product-course", title: "Ukończyć kurs zarządzania produktem", description: "Ukończyć wszystkie moduły i odebrać certyfikat.",
    categoryId: "growth", iconKey: "trophy", color: "#79A8A4", status: "completed", health: "ontrack", priority: "low",
    startDate: "2026-03-01", dueDate: "2026-06-30", progressMode: "manual", initialValue: 0, targetValue: 100, unit: "%", manualProgress: 100,
    milestones: [milestone("m-course-1", "Certyfikat ukończenia", "2026-06-30", true)], progressEntries: [],
    note: "Podsumowanie kursu zapisane w notatkach.", createdAt, updatedAt: createdAt,
  },
  {
    id: "portugal", title: "Zorganizować wyjazd do Portugalii", description: "Zaplanować tygodniowy wyjazd do Portugalii.",
    categoryId: "personal", iconKey: "sparkles", color: "#7FA6C9", status: "planned", health: "ontrack", priority: "low",
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
  const calendarDays = calendarDaysBetween(goal.startDate, goal.dueDate);
  if (calendarDays === null) return Math.max(1, goal.frequencyTarget ?? 1);
  const days = Math.max(1, calendarDays + 1);
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

export type GoalsWorkspace = {
  version: typeof GOALS_STORE_VERSION;
  goals: Goal[];
  categories: GoalCategory[];
};

export type GoalsImportPreview = {
  goalCount: number;
  categoryCount: number;
  milestoneCount: number;
  progressCount: number;
  activeCount: number;
};

export type GoalsImportInspection =
  | { ok: true; preview: GoalsImportPreview }
  | { ok: false; error: string };

export type GoalsImportResult =
  | { ok: true }
  | { ok: false; error: string };

export function normalizeGoal(goal: Goal): Goal {
  const cleanGoal = { ...goal, color: normalizeGoalAccentColor(goal.color) } as Goal & { modules?: unknown };
  delete cleanGoal.modules;
  return cleanGoal;
}

export function normalizeGoalCategory(category: GoalCategory): GoalCategory {
  const color = normalizeGoalAccentColor(category.color);
  return color === category.color ? category : { ...category, color };
}

export function createSeedGoalsWorkspace(): GoalsWorkspace {
  return JSON.parse(JSON.stringify({
    version: GOALS_STORE_VERSION,
    goals: SEED_GOALS,
    categories: INITIAL_CATEGORIES,
  })) as GoalsWorkspace;
}

export function normalizeGoalsWorkspace(workspace: GoalsWorkspace): GoalsWorkspace {
  return {
    version: GOALS_STORE_VERSION,
    goals: workspace.goals.map(normalizeGoal),
    categories: workspace.categories.map(normalizeGoalCategory),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const GOAL_STATUSES = new Set<GoalStatus>(["planned", "active", "paused", "completed", "archived"]);
const GOAL_HEALTH_VALUES = new Set<GoalHealth>(["ontrack", "risk"]);
const GOAL_PRIORITIES = new Set<GoalPriority>(["high", "medium", "low"]);
const GOAL_PROGRESS_MODES = new Set<GoalProgressMode>(["numeric", "milestones", "regularity", "manual"]);
const GOAL_REGULARITY_MODES = new Set<GoalRegularityMode>(["streak", "frequency"]);
const GOAL_REGULARITY_PERIODS = new Set<GoalRegularityPeriod>(["day", "week", "month"]);
const GOAL_ICON_KEYS = new Set<GoalIconKey>(["laptop", "no-smoking", "activity", "languages", "piggy-bank", "dumbbell", "trophy", "sparkles", "target"]);
const PROGRESS_KINDS = new Set<GoalProgressEntry["kind"]>(["absolute", "delta"]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const CUSTOM_ICON = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i;

function isBoundedString(value: unknown, maxLength: number, allowEmpty = true): value is string {
  return typeof value === "string"
    && value.length <= maxLength
    && (allowEmpty || value.trim().length > 0);
}

function isFiniteBoundedNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isIsoTimestamp(value: unknown): value is string {
  return isBoundedString(value, 64, false) && Number.isFinite(Date.parse(value));
}

function hasUniqueIds(values: Array<{ id: string }>): boolean {
  return new Set(values.map((value) => value.id)).size === values.length;
}

function isGoalCategory(value: unknown): value is GoalCategory {
  return isRecord(value)
    && isBoundedString(value.id, 120, false)
    && isBoundedString(value.label, 80, false)
    && typeof value.color === "string"
    && HEX_COLOR.test(value.color)
    && isBoundedString(value.iconKey, 80, false);
}

function isGoalMilestone(value: unknown): value is GoalMilestone {
  return isRecord(value)
    && isBoundedString(value.id, 120, false)
    && isBoundedString(value.title, 200, false)
    && isLocalDateKey(value.dueDate)
    && typeof value.done === "boolean"
    && isFiniteBoundedNumber(value.weight, 0.01, 10_000);
}

function isGoalProgressEntry(value: unknown): value is GoalProgressEntry {
  return isRecord(value)
    && isBoundedString(value.id, 120, false)
    && isLocalDateKey(value.date)
    && isFiniteBoundedNumber(value.value, -1_000_000_000_000, 1_000_000_000_000)
    && typeof value.kind === "string"
    && PROGRESS_KINDS.has(value.kind as GoalProgressEntry["kind"])
    && isBoundedString(value.note, 2_000)
    && isIsoTimestamp(value.createdAt);
}

function isGoal(value: unknown): value is Goal {
  if (!isRecord(value)) return false;
  if (
    !isBoundedString(value.id, 120, false)
    || !isBoundedString(value.title, 240, false)
    || !isBoundedString(value.description, 4_000)
    || !isBoundedString(value.categoryId, 120, false)
    || typeof value.iconKey !== "string"
    || !GOAL_ICON_KEYS.has(value.iconKey as GoalIconKey)
    || typeof value.color !== "string"
    || !HEX_COLOR.test(value.color)
    || typeof value.status !== "string"
    || !GOAL_STATUSES.has(value.status as GoalStatus)
    || typeof value.health !== "string"
    || !GOAL_HEALTH_VALUES.has(value.health as GoalHealth)
    || typeof value.priority !== "string"
    || !GOAL_PRIORITIES.has(value.priority as GoalPriority)
    || !isLocalDateKey(value.startDate)
    || !isLocalDateKey(value.dueDate)
    || (calendarDaysBetween(value.startDate, value.dueDate) ?? -1) < 0
    || typeof value.progressMode !== "string"
    || !GOAL_PROGRESS_MODES.has(value.progressMode as GoalProgressMode)
    || !isFiniteBoundedNumber(value.initialValue, -1_000_000_000_000, 1_000_000_000_000)
    || !isFiniteBoundedNumber(value.targetValue, 0, 1_000_000_000_000)
    || !isBoundedString(value.unit, 80)
    || !isFiniteBoundedNumber(value.manualProgress, 0, 100)
    || !Array.isArray(value.milestones)
    || value.milestones.length > 5_000
    || !value.milestones.every(isGoalMilestone)
    || !hasUniqueIds(value.milestones)
    || !Array.isArray(value.progressEntries)
    || value.progressEntries.length > 20_000
    || !value.progressEntries.every(isGoalProgressEntry)
    || !hasUniqueIds(value.progressEntries)
    || !isBoundedString(value.note, 10_000)
    || !isIsoTimestamp(value.createdAt)
    || !isIsoTimestamp(value.updatedAt)
  ) return false;

  if (
    value.customIcon !== undefined
    && (!isBoundedString(value.customIcon, 500_000, false) || !CUSTOM_ICON.test(value.customIcon))
  ) return false;
  if (
    value.regularityMode !== undefined
    && (typeof value.regularityMode !== "string" || !GOAL_REGULARITY_MODES.has(value.regularityMode as GoalRegularityMode))
  ) return false;
  if (
    value.frequencyPeriod !== undefined
    && (typeof value.frequencyPeriod !== "string" || !GOAL_REGULARITY_PERIODS.has(value.frequencyPeriod as GoalRegularityPeriod))
  ) return false;
  if (
    value.frequencyTarget !== undefined
    && !isFiniteBoundedNumber(value.frequencyTarget, 0.01, 1_000_000)
  ) return false;

  if (value.progressMode === "regularity" && !value.regularityMode) return false;
  if (
    value.progressMode === "regularity"
    && value.regularityMode === "frequency"
    && (!value.frequencyPeriod || value.frequencyTarget === undefined)
  ) return false;
  if (value.progressMode !== "milestones" && value.targetValue <= 0) return false;
  return true;
}

export function isGoalsWorkspace(value: unknown): value is GoalsWorkspace {
  if (
    !isRecord(value)
    || value.version !== GOALS_STORE_VERSION
    || !Array.isArray(value.goals)
    || value.goals.length > 5_000
    || !value.goals.every(isGoal)
    || !hasUniqueIds(value.goals)
    || !Array.isArray(value.categories)
    || value.categories.length === 0
    || value.categories.length > 500
    || !value.categories.every(isGoalCategory)
    || !hasUniqueIds(value.categories)
  ) return false;

  const categoryIds = new Set(value.categories.map((category) => category.id));
  return categoryIds.has("personal")
    && value.goals.every((goal) => categoryIds.has(goal.categoryId));
}

function explainInvalidWorkspace(value: unknown): string {
  if (!isRecord(value)) return "Plik nie zawiera obiektu danych celów.";
  if (value.version !== GOALS_STORE_VERSION) return "Plik ma nieobsługiwaną wersję danych.";
  if (!Array.isArray(value.goals) || !Array.isArray(value.categories)) {
    return "Plik nie zawiera list celów i kategorii.";
  }
  if (value.goals.length > 5_000 || value.categories.length > 500) {
    return "Plik przekracza bezpieczny limit liczby celów lub kategorii.";
  }
  if (!value.categories.every(isGoalCategory)) {
    return "Co najmniej jedna kategoria ma nieprawidłowe lub niepełne dane.";
  }
  if (!hasUniqueIds(value.categories)) return "Identyfikatory kategorii muszą być unikalne.";
  if (!value.goals.every(isGoal)) {
    return "Co najmniej jeden cel zawiera nieprawidłowe daty, wartości, status lub wpisy postępu.";
  }
  if (!hasUniqueIds(value.goals)) return "Identyfikatory celów muszą być unikalne.";
  const categoryIds = new Set(value.categories.map((category) => category.id));
  if (!categoryIds.has("personal")) return "Brakuje wymaganej kategorii „Sprawy osobiste”.";
  if (!value.goals.every((goal) => categoryIds.has(goal.categoryId))) {
    return "Co najmniej jeden cel odwołuje się do nieistniejącej kategorii.";
  }
  return "Plik nie przeszedł pełnej walidacji danych.";
}

export function parseGoalsImport(raw: string): { workspace: GoalsWorkspace } | { error: string } {
  if (new Blob([raw]).size > 10_000_000) {
    return { error: "Plik jest zbyt duży. Maksymalny rozmiar importu to 10 MB." };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isGoalsWorkspace(parsed)) return { error: explainInvalidWorkspace(parsed) };
    return { workspace: normalizeGoalsWorkspace(parsed) };
  } catch {
    return { error: "Nie można odczytać pliku JSON." };
  }
}

function previewWorkspace(workspace: GoalsWorkspace): GoalsImportPreview {
  return {
    goalCount: workspace.goals.length,
    categoryCount: workspace.categories.length,
    milestoneCount: workspace.goals.reduce((sum, goal) => sum + goal.milestones.length, 0),
    progressCount: workspace.goals.reduce((sum, goal) => sum + goal.progressEntries.length, 0),
    activeCount: workspace.goals.filter((goal) => goal.status === "active").length,
  };
}

export function inspectGoalsImport(raw: string): GoalsImportInspection {
  const parsed = parseGoalsImport(raw);
  return "error" in parsed
    ? { ok: false, error: parsed.error }
    : { ok: true, preview: previewWorkspace(parsed.workspace) };
}
