import { useEffect, useId, useRef, useState } from "react";
import type React from "react";
import type { LucideIcon } from "lucide-react";
import type {
  Goal as StoredGoal,
  GoalCategory,
  GoalStatus as StoredGoalStatus,
} from "./goalsModel";
import { ThemedSelect } from "./GoalDialogs";
import { GoalNoteTextarea } from "./GoalNoteTextarea";
import type { GoalFilterId as FilterId } from "./goalViewState";
import {
  C,
  CATEGORY_ICONS,
  FILTER_ITEMS,
  STATUS_META,
  countForFilter,
  deadlineColor,
  type Goal,
  type GoalStatus,
} from "./goalPresentationModel";
import {
  Badge,
  Button,
  ContextNavGroup,
  ContextNavItem,
  ModuleSidebar,
  Menu,
  MenuItem,
  ProgressBar,
} from "../ui";
import { AddToTasksButton } from "../ui";
import type { ExternalTaskInput } from "../data/taskLinks";
import {
  Archive,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Ellipsis,
  Flag,
  Pencil,
  Plus,
  Search,
  Settings2,
  Target,
  Trash2,
  X,
} from "lucide-react";

const GOALS_SIDEBAR_STATE_KEY = "rootine.goals.sidebar.v1";

function loadGoalsCategoriesOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const value = JSON.parse(window.localStorage.getItem(GOALS_SIDEBAR_STATE_KEY) ?? "null") as { categoriesOpen?: unknown } | null;
    return value?.categoriesOpen === true;
  } catch {
    return false;
  }
}

export function GoalSubSidebar({
  activeFilter,
  scopedGoalId,
  onFilter,
  goals,
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onSettings,
}: {
  activeFilter: FilterId;
  scopedGoalId?: string | null;
  onFilter: (id: FilterId) => void;
  goals: Goal[];
  categories: GoalCategory[];
  onCreateCategory: (draft: Omit<GoalCategory, "id">) => void;
  onUpdateCategory: (id: string, patch: Partial<GoalCategory>) => void;
  onDeleteCategory: (id: string) => void;
  onSettings: () => void;
}) {
  const [categoriesOpen, setCategoriesOpen] = useState(loadGoalsCategoriesOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editMode, setEditMode] = useState(false);
  const categoriesPanelId = useId();
  const filteredCategories = categories.filter((category) => category.label.toLocaleLowerCase("pl-PL").includes(search.toLocaleLowerCase("pl-PL")));

  useEffect(() => {
    if (activeFilter.startsWith("category:")) setCategoriesOpen(true);
  }, [activeFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem(GOALS_SIDEBAR_STATE_KEY, JSON.stringify({ categoriesOpen }));
    } catch {
      // A sidebar preference is optional and must not block goal management.
    }
  }, [categoriesOpen]);

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

  const item = (id: FilterId, label: string, Icon: LucideIcon, meta?: React.ReactNode, accessibleLabel?: string) => {
    const active = !scopedGoalId && activeFilter === id;
    return (
      <ContextNavItem
        key={id}
        active={active}
        onClick={() => onFilter(id)}
        icon={<Icon />}
        label={label}
        meta={meta}
        aria-label={accessibleLabel}
      />
    );
  };

  return (
    <ModuleSidebar label="Widoki i kategorie celów" className="goal-context-sidebar">
      <div className="goal-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-4">
        <ContextNavGroup label="Na bieżąco">
          {item("next", "Następne kroki", Clock3)}
          {item("week", "Ten tydzień", CalendarDays)}
          {item("risk", "Wymagają uwagi", FILTER_ITEMS.find((filter) => filter.id === "risk")!.icon, <span className="goal-sidebar-attention-count">{countForFilter("risk", goals)}</span>, "Zagrożone cele")}
        </ContextNavGroup>

        <ContextNavGroup label="Cele">
          {item("overview", "Aktywne", BarChart3, countForFilter("overview", goals), "Aktywne cele")}
          {item("planned", "Zaplanowane", FILTER_ITEMS.find((filter) => filter.id === "planned")!.icon, countForFilter("planned", goals))}
          {item("paused", "Wstrzymane", FILTER_ITEMS.find((filter) => filter.id === "paused")!.icon, countForFilter("paused", goals))}
          {item("completed", "Zakończone", FILTER_ITEMS.find((filter) => filter.id === "completed")!.icon, countForFilter("completed", goals))}
          {item("all", "Wszystkie", Target, countForFilter("all", goals), "Wszystkie cele")}
        </ContextNavGroup>

        <div className={`goal-sidebar-section-heading${categoriesOpen || searchOpen || adding ? " is-open" : ""}`}>
          <button
            type="button"
            onClick={() => setCategoriesOpen((open) => !open)}
            aria-expanded={categoriesOpen}
            aria-controls={categoriesPanelId}
            className="goal-sidebar-section-toggle flex min-w-0 flex-1 items-center gap-1.5"
          >
            <ChevronRight className="goal-sidebar-section-chevron" size={11} strokeWidth={2} />
            <span>Kategorie</span>
          </button>
          <div className="goal-sidebar-section-actions flex items-center gap-1">
            <button
              type="button"
              aria-label="Szukaj w kategoriach"
              title="Szukaj w kategoriach"
              onClick={() => { setCategoriesOpen(true); setSearchOpen((open) => !open); }}
              className={`goal-sidebar-icon-action flex h-6 w-6 items-center justify-center rounded-md ${searchOpen ? "is-active" : ""}`}
            >
              <Search size={13} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label={editMode ? "Zakończ edycję kategorii" : "Edytuj kategorie"}
              aria-pressed={editMode}
              title={editMode ? "Zakończ edycję kategorii" : "Edytuj kategorie"}
              onClick={() => { setCategoriesOpen(true); setEditMode((open) => {
                if (open) setEditingId(null);
                return !open;
              }); }}
              className={`goal-sidebar-icon-action flex h-6 w-6 items-center justify-center rounded-md ${editMode ? "is-active" : ""}`}
            >
              <Pencil size={13} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Dodaj kategorię"
              title="Dodaj kategorię"
              onClick={() => { setCategoriesOpen(true); setAdding(true); }}
              className={`goal-sidebar-icon-action flex h-6 w-6 items-center justify-center rounded-md ${adding ? "is-active" : ""}`}
            >
              <Plus size={13} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {categoriesOpen && (
          <div id={categoriesPanelId} className="space-y-1">
            {searchOpen && (
              <div className="px-1 pb-1">
                <div className="goal-category-search flex items-center gap-2 rounded-lg border px-2.5 py-2">
                  <Search className="goal-category-symbol" size={11} strokeWidth={1.7} />
                  <input
                    autoFocus
                    aria-label="Szukaj kategorii"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Szukaj kategorii"
                    className="goal-category-input min-w-0 flex-1 bg-transparent outline-none"
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Wyczyść wyszukiwanie kategorii"
                      onClick={() => setSearch("")}
                      className="goal-category-clear"
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {adding && (
              <form
                onSubmit={(event) => { event.preventDefault(); addCategory(); }}
                className="goal-category-add mx-1 flex items-center gap-1.5 rounded-lg border px-2 py-1.5"
              >
                <Circle className="goal-category-symbol" size={11} />
                <input
                  autoFocus
                  aria-label="Nazwa nowej kategorii"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Escape") setAdding(false); }}
                  placeholder="Nowa kategoria"
                  className="goal-category-input goal-category-input--primary min-w-0 flex-1 bg-transparent outline-none"
                />
                <button type="submit" aria-label="Zapisz kategorię" className="goal-category-confirm"><Check size={11} strokeWidth={2.2} /></button>
                <button type="button" aria-label="Anuluj" onClick={() => setAdding(false)} className="goal-category-cancel"><X size={11} /></button>
              </form>
            )}

            {filteredCategories.map((category) => {
              const active = !scopedGoalId && activeFilter === `category:${category.id}`;
              const count = goals.filter((goal) => goal.categoryId === category.id && goal.status !== "archived").length;
              return (
                <div key={category.id} className="group flex min-h-8 items-center rounded-lg">
                  {editingId === category.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); saveCategory(category.id); }} className="goal-category-edit flex min-w-0 flex-1 items-center gap-1.5 px-2.5">
                      <span className="goal-category-dot" style={{ "--goal-category-color": category.color } as React.CSSProperties} aria-hidden="true" />
                      <input
                        autoFocus
                        aria-label={`Nazwa kategorii ${category.label}`}
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onBlur={() => saveCategory(category.id)}
                        onKeyDown={(event) => { if (event.key === "Escape") setEditingId(null); }}
                        className="goal-category-edit-input min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 outline-none"
                      />
                    </form>
                  ) : (
                    <ContextNavItem
                      onClick={() => onFilter(`category:${category.id}`)}
                      className="min-w-0 flex-1"
                      active={active}
                      icon={<span className="goal-category-dot" style={{ "--goal-category-color": category.color } as React.CSSProperties} />}
                      label={category.label}
                      meta={count}
                    />
                  )}
                  {editMode && editingId !== category.id && (
                    <div className="goal-category-actions is-editing flex flex-shrink-0 items-center pr-1">
                      <button
                        type="button"
                        aria-label={`Edytuj kategorię ${category.label}`}
                        title="Edytuj"
                        onClick={() => { setEditingId(category.id); setEditingValue(category.label); }}
                        className="goal-category-action flex h-6 w-6 items-center justify-center rounded-md"
                      >
                        <Pencil size={11} strokeWidth={1.7} />
                      </button>
                      {category.id !== "personal" && <button
                          type="button"
                          aria-label={`Usuń kategorię ${category.label}`}
                          title="Usuń"
                          onClick={() => onDeleteCategory(category.id)}
                          className="goal-category-action is-danger flex h-6 w-6 items-center justify-center rounded-md"
                        >
                          <Trash2 size={11} strokeWidth={1.7} />
                        </button>}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredCategories.length === 0 && (
              <p className="goal-category-empty px-2.5 py-2">
                Nie znaleziono kategorii.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="goal-sidebar-footer border-t px-2 pb-4 pt-4">
        <ContextNavGroup label="Zarządzanie">
          <ContextNavItem active={activeFilter === "archived"} onClick={() => onFilter("archived")} icon={<Archive />} label="Archiwum" />
          <ContextNavItem onClick={onSettings} icon={<Settings2 />} label="Ustawienia celów" />
        </ContextNavGroup>
      </div>
    </ModuleSidebar>
  );
}

function StatusPill({ status }: { status: GoalStatus }) {
  const meta = STATUS_META[status];
  const tone = status === "completed" ? "success" : status === "risk" ? "warning" : status === "active" ? "primary" : "neutral";
  return (
    <Badge tone={tone} className="h-7 rounded-lg">
      {meta.label}
      <ChevronDown size={11} strokeWidth={1.7} />
    </Badge>
  );
}

export function GoalCard({
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
  onEdit: (returnFocus?: HTMLElement | null) => void;
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
  const dueColor = deadlineColor(goal);
  const deadlineTone = dueColor === C.danger ? "danger" : dueColor === C.warning ? "warning" : "neutral";

  return (
    <article
      className={`goal-card group border ${grid ? "goal-card-grid" : ""} ${selected ? "is-selected" : ""}`}
      data-status={goal.status}
      style={{
        "--goal-progress": `${goal.progress}%`,
      } as React.CSSProperties}
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
          >
            {goal.customIcon
              ? <img src={goal.customIcon} alt="" className="h-5 w-5 object-contain" />
              : <Icon size={16} strokeWidth={1.6} aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex flex-1 flex-col">
            <h3 className="goal-card-title ui-record-title truncate">
              {goal.title}
            </h3>
            <div className="goal-card-meta ui-record-meta order-2 mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="flex items-center gap-1 font-medium">
                <CategoryIcon size={13} strokeWidth={1.7} aria-hidden="true" /> {goal.category}
              </span>
              <span>•</span>
              <span>{goal.progressLabel}</span>
              {goal.nextMilestone.title && <><span>•</span><span className="goal-card-next" title={goal.nextMilestone.title}>Następny: {goal.nextMilestone.title}</span></>}
            </div>
            <div className="order-1 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div
                className="goal-card-inline-date inline-flex h-7 items-center gap-1.5 rounded-lg border px-2"
                data-deadline-tone={deadlineTone}
              >
                <CalendarDays size={13} strokeWidth={1.7} aria-hidden="true" />
                <span className="goal-card-inline-date__date font-medium">{goal.due}</span>
                <span className="goal-card-inline-date__days">· {goal.daysLeft}</span>
              </div>
              <div className="goal-card-progress flex flex-1 items-center gap-3">
                <div className="goal-card-progress-track h-1 flex-1 overflow-hidden rounded-full">
                  <div className="goal-card-progress-fill h-full rounded-full" />
                </div>
                <span className="goal-card-progress-value w-9 text-right font-semibold tabular-nums">
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
                layer="context"
                className="absolute right-0 top-9 w-40"
              >
                {(["active", "paused", "completed", "planned", "archived"] as GoalStatus[]).map((status) => (
                  <MenuItem className="goal-status-menu-item" data-goal-status={status} key={status} selected={goal.status === status} onClick={() => { onStatus(status); setStatusOpen(false); }} leadingIcon={<span className="goal-status-dot h-1.5 w-1.5 rounded-full" />}>
                    {STATUS_META[status].label}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </div>

          <div className="goal-card-date flex items-center gap-2 font-medium" data-deadline-tone={deadlineTone}>
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
              className="flex items-center justify-center rounded-lg transition-colors"
            >
              <Ellipsis size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {menuOpen && (
              <Menu
                id={actionsMenuId}
                triggerRef={menuTriggerRef}
                onDismiss={() => setMenuOpen(false)}
                layer="context"
                className="absolute right-0 top-9 w-44"
              >
                {[
                  { label: goal.rhythm === "Cel etapowy" ? "Dodaj etap" : goal.rhythm === "Wartość liczbowa" ? "Zaktualizuj wartość" : goal.rhythm === "Regularność" ? "Zapisz wykonanie" : "Zaktualizuj postęp", icon: BarChart3, action: onProgress },
                  { label: "Edytuj cel", icon: Pencil, action: () => onEdit(menuTriggerRef.current) },
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
    </article>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="goal-panel-section-title mb-3 font-semibold uppercase">{title}</h3>
      {children}
    </section>
  );
}

function DetailRow({ icon: Icon, label, children, onClick }: { icon: LucideIcon; label: string; children: React.ReactNode; onClick?: () => void }) {
  const content = (
    <>
      <Icon className="goal-detail-row__icon" size={13} strokeWidth={1.6} aria-hidden="true" />
      <span className="goal-detail-row__label flex-1">{label}</span>
      <div className="goal-detail-row__value flex items-center gap-1.5 text-right">{children}</div>
      {onClick && <ChevronRight className="goal-detail-row__chevron" size={11} strokeWidth={1.7} aria-hidden="true" />}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="goal-detail-row flex min-h-10 w-full items-center gap-2.5 border-b py-3 text-left last:border-b-0"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="goal-detail-row flex min-h-10 w-full items-center gap-2.5 border-b py-3 text-left last:border-b-0">
      {content}
    </div>
  );
}

export function GoalDetail({
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
  addToTasksInput,
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
  addToTasksInput?: ExternalTaskInput;
}) {
  const Icon = goal.icon;
  const CategoryIcon = CATEGORY_ICONS[goal.category] ?? Circle;
  const priorityLabel = goal.priority === "high" ? "Wysoki" : goal.priority === "medium" ? "Średni" : "Niski";
  const dueColor = deadlineColor(goal);
  const deadlineTone = dueColor === C.danger ? "danger" : dueColor === C.warning ? "warning" : "neutral";
  const measurementLabel = rawGoal.progressMode === "milestones"
    ? "Etapy"
    : rawGoal.progressMode === "regularity"
      ? rawGoal.regularityMode === "frequency" ? "Wykonania" : "Dni serii"
      : rawGoal.progressMode === "manual" ? "Postęp" : "Wartość";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="goal-detail-scroll flex-1 overflow-y-auto px-5 pb-5 pt-4">
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={onClose} aria-label="Zamknij szczegóły celu" className="goal-detail-close flex h-8 w-8 items-center justify-center rounded-lg">
            <X size={18} strokeWidth={1.7} />
          </button>
        </div>

        <div className="flex items-start gap-3">
          <div className="goal-detail-panel-icon flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border">
            {goal.customIcon ? <img src={goal.customIcon} alt="" className="h-6 w-6 object-contain" /> : <Icon size={18} strokeWidth={1.55} />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="goal-detail-panel-title font-semibold">{goal.title}</h2>
            <p className="goal-detail-panel-meta mt-1.5 flex items-center gap-1">
              <CategoryIcon size={11} /> {goal.category}
              <span className="goal-detail-panel-separator">•</span>
              <span className="goal-detail-panel-rhythm">{goal.rhythm}</span>
            </p>
          </div>
          <div className="goal-detail-status-select"><ThemedSelect compact value={rawGoal.status} onChange={(value) => onStatus(value as StoredGoalStatus)} options={[{ value: "planned", label: "Zaplanowany" }, { value: "active", label: "Aktywny" }, { value: "paused", label: "Wstrzymany" }, { value: "completed", label: "Zakończony" }, { value: "archived", label: "Archiwum" }]} ariaLabel="Status celu" /></div>
        </div>

        <div className="goal-detail-progress-section my-5 border-y py-4">
          <div className="mb-3 flex items-end justify-between">
            <span className="goal-detail-panel-progress font-semibold">{goal.progress}%</span>
            <span className="goal-detail-panel-progress-label">{goal.progressLabel}</span>
          </div>
          <ProgressBar
            className="goal-detail-progress-bar"
            value={goal.progress}
            label={`Postęp celu ${goal.title}`}
            valueText={`${goal.progress}%`}
          />
          <button type="button" onClick={rawGoal.progressMode === "milestones" ? onAddMilestone : onProgress} className="goal-detail-progress-action mt-3 flex items-center gap-1.5 font-medium"><Plus size={11} />{rawGoal.progressMode === "milestones" ? "Dodaj etap" : rawGoal.progressMode === "numeric" ? "Zaktualizuj wartość" : rawGoal.progressMode === "regularity" ? "Zapisz wykonanie" : "Zaktualizuj postęp"}</button>
        </div>

        <div className="mb-5">
          <DetailRow icon={CalendarDays} label="Termin" onClick={onEdit}>
            <span className="goal-deadline-text" data-deadline-tone={deadlineTone}>{goal.due}</span>
          </DetailRow>
          <DetailRow icon={Flag} label="Priorytet" onClick={onEdit}>
            <Flag className="goal-detail-priority-icon" size={11} />
            <span>{priorityLabel}</span>
          </DetailRow>
          <DetailRow icon={Target} label="Kategoria" onClick={onEdit}>
            <span>{goal.category}</span>
          </DetailRow>
          <DetailRow icon={BarChart3} label={measurementLabel} onClick={onProgress}>
            <span className="goal-detail-value--primary">{goal.progress}%</span>
          </DetailRow>
        </div>

        {rawGoal.progressMode === "milestones" && <>
          <PanelSection title="Najbliższy etap">
            <button type="button" onClick={() => {
              const next = [...rawGoal.milestones].filter((item) => !item.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
              if (next) onToggleMilestone(next.id, true); else onAddMilestone();
            }} className="goal-next-milestone w-full rounded-xl border p-3 text-left">
              <div className="flex items-start gap-2.5">
                <div className="goal-next-milestone__marker mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full border" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="goal-next-milestone__title font-medium">{goal.nextMilestone.title}</p>
                    <span className="goal-next-milestone__progress">{goal.nextMilestone.progress}%</span>
                  </div>
                  <p className="goal-next-milestone__meta mt-1">Plan: {goal.nextMilestone.date} · {goal.nextMilestone.daysLeft}</p>
                </div>
              </div>
            </button>
          </PanelSection>
          <div className="goal-detail-divider my-5 border-t" />
        </>}

        <PanelSection title="Stan celu">
          <dl className="goal-detail-snapshot">
            <div><dt>{measurementLabel}</dt><dd>{goal.current} / {goal.total}</dd></div>
            <div><dt>Ogólny postęp</dt><dd>{goal.progress}%</dd></div>
            <div><dt>Kondycja celu</dt><dd className="goal-status-value" data-goal-status={goal.status}>{goal.status === "risk" ? "Wymaga uwagi" : "Na planie"}</dd></div>
            <div><dt>Priorytet</dt><dd>{goal.priority === "high" ? "Wysoki" : goal.priority === "medium" ? "Średni" : "Niski"}</dd></div>
          </dl>
        </PanelSection>

        <div className="mt-5">
          <PanelSection title="Notatka">
            <GoalNoteTextarea
              key={goal.id}
              aria-label="Notatka do celu"
              value={note}
              onCommit={onNoteChange}
              rows={3}
              className="goal-detail-note-input w-full resize-none rounded-xl border p-3.5 outline-none"
            />
          </PanelSection>
        </div>
      </div>

      <div className="goal-detail-panel-footer border-t p-4">
        {addToTasksInput && <div className="mb-2"><AddToTasksButton input={addToTasksInput} /></div>}
        <Button type="button" variant="quiet" fullWidth onClick={onOpen}>
          Otwórz pełny widok celu
        </Button>
      </div>
    </div>
  );
}
