import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";
import {
  getGoalCurrentValue,
  getGoalMetric,
  getGoalProgress,
  getRegularityTarget,
  useGoalsStore,
} from "../goals/goalsStore";
import type {
  Goal as StoredGoal,
  GoalCategory,
  GoalDraft,
  GoalIconKey,
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
import {
  Badge,
  Button,
  ContextNavItem,
  ContextSidebar,
  DetailPanel,
  EmptyState,
  Menu,
  MenuItem,
  ModuleMain,
  ModuleShell,
  PageHeader,
  SectionHeader,
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
  CircleAlert,
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
  ListChecks,
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
  iceBlueBg: uiColors.precisionBlueSoft,
  seaGlass: uiColors.success,
  warning: uiColors.warning,
  danger: uiColors.danger,
  violet: uiColors.violet,
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

type FilterId =
  | "overview"
  | "all"
  | "active"
  | "ontrack"
  | "risk"
  | "paused"
  | "completed"
  | "planned"
  | "archived"
  | `category:${string}`;

const GOALS: Goal[] = [
  {
    id: 1,
    title: "Stworzyć aplikację do rehabilitacji",
    category: "Praca",
    icon: Laptop,
    color: C.iceBlue,
    progress: 37,
    current: 3,
    total: 12,
    progressLabel: "3 z 12 kamieni milowych",
    due: "31 mar 2027",
    daysLeft: "253 dni zostało",
    status: "active",
    priority: "high",
    rhythm: "Kamienie milowe",
    nextMilestone: {
      title: "MVP — główne funkcje aplikacji",
      progress: 40,
      date: "15 sie 2026",
      daysLeft: "25 dni zostało",
    },
    note: "Skupić się najpierw na modułach rehabilitacji kolana i integracji z zegarkami.",
  },
  {
    id: 2,
    title: "Rzucić palenie",
    category: "Zdrowie",
    icon: CigaretteOff,
    color: C.seaGlass,
    progress: 50,
    current: 45,
    total: 90,
    progressLabel: "45 dni z 90",
    due: "15 paź 2026",
    daysLeft: "86 dni zostało",
    status: "active",
    priority: "high",
    rhythm: "Regularność",
    nextMilestone: {
      title: "60 dni bez papierosa",
      progress: 75,
      date: "20 sie 2026",
      daysLeft: "30 dni zostało",
    },
    note: "Po każdym pełnym tygodniu zapisać, co najbardziej pomogło utrzymać rytm.",
  },
  {
    id: 3,
    title: "Wrócić do pełnej sprawności kolana",
    category: "Sport",
    icon: Activity,
    color: C.warning,
    progress: 72,
    current: 72,
    total: 100,
    progressLabel: "72% z 100% sprawności",
    due: "30 wrz 2026",
    daysLeft: "71 dni zostało",
    status: "risk",
    priority: "high",
    rhythm: "Wartość liczbowa",
    nextMilestone: {
      title: "Pełny zakres ruchu bez bólu",
      progress: 80,
      date: "10 sie 2026",
      daysLeft: "20 dni zostało",
    },
    note: "Umówić kontrolę z fizjoterapeutą i wrócić do trzech krótkich sesji tygodniowo.",
  },
  {
    id: 4,
    title: "Nauczyć się hiszpańskiego na poziomie B2",
    category: "Rozwój",
    icon: Languages,
    color: C.violet,
    progress: 41,
    current: 4,
    total: 10,
    progressLabel: "4 z 10 kamieni milowych",
    due: "30 cze 2027",
    daysLeft: "344 dni zostało",
    status: "active",
    priority: "medium",
    rhythm: "Kamienie milowe",
    nextMilestone: {
      title: "Swobodna rozmowa przez 30 minut",
      progress: 55,
      date: "30 wrz 2026",
      daysLeft: "71 dni zostało",
    },
    note: "Dwie konwersacje tygodniowo i codziennie 15 minut powtórek słownictwa.",
  },
  {
    id: 5,
    title: "Zaoszczędzić 50 000 PLN",
    category: "Finanse",
    icon: PiggyBank,
    color: C.warning,
    progress: 37,
    current: 18_320,
    total: 50_000,
    progressLabel: "18 320 / 50 000 PLN",
    due: "31 gru 2026",
    daysLeft: "163 dni zostało",
    status: "active",
    priority: "medium",
    rhythm: "Wartość liczbowa",
    nextMilestone: {
      title: "Przekroczyć próg 25 000 PLN",
      progress: 73,
      date: "31 sie 2026",
      daysLeft: "41 dni zostało",
    },
    note: "Automatyczny przelew wykonać w dniu wpływu wynagrodzenia.",
  },
  {
    id: 6,
    title: "Przebiec półmaraton",
    category: "Sport",
    icon: Dumbbell,
    color: C.seaGlass,
    progress: 28,
    current: 4,
    total: 14,
    progressLabel: "4 z 14 tygodni planu",
    due: "18 paź 2026",
    daysLeft: "89 dni zostało",
    status: "paused",
    priority: "medium",
    rhythm: "Plan treningowy",
    nextMilestone: {
      title: "Długi bieg 12 km",
      progress: 60,
      date: "9 sie 2026",
      daysLeft: "19 dni zostało",
    },
    note: "Cel wstrzymany do czasu zgody fizjoterapeuty.",
  },
  {
    id: 7,
    title: "Ukończyć kurs zarządzania produktem",
    category: "Rozwój",
    icon: Trophy,
    color: C.seaGlass,
    progress: 100,
    current: 8,
    total: 8,
    progressLabel: "8 z 8 modułów",
    due: "30 cze 2026",
    daysLeft: "Ukończono 21 dni temu",
    status: "completed",
    priority: "low",
    rhythm: "Kamienie milowe",
    nextMilestone: {
      title: "Certyfikat ukończenia",
      progress: 100,
      date: "30 cze 2026",
      daysLeft: "Ukończono",
    },
    note: "Podsumowanie kursu zapisane w notatkach.",
  },
  {
    id: 8,
    title: "Zorganizować wyjazd do Portugalii",
    category: "Sprawy osobiste",
    icon: Sparkles,
    color: C.iceBlue,
    progress: 0,
    current: 0,
    total: 6,
    progressLabel: "0 z 6 kroków",
    due: "30 kwi 2027",
    daysLeft: "283 dni zostało",
    status: "planned",
    priority: "low",
    rhythm: "Lista kroków",
    nextMilestone: {
      title: "Wybrać termin i kierunek",
      progress: 0,
      date: "15 wrz 2026",
      daysLeft: "56 dni zostało",
    },
    note: "Rozpocząć planowanie po zamknięciu bieżącego projektu.",
  },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Sport: Dumbbell,
  Zdrowie: HeartPulse,
  Praca: Briefcase,
  Finanse: WalletCards,
  Rozwój: Languages,
  Relacje: Users,
  "Sprawy osobiste": Circle,
};

const CATEGORY_COLORS: Record<string, string> = {
  Sport: C.seaGlass,
  Zdrowie: C.danger,
  Praca: C.iceBlue,
  Finanse: C.warning,
  Rozwój: C.violet,
  Relacje: C.violet,
  "Sprawy osobiste": C.textSecond,
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
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function formatDaysLeft(date: string, status: StoredGoalStatus) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T00:00:00`);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (status === "completed") return days < 0 ? `Ukończono ${Math.abs(days)} dni po terminie` : "Ukończono";
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
  active: { label: "Aktywny", color: C.iceBlue },
  risk: { label: "Zagrożony", color: C.warning },
  paused: { label: "Wstrzymany", color: C.textSecond },
  completed: { label: "Zakończony", color: C.seaGlass },
  planned: { label: "Zaplanowany", color: C.textSecond },
  archived: { label: "Zarchiwizowany", color: C.textSecond },
};

const FILTER_ITEMS: { id: FilterId; label: string; icon: LucideIcon; color?: string }[] = [
  { id: "all", label: "Wszystkie cele", icon: Target },
  { id: "active", label: "Aktywne", icon: Activity, color: C.iceBlue },
  { id: "paused", label: "Wstrzymane", icon: CirclePause, color: C.textSecond },
  { id: "completed", label: "Zakończone", icon: CheckCircle2, color: C.seaGlass },
  { id: "planned", label: "Zaplanowane", icon: CircleDashed, color: C.textSecond },
];

function deadlineColor(goal: Goal) {
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
              style={{ color: searchOpen ? C.iceBlue : C.textDisabled }}
            >
              <Search size={12} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Dodaj kategorię"
              title="Dodaj kategorię"
              onClick={() => { setCategoriesOpen(true); setAdding(true); }}
              className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
              style={{ color: adding ? C.iceBlue : C.textDisabled }}
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
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Szukaj kategorii"
                    className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                    style={{ color: C.textSecond }}
                  />
                  {search && <button type="button" onClick={() => setSearch("")} style={{ color: C.textDisabled }}><X size={10} /></button>}
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
  const Icon = goal.icon;
  const CategoryIcon = CATEGORY_ICONS[goal.category] ?? Circle;
  const statusColor = STATUS_META[goal.status].color;
  const dueColor = deadlineColor(goal);

  return (
    <article
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={`goal-card group cursor-pointer rounded-xl border transition-all duration-150 ${grid ? "goal-card-grid" : ""}`}
      style={{
        background: selected ? C.iceBlueBg : C.card,
        borderColor: selected ? C.iceBlue : C.borderSubtle,
        boxShadow: "none",
      }}
    >
      <div className="goal-card-layout grid items-start gap-x-4 gap-y-2 px-4 py-3">
        <div className="goal-card-primary flex min-w-0 items-center gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border"
            style={{ color: C.textSecond, background: C.inputBg, borderColor: C.borderStrong }}
          >
            {goal.customIcon ? <img src={goal.customIcon} alt="" className="h-5 w-5 object-contain" /> : <Icon size={17} strokeWidth={1.6} />}
          </div>
          <div className="min-w-0 flex flex-1 flex-col">
            <h3 className="ui-record-title truncate" style={{ color: C.textPrimary }}>
              {goal.title}
            </h3>
            <div className="goal-card-meta ui-record-meta order-2 mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1" style={{ color: C.textMuted }}>
              <span className="flex items-center gap-1 font-medium" style={{ color: C.textSecond }}>
                <CategoryIcon size={13} strokeWidth={1.7} /> {goal.category}
              </span>
              <span>•</span>
              <span>{goal.progressLabel}</span>
              <span>•</span>
              <span className="hidden">{goal.progressLabel}</span>
            </div>
            <div className="order-1 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div
                className="goal-card-inline-date inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[10px]"
                style={{ color: dueColor, borderColor: dueColor === C.textSecond ? C.borderStrong : `${dueColor}35`, background: C.inputBg }}
              >
                <CalendarDays size={12} strokeWidth={1.7} />
                <span className="font-medium" style={{ color: dueColor === C.textSecond ? C.textPrimary : dueColor }}>{goal.due}</span>
                <span style={{ color: C.textMuted }}>· {goal.daysLeft}</span>
              </div>
              <div className="flex min-w-[150px] flex-1 items-center gap-3">
                <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: C.borderStrong }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${goal.progress}%`, background: C.iceBlue }}
                  />
                </div>
                <span className="w-9 text-right text-[11px] font-semibold tabular-nums" style={{ color: C.textPrimary, fontFamily: "'DM Mono', monospace" }}>
                  {goal.progress}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="goal-card-status relative self-center" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => { setStatusOpen((open) => !open); setMenuOpen(false); }}><StatusPill status={goal.status} /></button>
          {statusOpen && (
            <Menu className="absolute right-0 top-9 z-30 w-40">
              {(["active", "paused", "completed", "planned", "archived"] as GoalStatus[]).map((status) => (
                <MenuItem key={status} selected={goal.status === status} onClick={() => { onStatus(status); setStatusOpen(false); }} leadingIcon={<span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_META[status].color }} />} style={{ color: STATUS_META[status].color }}>
                  {STATUS_META[status].label}
                </MenuItem>
              ))}
            </Menu>
          )}
        </div>

        <div className="goal-card-date flex items-center gap-2 text-[10px] font-medium" style={{ color: dueColor }}>
          <CalendarDays size={13} strokeWidth={1.7} />
          <span>{goal.due}</span>
        </div>

        <div className="goal-card-more relative self-center" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => { setMenuOpen((open) => !open); setStatusOpen(false); }} aria-label={`Więcej opcji dla celu ${goal.title}`} className="flex h-[30px] w-[30px] items-center justify-center rounded-lg transition-colors" style={{ color: C.textMuted }}>
            <Ellipsis size={17} strokeWidth={1.8} />
          </button>
          {menuOpen && (
            <Menu className="absolute right-0 top-9 z-30 w-44">
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

function SummaryPanel({ goals, onFilter, onSelectGoal }: { goals: Goal[]; onFilter: (filter: FilterId) => void; onSelectGoal: (id: string) => void }) {
  const activeGoals = goals.filter((goal) => goal.status === "active" || goal.status === "risk");
  const onTrack = activeGoals.filter((goal) => goal.status === "active").length;
  const atRisk = activeGoals.filter((goal) => goal.status === "risk").length;
  const upcoming = activeGoals.slice(0, 3);
  const averageProgress = activeGoals.length ? Math.round(activeGoals.reduce((sum, goal) => sum + goal.progress, 0) / activeGoals.length) : 0;

  const stats = [
    { label: "Aktywne cele", note: "W realizacji", value: activeGoals.length, icon: Target, color: C.iceBlue, filter: "active" as FilterId },
    { label: "Na dobrej drodze", note: "Realizowane zgodnie z planem", value: onTrack, icon: CheckCircle2, color: C.seaGlass, filter: "ontrack" as FilterId },
    { label: "Zagrożone", note: "Wymagają uwagi", value: atRisk, icon: CircleAlert, color: C.warning, filter: "risk" as FilterId },
  ];

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <PanelSection title="Podsumowanie">
        <div className="space-y-2">
          {stats.map(({ label, note, value, icon: Icon, color, filter }) => (
            <button type="button" onClick={() => onFilter(filter)} key={label} className="flex w-full items-center gap-3.5 rounded-xl border px-3.5 py-3.5 text-left" style={{ background: C.panel, borderColor: C.borderSubtle }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: `${color}16`, color }}>
                <Icon size={19} strokeWidth={1.7} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium" style={{ color: C.textPrimary }}>{label}</p>
                <p className="mt-0.5 truncate text-[10px]" style={{ color: C.textMuted }}>{note}</p>
              </div>
              <span className="text-[22px] font-medium" style={{ color: C.textPrimary, fontFamily: "'DM Mono', monospace" }}>{value}</span>
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Postęp aktywnych celów">
        <div className="rounded-xl border p-3.5" style={{ background: C.panel, borderColor: C.borderSubtle }}>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: C.borderSubtle }}>
              <div className="h-full rounded-full" style={{ width: `${averageProgress}%`, background: C.iceBlue }} />
            </div>
            <span className="text-[22px] font-medium" style={{ color: C.textPrimary, fontFamily: "'DM Mono', monospace" }}>{averageProgress}%</span>
          </div>
          <p className="mt-2 text-[10px]" style={{ color: C.textMuted }}>Średnia dla {activeGoals.length} aktywnych celów</p>
        </div>
      </PanelSection>

      <PanelSection title="Najbliższe terminy">
        <div className="rounded-xl border px-3" style={{ background: C.panel, borderColor: C.borderSubtle }}>
          {upcoming.map((goal, index) => (
            <button
              key={goal.id}
              type="button"
              onClick={() => onSelectGoal(String(goal.id))}
              className="flex w-full gap-2.5 py-3 text-left"
              style={{ borderBottom: index < upcoming.length - 1 ? `1px solid ${C.borderSubtle}` : "none" }}
            >
              <CalendarDays size={13} strokeWidth={1.6} className="mt-0.5 flex-shrink-0" style={{ color: C.textSecond }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: C.textSecond }}>{goal.due}</span>
                  <span className="line-clamp-2 text-right text-[10px] leading-4" style={{ color: C.textPrimary }}>{goal.title}</span>
                </div>
                <p className="mt-0.5 text-right text-[9px]" style={{ color: C.textMuted }}>{goal.daysLeft}</p>
              </div>
            </button>
          ))}
        </div>
      </PanelSection>

    </div>
  );
}

function DetailRow({ icon: Icon, label, children, onClick }: { icon: LucideIcon; label: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} onKeyDown={(event) => { if (onClick && (event.key === "Enter" || event.key === " ")) onClick(); }} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} className="flex min-h-10 w-full items-center gap-2.5 border-b py-3 text-left last:border-b-0" style={{ borderColor: C.borderSubtle, cursor: onClick ? "pointer" : "default" }}>
      <Icon size={13} strokeWidth={1.6} style={{ color: C.textMuted }} />
      <span className="flex-1 text-[11px]" style={{ color: C.textMuted }}>{label}</span>
      <div className="flex items-center gap-1.5 text-right text-[11px]" style={{ color: C.textSecond }}>{children}</div>
      <ChevronRight size={11} strokeWidth={1.7} style={{ color: C.textDisabled }} />
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
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border" style={{ color: C.textSecond, background: C.inputBg, borderColor: C.borderStrong }}>
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
            <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, background: C.iceBlue }} />
          </div>
          <button type="button" onClick={onProgress} className="mt-3 flex items-center gap-1.5 text-[10px] font-medium" style={{ color: C.iceBlue }}><Plus size={11} />{rawGoal.progressMode === "milestones" ? "Dodaj kamień milowy" : "Dodaj aktualizację postępu"}</button>
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
            <span style={{ color: C.iceBlue }}>{goal.progress}%</span>
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
                    <span className="text-[11px]" style={{ color: C.iceBlue, fontFamily: "'DM Mono', monospace" }}>{goal.nextMilestone.progress}%</span>
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
              { value: `${goal.progress}%`, label: "Ogólny postęp", color: C.iceBlue },
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
            <textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
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
  const {
    goals: storedGoals,
    categories,
    storageFailed,
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
    importStore,
  } = useGoalsStore();
  const [activeFilter, setActiveFilter] = useState<FilterId>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<"list" | "grid">(() => {
    try { return localStorage.getItem("routine.goals.layout") === "grid" ? "grid" : "list"; }
    catch { return "list"; }
  });
  const [sortKey, setSortKey] = useState<"priority" | "due" | "progress" | "updated" | "name">(() => {
    try {
      const saved = localStorage.getItem("routine.goals.sort");
      return saved === "due" || saved === "progress" || saved === "updated" || saved === "name" ? saved : "priority";
    } catch { return "priority"; }
  });
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalFormId, setGoalFormId] = useState<"new" | string | null>(null);
  const [progressGoalId, setProgressGoalId] = useState<string | null>(null);
  const [milestoneGoalId, setMilestoneGoalId] = useState<string | null>(null);
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [deletedGoal, setDeletedGoal] = useState<StoredGoal | null>(null);
  const goals = useMemo(() => storedGoals.map((goal) => toViewGoal(goal, categories)), [storedGoals, categories]);

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
    setActiveFilter(filter);
    setSelectedId(null);
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
      setSelectedId(id);
    } else if (goalFormId) updateGoal(goalFormId, data);
    setGoalFormId(null);
  };

  const exportGoals = () => {
    const blob = new Blob([exportStore()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `routine-cele-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setHeaderMenuOpen(false);
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
          meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
          actions={<>
            <Button className="ui-button--icon-mobile" variant="primary" onClick={() => setGoalFormId("new")} leadingIcon={<Plus size={15} strokeWidth={2} />}><span className="header-action-label">Nowy cel</span></Button>
            <div className="relative">
              <Button variant="quiet" iconOnly onClick={() => setHeaderMenuOpen((open) => !open)} aria-label="Więcej opcji"><Ellipsis size={17} /></Button>
              {headerMenuOpen && <Menu className="absolute right-0 top-12 z-40 w-48">
                <label
                  role="menuitem"
                  tabIndex={0}
                  className="ui-menu-item cursor-pointer"
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.currentTarget.querySelector("input")?.click();
                  }}
                ><span className="ui-menu-item__icon"><Archive /></span><span className="ui-menu-item__label">Importuj dane</span><input type="file" accept="application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) file.text().then((raw) => importStore(raw)); setHeaderMenuOpen(false); }} /></label>
                <MenuItem onClick={exportGoals} leadingIcon={<NotebookPen />}>Eksportuj dane</MenuItem>
                <MenuItem onClick={() => { handleFilter("archived"); setHeaderMenuOpen(false); }} leadingIcon={<Archive />}>Otwórz archiwum</MenuItem>
              </Menu>}
            </div>
          </>}
        />

        <WorkspaceToolbar>
          <div className="flex min-w-0 items-center gap-2">
            <select
              aria-label="Widok celów"
              className="context-mobile-select ui-field__control ui-select ui-select--compact"
              value={activeFilter}
              onChange={(event) => handleFilter(event.target.value as FilterId)}
            >
              <option value="overview">Przegląd</option>
              {FILTER_ITEMS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              {categories.map((category) => <option key={category.id} value={`category:${category.id}`}>{category.label}</option>)}
              <option value="archived">Archiwum</option>
            </select>
            <span className="workspace-context-label">{filterLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative goals-sort">
              <Button variant="quiet" size="sm" onClick={() => setSortMenuOpen((open) => !open)} trailingIcon={<ChevronDown size={11} />}>
                Sortuj: <span className="goals-sort-label">{({ priority: "Priorytet", due: "Termin", progress: "Postęp", updated: "Ostatnia zmiana", name: "Nazwa" } as const)[sortKey]}</span>
              </Button>
              {sortMenuOpen && <Menu className="absolute right-0 top-11 z-40 w-44">{([{ id: "priority", label: "Priorytet" }, { id: "due", label: "Termin" }, { id: "progress", label: "Postęp" }, { id: "updated", label: "Ostatnia zmiana" }, { id: "name", label: "Nazwa" }] as const).map((option) => <MenuItem key={option.id} selected={sortKey === option.id} onClick={() => { setSortKey(option.id); setSortMenuOpen(false); }} trailingIcon={sortKey === option.id ? <Check size={11} /> : undefined}>{option.label}</MenuItem>)}</Menu>}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" iconOnly onClick={() => setLayout("list")} aria-label="Widok listy" aria-pressed={layout === "list"} style={{ color: layout === "list" ? C.iceBlue : C.textMuted, background: layout === "list" ? C.iceBlueBg : "transparent" }}>
                <List size={15} strokeWidth={1.8} />
              </Button>
              <Button variant="ghost" size="sm" iconOnly onClick={() => setLayout("grid")} aria-label="Widok kafelków" aria-pressed={layout === "grid"} style={{ color: layout === "grid" ? C.iceBlue : C.textMuted, background: layout === "grid" ? C.iceBlueBg : "transparent" }}>
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
                        onSelect={() => setSelectedId(selectedId === goal.id ? null : String(goal.id))}
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
                        onSelect={() => setSelectedId(selectedId === goal.id ? null : String(goal.id))}
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
        <DetailPanel label="Szczegóły celu">
          <GoalDetail
            goal={selectedGoal}
            rawGoal={storedGoals.find((goal) => goal.id === String(selectedGoal.id))!}
            note={selectedGoal.note}
            onNoteChange={(value) => updateGoal(String(selectedGoal.id), { note: value })}
            onClose={() => setSelectedId(null)}
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
            if (selectedId === deleteGoalId) setSelectedId(null);
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
          <button type="button" onClick={() => { restoreGoal(deletedGoal); setDeletedGoal(null); }} className="text-[11px] font-semibold" style={{ color: C.iceBlue }}>Cofnij</button>
          <button type="button" onClick={() => setDeletedGoal(null)} aria-label="Zamknij" style={{ color: C.textMuted }}><X size={13} /></button>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-5 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <div className="w-full max-w-[460px] rounded-2xl border shadow-2xl" style={{ background: C.bg, borderColor: C.borderStrong }}>
            <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: C.borderSubtle }}><div><h2 className="text-[16px] font-semibold" style={{ color: C.textPrimary }}>Ustawienia celów</h2><p className="mt-1 text-[10px]" style={{ color: C.textMuted }}>Preferencje są zapamiętywane na tym urządzeniu.</p></div><button type="button" onClick={() => setSettingsOpen(false)} style={{ color: C.textSecond }}><X size={16} /></button></div>
            <div className="space-y-5 px-5 py-5"><div><p className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: C.textMuted }}>Domyślny widok</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setLayout("list")} className="flex items-center justify-center gap-2 rounded-lg border py-3 text-[11px]" style={{ color: layout === "list" ? C.iceBlue : C.textSecond, borderColor: layout === "list" ? C.iceBlue : C.borderSubtle, background: C.inputBg }}><List size={13} />Lista</button><button type="button" onClick={() => setLayout("grid")} className="flex items-center justify-center gap-2 rounded-lg border py-3 text-[11px]" style={{ color: layout === "grid" ? C.iceBlue : C.textSecond, borderColor: layout === "grid" ? C.iceBlue : C.borderSubtle, background: C.inputBg }}><Grid2X2 size={13} />Kafelki</button></div></div><div><p className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: C.textMuted }}>Domyślne sortowanie</p><ThemedSelect value={sortKey} onChange={(value) => setSortKey(value as typeof sortKey)} options={[{ value: "priority", label: "Priorytet" }, { value: "due", label: "Termin" }, { value: "progress", label: "Postęp" }, { value: "updated", label: "Ostatnia zmiana" }, { value: "name", label: "Nazwa" }]} ariaLabel="Domyślne sortowanie" /></div></div>
            <div className="flex justify-end border-t px-5 py-4" style={{ borderColor: C.borderSubtle }}><Button type="button" variant="primary" size="sm" onClick={() => setSettingsOpen(false)}>Gotowe</Button></div>
          </div>
        </div>
      )}
    </ModuleShell>
  );
}
