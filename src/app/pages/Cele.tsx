import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import {
  getGoalCurrentValue,
  getGoalMetric,
  getGoalProgress,
  getRegularityTarget,
  useGoalsStore,
} from "../goals/goalsStore";
import { calendarDaysBetween, formatLocalDate, todayLocalDateKey } from "../data/localDate";
import type {
  Goal as StoredGoal,
  GoalCategory,
  GoalDraft,
  GoalIconKey,
  GoalsImportPreview,
  GoalProgressMode,
  GoalStatus as StoredGoalStatus,
} from "../goals/goalsStore";
import {
  ConfirmDialog,
  GoalFormDialog,
  MilestoneDialog,
  ProgressDialog,
  ThemedSelect,
} from "../goals/GoalDialogs";
import type { GoalEditorData } from "../goals/GoalDialogs";
import { GoalNoteTextarea } from "../goals/GoalNoteTextarea";
import {
  readGoalViewState,
  writeGoalViewState,
  type GoalFilterId as FilterId,
  type GoalLayout,
  type GoalSortKey,
  type GoalViewState,
} from "../goals/goalViewState";
import {
  Badge,
  Button,
  ContextNavItem,
  ContextSidebar,
  DetailPanel,
  EmptyState,
  Menu,
  MenuItem,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  SectionHeader,
  Select,
  WorkspaceToolbar,
  uiColors,
} from "../ui";
import {
  Activity,
  Archive,
  BarChart3,
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDashed,
  CirclePause,
  CigaretteOff,
  Dumbbell,
  Ellipsis,
  Flag,
  FolderCog,
  Grid2X2,
  HeartPulse,
  Languages,
  Laptop,
  List,
  NotebookPen,
  PiggyBank,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  Trophy,
  Trash2,
  Users,
  WalletCards,
  X,
} from "lucide-react";

const C = {
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

type GoalStatus = "active" | "risk" | "paused" | "completed" | "planned" | "archived";
type GoalPriority = "high" | "medium" | "low";
type Goal = {
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

type ImportCandidate = {
  fileName: string;
  raw: string;
  preview: GoalsImportPreview;
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
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

const CATEGORY_ICON_KEYS: Record<string, LucideIcon> = {
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

function toViewGoal(goal: StoredGoal, categories: GoalCategory[]): Goal {
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

const STATUS_META: Record<GoalStatus, { label: string; color: string }> = {
  active: { label: "Aktywny", color: C.iceBlueText },
  risk: { label: "Zagrożony", color: C.warning },
  paused: { label: "Wstrzymany", color: C.textSecond },
  completed: { label: "Zakończony", color: C.seaGlass },
  planned: { label: "Zaplanowany", color: C.textSecond },
  archived: { label: "Zarchiwizowany", color: C.textSecond },
};

const FILTER_ITEMS: { id: FilterId; label: string; icon: LucideIcon; color?: string }[] = [
  { id: "all", label: "Wszystkie cele", icon: Target },
  { id: "active", label: "Aktywne", icon: Activity, color: C.iceBlueText },
  { id: "paused", label: "Wstrzymane", icon: CirclePause, color: C.textSecond },
  { id: "completed", label: "Zakończone", icon: CheckCircle2, color: C.seaGlass },
  { id: "planned", label: "Zaplanowane", icon: CircleDashed, color: C.textSecond },
];

function deadlineColor(goal: Goal) {
  if (["paused", "completed", "planned", "archived"].includes(goal.status)) return C.textSecond;
  if (goal.daysLeft.includes("po terminie")) return C.danger;
  const daysRemaining = Number(goal.daysLeft.match(/^(\d+) dni zostało/)?.[1]);
  if (Number.isFinite(daysRemaining) && daysRemaining <= 14) return C.warning;
  if (goal.status === "risk") return C.warning;
  return C.textSecond;
}

const countForFilter = (id: FilterId, goals: Goal[]) => {
  if (id === "all") return goals.filter((goal) => goal.status !== "archived").length;
  if (id === "active") return goals.filter((goal) => goal.status === "active" || goal.status === "risk").length;
  return goals.filter((goal) => goal.status === id).length;
};

function readLayoutPreference(): GoalLayout {
  try {
    return localStorage.getItem("routine.goals.layout") === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function readSortPreference(): GoalSortKey {
  try {
    const saved = localStorage.getItem("routine.goals.sort");
    return saved === "due" || saved === "progress" || saved === "updated" || saved === "name"
      ? saved
      : "priority";
  } catch {
    return "priority";
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <SectionHeader title={children} level={3} variant="label" className="px-1.5" />;
}

function GoalSubSidebar({
  activeFilter,
  onFilter,
  goals,
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onSettings,
}: {
  activeFilter: FilterId;
  onFilter: (id: FilterId) => void;
  goals: Goal[];
  categories: GoalCategory[];
  onCreateCategory: (draft: Omit<GoalCategory, "id">) => void;
  onUpdateCategory: (id: string, patch: Partial<GoalCategory>) => void;
  onDeleteCategory: (id: string) => void;
  onSettings: () => void;
}) {
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const filteredCategories = categories.filter((category) => category.label.toLocaleLowerCase("pl-PL").includes(search.toLocaleLowerCase("pl-PL")));

  const addCategory = () => {
    const label = newCategory.trim();
    if (!label) return;
    onCreateCategory({ label, iconKey: "circle", color: C.textSecond });
    setNewCategory("");
    setAdding(false);
  };

  const saveCategory = (id: string) => {
    const label = editingValue.trim();
    if (label) onUpdateCategory(id, { label });
    setEditingId(null);
    setEditingValue("");
  };

  const item = (id: FilterId, label: string, Icon: LucideIcon, count?: number, color?: string) => {
    const active = activeFilter === id;
    return (
      <ContextNavItem
        key={id}
        active={active}
        onClick={() => onFilter(id)}
        icon={<Icon style={{ color: active ? undefined : color }} />}
        label={label}
        meta={count}
      />
    );
  };

  return (
    <ContextSidebar label="Widoki i kategorie celów">
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SectionLabel>Główne</SectionLabel>
        <div className="mb-6">{item("overview", "Przegląd", BarChart3)}</div>

        <SectionLabel>Cele</SectionLabel>
        <div className="mb-6 space-y-px">
          {FILTER_ITEMS.map((filter) => item(filter.id, filter.label, filter.icon, countForFilter(filter.id, goals), filter.color))}
        </div>

        <div className="mb-2 flex items-center justify-between px-1.5">
          <button
            type="button"
            onClick={() => setCategoriesOpen((open) => !open)}
            className="flex min-w-0 items-center gap-1.5"
            style={{ color: C.textMuted }}
          >
            <ChevronRight size={11} strokeWidth={2} style={{ transform: categoriesOpen ? "rotate(90deg)" : "none", transition: "transform 150ms" }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Kategorie</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Szukaj kategorii"
              title="Szukaj kategorii"
              onClick={() => { setCategoriesOpen(true); setSearchOpen((open) => !open); }}
              className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
              style={{ color: searchOpen ? C.iceBlueText : C.textDisabled }}
            >
              <Search size={12} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Dodaj kategorię"
              title="Dodaj kategorię"
              onClick={() => { setCategoriesOpen(true); setAdding(true); }}
              className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
              style={{ color: adding ? C.iceBlueText : C.textDisabled }}
            >
              <Plus size={13} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {categoriesOpen && (
          <div className="space-y-1">
            {searchOpen && (
              <div className="px-1 pb-1">
                <div className="flex items-center gap-2 rounded-lg border px-2.5 py-2" style={{ background: C.inputBg, borderColor: C.borderSubtle }}>
                  <Search size={11} strokeWidth={1.7} style={{ color: C.textMuted }} />
                  <input
                    autoFocus
                    aria-label="Szukaj kategorii"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Szukaj kategorii"
                    className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                    style={{ color: C.textSecond }}
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Wyczyść wyszukiwanie kategorii"
                      onClick={() => setSearch("")}
                      style={{ color: C.textDisabled }}
                    >
                      <X size={10} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {adding && (
              <form
                onSubmit={(event) => { event.preventDefault(); addCategory(); }}
                className="mx-1 flex items-center gap-1.5 rounded-lg border px-2 py-1.5"
                style={{ background: C.inputBg, borderColor: C.blueBorder }}
              >
                <Circle size={11} style={{ color: C.textSecond }} />
                <input
                  autoFocus
                  aria-label="Nazwa nowej kategorii"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Escape") setAdding(false); }}
                  placeholder="Nowa kategoria"
                  className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                  style={{ color: C.textPrimary }}
                />
                <button type="submit" aria-label="Zapisz kategorię" style={{ color: C.seaGlass }}><Check size={11} strokeWidth={2.2} /></button>
                <button type="button" aria-label="Anuluj" onClick={() => setAdding(false)} style={{ color: C.textMuted }}><X size={11} /></button>
              </form>
            )}

            {filteredCategories.map((category) => {
              const Icon = CATEGORY_ICON_KEYS[category.iconKey] ?? Circle;
              const active = activeFilter === `category:${category.id}`;
              return (
                <div key={category.id} className="group flex min-h-8 items-center rounded-lg">
                  {editingId === category.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); saveCategory(category.id); }} className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5">
                      <Icon size={12} strokeWidth={1.7} style={{ color: C.textSecond }} />
                      <input
                        autoFocus
                        aria-label={`Nazwa kategorii ${category.label}`}
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onBlur={() => saveCategory(category.id)}
                        onKeyDown={(event) => { if (event.key === "Escape") setEditingId(null); }}
                        className="min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-[11px] outline-none"
                        style={{ color: C.textPrimary, borderColor: C.iceBlue }}
                      />
                    </form>
                  ) : (
                    <ContextNavItem
                      onClick={() => onFilter(`category:${category.id}`)}
                      className="min-w-0 flex-1"
                      active={active}
                      icon={<Icon style={{ color: active ? undefined : C.textSecond }} />}
                      label={category.label}
                    />
                  )}
                  {editingId !== category.id && (
                    <div className="flex flex-shrink-0 items-center pr-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        aria-label={`Edytuj kategorię ${category.label}`}
                        title="Edytuj"
                        onClick={() => { setEditingId(category.id); setEditingValue(category.label); }}
                        className="flex h-6 w-6 items-center justify-center rounded-md"
                        style={{ color: C.textMuted }}
                      >
                        <Pencil size={11} strokeWidth={1.7} />
                      </button>
                      {category.id !== "personal" && <button
                          type="button"
                          aria-label={`Usuń kategorię ${category.label}`}
                          title="Usuń"
                          onClick={() => onDeleteCategory(category.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-md"
                          style={{ color: C.danger }}
                        >
                          <Trash2 size={11} strokeWidth={1.7} />
                        </button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t px-2.5 pb-4 pt-4" style={{ borderColor: C.borderSubtle, background: C.subSidebar }}>
        <SectionLabel>Zarządzanie</SectionLabel>
        <div className="space-y-px">
          <ContextNavItem onClick={() => setCategoriesOpen(true)} icon={<FolderCog />} label="Kategorie" />
          <ContextNavItem active={activeFilter === "archived"} onClick={() => onFilter("archived")} icon={<Archive />} label="Archiwum" />
          <ContextNavItem onClick={onSettings} icon={<Settings2 />} label="Ustawienia" />
        </div>
      </div>
    </ContextSidebar>
  );
}

function StatusPill({ status }: { status: GoalStatus }) {
  const meta = STATUS_META[status];
  const tone = status === "completed" ? "success" : status === "risk" ? "warning" : status === "active" ? "primary" : "neutral";
  return (
    <Badge tone={tone} className="h-7 rounded-lg">
      {meta.label}
      <ChevronDown size={10} strokeWidth={1.7} />
    </Badge>
  );
}

function GoalCard({
  goal,
  selected,
  grid,
  onSelect,
  onEdit,
  onProgress,
  onDuplicate,
  onDelete,
  onOpen,
  onStatus,
}: {
  goal: Goal;
  selected: boolean;
  grid: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onProgress: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onStatus: (status: GoalStatus) => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const statusTriggerRef = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const statusMenuId = useId();
  const actionsMenuId = useId();
  const Icon = goal.icon;
  const CategoryIcon = CATEGORY_ICONS[goal.category] ?? Circle;
  const statusColor = STATUS_META[goal.status].color;
  const dueColor = deadlineColor(goal);

  return (
    <article
      className={`goal-card group rounded-xl border transition-all duration-150 ${grid ? "goal-card-grid" : ""} ${selected ? "is-selected" : ""}`}
      data-status={goal.status}
      style={{
        background: selected ? C.iceBlueBg : C.card,
        borderColor: selected ? C.iceBlue : C.borderSubtle,
        boxShadow: "none",
      }}
    >
      <div className="goal-card-layout grid items-start gap-x-4 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`${selected ? "Ukryj" : "Pokaż"} szczegóły celu ${goal.title}`}
          className="goal-card-primary flex min-w-0 items-center gap-3 border-0 bg-transparent p-0 text-left"
        >
          <div
            className="goal-card-icon flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border"
            style={{ color: goal.color, background: `${goal.color}18`, borderColor: `${goal.color}55` }}
          >
            {goal.customIcon
              ? <img src={goal.customIcon} alt="" className="h-5 w-5 object-contain" />
              : <Icon size={17} strokeWidth={1.6} aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex flex-1 flex-col">
            <h3 className="goal-card-title ui-record-title truncate" style={{ color: C.textPrimary }}>
              {goal.title}
            </h3>
            <div className="goal-card-meta ui-record-meta order-2 mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1" style={{ color: C.textMuted }}>
              <span className="flex items-center gap-1 font-medium" style={{ color: C.textSecond }}>
                <CategoryIcon size={13} strokeWidth={1.7} aria-hidden="true" /> {goal.category}
              </span>
              <span>•</span>
              <span>{goal.progressLabel}</span>
            </div>
            <div className="order-1 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div
                className="goal-card-inline-date inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[10px]"
                style={{ color: dueColor, borderColor: dueColor === C.textSecond ? C.borderStrong : `${dueColor}35`, background: C.inputBg }}
              >
                <CalendarDays size={12} strokeWidth={1.7} aria-hidden="true" />
                <span className="font-medium" style={{ color: dueColor === C.textSecond ? C.textPrimary : dueColor }}>{goal.due}</span>
                <span style={{ color: C.textMuted }}>· {goal.daysLeft}</span>
              </div>
              <div className="flex min-w-[150px] flex-1 items-center gap-3">
                <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: C.borderStrong }}>
                  <div
                    className="goal-card-progress-fill h-full rounded-full transition-all duration-500"
                    style={{ width: `${goal.progress}%`, background: goal.color }}
                  />
                </div>
                <span className="goal-card-progress-value w-9 text-right text-[11px] font-semibold tabular-nums" style={{ color: C.textPrimary, fontFamily: "'DM Mono', monospace" }}>
                  {goal.progress}%
                </span>
              </div>
            </div>
          </div>
        </button>

        <div className="goal-card-actions">
          <div className="goal-card-status relative">
            <button
              ref={statusTriggerRef}
              type="button"
              aria-label={`Zmień status celu ${goal.title}. Aktualny status: ${STATUS_META[goal.status].label}`}
              aria-haspopup="menu"
              aria-expanded={statusOpen}
              aria-controls={statusMenuId}
              onClick={() => { setStatusOpen((open) => !open); setMenuOpen(false); }}
            >
              <StatusPill status={goal.status} />
            </button>
            {statusOpen && (
              <Menu
                id={statusMenuId}
                triggerRef={statusTriggerRef}
                onDismiss={() => setStatusOpen(false)}
                className="absolute right-0 top-9 z-30 w-40"
              >
                {(["active", "paused", "completed", "planned", "archived"] as GoalStatus[]).map((status) => (
                  <MenuItem key={status} selected={goal.status === status} onClick={() => { onStatus(status); setStatusOpen(false); }} leadingIcon={<span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_META[status].color }} />} style={{ color: STATUS_META[status].color }}>
                    {STATUS_META[status].label}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </div>

          <div className="goal-card-date flex items-center gap-2 text-[10px] font-medium" style={{ color: dueColor }}>
            <CalendarDays size={13} strokeWidth={1.7} aria-hidden="true" />
            <span>{goal.due}</span>
          </div>

          <div className="goal-card-more relative">
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => { setMenuOpen((open) => !open); setStatusOpen(false); }}
              aria-label={`Więcej opcji dla celu ${goal.title}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={actionsMenuId}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg transition-colors"
              style={{ color: C.textMuted }}
            >
              <Ellipsis size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {menuOpen && (
              <Menu
                id={actionsMenuId}
                triggerRef={menuTriggerRef}
                onDismiss={() => setMenuOpen(false)}
                className="absolute right-0 top-9 z-30 w-44"
              >
                {[
                  { label: "Dodaj postęp", icon: BarChart3, action: onProgress },
                  { label: "Edytuj cel", icon: Pencil, action: onEdit },
                  { label: "Otwórz pełny widok", icon: Target, action: onOpen },
                  { label: "Duplikuj", icon: Plus, action: onDuplicate },
                  { label: goal.status === "archived" ? "Przywróć" : "Archiwizuj", icon: Archive, action: () => onStatus(goal.status === "archived" ? "active" : "archived") },
                  { label: "Usuń", icon: Trash2, action: onDelete, danger: true },
                ].map(({ label, icon: MenuIcon, action, danger }) => (
                  <MenuItem key={label} onClick={() => { action(); setMenuOpen(false); }} tone={danger ? "danger" : "default"} leadingIcon={<MenuIcon />}>
                    {label}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </div>
        </div>
      </div>
      <div className="pointer-events-none h-px opacity-0 transition-opacity group-hover:opacity-100" style={{ background: `linear-gradient(90deg, transparent, ${statusColor}40, transparent)` }} />
    </article>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.textMuted }}>{title}</h3>
      {children}
    </section>
  );
}

function DetailRow({ icon: Icon, label, children, onClick }: { icon: LucideIcon; label: string; children: React.ReactNode; onClick?: () => void }) {
  const content = (
    <>
      <Icon size={13} strokeWidth={1.6} aria-hidden="true" style={{ color: C.textMuted }} />
      <span className="flex-1 text-[11px]" style={{ color: C.textMuted }}>{label}</span>
      <div className="flex items-center gap-1.5 text-right text-[11px]" style={{ color: C.textSecond }}>{children}</div>
      {onClick && <ChevronRight size={11} strokeWidth={1.7} aria-hidden="true" style={{ color: C.textDisabled }} />}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-10 w-full items-center gap-2.5 border-b py-3 text-left last:border-b-0"
        style={{ borderColor: C.borderSubtle }}
      >
        {content}
      </button>
    );
  }
  return (
    <div className="flex min-h-10 w-full items-center gap-2.5 border-b py-3 text-left last:border-b-0" style={{ borderColor: C.borderSubtle }}>
      {content}
    </div>
  );
}

function GoalDetail({
  goal,
  rawGoal,
  note,
  onNoteChange,
  onClose,
  onEdit,
  onProgress,
  onStatus,
  onAddMilestone,
  onToggleMilestone,
  onOpen,
}: {
  goal: Goal;
  rawGoal: StoredGoal;
  note: string;
  onNoteChange: (value: string) => void;
  onClose: () => void;
  onEdit: () => void;
  onProgress: () => void;
  onStatus: (status: StoredGoalStatus) => void;
  onAddMilestone: () => void;
  onToggleMilestone: (id: string, done: boolean) => void;
  onOpen: () => void;
}) {
  const Icon = goal.icon;
  const CategoryIcon = CATEGORY_ICONS[goal.category] ?? Circle;
  const status = STATUS_META[goal.status];
  const priority = goal.priority === "high" ? { label: "Wysoki", color: C.textSecond } : goal.priority === "medium" ? { label: "Średni", color: C.textSecond } : { label: "Niski", color: C.textSecond };
  const dueColor = deadlineColor(goal);
  const measurementLabel = rawGoal.progressMode === "milestones"
    ? "Kamienie milowe"
    : rawGoal.progressMode === "regularity"
      ? rawGoal.regularityMode === "frequency" ? "Wykonania" : "Dni serii"
      : rawGoal.progressMode === "manual" ? "Postęp" : "Wartość";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={onClose} aria-label="Zamknij szczegóły celu" className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: C.textSecond }}>
            <X size={18} strokeWidth={1.7} />
          </button>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border" style={{ color: goal.color, background: `${goal.color}18`, borderColor: `${goal.color}55` }}>
            {goal.customIcon ? <img src={goal.customIcon} alt="" className="h-6 w-6 object-contain" /> : <Icon size={19} strokeWidth={1.55} />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold leading-5" style={{ color: C.textPrimary }}>{goal.title}</h2>
            <p className="mt-1.5 flex items-center gap-1 text-[10px]" style={{ color: C.textSecond }}>
              <CategoryIcon size={10} /> {goal.category}
              <span style={{ color: C.textDisabled }}>•</span>
              <span style={{ color: C.textMuted }}>{goal.rhythm}</span>
            </p>
          </div>
          <div className="w-[106px]"><ThemedSelect compact value={rawGoal.status} onChange={(value) => onStatus(value as StoredGoalStatus)} options={[{ value: "planned", label: "Zaplanowany" }, { value: "active", label: "Aktywny" }, { value: "paused", label: "Wstrzymany" }, { value: "completed", label: "Zakończony" }, { value: "archived", label: "Archiwum" }]} ariaLabel="Status celu" /></div>
        </div>

        <div className="my-5 border-y py-4" style={{ borderColor: C.borderSubtle }}>
          <div className="mb-3 flex items-end justify-between">
            <span className="text-[22px] font-semibold" style={{ color: C.textPrimary, fontFamily: "'DM Mono', monospace" }}>{goal.progress}%</span>
            <span className="text-[10px]" style={{ color: C.textMuted }}>{goal.progressLabel}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: C.borderStrong }}>
            <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, background: goal.color }} />
          </div>
          <button type="button" onClick={onProgress} className="mt-3 flex items-center gap-1.5 text-[10px] font-medium" style={{ color: C.iceBlueText }}><Plus size={11} />{rawGoal.progressMode === "milestones" ? "Dodaj kamień milowy" : "Dodaj aktualizację postępu"}</button>
        </div>

        <div className="mb-5">
          <DetailRow icon={CalendarDays} label="Termin" onClick={onEdit}>
            <span style={{ color: dueColor === C.textSecond ? C.textPrimary : dueColor }}>{goal.due}</span>
          </DetailRow>
          <DetailRow icon={Flag} label="Priorytet" onClick={onEdit}>
            <Flag size={10} fill={`${priority.color}38`} style={{ color: priority.color }} />
            <span style={{ color: priority.color }}>{priority.label}</span>
          </DetailRow>
          <DetailRow icon={Target} label="Kategoria" onClick={onEdit}>
            <span style={{ color: C.textSecond }}>{goal.category}</span>
          </DetailRow>
          <DetailRow icon={BarChart3} label={measurementLabel} onClick={onProgress}>
            <span style={{ color: C.iceBlueText }}>{goal.progress}%</span>
          </DetailRow>
        </div>

        {rawGoal.progressMode === "milestones" && <>
          <PanelSection title="Najbliższy kamień milowy">
            <button type="button" onClick={() => {
              const next = [...rawGoal.milestones].filter((item) => !item.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
              if (next) onToggleMilestone(next.id, true); else onAddMilestone();
            }} className="w-full rounded-xl border p-3 text-left" style={{ background: C.panel, borderColor: C.borderSubtle }}>
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full border" style={{ borderColor: C.textMuted }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-medium leading-4" style={{ color: C.textPrimary }}>{goal.nextMilestone.title}</p>
                    <span className="text-[11px]" style={{ color: C.iceBlueText, fontFamily: "'DM Mono', monospace" }}>{goal.nextMilestone.progress}%</span>
                  </div>
                  <p className="mt-1 text-[9px]" style={{ color: C.textMuted }}>Plan: {goal.nextMilestone.date} · {goal.nextMilestone.daysLeft}</p>
                </div>
              </div>
            </button>
          </PanelSection>
          <div className="my-5 border-t" style={{ borderColor: C.borderSubtle }} />
        </>}

        <PanelSection title="Statystyki">
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: `${goal.current} / ${goal.total}`, label: measurementLabel, color: C.textPrimary },
              { value: `${goal.progress}%`, label: "Ogólny postęp", color: C.iceBlueText },
              { value: goal.status === "risk" ? "Uwaga" : "Na planie", label: "Status planu", color: status.color },
              { value: goal.priority === "high" ? "Wysoki" : goal.priority === "medium" ? "Średni" : "Niski", label: "Priorytet", color: priority.color },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border p-2.5" style={{ background: C.panel, borderColor: C.borderSubtle }}>
                <p className="text-[13px] font-medium" style={{ color: stat.color, fontFamily: "'DM Mono', monospace" }}>{stat.value}</p>
                <p className="mt-1 text-[9px]" style={{ color: C.textMuted }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </PanelSection>

        <div className="mt-5">
          <PanelSection title="Notatka">
            <GoalNoteTextarea
              key={goal.id}
              aria-label="Notatka do celu"
              value={note}
              onCommit={onNoteChange}
              rows={3}
              className="w-full resize-none rounded-xl border p-3.5 text-[11px] leading-5 outline-none"
              style={{ color: C.textSecond, background: C.inputBg, borderColor: C.borderSubtle }}
            />
          </PanelSection>
        </div>
      </div>

      <div className="border-t p-4" style={{ borderColor: C.borderSubtle, background: C.subSidebar }}>
        <Button type="button" variant="quiet" fullWidth onClick={onOpen}>
          Otwórz pełny widok celu
        </Button>
      </div>
    </div>
  );
}

export default function Cele() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    goals: storedGoals,
    categories,
    storageFailed,
    loadStatus,
    createGoal,
    updateGoal,
    deleteGoal,
    restoreGoal,
    duplicateGoal,
    addProgress,
    addMilestone,
    updateMilestone,
    createCategory,
    updateCategory,
    deleteCategory,
    exportStore,
    inspectImport,
    importStore,
  } = useGoalsStore();
  const importInputRef = useRef<HTMLInputElement>(null);
  const headerMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const sortMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const headerMenuId = useId();
  const sortMenuId = useId();
  const viewDefaults = useMemo(() => ({
    layout: readLayoutPreference(),
    sort: readSortPreference(),
  }), []);
  const categoryIds = useMemo(() => new Set(categories.map((category) => category.id)), [categories]);
  const viewState = useMemo(
    () => readGoalViewState(searchParams, categoryIds, viewDefaults),
    [categoryIds, searchParams, viewDefaults],
  );
  const activeFilter = viewState.filter;
  const layout = viewState.layout;
  const sortKey = viewState.sort;
  const selectedId = viewState.selectedId && storedGoals.some((goal) => goal.id === viewState.selectedId)
    ? viewState.selectedId
    : null;
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalFormId, setGoalFormId] = useState<"new" | string | null>(null);
  const [progressGoalId, setProgressGoalId] = useState<string | null>(null);
  const [milestoneGoalId, setMilestoneGoalId] = useState<string | null>(null);
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [deletedGoal, setDeletedGoal] = useState<StoredGoal | null>(null);
  const [importCandidate, setImportCandidate] = useState<ImportCandidate | null>(null);
  const [importNotice, setImportNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const goals = useMemo(() => storedGoals.map((goal) => toViewGoal(goal, categories)), [storedGoals, categories]);

  const updateGoalViewState = (patch: Partial<GoalViewState>) => {
    setSearchParams(writeGoalViewState(searchParams, { ...viewState, ...patch }));
  };
  const setSelectedGoalId = (goalId: string | null) => updateGoalViewState({ selectedId: goalId });
  const setGoalLayout = (nextLayout: GoalLayout) => updateGoalViewState({ layout: nextLayout });
  const setGoalSort = (nextSort: GoalSortKey) => updateGoalViewState({ sort: nextSort });

  useEffect(() => {
    const canonical = writeGoalViewState(searchParams, { ...viewState, selectedId });
    if (canonical.toString() !== searchParams.toString()) {
      setSearchParams(canonical, { replace: true });
    }
  }, [searchParams, selectedId, setSearchParams, viewState]);

  useEffect(() => { try { localStorage.setItem("routine.goals.layout", layout); } catch { /* preference persistence is best-effort */ } }, [layout]);
  useEffect(() => { try { localStorage.setItem("routine.goals.sort", sortKey); } catch { /* preference persistence is best-effort */ } }, [sortKey]);

  const visibleGoals = useMemo(() => {
    let result: Goal[];
    if (activeFilter === "overview" || activeFilter === "active") {
      result = goals.filter((goal) => goal.status === "active" || goal.status === "risk");
    } else if (activeFilter === "all") result = goals.filter((goal) => goal.status !== "archived");
    else if (activeFilter === "ontrack") result = goals.filter((goal) => goal.status === "active");
    else if (activeFilter.startsWith("category:")) result = goals.filter((goal) => goal.categoryId === activeFilter.slice("category:".length) && goal.status !== "archived");
    else result = goals.filter((goal) => goal.status === activeFilter);

    const priorityOrder: Record<GoalPriority, number> = { high: 0, medium: 1, low: 2 };
    return [...result].sort((a, b) => {
      const rawA = storedGoals.find((goal) => goal.id === String(a.id));
      const rawB = storedGoals.find((goal) => goal.id === String(b.id));
      if (sortKey === "name") return a.title.localeCompare(b.title, "pl");
      if (sortKey === "progress") return b.progress - a.progress;
      if (sortKey === "due") return (rawA?.dueDate ?? "").localeCompare(rawB?.dueDate ?? "");
      if (sortKey === "updated") return (rawB?.updatedAt ?? "").localeCompare(rawA?.updatedAt ?? "");
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [activeFilter, goals, sortKey, storedGoals]);

  const selectedGoal = goals.find((goal) => goal.id === selectedId) ?? null;
  const priorityGoals = visibleGoals.filter((goal) => goal.priority === "high" || goal.status === "risk");
  const remainingGoals = visibleGoals.filter((goal) => !priorityGoals.includes(goal));

  const handleFilter = (filter: FilterId) => {
    updateGoalViewState({ filter, selectedId: null });
  };

  const openProgressFor = (goalId: string) => {
    const goal = storedGoals.find((item) => item.id === goalId);
    if (goal?.progressMode === "milestones") setMilestoneGoalId(goalId);
    else setProgressGoalId(goalId);
  };

  const changeStatus = (goalId: string, status: GoalStatus) => {
    if (status === "risk") updateGoal(goalId, { status: "active", health: "risk" });
    else updateGoal(goalId, { status: status as StoredGoalStatus, ...(status === "active" ? { health: "ontrack" as const } : {}) });
  };

  const submitGoal = (data: GoalEditorData) => {
    if (goalFormId === "new") {
      const draft: GoalDraft = { ...data, initialValue: 0, milestones: [], progressEntries: [] };
      const id = createGoal(draft);
      setSelectedGoalId(id);
    } else if (goalFormId) updateGoal(goalFormId, data);
    setGoalFormId(null);
  };

  const downloadJson = (raw: string, fileName: string) => {
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const exportGoals = () => {
    downloadJson(exportStore(), `routine-cele-${todayLocalDateKey()}.json`);
    setHeaderMenuOpen(false);
  };

  const inspectImportFile = async (file: File) => {
    setHeaderMenuOpen(false);
    setImportNotice(null);
    if (file.size > 10_000_000) {
      setImportNotice({ tone: "danger", message: "Plik jest zbyt duży. Maksymalny rozmiar importu to 10 MB." });
      return;
    }
    try {
      const raw = await file.text();
      const inspection = inspectImport(raw);
      if (!inspection.ok) {
        setImportNotice({ tone: "danger", message: inspection.error });
        return;
      }
      setImportCandidate({ fileName: file.name, raw, preview: inspection.preview });
    } catch {
      setImportNotice({ tone: "danger", message: "Nie udało się odczytać wybranego pliku." });
    }
  };

  const confirmImport = () => {
    if (!importCandidate) return;
    downloadJson(
      exportStore(),
      `routine-cele-kopia-przed-importem-${todayLocalDateKey()}.json`,
    );
    const result = importStore(importCandidate.raw);
    if (!result.ok) {
      setImportNotice({ tone: "danger", message: result.error });
      return;
    }
    setImportCandidate(null);
    setSelectedGoalId(null);
    setImportNotice({
      tone: "success",
      message: `Zaimportowano ${importCandidate.preview.goalCount} celów. Poprzedni stan został pobrany jako kopia zapasowa.`,
    });
  };

  const filterLabel = activeFilter === "overview" || activeFilter === "active"
    ? "Aktywne cele"
    : activeFilter === "all"
      ? "Wszystkie cele"
      : activeFilter === "ontrack"
        ? "Na dobrej drodze"
        : activeFilter === "risk"
          ? "Zagrożone"
      : activeFilter === "archived"
        ? "Archiwum"
        : activeFilter.startsWith("category:")
          ? categories.find((category) => category.id === activeFilter.slice("category:".length))?.label ?? "Kategoria"
          : FILTER_ITEMS.find((item) => item.id === activeFilter)?.label ?? "Cele";

  return (
    <ModuleShell>
      <GoalSubSidebar
        activeFilter={activeFilter}
        onFilter={handleFilter}
        goals={goals}
        categories={categories}
        onCreateCategory={createCategory}
        onUpdateCategory={updateCategory}
        onDeleteCategory={setDeleteCategoryId}
        onSettings={() => setSettingsOpen(true)}
      />

      <ModuleMain>
        <PageHeader
          title="Cele"
          description="Przegląd Twoich celów i postępów"
          leading={<Target size={18} strokeWidth={1.5} />}
          meta={storageFailed
            ? <Badge tone="danger">Brak zapisu lokalnego</Badge>
            : loadStatus === "corrupt"
              ? <Badge tone="danger">Oryginał danych zabezpieczony</Badge>
              : importNotice
                ? <Badge tone={importNotice.tone}>{importNotice.tone === "success" ? "Import zakończony" : "Błąd importu"}</Badge>
                : undefined}
          actions={<>
            <Button className="ui-button--icon-mobile" variant="primary" onClick={() => setGoalFormId("new")} leadingIcon={<Plus size={15} strokeWidth={2} />}><span className="header-action-label">Nowy cel</span></Button>
            <div className="relative">
              <Button
                ref={headerMenuTriggerRef}
                variant="quiet"
                iconOnly
                onClick={() => setHeaderMenuOpen((open) => !open)}
                aria-label="Więcej opcji"
                aria-haspopup="menu"
                aria-expanded={headerMenuOpen}
                aria-controls={headerMenuId}
              >
                <Ellipsis size={17} />
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label="Wybierz plik danych celów do importu"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void inspectImportFile(file);
                  event.currentTarget.value = "";
                }}
              />
              {headerMenuOpen && <Menu id={headerMenuId} triggerRef={headerMenuTriggerRef} onDismiss={() => setHeaderMenuOpen(false)} className="absolute right-0 top-12 z-40 w-48">
                <MenuItem onClick={() => importInputRef.current?.click()} leadingIcon={<Archive />}>Importuj dane</MenuItem>
                <MenuItem onClick={exportGoals} leadingIcon={<NotebookPen />}>Eksportuj dane</MenuItem>
                <MenuItem onClick={() => { handleFilter("archived"); setHeaderMenuOpen(false); }} leadingIcon={<Archive />}>Otwórz archiwum</MenuItem>
              </Menu>}
            </div>
          </>}
        />
        {importNotice && (
          <div
            role={importNotice.tone === "danger" ? "alert" : "status"}
            aria-live={importNotice.tone === "danger" ? "assertive" : "polite"}
            className="flex items-center gap-3 border-b px-7 py-2.5 text-[11px]"
            style={{
              color: importNotice.tone === "danger" ? C.danger : C.seaGlass,
              borderColor: C.borderSubtle,
              background: C.panel,
            }}
          >
            <span className="min-w-0 flex-1">{importNotice.message}</span>
            <button
              type="button"
              aria-label="Zamknij komunikat importu"
              onClick={() => setImportNotice(null)}
              className="p-1"
              style={{ color: C.textMuted }}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        )}

        <WorkspaceToolbar>
          <div className="flex min-w-0 items-center gap-2">
            <Select
              aria-label="Widok celów"
              fieldClassName="context-mobile-select"
              compact
              value={activeFilter}
              options={[
                { value: "overview", label: "Przegląd" },
                ...FILTER_ITEMS.map((item) => ({ value: item.id, label: item.label })),
                ...categories.map((category) => ({ value: `category:${category.id}`, label: category.label })),
                { value: "archived", label: "Archiwum" },
              ]}
              onChange={(event) => handleFilter(event.target.value as FilterId)}
            />
            <span className="workspace-context-label">{filterLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative goals-sort">
              <Button ref={sortMenuTriggerRef} variant="quiet" size="sm" onClick={() => setSortMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={sortMenuOpen} aria-controls={sortMenuId} trailingIcon={<ChevronDown size={11} />}>
                Sortuj: <span className="goals-sort-label">{({ priority: "Priorytet", due: "Termin", progress: "Postęp", updated: "Ostatnia zmiana", name: "Nazwa" } as const)[sortKey]}</span>
              </Button>
              {sortMenuOpen && <Menu id={sortMenuId} triggerRef={sortMenuTriggerRef} onDismiss={() => setSortMenuOpen(false)} initialFocus="selected" className="absolute right-0 top-11 z-40 w-44">{([{ id: "priority", label: "Priorytet" }, { id: "due", label: "Termin" }, { id: "progress", label: "Postęp" }, { id: "updated", label: "Ostatnia zmiana" }, { id: "name", label: "Nazwa" }] as const).map((option) => <MenuItem key={option.id} selected={sortKey === option.id} onClick={() => { setGoalSort(option.id); setSortMenuOpen(false); }} trailingIcon={sortKey === option.id ? <Check size={11} /> : undefined}>{option.label}</MenuItem>)}</Menu>}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" iconOnly onClick={() => setGoalLayout("list")} aria-label="Widok listy" aria-pressed={layout === "list"} style={{ color: layout === "list" ? C.iceBlueText : C.textMuted, background: layout === "list" ? C.iceBlueBg : "transparent" }}>
                <List size={15} strokeWidth={1.8} />
              </Button>
              <Button variant="ghost" size="sm" iconOnly onClick={() => setGoalLayout("grid")} aria-label="Widok kafelków" aria-pressed={layout === "grid"} style={{ color: layout === "grid" ? C.iceBlueText : C.textMuted, background: layout === "grid" ? C.iceBlueBg : "transparent" }}>
                <Grid2X2 size={14} strokeWidth={1.8} />
              </Button>
            </div>
          </div>
        </WorkspaceToolbar>

        <div className="goals-content flex-1 overflow-y-auto px-7 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleGoals.length === 0 ? (
            <EmptyState className="h-full" icon={<Target size={20} strokeWidth={1.4} />} title="Brak celów w tym widoku" description="Zmień filtr albo utwórz nowy cel." action={<Button variant="primary" size="sm" onClick={() => setGoalFormId("new")} leadingIcon={<Plus size={12} />}>Nowy cel</Button>} />
          ) : (
            <div className="w-full">
              {priorityGoals.length > 0 && (
                <section className="mb-5">
                  <SectionHeader title="Priorytetowe" level={2} variant="label" />
                  <div className={layout === "grid" ? "goals-card-grid grid grid-cols-2 gap-3" : "space-y-3"}>
                    {priorityGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        selected={selectedId === goal.id}
                        grid={layout === "grid"}
                        onSelect={() => setSelectedGoalId(selectedId === goal.id ? null : String(goal.id))}
                        onEdit={() => setGoalFormId(String(goal.id))}
                        onProgress={() => openProgressFor(String(goal.id))}
                        onDuplicate={() => duplicateGoal(String(goal.id))}
                        onDelete={() => setDeleteGoalId(String(goal.id))}
                        onOpen={() => navigate(`/cele/${goal.id}`)}
                        onStatus={(status) => changeStatus(String(goal.id), status)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {remainingGoals.length > 0 && (
                <section>
                  <SectionHeader title={priorityGoals.length > 0 ? "Pozostałe cele" : filterLabel} level={2} variant="label" />
                  <div className={layout === "grid" ? "goals-card-grid grid grid-cols-2 gap-3" : "space-y-3"}>
                    {remainingGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        selected={selectedId === goal.id}
                        grid={layout === "grid"}
                        onSelect={() => setSelectedGoalId(selectedId === goal.id ? null : String(goal.id))}
                        onEdit={() => setGoalFormId(String(goal.id))}
                        onProgress={() => openProgressFor(String(goal.id))}
                        onDuplicate={() => duplicateGoal(String(goal.id))}
                        onDelete={() => setDeleteGoalId(String(goal.id))}
                        onOpen={() => navigate(`/cele/${goal.id}`)}
                        onStatus={(status) => changeStatus(String(goal.id), status)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </ModuleMain>

      {selectedGoal && (
        <DetailPanel label="Szczegóły celu" onDismiss={() => setSelectedGoalId(null)}>
          <GoalDetail
            goal={selectedGoal}
            rawGoal={storedGoals.find((goal) => goal.id === String(selectedGoal.id))!}
            note={selectedGoal.note}
            onNoteChange={(value) => updateGoal(String(selectedGoal.id), { note: value }, { persistence: "immediate" })}
            onClose={() => setSelectedGoalId(null)}
            onEdit={() => setGoalFormId(String(selectedGoal.id))}
            onProgress={() => openProgressFor(String(selectedGoal.id))}
            onStatus={(status) => updateGoal(String(selectedGoal.id), { status, ...(status === "active" ? { health: "ontrack" as const } : {}) })}
            onAddMilestone={() => setMilestoneGoalId(String(selectedGoal.id))}
            onToggleMilestone={(id, done) => updateMilestone(String(selectedGoal.id), id, { done })}
            onOpen={() => navigate(`/cele/${selectedGoal.id}`)}
          />
        </DetailPanel>
      )}

      {goalFormId && (
        <GoalFormDialog
          goal={goalFormId === "new" ? null : storedGoals.find((goal) => goal.id === goalFormId)}
          categories={categories}
          onClose={() => setGoalFormId(null)}
          onSubmit={submitGoal}
        />
      )}

      {progressGoalId && storedGoals.find((goal) => goal.id === progressGoalId) && (
        <ProgressDialog
          goal={storedGoals.find((goal) => goal.id === progressGoalId)!}
          onClose={() => setProgressGoalId(null)}
          onSubmit={(draft) => {
            const goal = storedGoals.find((item) => item.id === progressGoalId)!;
            addProgress(progressGoalId, { ...draft, value: goal.progressMode === "manual" ? Math.max(0, Math.min(100, draft.value)) : draft.value });
            setProgressGoalId(null);
          }}
        />
      )}

      {milestoneGoalId && (
        <MilestoneDialog
          onClose={() => setMilestoneGoalId(null)}
          onSubmit={(draft) => { addMilestone(milestoneGoalId, draft); setMilestoneGoalId(null); }}
        />
      )}

      {deleteGoalId && storedGoals.find((goal) => goal.id === deleteGoalId) && (
        <ConfirmDialog
          title="Usunąć cel?"
          message={`Cel „${storedGoals.find((goal) => goal.id === deleteGoalId)?.title}” wraz z historią postępów i kamieniami milowymi zostanie usunięty.`}
          onClose={() => setDeleteGoalId(null)}
          onConfirm={() => {
            const deleted = deleteGoal(deleteGoalId);
            setDeletedGoal(deleted);
            if (selectedId === deleteGoalId) setSelectedGoalId(null);
            setDeleteGoalId(null);
          }}
        />
      )}

      {deleteCategoryId && categories.find((category) => category.id === deleteCategoryId) && (
        <ConfirmDialog
          title="Usunąć kategorię?"
          message={`Kategoria „${categories.find((category) => category.id === deleteCategoryId)?.label}” zostanie usunięta. Przypisane cele zostaną przeniesione do kategorii „Sprawy osobiste”.`}
          onClose={() => setDeleteCategoryId(null)}
          onConfirm={() => { if (activeFilter === `category:${deleteCategoryId}`) handleFilter("overview"); deleteCategory(deleteCategoryId); setDeleteCategoryId(null); }}
        />
      )}

      {deletedGoal && (
        <div className="fixed bottom-5 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-4 rounded-xl border px-4 py-3 shadow-2xl" style={{ background: C.subSidebar, borderColor: C.borderStrong }}>
          <span className="text-[11px]" style={{ color: C.textSecond }}>Cel został usunięty</span>
          <button type="button" onClick={() => { restoreGoal(deletedGoal); setDeletedGoal(null); }} className="text-[11px] font-semibold" style={{ color: C.iceBlueText }}>Cofnij</button>
          <button type="button" onClick={() => setDeletedGoal(null)} aria-label="Zamknij" style={{ color: C.textMuted }}><X size={13} /></button>
        </div>
      )}

      {importCandidate && (
        <Modal
          title="Sprawdź import celów"
          description={`Plik: ${importCandidate.fileName}`}
          onClose={() => setImportCandidate(null)}
          width={520}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setImportCandidate(null)}>Anuluj</Button>
              <Button variant="primary" onClick={confirmImport}>Pobierz kopię i importuj</Button>
            </>
          )}
        >
          <div className="space-y-4">
            <p className="text-[12px] leading-5" style={{ color: C.textSecond }}>
              Import zastąpi obecne cele i kategorie. Tuż przed zmianą przeglądarka pobierze pełną kopię aktualnych danych celów.
            </p>
            <dl className="grid grid-cols-2 gap-2">
              {[
                ["Cele", importCandidate.preview.goalCount],
                ["Aktywne cele", importCandidate.preview.activeCount],
                ["Kategorie", importCandidate.preview.categoryCount],
                ["Kamienie milowe", importCandidate.preview.milestoneCount],
                ["Wpisy postępu", importCandidate.preview.progressCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3" style={{ background: C.inputBg, borderColor: C.borderSubtle }}>
                  <dt className="text-[10px]" style={{ color: C.textMuted }}>{label}</dt>
                  <dd className="mt-1 text-[16px] font-semibold tabular-nums" style={{ color: C.textPrimary }}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Modal>
      )}

      {settingsOpen && (
        <Modal
          title="Ustawienia celów"
          description="Preferencje są zapamiętywane na tym urządzeniu."
          onClose={() => setSettingsOpen(false)}
          width={460}
          footer={<Button variant="primary" size="sm" onClick={() => setSettingsOpen(false)}>Gotowe</Button>}
        >
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: C.textMuted }}>Domyślny widok</legend>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={layout === "list"}
                  onClick={() => setGoalLayout("list")}
                  className="flex items-center justify-center gap-2 rounded-lg border py-3 text-[11px]"
                  style={{ color: layout === "list" ? C.iceBlueText : C.textSecond, borderColor: layout === "list" ? C.iceBlue : C.borderSubtle, background: C.inputBg }}
                >
                  <List size={13} aria-hidden="true" />Lista
                </button>
                <button
                  type="button"
                  aria-pressed={layout === "grid"}
                  onClick={() => setGoalLayout("grid")}
                  className="flex items-center justify-center gap-2 rounded-lg border py-3 text-[11px]"
                  style={{ color: layout === "grid" ? C.iceBlueText : C.textSecond, borderColor: layout === "grid" ? C.iceBlue : C.borderSubtle, background: C.inputBg }}
                >
                  <Grid2X2 size={13} aria-hidden="true" />Kafelki
                </button>
              </div>
            </fieldset>
            <ThemedSelect
              label="Domyślne sortowanie"
              value={sortKey}
              onChange={(value) => setGoalSort(value as GoalSortKey)}
              options={[
                { value: "priority", label: "Priorytet" },
                { value: "due", label: "Termin" },
                { value: "progress", label: "Postęp" },
                { value: "updated", label: "Ostatnia zmiana" },
                { value: "name", label: "Nazwa" },
              ]}
              ariaLabel="Domyślne sortowanie"
            />
          </div>
        </Modal>
      )}
    </ModuleShell>
  );
}
