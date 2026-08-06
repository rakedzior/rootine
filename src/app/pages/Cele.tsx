import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useGoalsStore } from "../goals/goalsContext";
import { calendarDaysBetween, todayLocalDateKey } from "../data/localDate";
import { recordActivity } from "../experience/activityLog";
import { pluralize } from "../formatters";
import type {
  Goal as StoredGoal,
  GoalDraft,
  GoalStatus as StoredGoalStatus,
} from "../goals/goalsModel";
import {
  ConfirmDialog,
  GoalFormDialog,
  MilestoneDialog,
  ProgressDialog,
  ThemedSelect,
} from "../goals/GoalDialogs";
import type { GoalEditorData } from "../goals/GoalDialogs";
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
  CompletedSection,
  ContentHeader,
  DetailPanel,
  EmptyState,
  Menu,
  MenuItem,
  Modal,
  ModuleMain,
  ModuleShell,
  SectionHeader,
  Select,
} from "../ui";
import {
  Archive,
  Check,
  ChevronDown,
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
  C,
  FILTER_ITEMS,
  readLayoutPreference,
  readSortPreference,
  toViewGoal,
  type Goal,
  type GoalPriority,
  type GoalStatus,
  type ImportCandidate,
} from "../goals/goalPresentationModel";
import "../../styles/goals.css";

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
  const [quickGoalTitle, setQuickGoalTitle] = useState("");
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
    if (searchParams.get("akcja") === "nowy-cel") return;
    const canonical = writeGoalViewState(searchParams, { ...viewState, selectedId });
    if (canonical.toString() !== searchParams.toString()) {
      setSearchParams(canonical, { replace: true });
    }
  }, [searchParams, selectedId, setSearchParams, viewState]);

  useEffect(() => {
    if (searchParams.get("akcja") !== "nowy-cel") return;

    setQuickGoalTitle(searchParams.get("tytul")?.trim() ?? "");
    setGoalFormId("new");

    const next = new URLSearchParams(searchParams);
    ["akcja", "tytul", "data", "godzina", "priorytet"].forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => { try { localStorage.setItem("rootine.goals.layout", layout); } catch { /* preference persistence is best-effort */ } }, [layout]);
  useEffect(() => { try { localStorage.setItem("rootine.goals.sort", sortKey); } catch { /* preference persistence is best-effort */ } }, [sortKey]);

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

  const goalsRadar = useMemo(() => {
    const actionable = goals.filter((goal) => goal.status === "active" || goal.status === "risk");
    const risk = actionable.filter((goal) => goal.status === "risk" || goal.daysLeft.includes("po terminie"));
    const upcoming = [...actionable]
      .map((goal) => ({ goal, days: calendarDaysBetween(todayLocalDateKey(), storedGoals.find((item) => item.id === String(goal.id))?.dueDate ?? "") ?? 99999 }))
      .filter(({ days }) => days >= 0)
      .sort((a, b) => a.days - b.days)[0]?.goal ?? null;
    return { risk, upcoming };
  }, [goals, storedGoals]);

  const selectedGoal = goals.find((goal) => goal.id === selectedId) ?? null;
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
  const ambientGoalProgress = selectedGoal?.progress ?? (visibleGoals.length
    ? visibleGoals.reduce((sum, goal) => sum + goal.progress, 0) / visibleGoals.length
    : 0);

  const handleFilter = (filter: FilterId) => {
    updateGoalViewState({ filter, selectedId: null });
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
    setGoalFormId(null);
    setQuickGoalTitle("");
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
    <ModuleShell
      pageWidth="standard"
      contextSidebar={(
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
      )}
      ambient={{
        scene: "goals",
        progress: ambientGoalProgress / 100,
        signal: `${selectedId ?? activeFilter}:${Math.round(ambientGoalProgress)}`,
      }}
    >
      <ModuleMain>
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
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )}

        <ContentHeader
          headingLevel={1}
          title={filterLabel}
          description={`${visibleGoals.length} ${visibleGoals.length === 1 ? "cel" : "celów"}`}
          mobileNavigation={<Select
              aria-label="Widok celów"
              compact
              fieldClassName="context-mobile-select goals-filter-select"
              value={activeFilter}
              options={[
                { value: "overview", label: "Aktywne cele" },
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
          actions={<div className="flex items-center gap-2">
            <div className="relative goals-sort">
              <Button ref={sortMenuTriggerRef} variant="quiet" size="sm" onClick={() => setSortMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={sortMenuOpen} aria-controls={sortMenuId} trailingIcon={<ChevronDown size={11} />}>
                Sortuj: <span className="goals-sort-label">{({ priority: "Priorytet", due: "Termin", progress: "Postęp", updated: "Ostatnia zmiana", name: "Nazwa" } as const)[sortKey]}</span>
              </Button>
              {sortMenuOpen && <Menu id={sortMenuId} triggerRef={sortMenuTriggerRef} onDismiss={() => setSortMenuOpen(false)} initialFocus="selected" layer="detail" className="absolute right-0 top-11 w-44">{([{ id: "priority", label: "Priorytet" }, { id: "due", label: "Termin" }, { id: "progress", label: "Postęp" }, { id: "updated", label: "Ostatnia zmiana" }, { id: "name", label: "Nazwa" }] as const).map((option) => <MenuItem key={option.id} selected={sortKey === option.id} onClick={() => { setGoalSort(option.id); setSortMenuOpen(false); }} trailingIcon={sortKey === option.id ? <Check size={11} /> : undefined}>{option.label}</MenuItem>)}</Menu>}
            </div>
            <div className="ui-view-switch" aria-label="Sposób wyświetlania celów">
              <Button variant="ghost" size="sm" iconOnly onClick={() => setGoalLayout("list")} aria-label="Widok listy" aria-pressed={layout === "list"}>
                <List size={16} strokeWidth={1.8} />
              </Button>
              <Button variant="ghost" size="sm" iconOnly onClick={() => setGoalLayout("grid")} aria-label="Widok kafelków" aria-pressed={layout === "grid"}>
                <Grid2X2 size={13} strokeWidth={1.8} />
              </Button>
            </div>
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
              {headerMenuOpen && <Menu id={headerMenuId} triggerRef={headerMenuTriggerRef} onDismiss={() => setHeaderMenuOpen(false)} layer="detail" className="absolute right-0 top-12 w-48">
                <MenuItem onClick={() => importInputRef.current?.click()} leadingIcon={<Archive />}>Importuj dane</MenuItem>
                <MenuItem onClick={exportGoals} leadingIcon={<NotebookPen />}>Eksportuj dane</MenuItem>
                <MenuItem onClick={() => { handleFilter("archived"); setHeaderMenuOpen(false); }} leadingIcon={<Archive />}>Otwórz archiwum</MenuItem>
                <MenuItem onClick={() => { setSettingsOpen(true); setHeaderMenuOpen(false); }} leadingIcon={<Settings2 />}>Ustawienia celów</MenuItem>
              </Menu>}
            </div>
            <Button className="ui-button--icon-mobile" variant="primary" onClick={() => setGoalFormId("new")} leadingIcon={<Plus size={16} strokeWidth={2} />}><span className="header-action-label">Dodaj cel</span></Button>
          </div>}
        />

        {activeFilter === "overview" && (
          <div className="goals-overview-summary" aria-label="Podsumowanie aktywnych celów">
            <span>{goalsRadar.risk.length === 0 ? "Brak zagrożeń" : `${goalsRadar.risk.length} ${pluralize(goalsRadar.risk.length, "zagrożony", "zagrożone", "zagrożonych")}`}</span>
            <span aria-hidden="true">·</span>
            <span>{goalsRadar.upcoming ? `Najbliższy termin ${goalsRadar.upcoming.due}` : "Brak nadchodzących terminów"}</span>
            <span aria-hidden="true">·</span>
            <span>{visibleGoals.length} aktywnych celów</span>
          </div>
        )}

        <div className="goals-content flex-1 overflow-y-auto px-7 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleGoals.length === 0 ? (
            <EmptyState className="h-full" icon={<Target size={18} strokeWidth={1.4} />} title="Brak celów w tym widoku" description="Zmień filtr albo dodaj nowy cel." action={<Button variant="primary" size="sm" onClick={() => setGoalFormId("new")} leadingIcon={<Plus size={13} />}>Dodaj cel</Button>} />
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

              {completedGoals.length > 0 && (
                <CompletedSection label="Ukończone cele" count={completedGoals.length} className="goals-completed-section">
                  <div className={layout === "grid" ? "goals-card-grid grid grid-cols-2 gap-3" : "space-y-3"}>
                    {completedGoals.map((goal) => (
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
            onEdit={() => setGoalFormId(String(selectedGoal.id))}
            onProgress={() => openProgressFor(String(selectedGoal.id))}
            onStatus={(status) => updateGoal(String(selectedGoal.id), { status, ...(status === "active" ? { health: "ontrack" as const } : {}) })}
            onAddMilestone={() => setMilestoneGoalId(String(selectedGoal.id))}
            onToggleMilestone={(id, done) => updateMilestone(String(selectedGoal.id), id, { done })}
            onOpen={() => navigate(`/cele/${selectedGoal.id}`)}
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
          initialTitle={goalFormId === "new" ? quickGoalTitle : undefined}
          categories={categories}
          onClose={() => {
            setGoalFormId(null);
            setQuickGoalTitle("");
          }}
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
          message={`Cel „${storedGoals.find((goal) => goal.id === deleteGoalId)?.title}” wraz z historią postępów i etapami zostanie usunięty.`}
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
        <div className="fixed bottom-5 left-1/2 z-[var(--layer-goal-toast)] flex -translate-x-1/2 items-center gap-4 rounded-xl border px-4 py-3 shadow-2xl" style={{ background: C.subSidebar, borderColor: C.borderStrong }}>
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
          size="md"
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
                ["Etapy", importCandidate.preview.milestoneCount],
                ["Wpisy postępu", importCandidate.preview.progressCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3" style={{ background: C.inputBg, borderColor: C.borderSubtle }}>
                  <dt className="text-[11px]" style={{ color: C.textMuted }}>{label}</dt>
                  <dd className="mt-1 text-[var(--text-section)] font-semibold tabular-nums" style={{ color: C.textPrimary }}>{value}</dd>
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
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-[11px] uppercase tracking-wider" style={{ color: C.textMuted }}>Domyślny widok</legend>
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
