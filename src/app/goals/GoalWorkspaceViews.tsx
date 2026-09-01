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
  PriorityIcon,
  ProgressBar,
} from "../ui";
import { AddToTasksButton } from "../ui";
import type { ExternalTaskInput } from "../data/taskLinks";
import { getRootineStorageItem, setRootineStorageItem } from "../data/accountStorage";
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
    const value = JSON.parse(getRootineStorageItem(GOALS_SIDEBAR_STATE_KEY) ?? "null") as { categoriesOpen?: unknown } | null;
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
      setRootineStorageItem(GOALS_SIDEBAR_STATE_KEY, JSON.stringify({ categoriesOpen }));
    } catch {
      // A sidebar preference is optional and must not block goal management.
    }
  }, [categoriesOpen]);

  const addCategory = () => {
    const label = newCategory.trim();
    if (!label) return;
    onCreateCategory({ label, iconKey: "circle", color: C.textSecondary });
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
      <div className="goal-sidebar-scroll">
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
            className="goal-sidebar-section-toggle"
          >
            <ChevronRight className="goal-sidebar-section-chevron" size={11} strokeWidth={2} />
            <span>Kategorie</span>
          </button>
          <div className="goal-sidebar-section-actions">
            <button
              type="button"
              aria-label="Szukaj w kategoriach"
              title="Szukaj w kategoriach"
              onClick={() => { setCategoriesOpen(true); setSearchOpen((open) => !open); }}
              className={`goal-sidebar-icon-action ${searchOpen ? "is-active" : ""}`}
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
              className={`goal-sidebar-icon-action ${editMode ? "is-active" : ""}`}
            >
              <Pencil size={13} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Dodaj kategorię"
              title="Dodaj kategorię"
              onClick={() => { setCategoriesOpen(true); setAdding(true); }}
              className={`goal-sidebar-icon-action ${adding ? "is-active" : ""}`}
            >
              <Plus size={13} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {categoriesOpen && (
          <div id={categoriesPanelId} className="goal-category-list">
            {searchOpen && (
              <div className="goal-category-search-wrap">
                <div className="goal-category-search">
                  <Search className="goal-category-symbol" size={11} strokeWidth={1.7} />
                  <input
                    autoFocus
                    aria-label="Szukaj kategorii"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Szukaj kategorii"
                    className="goal-category-input"
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
                className="goal-category-add"
              >
                <Circle className="goal-category-symbol" size={11} />
                <input
                  autoFocus
                  aria-label="Nazwa nowej kategorii"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Escape") setAdding(false); }}
                  placeholder="Nowa kategoria"
                  className="goal-category-input goal-category-input--primary"
                />
                <button type="submit" aria-label="Zapisz kategorię" className="goal-category-confirm"><Check size={11} strokeWidth={2.2} /></button>
                <button type="button" aria-label="Anuluj" onClick={() => setAdding(false)} className="goal-category-cancel"><X size={11} /></button>
              </form>
            )}

            {filteredCategories.map((category) => {
              const active = !scopedGoalId && activeFilter === `category:${category.id}`;
              const count = goals.filter((goal) => goal.categoryId === category.id && goal.status !== "archived").length;
              return (
                <div key={category.id} className="goal-category-row">
                  {editingId === category.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); saveCategory(category.id); }} className="goal-category-edit">
                      <span className="goal-category-dot" style={{ "--goal-category-color": category.color } as React.CSSProperties} aria-hidden="true" />
                      <input
                        autoFocus
                        aria-label={`Nazwa kategorii ${category.label}`}
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onBlur={() => saveCategory(category.id)}
                        onKeyDown={(event) => { if (event.key === "Escape") setEditingId(null); }}
                        className="goal-category-edit-input"
                      />
                    </form>
                  ) : (
                    <ContextNavItem
                      onClick={() => onFilter(`category:${category.id}`)}
                      className="goal-category-nav-item"
                      active={active}
                      icon={<span className="goal-category-dot" style={{ "--goal-category-color": category.color } as React.CSSProperties} />}
                      label={category.label}
                      meta={count}
                    />
                  )}
                  {editMode && editingId !== category.id && (
                    <div className="goal-category-actions is-editing">
                      <button
                        type="button"
                        aria-label={`Edytuj kategorię „${category.label}”`}
                        title="Edytuj"
                        onClick={() => { setEditingId(category.id); setEditingValue(category.label); }}
                        className="goal-category-action"
                      >
                        <Pencil size={11} strokeWidth={1.7} />
                      </button>
                      {category.id !== "personal" && <button
                          type="button"
                          aria-label={`Usuń kategorię „${category.label}”`}
                          title="Usuń"
                          onClick={() => onDeleteCategory(category.id)}
                          className="goal-category-action is-danger"
                        >
                          <Trash2 size={11} strokeWidth={1.7} />
                        </button>}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredCategories.length === 0 && (
              <p className="goal-category-empty">
                Nie znaleziono kategorii.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="goal-sidebar-footer">
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
    <Badge tone={tone} className="goal-status-pill">
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
      className={`goal-card ${grid ? "goal-card-grid" : ""} ${selected ? "is-selected" : ""}`}
      data-goal-id={String(goal.id)}
      data-status={goal.status}
      style={{
        "--goal-progress": `${goal.progress}%`,
      } as React.CSSProperties}
    >
      <div className="goal-card-layout">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`${selected ? "Ukryj" : "Pokaż"} szczegóły celu ${goal.title}`}
          className="goal-card-primary"
        >
          <div
            className="goal-card-icon"
          >
            {goal.customIcon
              ? <img src={goal.customIcon} alt="" className="goal-card-icon__image" />
              : <Icon size={16} strokeWidth={1.6} aria-hidden="true" />}
          </div>
          <div className="goal-card-copy">
            <h3 className="goal-card-title ui-record-title">
              {goal.title}
            </h3>
            <div className="goal-card-meta ui-record-meta">
              <span className="goal-card-category">
                <CategoryIcon size={13} strokeWidth={1.7} aria-hidden="true" /> {goal.category}
              </span>
              <span>•</span>
              <span>{goal.progressLabel}</span>
              {goal.nextMilestone.title && <><span>•</span><span className="goal-card-next" title={goal.nextMilestone.title}>Następny: {goal.nextMilestone.title}</span></>}
            </div>
            <div className="goal-card-summary">
              <div
                className="goal-card-inline-date"
                data-deadline-tone={deadlineTone}
              >
                <CalendarDays size={13} strokeWidth={1.7} aria-hidden="true" />
                <span className="goal-card-inline-date__date">{goal.due}</span>
                <span className="goal-card-inline-date__days">· {goal.daysLeft}</span>
              </div>
              <div className="goal-card-progress">
                <div className="goal-card-progress-track">
                  <div className="goal-card-progress-fill" />
                </div>
                <span className="goal-card-progress-value">
                  {goal.progress}%
                </span>
              </div>
            </div>
          </div>
        </button>

        <div className="goal-card-actions">
          <div className="goal-card-status">
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
                className="goal-card-status-menu"
              >
                {(["active", "paused", "completed", "planned", "archived"] as GoalStatus[]).map((status) => (
                  <MenuItem className="goal-status-menu-item" data-goal-status={status} key={status} selected={goal.status === status} onClick={() => { onStatus(status); setStatusOpen(false); }} leadingIcon={<span className="goal-status-dot" />}>
                    {STATUS_META[status].label}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </div>

          <div className="goal-card-date" data-deadline-tone={deadlineTone}>
            <CalendarDays size={13} strokeWidth={1.7} aria-hidden="true" />
            <span>{goal.due}</span>
          </div>

          <div className="goal-card-more">
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => { setMenuOpen((open) => !open); setStatusOpen(false); }}
              aria-label={`Więcej opcji dla celu ${goal.title}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={actionsMenuId}
              data-focus-return-key={`goal-actions-${goal.id}`}
              className="goal-card-more__button"
            >
              <Ellipsis size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {menuOpen && (
              <Menu
                id={actionsMenuId}
                triggerRef={menuTriggerRef}
                onDismiss={() => setMenuOpen(false)}
                layer="context"
                className="goal-card-actions-menu"
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
      <h3 className="goal-panel-section-title">{title}</h3>
      {children}
    </section>
  );
}

function DetailRow({ icon: Icon, leading, label, children, onClick }: { icon?: LucideIcon; leading?: React.ReactNode; label: string; children: React.ReactNode; onClick?: () => void }) {
  const content = (
    <>
      {leading ?? (Icon && <Icon className="goal-detail-row__icon" size={13} strokeWidth={1.6} aria-hidden="true" />)}
      <span className="goal-detail-row__label">{label}</span>
      <div className="goal-detail-row__value">{children}</div>
      {onClick && <ChevronRight className="goal-detail-row__chevron" size={11} strokeWidth={1.7} aria-hidden="true" />}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="goal-detail-row"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="goal-detail-row">
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
    <div className="goal-detail-panel-layout">
      <div className="goal-detail-scroll">
        <div className="goal-detail-close-row">
          <button type="button" onClick={onClose} aria-label="Zamknij szczegóły celu" className="goal-detail-close">
            <X size={18} strokeWidth={1.7} />
          </button>
        </div>

        <div className="goal-detail-panel-heading">
          <div className="goal-detail-panel-icon">
            {goal.customIcon ? <img src={goal.customIcon} alt="" className="goal-detail-panel-icon__image" /> : <Icon size={18} strokeWidth={1.55} />}
          </div>
          <div className="goal-detail-panel-copy">
            <h2 className="goal-detail-panel-title">{goal.title}</h2>
            <p className="goal-detail-panel-meta">
              <CategoryIcon size={11} /> {goal.category}
              <span className="goal-detail-panel-separator">•</span>
              <span className="goal-detail-panel-rhythm">{goal.rhythm}</span>
            </p>
          </div>
          <div className="goal-detail-status-select"><ThemedSelect compact value={rawGoal.status} onChange={(value) => onStatus(value as StoredGoalStatus)} options={[{ value: "planned", label: "Zaplanowany" }, { value: "active", label: "Aktywny" }, { value: "paused", label: "Wstrzymany" }, { value: "completed", label: "Zakończony" }, { value: "archived", label: "Archiwum" }]} ariaLabel="Status celu" /></div>
        </div>

        <div className="goal-detail-progress-section">
          <div className="goal-detail-progress-heading">
            <span className="goal-detail-panel-progress">{goal.progress}%</span>
            <span className="goal-detail-panel-progress-label">{goal.progressLabel}</span>
          </div>
          <ProgressBar
            className="goal-detail-progress-bar"
            value={goal.progress}
            label={`Postęp celu ${goal.title}`}
            valueText={`${goal.progress}%`}
          />
          <button type="button" onClick={rawGoal.progressMode === "milestones" ? onAddMilestone : onProgress} className="goal-detail-progress-action"><Plus size={11} />{rawGoal.progressMode === "milestones" ? "Dodaj etap" : rawGoal.progressMode === "numeric" ? "Zaktualizuj wartość" : rawGoal.progressMode === "regularity" ? "Zapisz wykonanie" : "Zaktualizuj postęp"}</button>
        </div>

        <div className="goal-detail-facts-block">
          <DetailRow icon={CalendarDays} label="Termin" onClick={onEdit}>
            <span className="goal-deadline-text" data-deadline-tone={deadlineTone}>{goal.due}</span>
          </DetailRow>
          <DetailRow leading={<PriorityIcon level={goal.priority} />} label="Priorytet" onClick={onEdit}>
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
            }} className="goal-next-milestone">
              <div className="goal-next-milestone__layout">
                <div className="goal-next-milestone__marker" />
                <div className="goal-next-milestone__copy">
                  <div className="goal-next-milestone__heading">
                    <p className="goal-next-milestone__title">{goal.nextMilestone.title}</p>
                    <span className="goal-next-milestone__progress">{goal.nextMilestone.progress}%</span>
                  </div>
                  <p className="goal-next-milestone__meta">Plan: {goal.nextMilestone.date} · {goal.nextMilestone.daysLeft}</p>
                </div>
              </div>
            </button>
          </PanelSection>
          <div className="goal-detail-divider" />
        </>}

        <PanelSection title="Stan celu">
          <dl className="goal-detail-snapshot">
            <div><dt>{measurementLabel}</dt><dd>{goal.current} / {goal.total}</dd></div>
            <div><dt>Ogólny postęp</dt><dd>{goal.progress}%</dd></div>
            <div><dt>Kondycja celu</dt><dd className="goal-status-value" data-goal-status={goal.status}>{goal.status === "risk" ? "Wymaga uwagi" : "Na planie"}</dd></div>
            <div><dt>Priorytet</dt><dd>{goal.priority === "high" ? "Wysoki" : goal.priority === "medium" ? "Średni" : "Niski"}</dd></div>
          </dl>
        </PanelSection>

        <div className="goal-detail-note-section">
          <PanelSection title="Notatka">
            <GoalNoteTextarea
              key={goal.id}
              aria-label="Notatka do celu"
              value={note}
              onCommit={onNoteChange}
              rows={3}
              className="goal-detail-note-input"
            />
          </PanelSection>
        </div>
      </div>

      <div className="goal-detail-panel-footer">
        {addToTasksInput && <div className="goal-detail-panel-add-task"><AddToTasksButton input={addToTasksInput} /></div>}
        <Button type="button" variant="quiet" fullWidth onClick={onOpen}>
          Otwórz pełny widok celu
        </Button>
      </div>
    </div>
  );
}
