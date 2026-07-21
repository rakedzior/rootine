import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
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
  Link2,
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
  bg: "#242424",
  subSidebar: "#1E1E1E",
  card: "#2E2E2E",
  cardHover: "#333333",
  panel: "#2A2A2A",
  inputBg: "#222222",
  borderSubtle: "#383838",
  borderStrong: "#484848",
  textPrimary: "#F0F0F0",
  textSecond: "#A0A0A0",
  textMuted: "#777777",
  textDisabled: "#515151",
  iceBlue: "#4772FA",
  iceBlueBg: "rgba(71,114,250,0.11)",
  seaGlass: "#70B89F",
  warning: "#D4AA68",
  danger: "#CF777C",
  violet: "#9B8CE8",
} as const;

type GoalStatus = "active" | "risk" | "paused" | "completed" | "planned";
type GoalPriority = "high" | "medium" | "low";
type Goal = {
  id: number;
  title: string;
  category: string;
  icon: LucideIcon;
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
  links: { label: string; icon: LucideIcon }[];
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
    links: [
      { label: "Zadania", icon: ListChecks },
      { label: "Kalendarz", icon: CalendarDays },
      { label: "Notatki", icon: NotebookPen },
    ],
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
    links: [
      { label: "Nawyki", icon: CheckCircle2 },
      { label: "Notatki", icon: NotebookPen },
    ],
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
    links: [
      { label: "Treningi", icon: Dumbbell },
      { label: "Nawyki", icon: CheckCircle2 },
      { label: "Notatki", icon: NotebookPen },
    ],
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
    links: [
      { label: "Nawyki", icon: CheckCircle2 },
      { label: "Notatki", icon: NotebookPen },
    ],
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
    links: [
      { label: "Budżet", icon: WalletCards },
      { label: "Płatności", icon: CalendarDays },
      { label: "Notatki", icon: NotebookPen },
    ],
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
    links: [{ label: "Treningi", icon: Dumbbell }],
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
    links: [{ label: "Notatki", icon: NotebookPen }],
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
    links: [{ label: "Zadania", icon: ListChecks }],
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
  Relacje: "#C77DBB",
  "Sprawy osobiste": C.textSecond,
};

const STATUS_META: Record<GoalStatus, { label: string; color: string }> = {
  active: { label: "Aktywny", color: C.seaGlass },
  risk: { label: "Zagrożony", color: C.warning },
  paused: { label: "Wstrzymany", color: C.textSecond },
  completed: { label: "Zakończony", color: C.seaGlass },
  planned: { label: "Zaplanowany", color: C.violet },
};

const FILTER_ITEMS: { id: FilterId; label: string; icon: LucideIcon; color?: string }[] = [
  { id: "all", label: "Wszystkie cele", icon: Target },
  { id: "active", label: "Aktywne", icon: Activity, color: C.seaGlass },
  { id: "paused", label: "Wstrzymane", icon: CirclePause, color: C.textSecond },
  { id: "completed", label: "Zakończone", icon: CheckCircle2, color: C.seaGlass },
  { id: "planned", label: "Zaplanowane", icon: CircleDashed, color: C.violet },
];

const countForFilter = (id: FilterId) => {
  if (id === "all") return GOALS.length;
  if (id === "active") return GOALS.filter((goal) => goal.status === "active" || goal.status === "risk").length;
  return GOALS.filter((goal) => goal.status === id).length;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 px-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.textMuted }}>
      {children}
    </p>
  );
}

function GoalSubSidebar({ activeFilter, onFilter }: { activeFilter: FilterId; onFilter: (id: FilterId) => void }) {
  const [categories, setCategories] = useState(() => Object.keys(CATEGORY_ICONS).map((label) => ({
    id: label.toLocaleLowerCase("pl-PL").replaceAll(" ", "-"),
    label,
    filterValue: label,
    icon: CATEGORY_ICONS[label],
    color: CATEGORY_COLORS[label],
  })));
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
    setCategories((current) => [...current, {
      id: `${label.toLocaleLowerCase("pl-PL").replaceAll(" ", "-")}-${Date.now()}`,
      label,
      filterValue: label,
      icon: Circle,
      color: C.textSecond,
    }]);
    setNewCategory("");
    setAdding(false);
  };

  const saveCategory = (id: string) => {
    const label = editingValue.trim();
    if (label) setCategories((current) => current.map((category) => category.id === id ? { ...category, label } : category));
    setEditingId(null);
    setEditingValue("");
  };

  const item = (id: FilterId, label: string, Icon: LucideIcon, count?: number, color?: string) => {
    const active = activeFilter === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onFilter(id)}
        className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors"
        style={{
          color: active ? C.iceBlue : C.textMuted,
          background: active ? C.iceBlueBg : "transparent",
          borderLeft: `2px solid ${active ? C.iceBlue : "transparent"}`,
        }}
      >
        <Icon size={13} strokeWidth={1.7} style={{ color: active ? C.iceBlue : color ?? C.textMuted }} />
        <span className="min-w-0 flex-1 truncate text-left text-[12px]">{label}</span>
        {count !== undefined && (
          <span className="text-[9px] tabular-nums" style={{ color: active ? C.iceBlue : C.textDisabled, fontFamily: "'DM Mono', monospace" }}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className="task-sub-sidebar flex w-[200px] flex-shrink-0 flex-col overflow-hidden border-r"
      style={{ background: C.subSidebar, borderColor: C.borderSubtle }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SectionLabel>Przegląd</SectionLabel>
        <div className="mb-6">{item("overview", "Przegląd", BarChart3)}</div>

        <SectionLabel>Cele</SectionLabel>
        <div className="mb-6 space-y-px">
          {FILTER_ITEMS.map((filter) => item(filter.id, filter.label, filter.icon, countForFilter(filter.id), filter.color))}
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
                style={{ background: C.inputBg, borderColor: "rgba(71,114,250,0.35)" }}
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
              const Icon = category.icon;
              const active = activeFilter === `category:${category.filterValue}`;
              return (
                <div key={category.id} className="group flex min-h-8 items-center rounded-lg" style={{ background: active ? C.iceBlueBg : "transparent" }}>
                  {editingId === category.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); saveCategory(category.id); }} className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5">
                      <Icon size={12} strokeWidth={1.7} style={{ color: category.color }} />
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
                    <button
                      type="button"
                      onClick={() => onFilter(`category:${category.filterValue}`)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 text-left"
                      style={{ color: active ? C.iceBlue : C.textMuted, borderLeft: `2px solid ${active ? C.iceBlue : "transparent"}` }}
                    >
                      <Icon size={13} strokeWidth={1.7} style={{ color: active ? C.iceBlue : category.color }} />
                      <span className="truncate text-[12px]">{category.label}</span>
                    </button>
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
                      <button
                        type="button"
                        aria-label={`Usuń kategorię ${category.label}`}
                        title="Usuń"
                        onClick={() => { setCategories((current) => current.filter((item) => item.id !== category.id)); if (active) onFilter("overview"); }}
                        className="flex h-6 w-6 items-center justify-center rounded-md"
                        style={{ color: C.danger }}
                      >
                        <Trash2 size={11} strokeWidth={1.7} />
                      </button>
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
          <button type="button" className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ color: C.textMuted }}>
            <FolderCog size={13} strokeWidth={1.7} />
            <span className="text-[12px]">Kategorie</span>
          </button>
          <button type="button" className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ color: C.textMuted }}>
            <Archive size={13} strokeWidth={1.7} />
            <span className="text-[12px]">Archiwum</span>
          </button>
          <button type="button" className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ color: C.textMuted }}>
            <Settings2 size={13} strokeWidth={1.7} />
            <span className="text-[12px]">Ustawienia</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function StatusPill({ status }: { status: GoalStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex h-[30px] items-center gap-1 rounded-lg border px-3 text-[11px] font-medium"
      style={{ color: meta.color, borderColor: `${meta.color}38`, background: `${meta.color}0B` }}
    >
      {meta.label}
      <ChevronDown size={11} strokeWidth={1.7} />
    </span>
  );
}

function GoalCard({ goal, selected, grid, onSelect }: { goal: Goal; selected: boolean; grid: boolean; onSelect: () => void }) {
  const Icon = goal.icon;
  const CategoryIcon = CATEGORY_ICONS[goal.category] ?? Circle;
  const statusColor = STATUS_META[goal.status].color;

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
        background: selected ? "linear-gradient(115deg, rgba(71,114,250,0.08), #2E2E2E 46%)" : C.card,
        borderColor: selected ? C.iceBlue : C.borderSubtle,
        boxShadow: selected ? "0 0 0 1px rgba(71,114,250,0.12), 0 12px 28px rgba(0,0,0,0.16)" : "0 1px 2px rgba(0,0,0,0.12)",
      }}
    >
      <div className="goal-card-layout grid items-start gap-x-5 gap-y-3 px-[18px] py-[17px]">
        <div className="goal-card-primary flex min-w-0 gap-4">
          <div
            className="flex h-[54px] w-[54px] flex-shrink-0 items-center justify-center rounded-xl border"
            style={{ color: goal.color, background: `${goal.color}16`, borderColor: `${goal.color}24` }}
          >
            <Icon size={24} strokeWidth={1.55} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="truncate text-[15px] font-semibold leading-5" style={{ color: C.textPrimary }}>
              {goal.title}
            </h3>
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px]" style={{ color: C.textMuted }}>
              <span className="flex items-center gap-1 font-medium" style={{ color: goal.color }}>
                <CategoryIcon size={10} strokeWidth={1.7} /> {goal.category}
              </span>
              <span>•</span>
              <span>{goal.rhythm}</span>
              <span>•</span>
              <span>{goal.progressLabel}</span>
            </div>
            <div className="mt-3.5 flex items-center gap-3">
              <div className="h-[5px] flex-1 overflow-hidden rounded-full" style={{ background: C.borderStrong }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${goal.progress}%`, background: goal.status === "risk" ? C.warning : goal.color }}
                />
              </div>
              <span className="w-9 text-right text-[11px] font-medium tabular-nums" style={{ color: C.textSecond, fontFamily: "'DM Mono', monospace" }}>
                {goal.progress}%
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {goal.links.map(({ label, icon: LinkIcon }) => (
                <span key={label} className="flex items-center gap-1 text-[10px]" style={{ color: C.textMuted }}>
                  <LinkIcon size={10} strokeWidth={1.7} /> {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="goal-card-date flex gap-2 pt-1">
          <CalendarDays size={14} strokeWidth={1.6} style={{ color: goal.status === "risk" ? C.warning : C.textSecond }} />
          <div>
            <p className="text-[11px] font-medium" style={{ color: goal.status === "risk" ? C.warning : C.textPrimary }}>{goal.due}</p>
            <p className="mt-1 text-[10px]" style={{ color: C.textMuted }}>{goal.daysLeft}</p>
          </div>
        </div>

        <div className="goal-card-status" onClick={(event) => event.stopPropagation()}>
          <StatusPill status={goal.status} />
        </div>

        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Więcej opcji dla celu ${goal.title}`}
          className="goal-card-more flex h-[30px] w-[30px] items-center justify-center rounded-lg transition-colors"
          style={{ color: C.textMuted }}
        >
          <Ellipsis size={17} strokeWidth={1.8} />
        </button>
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

function SummaryPanel({ onFilter }: { onFilter: (filter: FilterId) => void }) {
  const activeGoals = GOALS.filter((goal) => goal.status === "active" || goal.status === "risk");
  const onTrack = activeGoals.filter((goal) => goal.status === "active").length;
  const atRisk = activeGoals.filter((goal) => goal.status === "risk").length;
  const upcoming = [...activeGoals].sort((a, b) => a.id - b.id).slice(0, 3);
  const averageProgress = Math.round(activeGoals.reduce((sum, goal) => sum + goal.progress, 0) / activeGoals.length);

  const stats = [
    { label: "Aktywne cele", note: "W realizacji", value: activeGoals.length, icon: Target, color: C.seaGlass },
    { label: "Na dobrej drodze", note: "Realizowane zgodnie z planem", value: onTrack, icon: CheckCircle2, color: C.iceBlue },
    { label: "Zagrożone", note: "Wymagają uwagi", value: atRisk, icon: CircleAlert, color: C.warning },
  ];

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <PanelSection title="Podsumowanie">
        <div className="space-y-2">
          {stats.map(({ label, note, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-3.5 rounded-xl border px-3.5 py-3.5" style={{ background: C.panel, borderColor: C.borderSubtle }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: `${color}16`, color }}>
                <Icon size={19} strokeWidth={1.7} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium" style={{ color: C.textPrimary }}>{label}</p>
                <p className="mt-0.5 truncate text-[10px]" style={{ color: C.textMuted }}>{note}</p>
              </div>
              <span className="text-[20px] font-medium" style={{ color: C.textPrimary, fontFamily: "'DM Mono', monospace" }}>{value}</span>
            </div>
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
              onClick={() => onFilter(`category:${goal.category}`)}
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

function DetailRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-2.5 border-b py-3 last:border-b-0" style={{ borderColor: C.borderSubtle }}>
      <Icon size={13} strokeWidth={1.6} style={{ color: C.textMuted }} />
      <span className="flex-1 text-[11px]" style={{ color: C.textMuted }}>{label}</span>
      <div className="flex items-center gap-1.5 text-right text-[11px]" style={{ color: C.textSecond }}>{children}</div>
      <ChevronRight size={11} strokeWidth={1.7} style={{ color: C.textDisabled }} />
    </div>
  );
}

function GoalDetail({ goal, note, onNoteChange, onClose }: { goal: Goal; note: string; onNoteChange: (value: string) => void; onClose: () => void }) {
  const Icon = goal.icon;
  const CategoryIcon = CATEGORY_ICONS[goal.category] ?? Circle;
  const status = STATUS_META[goal.status];
  const priority = goal.priority === "high" ? { label: "Wysoki", color: C.danger } : goal.priority === "medium" ? { label: "Średni", color: C.warning } : { label: "Niski", color: C.iceBlue };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={onClose} aria-label="Zamknij szczegóły celu" className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: C.textSecond }}>
            <X size={18} strokeWidth={1.7} />
          </button>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border" style={{ color: goal.color, background: `${goal.color}16`, borderColor: `${goal.color}25` }}>
            <Icon size={25} strokeWidth={1.55} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold leading-5" style={{ color: C.textPrimary }}>{goal.title}</h2>
            <p className="mt-1.5 flex items-center gap-1 text-[10px]" style={{ color: goal.color }}>
              <CategoryIcon size={10} /> {goal.category}
              <span style={{ color: C.textDisabled }}>•</span>
              <span style={{ color: C.textMuted }}>{goal.rhythm}</span>
            </p>
          </div>
          <StatusPill status={goal.status} />
        </div>

        <div className="my-5 border-y py-4" style={{ borderColor: C.borderSubtle }}>
          <div className="mb-3 flex items-end justify-between">
            <span className="text-[20px] font-semibold" style={{ color: C.textPrimary, fontFamily: "'DM Mono', monospace" }}>{goal.progress}%</span>
            <span className="text-[10px]" style={{ color: C.textMuted }}>{goal.progressLabel}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: C.borderStrong }}>
            <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, background: goal.status === "risk" ? C.warning : goal.color }} />
          </div>
        </div>

        <div className="mb-5">
          <DetailRow icon={CalendarDays} label="Termin">
            <span style={{ color: goal.status === "risk" ? C.warning : C.textPrimary }}>{goal.due}</span>
          </DetailRow>
          <DetailRow icon={Flag} label="Priorytet">
            <Flag size={10} fill={`${priority.color}38`} style={{ color: priority.color }} />
            <span style={{ color: priority.color }}>{priority.label}</span>
          </DetailRow>
          <DetailRow icon={Target} label="Kategoria">
            <span style={{ color: goal.color }}>{goal.category}</span>
          </DetailRow>
          <DetailRow icon={BarChart3} label="Postęp liczbowy">
            <span style={{ color: goal.color }}>{goal.progress}%</span>
          </DetailRow>
          <DetailRow icon={Link2} label="Powiązane moduły">
            <div className="flex -space-x-1">
              {goal.links.slice(0, 3).map(({ label, icon: LinkIcon }) => (
                <span key={label} title={label} className="flex h-7 w-7 items-center justify-center rounded-md border" style={{ background: C.inputBg, borderColor: C.borderStrong, color: goal.color }}>
                  <LinkIcon size={12} strokeWidth={1.7} />
                </span>
              ))}
            </div>
          </DetailRow>
        </div>

        <PanelSection title="Najbliższy kamień milowy">
          <div className="rounded-xl border p-3" style={{ background: C.panel, borderColor: C.borderSubtle }}>
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full border" style={{ borderColor: C.textMuted }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-medium leading-4" style={{ color: C.textPrimary }}>{goal.nextMilestone.title}</p>
                  <span className="text-[11px]" style={{ color: goal.color, fontFamily: "'DM Mono', monospace" }}>{goal.nextMilestone.progress}%</span>
                </div>
                <p className="mt-1 text-[9px]" style={{ color: C.textMuted }}>Plan: {goal.nextMilestone.date} · {goal.nextMilestone.daysLeft}</p>
              </div>
            </div>
          </div>
        </PanelSection>

        <div className="my-5 border-t" style={{ borderColor: C.borderSubtle }} />

        <PanelSection title="Statystyki">
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: `${goal.current} / ${goal.total}`, label: "Kamienie milowe", color: C.textPrimary },
              { value: `${goal.progress}%`, label: "Ogólny postęp", color: goal.color },
              { value: goal.status === "risk" ? "Uwaga" : "Na planie", label: "Status planu", color: status.color },
              { value: String(Math.max(1, goal.links.length - 1)), label: "Powiązane nawyki", color: C.textPrimary },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border p-2.5" style={{ background: C.panel, borderColor: C.borderSubtle }}>
                <p className="text-[14px] font-medium" style={{ color: stat.color, fontFamily: "'DM Mono', monospace" }}>{stat.value}</p>
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
        <button type="button" className="w-full rounded-lg py-3.5 text-[11px] font-semibold" style={{ color: "#BFCBFF", background: C.iceBlueBg, border: `1px solid rgba(71,114,250,0.18)` }}>
          Otwórz pełny widok celu
        </button>
      </div>
    </div>
  );
}

export default function Cele() {
  const [activeFilter, setActiveFilter] = useState<FilterId>("overview");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [notes, setNotes] = useState<Record<number, string>>(() => Object.fromEntries(GOALS.map((goal) => [goal.id, goal.note])));

  const visibleGoals = useMemo(() => {
    if (activeFilter === "overview" || activeFilter === "active") {
      return GOALS.filter((goal) => goal.status === "active" || goal.status === "risk");
    }
    if (activeFilter === "all") return GOALS;
    if (activeFilter === "ontrack") return GOALS.filter((goal) => goal.status === "active");
    if (activeFilter.startsWith("category:")) {
      return GOALS.filter((goal) => goal.category === activeFilter.slice("category:".length));
    }
    return GOALS.filter((goal) => goal.status === activeFilter);
  }, [activeFilter]);

  const selectedGoal = GOALS.find((goal) => goal.id === selectedId) ?? null;
  const priorityGoals = visibleGoals.filter((goal) => goal.priority === "high" || goal.status === "risk");
  const remainingGoals = visibleGoals.filter((goal) => !priorityGoals.includes(goal));

  const handleFilter = (filter: FilterId) => {
    setActiveFilter(filter);
    setSelectedId(null);
  };

  const filterLabel = activeFilter === "overview" || activeFilter === "active"
    ? "Aktywne cele"
    : activeFilter === "all"
      ? "Wszystkie cele"
      : activeFilter === "ontrack"
        ? "Na dobrej drodze"
        : activeFilter === "risk"
          ? "Zagrożone"
      : activeFilter.startsWith("category:")
          ? activeFilter.slice("category:".length)
          : FILTER_ITEMS.find((item) => item.id === activeFilter)?.label ?? "Cele";

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden" style={{ background: C.bg }}>
      <GoalSubSidebar activeFilter={activeFilter} onFilter={handleFilter} />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-[82px] items-center justify-between gap-4 border-b px-7 py-4" style={{ borderColor: C.borderSubtle }}>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: C.textPrimary }}>Cele</h1>
            <p className="mt-1 text-[11px]" style={{ color: C.textMuted }}>Przegląd Twoich celów i postępów</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="flex h-10 items-center gap-1.5 rounded-lg px-4 text-[12px] font-semibold" style={{ color: "white", background: C.iceBlue, boxShadow: "0 6px 18px rgba(71,114,250,0.22)" }}>
              <Plus size={15} strokeWidth={2} /> Nowy cel
            </button>
            <button type="button" aria-label="Więcej opcji" className="flex h-10 w-10 items-center justify-center rounded-lg border" style={{ color: C.textSecond, borderColor: C.borderSubtle, background: C.inputBg }}>
              <Ellipsis size={17} />
            </button>
          </div>
        </header>

        <div className="flex min-h-[70px] items-center justify-between gap-3 border-b px-7 py-3" style={{ borderColor: C.borderSubtle }}>
          <button type="button" className="flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[11px]" style={{ color: C.textSecond, borderColor: C.borderSubtle, background: C.inputBg }}>
            <span className="h-2 w-2 rounded-full border" style={{ borderColor: C.seaGlass }} />
            {filterLabel}
            <ChevronDown size={11} strokeWidth={1.7} />
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="goals-sort flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-[11px]" style={{ color: C.textSecond, borderColor: C.borderSubtle, background: C.inputBg }}>
              Sortuj: <span style={{ color: C.textPrimary }}>Priorytet</span> <ChevronDown size={11} />
            </button>
            <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: C.borderSubtle, background: C.inputBg }}>
              <button type="button" onClick={() => setLayout("list")} aria-label="Widok listy" className="flex h-9 w-10 items-center justify-center border-r" style={{ color: layout === "list" ? C.iceBlue : C.textMuted, background: layout === "list" ? C.iceBlueBg : "transparent", borderColor: C.borderSubtle }}>
                <List size={15} strokeWidth={1.8} />
              </button>
              <button type="button" onClick={() => setLayout("grid")} aria-label="Widok kafelków" className="flex h-9 w-10 items-center justify-center" style={{ color: layout === "grid" ? C.iceBlue : C.textMuted, background: layout === "grid" ? C.iceBlueBg : "transparent" }}>
                <Grid2X2 size={14} strokeWidth={1.8} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleGoals.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2" style={{ color: C.textMuted }}>
              <Target size={30} strokeWidth={1.2} />
              <p className="text-[12px]">Brak celów w tym widoku</p>
            </div>
          ) : (
            <div className="w-full">
              {priorityGoals.length > 0 && (
                <section className="mb-5">
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.textMuted }}>Priorytetowe</p>
                  <div className={layout === "grid" ? "goals-card-grid grid grid-cols-2 gap-3" : "space-y-3"}>
                    {priorityGoals.map((goal) => (
                      <GoalCard key={goal.id} goal={goal} selected={selectedId === goal.id} grid={layout === "grid"} onSelect={() => setSelectedId(selectedId === goal.id ? null : goal.id)} />
                    ))}
                  </div>
                </section>
              )}

              {remainingGoals.length > 0 && (
                <section>
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.textMuted }}>
                    {priorityGoals.length > 0 ? "Pozostałe cele" : filterLabel}
                  </p>
                  <div className={layout === "grid" ? "goals-card-grid grid grid-cols-2 gap-3" : "space-y-3"}>
                    {remainingGoals.map((goal) => (
                      <GoalCard key={goal.id} goal={goal} selected={selectedId === goal.id} grid={layout === "grid"} onSelect={() => setSelectedId(selectedId === goal.id ? null : goal.id)} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      <aside
        className={`goals-side-panel w-[370px] flex-shrink-0 border-l ${selectedGoal ? "goals-side-panel-selected" : ""}`}
        style={{ background: C.subSidebar, borderColor: C.borderSubtle }}
      >
        {selectedGoal ? (
          <GoalDetail
            goal={selectedGoal}
            note={notes[selectedGoal.id]}
            onNoteChange={(value) => setNotes((current) => ({ ...current, [selectedGoal.id]: value }))}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <SummaryPanel onFilter={handleFilter} />
        )}
      </aside>
    </div>
  );
}
