import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useGoalsStore } from "../goals/goalsContext";
import { calendarDaysBetween, formatLocalDate, todayLocalDateKey } from "../data/localDate";
import { recordActivity } from "../experience/activityLog";
import { getRootineStorageItem, setRootineStorageItem } from "../data/accountStorage";
import type {
  Goal as StoredGoal,
  GoalDraft,
  GoalStatus as StoredGoalStatus,
} from "../goals/goalsModel";
import {
  GoalFormDialog,
  MilestoneDialog,
  ProgressDialog,
  ThemedSelect,
} from "../goals/GoalDialogs";
import type { GoalEditorData, GoalEditorInitialValues } from "../goals/GoalDialogs";
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
  Checkbox,
  CompletedSection,
  ConfirmDialog,
  ContentHeader,
  DetailPanel,
  EmptyState,
  ListRow,
  Menu,
  MenuItem,
  Modal,
  ModuleMain,
  ModuleShell,
  SectionSurface,
  SectionHeader,
  Select,
  SummaryStrip,
  Toast,
  ToastViewport,
} from "../ui";
import {
  Archive,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Ellipsis,
  Grid2X2,
  List,
  NotebookPen,
  Plus,
  Settings2,
  Target,
  X,
} from "lucide-react";

import {
  GoalCard,
  GoalDetail,
  GoalSubSidebar,
} from "../goals/GoalWorkspaceViews";
import {
  FILTER_ITEMS,
  STATUS_META,
  readLayoutPreference,
  readSortPreference,
  toViewGoal,
  type Goal,
  type GoalPriority,
  type GoalStatus,
  type ImportCandidate,
} from "../goals/goalPresentationModel";
import "../../styles/goals.css";

type GoalActionItem = {
  id: string;
  goalId: string;
  goalTitle: string;
  category: string;
  title: string;
  dueDate: string;
  milestoneId: string | null;
  stepNumber: number;
};

type GoalStepDepth = 1 | 2 | 3;

type GoalFormHistoryState = {
  rootineGoalFormId?: "new" | string;
};

const GOAL_STEP_DEPTH_KEY = "rootine.goals.next-step-depth";

function readGoalStepDepth(): GoalStepDepth {
  if (typeof window === "undefined") return 1;
  try {
    const saved = getRootineStorageItem(GOAL_STEP_DEPTH_KEY);
    return saved === "2" ? 2 : saved === "3" ? 3 : 1;
  } catch {
    return 1;
  }
}

export default function Cele() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const goalFormReturnFocusRef = useRef<HTMLElement | null>(null);
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
  const scopedGoalId = viewState.scopeId && storedGoals.some((goal) => goal.id === viewState.scopeId)
    ? viewState.scopeId
    : null;
  const selectedId = viewState.selectedId && storedGoals.some((goal) => goal.id === viewState.selectedId)
    ? viewState.selectedId
    : null;
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalFormId, setGoalFormId] = useState<"new" | string | null>(null);
  const [goalCommandPrefill, setGoalCommandPrefill] = useState<GoalEditorInitialValues>({});
  const [progressGoalId, setProgressGoalId] = useState<string | null>(null);
  const [milestoneGoalId, setMilestoneGoalId] = useState<string | null>(null);
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [deletedGoal, setDeletedGoal] = useState<StoredGoal | null>(null);
  const [importCandidate, setImportCandidate] = useState<ImportCandidate | null>(null);
  const [importNotice, setImportNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const [goalStepDepth, setGoalStepDepth] = useState<GoalStepDepth>(readGoalStepDepth);
  const previousHistoryGoalFormRef = useRef<"new" | string | null>(null);
  const goals = useMemo(() => storedGoals.map((goal) => toViewGoal(goal, categories)), [storedGoals, categories]);

  const openGoalForm = (id: "new" | string, returnFocus?: HTMLElement | null) => {
    goalFormReturnFocusRef.current = returnFocus ?? null;
    setGoalFormId(id);
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      state: {
        ...(location.state && typeof location.state === "object" ? location.state : {}),
        rootineGoalFormId: id,
      } satisfies GoalFormHistoryState,
    });
  };
  const closeGoalForm = (reason?: "navigation") => {
    setGoalCommandPrefill({});
    if (reason === "navigation") {
      setGoalFormId(null);
      return;
    }
    if ((location.state as GoalFormHistoryState | null)?.rootineGoalFormId) {
      navigate(-1);
      return;
    }
    setGoalFormId(null);
  };
  const openFullGoal = (id: string | number) => {
    const query = searchParams.toString();
    navigate(`/cele/${id}`, { state: { returnTo: query ? `/cele?${query}` : "/cele" } });
  };

  const updateGoalViewState = (patch: Partial<GoalViewState>) => {
    setSearchParams(writeGoalViewState(searchParams, { ...viewState, ...patch }));
  };
  const setSelectedGoalId = (goalId: string | null) => updateGoalViewState({ selectedId: goalId });
  const setGoalLayout = (nextLayout: GoalLayout) => updateGoalViewState({ layout: nextLayout });
  const setGoalSort = (nextSort: GoalSortKey) => updateGoalViewState({ sort: nextSort });

  useEffect(() => {
    const historyGoalFormId = (location.state as GoalFormHistoryState | null)?.rootineGoalFormId ?? null;
    if (historyGoalFormId) setGoalFormId(historyGoalFormId);
    else if (previousHistoryGoalFormRef.current) setGoalFormId(null);
    previousHistoryGoalFormRef.current = historyGoalFormId;
  }, [location.state]);

  useEffect(() => {
    if (searchParams.get("akcja") === "nowy-cel") return;
    const canonical = writeGoalViewState(searchParams, { ...viewState, scopeId: scopedGoalId, selectedId });
    if (canonical.toString() !== searchParams.toString()) {
      setSearchParams(canonical, { replace: true });
    }
  }, [scopedGoalId, searchParams, selectedId, setSearchParams, viewState]);

  useEffect(() => {
    if (searchParams.get("akcja") !== "nowy-cel") return;

    const requestedPriority = searchParams.get("priorytet");
    const requestedDueDate = searchParams.get("data");
    setGoalCommandPrefill({
      title: searchParams.get("tytul")?.trim() ?? "",
      ...(requestedDueDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDueDate)
        ? { dueDate: requestedDueDate }
        : {}),
      ...(requestedPriority === "low" || requestedPriority === "medium" || requestedPriority === "high"
        ? { priority: requestedPriority }
        : {}),
    });
    goalFormReturnFocusRef.current = null;
    setGoalFormId("new");

    const next = new URLSearchParams(searchParams);
    ["akcja", "tytul", "data", "godzina", "priorytet"].forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => { try { setRootineStorageItem("rootine.goals.layout", layout); } catch { /* preference persistence is best-effort */ } }, [layout]);
  useEffect(() => { try { setRootineStorageItem("rootine.goals.sort", sortKey); } catch { /* preference persistence is best-effort */ } }, [sortKey]);
  useEffect(() => {
    try { setRootineStorageItem(GOAL_STEP_DEPTH_KEY, String(goalStepDepth)); } catch { /* preference persistence is best-effort */ }
  }, [goalStepDepth]);

  const visibleGoals = useMemo(() => {
    let result: Goal[];
    if (activeFilter === "overview" || activeFilter === "active") {
      result = goals.filter((goal) => goal.status === "active" || goal.status === "risk");
    } else if (activeFilter === "all") result = goals.filter((goal) => goal.status !== "archived");
    else if (activeFilter === "ontrack") result = goals.filter((goal) => goal.status === "active");
    else if (activeFilter.startsWith("category:")) result = goals.filter((goal) => goal.categoryId === activeFilter.slice("category:".length) && goal.status !== "archived");
    else result = goals.filter((goal) => goal.status === activeFilter);

    const priorityOrder: Record<GoalPriority, number> = { high: 0, medium: 1, low: 2 };
    const scopedResult = scopedGoalId
      ? result.filter((goal) => String(goal.id) === scopedGoalId)
      : result;

    return [...scopedResult].sort((a, b) => {
      const rawA = storedGoals.find((goal) => goal.id === String(a.id));
      const rawB = storedGoals.find((goal) => goal.id === String(b.id));
      if (sortKey === "name") return a.title.localeCompare(b.title, "pl");
      if (sortKey === "progress") return b.progress - a.progress;
      if (sortKey === "due") return (rawA?.dueDate ?? "").localeCompare(rawB?.dueDate ?? "");
      if (sortKey === "updated") return (rawB?.updatedAt ?? "").localeCompare(rawA?.updatedAt ?? "");
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [activeFilter, goals, scopedGoalId, sortKey, storedGoals]);

  const goalsRadar = useMemo(() => {
    const actionable = goals.filter((goal) => goal.status === "active" || goal.status === "risk");
    const risk = actionable.filter((goal) => goal.status === "risk" || goal.daysLeft.includes("po terminie"));
    const upcoming = [...actionable]
      .map((goal) => ({ goal, days: calendarDaysBetween(todayLocalDateKey(), storedGoals.find((item) => item.id === String(goal.id))?.dueDate ?? "") ?? 99999 }))
      .filter(({ days }) => days >= 0)
      .sort((a, b) => a.days - b.days)[0]?.goal ?? null;
    return { risk, upcoming };
  }, [goals, storedGoals]);

  const goalActionItems = useMemo(() => {
    const actionTitle = (goal: StoredGoal) => {
      if (goal.progressMode === "numeric") return "Zaktualizuj wartość";
      if (goal.progressMode === "regularity") return "Zapisz wykonanie";
      return "Zaktualizuj postęp";
    };

    return storedGoals
      .filter((goal) => goal.status === "active" && (!scopedGoalId || goal.id === scopedGoalId))
      .flatMap<GoalActionItem>((goal) => {
        const viewGoal = goals.find((item) => String(item.id) === goal.id);
        const common = {
          goalId: goal.id,
          goalTitle: goal.title,
          category: viewGoal?.category ?? "Bez kategorii",
        };
        if (goal.progressMode === "milestones") {
          return goal.milestones
            .filter((milestone) => !milestone.done)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
            .map((milestone, index) => ({
              ...common,
              id: `${goal.id}:${milestone.id}`,
              title: milestone.title,
              dueDate: milestone.dueDate,
              milestoneId: milestone.id,
              stepNumber: index + 1,
            }));
        }
        return [{
          ...common,
          id: `${goal.id}:progress`,
          title: actionTitle(goal),
          dueDate: goal.dueDate,
          milestoneId: null,
          stepNumber: 1,
        }];
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.goalTitle.localeCompare(b.goalTitle, "pl"));
  }, [goals, scopedGoalId, storedGoals]);

  const agendaItems = useMemo(() => {
    if (activeFilter === "week") {
      const today = todayLocalDateKey();
      return goalActionItems.filter((item) => {
        const days = calendarDaysBetween(today, item.dueDate);
        return days !== null && days <= 7;
      });
    }
    if (activeFilter === "next") {
      const stepsPerGoal = new Map<string, number>();
      return goalActionItems.filter((item) => {
        const visibleSteps = stepsPerGoal.get(item.goalId) ?? 0;
        if (visibleSteps >= goalStepDepth) return false;
        stepsPerGoal.set(item.goalId, visibleSteps + 1);
        return true;
      });
    }
    return [];
  }, [activeFilter, goalActionItems, goalStepDepth]);

  const isAgendaView = activeFilter === "next" || activeFilter === "week";
  const showLayoutSwitch = !isAgendaView || activeFilter === "next";

  const selectedGoal = goals.find((goal) => goal.id === selectedId) ?? null;
  const scopedGoal = goals.find((goal) => String(goal.id) === scopedGoalId) ?? null;
  const nextStepGroups = useMemo(() => {
    if (activeFilter !== "next") return [];
    const grouped = new Map<string, GoalActionItem[]>();
    agendaItems.forEach((item) => {
      const items = grouped.get(item.goalId) ?? [];
      items.push(item);
      grouped.set(item.goalId, items);
    });
    return [...grouped.entries()]
      .map(([goalId, items]) => ({
        goal: goals.find((goal) => String(goal.id) === goalId),
        items,
      }))
      .filter((group): group is { goal: Goal; items: GoalActionItem[] } => Boolean(group.goal));
  }, [activeFilter, agendaItems, goals]);
  const shouldGroupPriority = activeFilter === "overview"
    || activeFilter === "active"
    || activeFilter === "all"
    || activeFilter.startsWith("category:");
  const collapseCompleted = activeFilter === "all" || activeFilter.startsWith("category:");
  const completedGoals = collapseCompleted
    ? visibleGoals.filter((goal) => goal.status === "completed")
    : [];
  const openVisibleGoals = collapseCompleted
    ? visibleGoals.filter((goal) => goal.status !== "completed")
    : visibleGoals;
  const priorityGoals = shouldGroupPriority
    ? openVisibleGoals.filter((goal) => goal.priority === "high" || goal.status === "risk")
    : [];
  const remainingGoals = openVisibleGoals.filter((goal) => !priorityGoals.includes(goal));

  const handleFilter = (filter: FilterId) => {
    updateGoalViewState({ filter, scopeId: null, selectedId: null });
  };

  const openProgressFor = (goalId: string) => {
    const goal = storedGoals.find((item) => item.id === goalId);
    if (goal?.progressMode === "milestones") setMilestoneGoalId(goalId);
    else setProgressGoalId(goalId);
  };

  const changeStatus = (goalId: string, status: GoalStatus) => {
    const goal = storedGoals.find((item) => item.id === goalId);
    if (status === "risk") updateGoal(goalId, { status: "active", health: "risk" });
    else updateGoal(goalId, { status: status as StoredGoalStatus, ...(status === "active" ? { health: "ontrack" as const } : {}) });
    if (goal) recordActivity({ moduleId: "goals", kind: "status", title: goal.title, detail: `Status: ${status}` });
  };

  const submitGoal = (data: GoalEditorData) => {
    if (goalFormId === "new") {
      const draft: GoalDraft = { ...data, initialValue: 0, milestones: [], progressEntries: [] };
      const id = createGoal(draft);
      recordActivity({ moduleId: "goals", kind: "create", title: data.title, detail: "Utworzono cel" });
      setSelectedGoalId(id);
    } else if (goalFormId) {
      updateGoal(goalFormId, data);
      recordActivity({ moduleId: "goals", kind: "save", title: data.title, detail: "Zaktualizowano cel" });
    }
    closeGoalForm();
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
    downloadJson(exportStore(), `rootine-cele-${todayLocalDateKey()}.json`);
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
      `rootine-cele-kopia-przed-importem-${todayLocalDateKey()}.json`,
    );
    const result = importStore(importCandidate.raw);
    if (!result.ok) {
      setImportNotice({ tone: "danger", message: result.error });
      return;
    }
    setImportCandidate(null);
    updateGoalViewState({ scopeId: null, selectedId: null });
    setImportNotice({
      tone: "success",
      message: `Zaimportowano ${importCandidate.preview.goalCount} celów. Poprzedni stan został pobrany jako kopia zapasowa.`,
    });
  };

  const filterLabel = activeFilter === "overview" || activeFilter === "active"
    ? "Aktywne cele"
    : activeFilter === "next"
      ? "Następne kroki"
      : activeFilter === "week"
        ? "Ten tydzień"
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
  const workspaceTitle = scopedGoal?.title ?? filterLabel;
  const workspaceDescription = isAgendaView
    ? `${scopedGoal ? `${filterLabel} · ` : ""}${agendaItems.length} ${agendaItems.length === 1 ? "krok do wykonania" : "kroków do wykonania"}`
    : `${scopedGoal ? `${filterLabel} · ` : ""}${visibleGoals.length} ${visibleGoals.length === 1 ? "cel" : "celów"}`;

  return (
    <ModuleShell
      pageWidth="standard"
      contextSidebar={(
        <GoalSubSidebar
          activeFilter={activeFilter}
          scopedGoalId={scopedGoalId}
          onFilter={handleFilter}
          goals={goals}
          categories={categories}
          onCreateCategory={createCategory}
          onUpdateCategory={updateCategory}
          onDeleteCategory={setDeleteCategoryId}
          onSettings={() => setSettingsOpen(true)}
        />
      )}
    >
      <ModuleMain>
        {importNotice && (
          <div
            role={importNotice.tone === "danger" ? "alert" : "status"}
            aria-live={importNotice.tone === "danger" ? "assertive" : "polite"}
            className={`goal-import-notice ${importNotice.tone === "danger" ? "is-danger" : "is-success"}`}
          >
            <span className="goal-import-notice__message">{importNotice.message}</span>
            <button
              type="button"
              aria-label="Zamknij komunikat importu"
              onClick={() => setImportNotice(null)}
              className="goal-import-notice__dismiss"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )}

        <ContentHeader
          headingLevel={1}
          title={workspaceTitle}
          description={workspaceDescription}
          mobileNavigation={<Select
              aria-label="Widok celów"
              compact
              fieldClassName="context-mobile-select goals-filter-select"
              value={activeFilter}
              options={[
                { value: "overview", label: "Aktywne cele" },
                { value: "next", label: "Następne kroki" },
                { value: "week", label: "Ten tydzień" },
                ...FILTER_ITEMS.map((item) => ({ value: item.id, label: item.label })),
                ...categories.map((category) => ({ value: `category:${category.id}`, label: category.label })),
                { value: "archived", label: "Archiwum" },
              ]}
              onChange={(event) => handleFilter(event.target.value as FilterId)}
            />}
          meta={storageFailed
            ? <Badge tone="danger">Brak zapisu lokalnego</Badge>
            : loadStatus === "corrupt"
              ? <Badge tone="danger">Oryginał danych zabezpieczony</Badge>
              : importNotice
                ? <Badge tone={importNotice.tone}>{importNotice.tone === "success" ? "Import zakończony" : "Błąd importu"}</Badge>
                : undefined}
          actions={<div className="goals-header-actions">
            {activeFilter === "next" && (
              <div className="ui-view-switch" aria-label="Liczba kroków pokazywanych dla każdego celu">
                <Button className="goal-step-depth__button" variant="ghost" size="sm" aria-pressed={goalStepDepth === 1} onClick={() => setGoalStepDepth(1)}>1 krok</Button>
                <Button className="goal-step-depth__button" variant="ghost" size="sm" aria-pressed={goalStepDepth === 2} onClick={() => setGoalStepDepth(2)}>2 kroki</Button>
                <Button className="goal-step-depth__button" variant="ghost" size="sm" aria-pressed={goalStepDepth === 3} onClick={() => setGoalStepDepth(3)}>3 kroki</Button>
              </div>
            )}
            {!isAgendaView && <div className="goals-sort">
              <Button ref={sortMenuTriggerRef} variant="quiet" size="sm" onClick={() => setSortMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={sortMenuOpen} aria-controls={sortMenuId} trailingIcon={<ChevronDown size={11} />}>
                Sortuj: {({ priority: "Priorytet", due: "Termin", progress: "Postęp", updated: "Ostatnia zmiana", name: "Nazwa" } as const)[sortKey]}
              </Button>
              {sortMenuOpen && <Menu id={sortMenuId} triggerRef={sortMenuTriggerRef} onDismiss={() => setSortMenuOpen(false)} initialFocus="selected" layer="detail" className="goals-sort-menu">{([{ id: "priority", label: "Priorytet" }, { id: "due", label: "Termin" }, { id: "progress", label: "Postęp" }, { id: "updated", label: "Ostatnia zmiana" }, { id: "name", label: "Nazwa" }] as const).map((option) => <MenuItem key={option.id} selected={sortKey === option.id} onClick={() => { setGoalSort(option.id); setSortMenuOpen(false); }} trailingIcon={sortKey === option.id ? <Check size={11} /> : undefined}>{option.label}</MenuItem>)}</Menu>}
            </div>}
            {showLayoutSwitch && <div className="ui-view-switch" aria-label="Sposób wyświetlania celów">
              <Button variant="ghost" size="sm" iconOnly onClick={() => setGoalLayout("list")} aria-label="Widok listy" aria-pressed={layout === "list"}>
                <List size={16} strokeWidth={1.8} />
              </Button>
              <Button variant="ghost" size="sm" iconOnly onClick={() => setGoalLayout("grid")} aria-label="Widok kafelków" aria-pressed={layout === "grid"}>
                <Grid2X2 size={13} strokeWidth={1.8} />
              </Button>
            </div>}
            <div className="goals-header-menu">
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
                <Ellipsis size={16} />
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
              {headerMenuOpen && <Menu id={headerMenuId} triggerRef={headerMenuTriggerRef} onDismiss={() => setHeaderMenuOpen(false)} layer="detail" className="goals-header-overflow-menu">
                <MenuItem onClick={() => importInputRef.current?.click()} leadingIcon={<Archive />}>Importuj dane</MenuItem>
                <MenuItem onClick={exportGoals} leadingIcon={<NotebookPen />}>Eksportuj dane</MenuItem>
                <MenuItem onClick={() => { handleFilter("archived"); setHeaderMenuOpen(false); }} leadingIcon={<Archive />}>Otwórz archiwum</MenuItem>
                <MenuItem onClick={() => { setSettingsOpen(true); setHeaderMenuOpen(false); }} leadingIcon={<Settings2 />}>Ustawienia celów</MenuItem>
              </Menu>}
            </div>
            <Button className="ui-button--icon-mobile" variant="primary" onClick={(event) => openGoalForm("new", event.currentTarget)} leadingIcon={<Plus size={13} />}><span className="header-action-label">Dodaj cel</span></Button>
          </div>}
        />

        {activeFilter === "overview" && (
          <SummaryStrip
            label="Podsumowanie aktywnych celów"
            className="goals-overview-summary ui-summary-strip--compact"
            items={[
              { label: "Aktywne cele", value: visibleGoals.length, note: "w tym widoku", tone: "primary" },
              { label: "Wymagają uwagi", value: goalsRadar.risk.length, note: goalsRadar.risk.length ? "zagrożone" : "brak zagrożeń", tone: goalsRadar.risk.length ? "warning" : "success" },
              { label: "Najbliższy termin", value: goalsRadar.upcoming?.due ?? "—", note: goalsRadar.upcoming ? "nadchodzący cel" : "brak terminu" },
            ]}
          />
        )}

        <div className="goals-content">
          {isAgendaView ? (
            agendaItems.length === 0 ? (
              <EmptyState
                className="goals-empty-state"
                icon={<CircleDot size={18} strokeWidth={1.4} />}
                title={activeFilter === "week" ? "Spokojny tydzień" : "Brak następnych kroków"}
                description={activeFilter === "week" ? "Żaden krok celu nie ma terminu w ciągu najbliższych siedmiu dni." : "Dodaj etap do aktywnego celu albo zapisz kolejną aktualizację."}
                action={<Button variant="primary" size="sm" onClick={(event) => openGoalForm("new", event.currentTarget)} leadingIcon={<Plus size={13} />}>Dodaj cel</Button>}
              />
            ) : (
              <section className="goal-agenda" aria-label={filterLabel}>
                <SectionHeader
                  title={activeFilter === "week"
                    ? "Do końca najbliższych 7 dni"
                    : goalStepDepth === 1
                      ? "Najbliższy krok z każdego aktywnego celu"
                      : `Do ${goalStepDepth} kolejnych kroków z każdego aktywnego celu`}
                  level={2}
                  variant="label"
                />
                {activeFilter === "next" ? (
                  <div className={`goal-next-groups${layout === "grid" ? " goal-next-groups--grid" : ""}`}>
                    {nextStepGroups.map(({ goal, items }) => {
                      const GoalIcon = goal.icon;
                      return (
                        <SectionSurface
                          key={goal.id}
                          className="goal-next-group"
                          data-goal-id={String(goal.id)}
                          aria-label={`Następne kroki celu ${goal.title}`}
                        >
                          <header className="goal-next-group__header">
                            <button
                              type="button"
                              className="goal-next-group__identity"
                              onClick={() => setSelectedGoalId(String(goal.id))}
                              aria-label={`Pokaż szybkie szczegóły celu ${goal.title}`}
                            >
                              <span className="goal-next-group__icon" aria-hidden="true">
                                {goal.customIcon
                                  ? <img src={goal.customIcon} alt="" />
                                  : <GoalIcon size={16} strokeWidth={1.7} />}
                              </span>
                              <span className="goal-next-group__copy">
                                <strong>{goal.title}</strong>
                                <span>{goal.category}</span>
                              </span>
                            </button>
                            <div className="goal-next-group__summary">
                              <Badge tone={goal.status === "completed" ? "success" : goal.status === "risk" ? "warning" : goal.status === "active" ? "primary" : "neutral"}>
                                {STATUS_META[goal.status].label}
                              </Badge>
                              <span className="goal-next-group__progress">{goal.progress}%</span>
                              <span className="goal-next-group__due"><CalendarDays size={12} aria-hidden="true" />{goal.due}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="goal-next-group__open"
                                onClick={() => openFullGoal(goal.id)}
                                trailingIcon={<ChevronRight size={13} aria-hidden="true" />}
                              >
                                Pełny widok
                              </Button>
                            </div>
                          </header>
                          <div className="goal-next-group__rows">
                            {items.map((item) => {
                              const days = calendarDaysBetween(todayLocalDateKey(), item.dueDate);
                              const dueTone = days !== null && days < 0 ? "danger" : days === 0 ? "primary" : days !== null && days <= 7 ? "warning" : "neutral";
                              const dueLabel = days !== null && days < 0
                                ? `${Math.abs(days)} dni po terminie`
                                : days === 0
                                  ? "Dzisiaj"
                                  : days === 1
                                    ? "Jutro"
                                    : formatLocalDate(item.dueDate);
                              return (
                                <ListRow
                                  key={item.id}
                                  className="goal-agenda-row"
                                  leading={item.milestoneId
                                    ? <Checkbox
                                        size="sm"
                                        aria-label={`Ukończ etap ${item.title}`}
                                        checked={false}
                                        onChange={() => updateMilestone(item.goalId, item.milestoneId!, { done: true })}
                                      />
                                    : <span className="goal-agenda-row__marker" aria-hidden="true"><CircleDot size={13} /></span>}
                                  title={item.title}
                                  titleLabel={`Pokaż szybkie szczegóły celu ${item.goalTitle}`}
                                  onTitleClick={() => setSelectedGoalId(item.goalId)}
                                  subtitle={<span>Krok {item.stepNumber}</span>}
                                  meta={<span className={`goal-agenda-row__date is-${dueTone}`}><CalendarDays size={11} aria-hidden="true" />{dueLabel}</span>}
                                  metaAlign="end"
                                  density="comfortable"
                                  selected={selectedId === item.goalId}
                                />
                              );
                            })}
                          </div>
                        </SectionSurface>
                      );
                    })}
                  </div>
                ) : (
                  <div className="goal-agenda__list">
                    {agendaItems.map((item) => {
                      const days = calendarDaysBetween(todayLocalDateKey(), item.dueDate);
                      const dueTone = days !== null && days < 0 ? "danger" : days === 0 ? "primary" : days !== null && days <= 7 ? "warning" : "neutral";
                      const dueLabel = days !== null && days < 0
                        ? `${Math.abs(days)} dni po terminie`
                        : days === 0
                          ? "Dzisiaj"
                          : days === 1
                            ? "Jutro"
                            : formatLocalDate(item.dueDate);
                      return (
                        <ListRow
                          key={item.id}
                          className="goal-agenda-row"
                          leading={item.milestoneId
                            ? <Checkbox
                                size="sm"
                                aria-label={`Ukończ etap ${item.title}`}
                                checked={false}
                                onChange={() => updateMilestone(item.goalId, item.milestoneId!, { done: true })}
                              />
                            : <span className="goal-agenda-row__marker" aria-hidden="true"><CircleDot size={13} /></span>}
                          title={item.title}
                          titleLabel={`Pokaż szybkie szczegóły celu ${item.goalTitle}`}
                          onTitleClick={() => setSelectedGoalId(item.goalId)}
                          subtitle={<><span>{item.goalTitle}</span><span aria-hidden="true"> · </span><span>Krok {item.stepNumber}</span><span aria-hidden="true"> · </span><span>{item.category}</span></>}
                          meta={<span className={`goal-agenda-row__date is-${dueTone}`}><CalendarDays size={11} aria-hidden="true" />{dueLabel}</span>}
                          metaAlign="end"
                          density="comfortable"
                          selected={selectedId === item.goalId}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            )
          ) : visibleGoals.length === 0 ? (
            <EmptyState className="goals-empty-state" icon={<Target size={18} strokeWidth={1.4} />} title="Brak celów w tym widoku" description="Zmień filtr albo dodaj nowy cel." action={<Button variant="primary" size="sm" onClick={(event) => openGoalForm("new", event.currentTarget)} leadingIcon={<Plus size={13} />}>Dodaj cel</Button>} />
          ) : (
            <div className="goals-card-sections">
              {priorityGoals.length > 0 && (
                <section className="goals-card-section">
                  <SectionHeader title="Priorytetowe" level={2} variant="label" />
                  <div className={layout === "grid" ? "goals-card-grid" : "goals-card-list"}>
                    {priorityGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        selected={selectedId === goal.id}
                        grid={layout === "grid"}
                        onSelect={() => setSelectedGoalId(selectedId === goal.id ? null : String(goal.id))}
                        onEdit={(returnFocus) => openGoalForm(String(goal.id), returnFocus)}
                        onProgress={() => openProgressFor(String(goal.id))}
                        onDuplicate={() => duplicateGoal(String(goal.id))}
                        onDelete={() => setDeleteGoalId(String(goal.id))}
                        onOpen={() => openFullGoal(goal.id)}
                        onStatus={(status) => changeStatus(String(goal.id), status)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {remainingGoals.length > 0 && (
                <section>
                  <SectionHeader title={priorityGoals.length > 0 ? "Pozostałe cele" : filterLabel} level={2} variant="label" />
                  <div className={layout === "grid" ? "goals-card-grid" : "goals-card-list"}>
                    {remainingGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        selected={selectedId === goal.id}
                        grid={layout === "grid"}
                        onSelect={() => setSelectedGoalId(selectedId === goal.id ? null : String(goal.id))}
                        onEdit={(returnFocus) => openGoalForm(String(goal.id), returnFocus)}
                        onProgress={() => openProgressFor(String(goal.id))}
                        onDuplicate={() => duplicateGoal(String(goal.id))}
                        onDelete={() => setDeleteGoalId(String(goal.id))}
                        onOpen={() => openFullGoal(goal.id)}
                        onStatus={(status) => changeStatus(String(goal.id), status)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {completedGoals.length > 0 && (
                <CompletedSection label="Ukończone cele" count={completedGoals.length}>
                  <div className={layout === "grid" ? "goals-card-grid" : "goals-card-list"}>
                    {completedGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        selected={selectedId === goal.id}
                        grid={layout === "grid"}
                        onSelect={() => setSelectedGoalId(selectedId === goal.id ? null : String(goal.id))}
                        onEdit={(returnFocus) => openGoalForm(String(goal.id), returnFocus)}
                        onProgress={() => openProgressFor(String(goal.id))}
                        onDuplicate={() => duplicateGoal(String(goal.id))}
                        onDelete={() => setDeleteGoalId(String(goal.id))}
                        onOpen={() => openFullGoal(goal.id)}
                        onStatus={(status) => changeStatus(String(goal.id), status)}
                      />
                    ))}
                  </div>
                </CompletedSection>
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
            onEdit={() => openGoalForm(String(selectedGoal.id))}
            onProgress={() => openProgressFor(String(selectedGoal.id))}
            onStatus={(status) => updateGoal(String(selectedGoal.id), { status, ...(status === "active" ? { health: "ontrack" as const } : {}) })}
            onAddMilestone={() => setMilestoneGoalId(String(selectedGoal.id))}
            onToggleMilestone={(id, done) => updateMilestone(String(selectedGoal.id), id, { done })}
            onOpen={() => openFullGoal(selectedGoal.id)}
            addToTasksInput={{
              source: {
                kind: "goals",
                entity: `${encodeURIComponent(String(selectedGoal.id))}/goal`,
                context: selectedGoal.title,
                href: `/cele/${encodeURIComponent(String(selectedGoal.id))}`,
              },
              text: selectedGoal.title,
              done: selectedGoal.status === "completed",
              calendarDate: storedGoals.find((goal) => goal.id === String(selectedGoal.id))?.dueDate,
              date: storedGoals.find((goal) => goal.id === String(selectedGoal.id))?.dueDate,
              priority: selectedGoal.priority,
              list: "cele",
              tags: ["cele"],
              notes: selectedGoal.note,
            }}
          />
        </DetailPanel>
      )}

      {goalFormId && (
        <GoalFormDialog
          goal={goalFormId === "new" ? null : storedGoals.find((goal) => goal.id === goalFormId)}
          initialValues={goalFormId === "new" ? goalCommandPrefill : undefined}
          categories={categories}
          returnFocusRef={goalFormReturnFocusRef}
          onClose={closeGoalForm}
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
          draftKey={`goal-${milestoneGoalId}`}
          onClose={() => setMilestoneGoalId(null)}
          onSubmit={(draft) => { addMilestone(milestoneGoalId, draft); setMilestoneGoalId(null); }}
        />
      )}

      {deleteGoalId && storedGoals.find((goal) => goal.id === deleteGoalId) && (
        <ConfirmDialog
          title={`Usunąć cel „${storedGoals.find((goal) => goal.id === deleteGoalId)?.title}”?`}
          confirmLabel="Usuń cel"
          onCancel={() => setDeleteGoalId(null)}
          onConfirm={() => {
            const deleted = deleteGoal(deleteGoalId);
            setDeletedGoal(deleted);
            if (selectedId === deleteGoalId || scopedGoalId === deleteGoalId) {
              updateGoalViewState({
                scopeId: scopedGoalId === deleteGoalId ? null : scopedGoalId,
                selectedId: selectedId === deleteGoalId ? null : selectedId,
              });
            }
            setDeleteGoalId(null);
          }}
        >
          <p className="ui-confirm-dialog__note">Cel „{storedGoals.find((goal) => goal.id === deleteGoalId)?.title}” wraz z historią postępów i etapami zostanie usunięty.</p>
        </ConfirmDialog>
      )}

      {deleteCategoryId && categories.find((category) => category.id === deleteCategoryId) && (
        <ConfirmDialog
          title={`Usunąć kategorię „${categories.find((category) => category.id === deleteCategoryId)?.label}”?`}
          confirmLabel="Usuń kategorię"
          onCancel={() => setDeleteCategoryId(null)}
          onConfirm={() => { if (activeFilter === `category:${deleteCategoryId}`) handleFilter("overview"); deleteCategory(deleteCategoryId); setDeleteCategoryId(null); }}
        >
          <p className="ui-confirm-dialog__note">Kategoria „{categories.find((category) => category.id === deleteCategoryId)?.label}” zostanie usunięta. Przypisane cele zostaną przeniesione do kategorii „Sprawy osobiste”.</p>
        </ConfirmDialog>
      )}

      {deletedGoal && (
        <ToastViewport>
          <Toast
            actionLabel="Cofnij"
            onAction={() => { restoreGoal(deletedGoal); setDeletedGoal(null); }}
            onDismiss={() => setDeletedGoal(null)}
          >
            Cel został usunięty.
          </Toast>
        </ToastViewport>
      )}

      {importCandidate && (
        <Modal
          title="Sprawdź import celów"
          description={`Plik: ${importCandidate.fileName}`}
          onClose={() => setImportCandidate(null)}
          size="md"
          footer={(
            <>
              <Button variant="ghost" onClick={() => setImportCandidate(null)}>Anuluj</Button>
              <Button variant="primary" onClick={confirmImport}>Pobierz kopię i importuj</Button>
            </>
          )}
        >
          <div className="goal-import-dialog-content">
            <p className="goal-import-copy">
              Import zastąpi obecne cele i kategorie. Tuż przed zmianą przeglądarka pobierze pełną kopię aktualnych danych celów.
            </p>
            <dl className="goal-import-stats">
              {[
                ["Cele", importCandidate.preview.goalCount],
                ["Aktywne cele", importCandidate.preview.activeCount],
                ["Kategorie", importCandidate.preview.categoryCount],
                ["Etapy", importCandidate.preview.milestoneCount],
                ["Wpisy postępu", importCandidate.preview.progressCount],
              ].map(([label, value]) => (
                <div key={label} className="goal-import-stat">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
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
          size="sm"
          footer={<Button variant="primary" size="sm" onClick={() => setSettingsOpen(false)}>Gotowe</Button>}
        >
          <div className="goal-settings-content">
            <fieldset>
              <legend className="goal-settings-legend">Domyślny widok</legend>
              <div className="goal-settings-layout-options">
                <button
                  type="button"
                  aria-pressed={layout === "list"}
                  onClick={() => setGoalLayout("list")}
                  className={`goal-settings-layout-option${layout === "list" ? " is-selected" : ""}`}
                >
                  <List size={13} aria-hidden="true" />Lista
                </button>
                <button
                  type="button"
                  aria-pressed={layout === "grid"}
                  onClick={() => setGoalLayout("grid")}
                  className={`goal-settings-layout-option${layout === "grid" ? " is-selected" : ""}`}
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
