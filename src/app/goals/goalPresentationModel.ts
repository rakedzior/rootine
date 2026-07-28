import type { LucideIcon } from "lucide-react";
import {
  getGoalCurrentValue,
  getGoalMetric,
  getGoalProgress,
  getRegularityTarget,
} from "./goalsModel";
import type {
  Goal as StoredGoal,
  GoalCategory,
  GoalIconKey,
  GoalsImportPreview,
  GoalProgressMode,
  GoalStatus as StoredGoalStatus,
} from "./goalsModel";
import { calendarDaysBetween, formatLocalDate, todayLocalDateKey } from "../data/localDate";
import type {
  GoalFilterId as FilterId,
  GoalLayout,
  GoalSortKey,
} from "./goalViewState";
import { uiColors } from "../ui";
import {
  Activity,
  Briefcase,
  CheckCircle2,
  Circle,
  CircleDashed,
  CirclePause,
  CigaretteOff,
  Dumbbell,
  HeartPulse,
  Languages,
  Laptop,
  PiggyBank,
  Sparkles,
  Target,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";

export const C = {
  bg: uiColors.graphiteCanvas,
  subSidebar: uiColors.graphiteSidebar,
  card: uiColors.graphiteCard,
  cardHover: uiColors.graphiteHover,
  panel: uiColors.graphitePanel,
  inputBg: uiColors.graphiteInput,
  borderSubtle: uiColors.borderSubtle,
  borderStrong: uiColors.borderStrong,
  textPrimary: uiColors.chalkWhite,
  textSecond: uiColors.textSecondary,
  textMuted: uiColors.textMuted,
  textDisabled: uiColors.textDisabled,
  iceBlue: uiColors.precisionBlue,
  iceBlueText: uiColors.precisionBlueText,
  iceBlueBg: uiColors.precisionBlueSoft,
  seaGlass: uiColors.success,
  warning: uiColors.warning,
  danger: uiColors.danger,
  blueBorder: "color-mix(in srgb, var(--color-precision-blue) 35%, transparent)",
} as const;

export type GoalStatus = "active" | "risk" | "paused" | "completed" | "planned" | "archived";
export type GoalPriority = "high" | "medium" | "low";
export type Goal = {
  id: string | number;
  title: string;
  category: string;
  categoryId?: string;
  icon: LucideIcon;
  customIcon?: string;
  color: string;
  progress: number;
  current: number;
  total: number;
  progressLabel: string;
  due: string;
  daysLeft: string;
  status: GoalStatus;
  priority: GoalPriority;
  rhythm: string;
  nextMilestone: { title: string; progress: number; date: string; daysLeft: string };
  note: string;
};

export type ImportCandidate = {
  fileName: string;
  raw: string;
  preview: GoalsImportPreview;
};

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Sport: Dumbbell,
  Zdrowie: HeartPulse,
  Praca: Briefcase,
  Finanse: WalletCards,
  Rozwój: Languages,
  Relacje: Users,
  "Sprawy osobiste": Circle,
};

const GOAL_ICONS: Record<GoalIconKey, LucideIcon> = {
  laptop: Laptop,
  "no-smoking": CigaretteOff,
  activity: Activity,
  languages: Languages,
  "piggy-bank": PiggyBank,
  dumbbell: Dumbbell,
  trophy: Trophy,
  sparkles: Sparkles,
  target: Target,
};

export const CATEGORY_ICON_KEYS: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  heart: HeartPulse,
  briefcase: Briefcase,
  wallet: WalletCards,
  languages: Languages,
  users: Users,
  circle: Circle,
};

const PROGRESS_LABELS: Record<GoalProgressMode, string> = {
  numeric: "Wartość liczbowa",
  milestones: "Kamienie milowe",
  regularity: "Regularność",
  manual: "Postęp ręczny",
};

function formatGoalDate(date: string) {
  return formatLocalDate(date);
}

function formatDaysLeft(date: string, status: StoredGoalStatus) {
  if (status === "completed") return "Ukończono";
  if (status === "archived") return "W archiwum";
  if (status === "paused") return "Realizacja wstrzymana";
  if (status === "planned") return "Zaplanowany";
  const days = calendarDaysBetween(todayLocalDateKey(), date);
  if (days === null) return "Nieprawidłowy termin";
  if (days === 0) return "Termin dzisiaj";
  if (days < 0) return `${Math.abs(days)} dni po terminie`;
  return `${days} dni zostało`;
}

export function toViewGoal(goal: StoredGoal, categories: GoalCategory[]): Goal {
  const category = categories.find((item) => item.id === goal.categoryId) ?? categories[0];
  const nextMilestone = [...goal.milestones].filter((item) => !item.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    ?? [...goal.milestones].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
  const progress = getGoalProgress(goal);
  const current = goal.progressMode === "milestones" ? goal.milestones.filter((item) => item.done).length : getGoalCurrentValue(goal);
  const total = goal.progressMode === "milestones" ? goal.milestones.length : goal.progressMode === "regularity" ? getRegularityTarget(goal) : goal.targetValue;
  return {
    id: goal.id,
    title: goal.title,
    category: category?.label ?? "Bez kategorii",
    categoryId: goal.categoryId,
    icon: GOAL_ICONS[goal.iconKey] ?? Target,
    customIcon: goal.customIcon,
    color: goal.color || category?.color || C.iceBlue,
    progress,
    current,
    total,
    progressLabel: getGoalMetric(goal),
    due: formatGoalDate(goal.dueDate),
    daysLeft: formatDaysLeft(goal.dueDate, goal.status),
    status: goal.status === "active" && goal.health === "risk" ? "risk" : goal.status,
    priority: goal.priority,
    rhythm: PROGRESS_LABELS[goal.progressMode],
    nextMilestone: nextMilestone ? {
      title: nextMilestone.title,
      progress: nextMilestone.done ? 100 : progress,
      date: formatGoalDate(nextMilestone.dueDate),
      daysLeft: formatDaysLeft(nextMilestone.dueDate, nextMilestone.done ? "completed" : "active"),
    } : {
      title: "Dodaj pierwszy kamień milowy",
      progress: 0,
      date: formatGoalDate(goal.dueDate),
      daysLeft: formatDaysLeft(goal.dueDate, goal.status),
    },
    note: goal.note,
  };
}

export const STATUS_META: Record<GoalStatus, { label: string; color: string }> = {
  active: { label: "Aktywny", color: C.iceBlueText },
  risk: { label: "Zagrożony", color: C.warning },
  paused: { label: "Wstrzymany", color: C.textSecond },
  completed: { label: "Zakończony", color: C.seaGlass },
  planned: { label: "Zaplanowany", color: C.textSecond },
  archived: { label: "Zarchiwizowany", color: C.textSecond },
};

export const FILTER_ITEMS: { id: FilterId; label: string; icon: LucideIcon; color?: string }[] = [
  { id: "all", label: "Wszystkie cele", icon: Target },
  { id: "active", label: "Aktywne", icon: Activity, color: C.iceBlueText },
  { id: "paused", label: "Wstrzymane", icon: CirclePause, color: C.textSecond },
  { id: "completed", label: "Zakończone", icon: CheckCircle2, color: C.seaGlass },
  { id: "planned", label: "Zaplanowane", icon: CircleDashed, color: C.textSecond },
];

export function deadlineColor(goal: Goal) {
  if (["paused", "completed", "planned", "archived"].includes(goal.status)) return C.textSecond;
  if (goal.daysLeft.includes("po terminie")) return C.danger;
  const daysRemaining = Number(goal.daysLeft.match(/^(\d+) dni zostało/)?.[1]);
  if (Number.isFinite(daysRemaining) && daysRemaining <= 14) return C.warning;
  if (goal.status === "risk") return C.warning;
  return C.textSecond;
}

export const countForFilter = (id: FilterId, goals: Goal[]) => {
  if (id === "all") return goals.filter((goal) => goal.status !== "archived").length;
  if (id === "active") return goals.filter((goal) => goal.status === "active" || goal.status === "risk").length;
  return goals.filter((goal) => goal.status === id).length;
};

export function readLayoutPreference(): GoalLayout {
  try {
    return localStorage.getItem("routine.goals.layout") === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

export function readSortPreference(): GoalSortKey {
  try {
    const saved = localStorage.getItem("routine.goals.sort");
    return saved === "due" || saved === "progress" || saved === "updated" || saved === "name"
      ? saved
      : "priority";
  } catch {
    return "priority";
  }
}
