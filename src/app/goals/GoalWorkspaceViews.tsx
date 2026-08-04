import { useId, useRef, useState } from "react";
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
  CATEGORY_ICON_KEYS,
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
  ContextNavItem,
  ContextSidebar,
  Menu,
  MenuItem,
  SectionHeader,
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
  Ellipsis,
  Flag,
  FolderCog,
  Pencil,
  Plus,
  Search,
  Settings2,
  Target,
  Trash2,
  X,
} from "lucide-react";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <SectionHeader title={children} level={2} variant="label" className="px-1.5" />;
}

export function GoalSubSidebar({
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
  const categoriesPanelId = useId();

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
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SectionLabel>Główne</SectionLabel>
        <div className="mb-6">{item("overview", "Aktywne cele", BarChart3, countForFilter("overview", goals))}</div>

        <SectionLabel>Cele</SectionLabel>
        <div className="mb-6 space-y-px">
          {FILTER_ITEMS.map((filter) => item(filter.id, filter.label, filter.icon, countForFilter(filter.id, goals), filter.color))}
        </div>

        <div className="mb-2 flex items-center justify-between px-1.5">
          <button
            type="button"
            onClick={() => setCategoriesOpen((open) => !open)}
            aria-expanded={categoriesOpen}
            aria-controls={categoriesPanelId}
            className="flex min-w-0 items-center gap-1.5"
            style={{ color: C.textMuted }}
          >
            <ChevronRight size={11} strokeWidth={2} style={{ transform: categoriesOpen ? "rotate(90deg)" : "none", transition: "transform 150ms" }} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Kategorie</span>
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
          <div id={categoriesPanelId} className="space-y-1">
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
                        className="goal-category-action flex h-6 w-6 items-center justify-center rounded-md"
                        style={{ color: C.textMuted }}
                      >
                        <Pencil size={11} strokeWidth={1.7} />
                      </button>
                      {category.id !== "personal" && <button
                          type="button"
                          aria-label={`Usuń kategorię ${category.label}`}
                          title="Usuń"
                          onClick={() => onDeleteCategory(category.id)}
                          className="goal-category-action flex h-6 w-6 items-center justify-center rounded-md"
                          style={{ color: C.danger }}
                        >
                          <Trash2 size={11} strokeWidth={1.7} />
                        </button>}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredCategories.length === 0 && (
              <p className="px-2.5 py-2 text-[11px]" style={{ color: C.textMuted }}>
                Nie znaleziono kategorii.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t px-2 pb-4 pt-4" style={{ borderColor: C.borderSubtle, background: C.subSidebar }}>
        <SectionLabel>Zarządzanie</SectionLabel>
        <div className="space-y-px">
          <ContextNavItem onClick={() => setCategoriesOpen(true)} icon={<FolderCog />} label="Kategorie" />
          <ContextNavItem active={activeFilter === "archived"} onClick={() => onFilter("archived")} icon={<Archive />} label="Archiwum" />
          <ContextNavItem onClick={onSettings} icon={<Settings2 />} label="Ustawienia celów" />
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
        "--goal-color": goal.color,
        "--goal-progress": `${goal.progress}%`,
        "--goal-status-glow": `${statusColor}40`,
      } as React.CSSProperties}
    >
      <div className="goal-card-layout grid items-start gap-x-4 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={onOpen}
          title="Kliknij dwa razy, aby otworzyć pełny widok celu"
          aria-pressed={selected}
          aria-label={`${selected ? "Ukryj" : "Pokaż"} szczegóły celu ${goal.title}`}
          className="goal-card-primary flex min-w-0 items-center gap-3 border-0 bg-transparent p-0 text-left"
        >
          <div
            className="goal-card-icon flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border"
          >
            {goal.customIcon
              ? <img src={goal.customIcon} alt="" className="h-5 w-5 object-contain" />
              : <Icon size={17} strokeWidth={1.6} aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex flex-1 flex-col">
            <h3 className="goal-card-title ui-record-title truncate">
              {goal.title}
            </h3>
            <div className="goal-card-meta ui-record-meta order-2 mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1" style={{ color: C.textSecond }}>
              <span className="flex items-center gap-1 font-medium" style={{ color: C.textSecond }}>
                <CategoryIcon size={13} strokeWidth={1.7} aria-hidden="true" /> {goal.category}
              </span>
              <span>•</span>
              <span>{goal.progressLabel}</span>
            </div>
            <div className="order-1 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div
                className="goal-card-inline-date inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px]"
                style={{ color: dueColor, borderColor: dueColor === C.textSecond ? C.borderStrong : `${dueColor}35`, background: C.inputBg }}
              >
                <CalendarDays size={12} strokeWidth={1.7} aria-hidden="true" />
                <span className="font-medium" style={{ color: dueColor === C.textSecond ? C.textPrimary : dueColor }}>{goal.due}</span>
                <span style={{ color: C.textMuted }}>· {goal.daysLeft}</span>
              </div>
              <div className="flex min-w-[150px] flex-1 items-center gap-3">
                <div className="goal-card-progress-track h-1 flex-1 overflow-hidden rounded-full">
                  <div className="goal-card-progress-fill h-full rounded-full transition-all duration-500" />
                </div>
                <span className="goal-card-progress-value w-9 text-right text-[11px] font-semibold tabular-nums">
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

          <div className="goal-card-date flex items-center gap-2 text-[11px] font-medium" style={{ color: dueColor }}>
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
                  { label: goal.rhythm === "Cel etapowy" ? "Dodaj etap" : goal.rhythm === "Wartość liczbowa" ? "Zaktualizuj wartość" : goal.rhythm === "Regularność" ? "Zapisz wykonanie" : "Zaktualizuj postęp", icon: BarChart3, action: onProgress },
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
      <div className="goal-card-status-glow pointer-events-none h-px opacity-0 transition-opacity group-hover:opacity-100" />
    </article>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.textMuted }}>{title}</h3>
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
  const status = STATUS_META[goal.status];
  const priority = goal.priority === "high" ? { label: "Wysoki", color: C.textSecond } : goal.priority === "medium" ? { label: "Średni", color: C.textSecond } : { label: "Niski", color: C.textSecond };
  const dueColor = deadlineColor(goal);
  const measurementLabel = rawGoal.progressMode === "milestones"
    ? "Etapy"
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
            <h2 className="text-[var(--text-section)] font-semibold leading-5" style={{ color: C.textPrimary }}>{goal.title}</h2>
            <p className="mt-1.5 flex items-center gap-1 text-[11px]" style={{ color: C.textSecond }}>
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
            <span className="text-[11px]" style={{ color: C.textMuted }}>{goal.progressLabel}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: C.borderStrong }}>
            <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, background: goal.color }} />
          </div>
          <button type="button" onClick={rawGoal.progressMode === "milestones" ? onAddMilestone : onProgress} className="mt-3 flex items-center gap-1.5 text-[11px] font-medium" style={{ color: C.iceBlueText }}><Plus size={11} />{rawGoal.progressMode === "milestones" ? "Dodaj etap" : rawGoal.progressMode === "numeric" ? "Zaktualizuj wartość" : rawGoal.progressMode === "regularity" ? "Zapisz wykonanie" : "Zaktualizuj postęp"}</button>
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
          <PanelSection title="Najbliższy etap">
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
                  <p className="mt-1 text-[11px]" style={{ color: C.textMuted }}>Plan: {goal.nextMilestone.date} · {goal.nextMilestone.daysLeft}</p>
                </div>
              </div>
            </button>
          </PanelSection>
          <div className="my-5 border-t" style={{ borderColor: C.borderSubtle }} />
        </>}

        <PanelSection title="Ostatnia aktywność">
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: `${goal.current} / ${goal.total}`, label: measurementLabel, color: C.textPrimary },
              { value: `${goal.progress}%`, label: "Ogólny postęp", color: C.iceBlueText },
              { value: goal.status === "risk" ? "Wymaga uwagi" : "Na planie", label: "Kondycja celu", color: status.color },
              { value: goal.priority === "high" ? "Wysoki" : goal.priority === "medium" ? "Średni" : "Niski", label: "Priorytet", color: priority.color },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border p-2.5" style={{ background: C.panel, borderColor: C.borderSubtle }}>
                <p className="text-[13px] font-medium" style={{ color: stat.color, fontFamily: "'DM Mono', monospace" }}>{stat.value}</p>
                <p className="mt-1 text-[11px]" style={{ color: C.textMuted }}>{stat.label}</p>
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
        {addToTasksInput && <div className="mb-2"><AddToTasksButton input={addToTasksInput} /></div>}
        <Button type="button" variant="quiet" fullWidth onClick={onOpen}>
          Otwórz pełny widok celu
        </Button>
      </div>
    </div>
  );
}
