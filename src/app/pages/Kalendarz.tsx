import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ChevronLeft, ChevronRight,
  CalendarDays, Check, List, Plus, Printer, RotateCcw, Trash2, X,
} from "lucide-react";
import { TaskDetail } from "./tasks/TaskViews";
import {
  selectTaskCalendarOccurrences,
  type CalendarOccurrence,
  type CalendarOccurrenceStatusKey,
} from "../data/calendarOccurrences";
import { persistTaskCompletion } from "../data/taskCompletion";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import {
  projectTaskOccurrences,
  setTaskOccurrenceCompletion,
  type TaskOccurrence,
} from "../data/taskSchedule";
import {
  isCalendarTask,
  isHabitDoneOnDate,
  isHabitScheduledOnDate,
  loadTaskWorkspaceResult,
  isTaskOwnedByTasksModule,
  replaceCalendarTasks,
  restoreTask,
  saveTaskWorkspace,
  setTaskDoneState,
  taskViewForCalendarDate,
  TASK_STORAGE_KEY,
  trashTask,
  type WorkspaceList as ListItem,
  type WorkspaceTag as TagItem,
  type WorkspaceTask as Task,
} from "../data/taskWorkspace";
import {
  AnchoredPopover,
  Badge,
  Button,
  ContentHeader,
  ContextNavItem,
  DetailPanel,
  ModuleSidebar,
  Menu,
  MenuItem,
  ModuleMain,
  ModuleShell,
  SectionHeader,
  Select,
  Toast,
  ToastViewport,
  uiColors,
} from "../ui";
import {
  loadTaskSidebarState,
  isTaskUndated,
  saveTaskSidebarState,
  SMART_VIEWS,
  PRIMARY_SMART_VIEWS,
  SPECIAL_SMART_VIEWS,
  VISIBLE_TAG_LIMIT,
  formatOpenTaskCount,
  saveTasksViewMode,
  smartDateViewRange,
  tasksForCalendarView,
  tasksForSmartDateView,
} from "./tasks/taskPageModel";
import { TaskReminderCenter } from "./tasks/TaskReminderCenter";
import { readModuleMemoryValue, writeModuleMemoryValue } from "../experience/moduleMemory";
import "../../styles/calendar.css";
import "../../styles/tasks.css";

const C = {
  bg: uiColors.appBg,
  grid: uiColors.appBg,
  border: uiColors.border,
  text: uiColors.textPrimary,
  second: uiColors.textSecondary,
  muted: uiColors.textTertiary,
  disabled: uiColors.textDisabled,
  blue: uiColors.primary,
  onAccent: "var(--color-on-accent)",
  blueText: uiColors.primaryText,
  blueSoft: uiColors.primarySubtle,
  panel: uiColors.surface1,
  hover: uiColors.surfaceHover,
} as const;

const MONTHS = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];
const WEEKDAYS = ["pon.", "wt.", "śr.", "czw.", "pt.", "sob.", "niedz."];

type CalendarEvent = Task & { calendarDate: string };
type CalendarMode = "full" | "compact" | "narrow";
type CalendarPriority = NonNullable<Task["priority"]>;
type CalendarFilter =
  | { kind: "all" }
  | { kind: "list"; id: string }
  | { kind: "tag"; id: string }
  | { kind: "priority"; id: CalendarPriority };

function isCalendarFilter(value: unknown): value is CalendarFilter {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  const candidate = value as { kind?: unknown; id?: unknown };
  if (candidate.kind === "all") return true;
  if (candidate.kind === "list" || candidate.kind === "tag") return typeof candidate.id === "string";
  return candidate.kind === "priority"
    && (candidate.id === "high" || candidate.id === "medium" || candidate.id === "low");
}

function isTasksCalendarEvent(task: Task): task is CalendarEvent {
  return isCalendarTask(task) && isTaskOwnedByTasksModule(task);
}

const CALENDAR_PRIORITIES: Array<{ id: CalendarPriority; label: string }> = [
  { id: "high", label: "Wysoki" },
  { id: "medium", label: "Średni" },
  { id: "low", label: "Niski" },
];

function getCalendarMode(width: number): CalendarMode {
  if (width >= 1160) return "full";
  if (width >= 760) return "compact";
  return "narrow";
}

function calendarPriorityClass(event: CalendarOccurrence) {
  if (event.kind !== "task") return "is-default";
  if (event.task.priority === "high") return "is-high";
  if (event.task.priority === "medium") return "is-medium";
  return "is-low";
}

function calendarPriorityColor(priority: Task["priority"]) {
  if (priority === "high") return uiColors.danger;
  if (priority === "medium") return uiColors.warning;
  return uiColors.primaryText;
}

function calendarFilterKey(filter: CalendarFilter) {
  return filter.kind === "all" ? "all" : `${filter.kind}:${filter.id}`;
}

function taskMatchesCalendarFilter(task: Task, filter: CalendarFilter) {
  if (filter.kind === "all") return true;
  if (filter.kind === "list") return task.list === filter.id;
  if (filter.kind === "tag") return task.tags?.includes(filter.id) ?? false;
  return task.priority === filter.id;
}

const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

function getCalendarCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const gridSize = Math.ceil((offset + daysInMonth) / 7) * 7;
  const cells: { year: number; month: number; day: number; current: boolean }[] = [];

  for (let i = offset - 1; i >= 0; i -= 1) {
    const d = new Date(year, month, -i);
    cells.push({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), current: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ year, month, day, current: true });
  }
  let nextDay = 1;
  while (cells.length < gridSize) {
    const d = new Date(year, month + 1, nextDay++);
    cells.push({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), current: false });
  }
  return cells;
}

function todayKey() {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatHeaderDate(value: Date) {
  return `${MONTHS[value.getMonth()]} ${value.getFullYear()}`;
}

function formatTaskDate(calendarDate: string) {
  const parsed = new Date(`${calendarDate}T12:00:00`);
  return parsed.toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" });
}

function formatCalendarDayTitle(calendarDate: string) {
  const parsed = new Date(`${calendarDate}T12:00:00`);
  return parsed.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
}

function formatCalendarOccurrenceCount(count: number) {
  if (count === 1) return "1 zadanie";
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) return `${count} zadania`;
  return `${count} zadań`;
}

function shiftCalendarDate(calendarDate: string, amount: number) {
  const parsed = new Date(`${calendarDate}T12:00:00`);
  parsed.setDate(parsed.getDate() + amount);
  return dateKey(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function occurrenceStatusTone(status: CalendarOccurrenceStatusKey) {
  if (status === "completed") return "success" as const;
  if (status === "incomplete" || status === "waiting" || status === "in_progress") return "warning" as const;
  if (status === "missed") return "danger" as const;
  if (status === "automatic") return "neutral" as const;
  return "primary" as const;
}

const currencyFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function CalendarEventBar({ event, mode, dragging, onClick, onToggle, onMoveByDay, onDragStart, onDragEnd }: {
  event: CalendarOccurrence;
  mode: CalendarMode;
  dragging: boolean;
  onClick: (trigger: HTMLButtonElement) => void;
  onToggle?: () => void;
  onMoveByDay?: (amount: number) => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  if (mode !== "full") {
    return (
      <span
        className={`calendar-event calendar-event--dot ${calendarPriorityClass(event)}`}
        aria-hidden="true"
        title={`${event.title || "Wpis bez nazwy"}${event.time ? ` · ${event.time}` : ""}`}
      />
    );
  }

  const task = event.kind === "task" ? event.task : null;
  const virtual = task?.occurrence.virtual ?? false;
  const draggable = Boolean(task && !virtual);
  return (
    <div
      role="group"
      aria-label={`${event.source.label}: ${event.title || "bez nazwy"}; status ${event.status.label}${virtual ? "; wystąpienie cykliczne" : ""}${event.source.context ? `; ${event.source.context}` : ""}`}
      className={`calendar-event${task ? "" : " calendar-event--readonly"}${draggable ? " is-draggable" : ""}${dragging ? " is-dragging" : ""}`}
      draggable={draggable}
      aria-grabbed={draggable ? dragging : undefined}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      {task && onToggle && (
        <button
          type="button"
          aria-label={event.status.completed ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          onKeyDown={(e) => e.stopPropagation()}
          className={`task-checkbox task-checkbox--compact ${event.status.completed ? "is-checked" : ""}`}
          style={{ "--task-checkbox-color": event.status.completed ? C.blueText : C.second } as React.CSSProperties}
        >
          {event.status.completed && <span className="calendar-event__checkmark">✓</span>}
        </button>
      )}
      <button
        type="button"
        data-calendar-event-id={task?.id ?? event.key}
        aria-label={`Otwórz szczegóły: ${event.title || "bez nazwy"}`}
        aria-describedby={draggable ? "calendar-keyboard-move-instructions" : undefined}
        aria-keyshortcuts={draggable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
        onClick={(e) => { e.stopPropagation(); onClick(e.currentTarget); }}
        onKeyDown={(keyboardEvent) => {
          if (!draggable || !onMoveByDay) return;
          if (!keyboardEvent.altKey || (keyboardEvent.key !== "ArrowLeft" && keyboardEvent.key !== "ArrowRight")) return;
          keyboardEvent.preventDefault();
          keyboardEvent.stopPropagation();
          onMoveByDay(keyboardEvent.key === "ArrowLeft" ? -1 : 1);
        }}
        className="calendar-event__trigger"
      >
        <span className={`calendar-event__title${event.status.completed ? " is-completed" : ""}`} title={event.title}>{event.title}</span>
        {virtual && <span className="calendar-event__recurrence" aria-hidden="true" title="Wystąpienie cykliczne">↻</span>}
        {/* The source label only earns space when the entry comes from another module. In a task
            calendar "Zadania" is redundant, and as a non-shrinking element it used to consume the
            whole chip and collapse the task name to zero width. */}
        {event.source.kind !== "task" && (
          <span className="calendar-event__source">{event.source.label}</span>
        )}
        {event.time && <span className="calendar-event__time">{event.time}</span>}
      </button>
    </div>
  );
}

function CalendarDayPanel({
  calendarDate,
  events,
  mode,
  onClose,
  onAddTask,
  onSelectEvent,
  onToggle,
}: {
  calendarDate: string;
  events: CalendarOccurrence[];
  mode: CalendarMode;
  onClose: () => void;
  onAddTask: () => void;
  onSelectEvent: (event: CalendarOccurrence, trigger: HTMLElement) => void;
  onToggle: (occurrence: TaskOccurrence) => void;
}) {
  const headingId = `calendar-day-panel-${calendarDate}`;
  return (
    <aside className={`calendar-day-panel calendar-day-panel--${mode}`} aria-labelledby={headingId}>
      <header className="calendar-day-panel__header">
        <div className="calendar-day-panel__heading">
          <h2 id={headingId}>{formatCalendarDayTitle(calendarDate)}</h2>
          <p>{formatCalendarOccurrenceCount(events.length)}</p>
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij listę dnia" onClick={onClose}>
          <X size={13} />
        </Button>
      </header>

      {events.length > 0 ? (
        <div className="calendar-day-panel__list" role="list">
          {events.map((event) => {
            const task = event.kind === "task" ? event.task : null;
            return (
              <div key={event.key} className="calendar-day-panel__row" role="listitem">
                {task ? (
                  <button
                    type="button"
                    aria-label={event.status.completed ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"}
                    className={`task-checkbox calendar-day-panel__checkbox ${event.status.completed ? "is-checked" : ""}`}
                    style={{ "--task-checkbox-color": calendarPriorityColor(task.priority) } as React.CSSProperties}
                    onClick={() => onToggle(task)}
                  >
                    {event.status.completed && <Check size={9} strokeWidth={2.5} />}
                  </button>
                ) : (
                  <span className={`calendar-day-panel__source-dot ${calendarPriorityClass(event)}`} aria-hidden="true" />
                )}
                <button
                  type="button"
                  className="calendar-day-panel__task"
                  onClick={(clickEvent) => onSelectEvent(event, clickEvent.currentTarget)}
                  aria-label={`Otwórz szczegóły: ${event.title || "bez nazwy"}`}
                >
                  <span className="calendar-day-panel__task-title">{event.title || "Wpis bez nazwy"}</span>
                  {event.source.kind !== "task" && <span className="calendar-day-panel__task-meta">{event.source.label}</span>}
                </button>
                {event.time && <time className="calendar-day-panel__time">{event.time}</time>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="calendar-day-panel__empty">
          <p>Brak zadań w tym dniu.</p>
          <Button variant="quiet" size="sm" leadingIcon={<Plus size={13} strokeWidth={1.7} />} onClick={onAddTask}>
            Dodaj zadanie
          </Button>
        </div>
      )}

      {events.length > 0 && (
        <footer className="calendar-day-panel__footer">
          <Button variant="quiet" size="sm" leadingIcon={<Plus size={13} strokeWidth={1.7} />} onClick={onAddTask}>
            Dodaj zadanie
          </Button>
        </footer>
      )}
    </aside>
  );
}

export default function Kalendarz() {
  const now = new Date();
  const [initialWorkspaceLoad] = useState(loadTaskWorkspaceResult);
  const [initialWorkspace] = useState(() => initialWorkspaceLoad.workspace);
  const initialSidebarState = loadTaskSidebarState();
  const activeTaskView = "wszystkie";
  const [viewDate, setViewDate] = useState(() => {
    const rememberedMonth = readModuleMemoryValue(
      "calendar",
      "month",
      (value): value is string => typeof value === "string" && /^\d{4}-\d{2}$/.test(value),
    );
    if (!rememberedMonth) return new Date(now.getFullYear(), now.getMonth(), 1);
    const [year, month] = rememberedMonth.split("-").map(Number);
    return new Date(year, month - 1, 1);
  });
  const [events, setEvents] = useState<CalendarEvent[]>(() => initialWorkspace.tasks.filter(isTasksCalendarEvent));
  const [lists, setLists] = useState<ListItem[]>(initialWorkspace.lists);
  const [tags, setTags] = useState<TagItem[]>(initialWorkspace.tags);
  const [listyOpen, setListyOpen] = useState(initialSidebarState.listyOpen);
  const [tagiOpen, setTagiOpen] = useState(initialSidebarState.tagiOpen);
  const [showAllLists, setShowAllLists] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>(() => (
    readModuleMemoryValue("calendar", "filter", isCalendarFilter) ?? { kind: "all" }
  ));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedOccurrenceDate, setSelectedOccurrenceDate] = useState<string | null>(null);
  const [selectedExternalKey, setSelectedExternalKey] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [anchorDateKey, setAnchorDateKey] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState({ left: 8, top: 73, width: 440, height: 400, ready: false });
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const [agendaDateKey, setAgendaDateKey] = useState<string | null>(null);
  const [calendarAnnouncement, setCalendarAnnouncement] = useState("");
  const [calendarWidth, setCalendarWidth] = useState<number | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(() => todayKey());

  const [trashedTask, setTrashedTask] = useState<CalendarEvent | null>(null);
  const calendarRootRef = useRef<HTMLDivElement>(null);
  const calendarViewMonthRef = useRef(`${viewDate.getFullYear()}-${viewDate.getMonth()}`);
  const detailRef = useRef<HTMLDivElement>(null);
  const agendaTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);
  const detailInitialFocusIdRef = useRef<string | null>(null);
  const skipDetailHistoryRef = useRef(false);
  const pendingKeyboardMoveRef = useRef<{ id: number; dateKey: string } | null>(null);
  const workspaceRef = useRef(initialWorkspace);
  const [taskWorkspaceHydrated, setTaskWorkspaceHydrated] = useState(() => initialWorkspaceLoad.status !== "missing");
  const suppressCellClickRef = useRef(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [focusedDateKey, setFocusedDateKey] = useState(todayKey);
  const sidebarTasks = workspaceRef.current.tasks.filter(isTaskOwnedByTasksModule);
  const calendarMode: CalendarMode = calendarWidth === null ? "full" : getCalendarMode(calendarWidth);
  const visibleEventLimit = 3;
  const hideCalendarTime = calendarMode !== "full";

  useEffect(() => {
    writeModuleMemoryValue(
      "calendar",
      "month",
      `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`,
    );
  }, [viewDate]);

  useEffect(() => {
    writeModuleMemoryValue("calendar", "filter", calendarFilter);
  }, [calendarFilter]);

  useLayoutEffect(() => {
    const root = calendarRootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      const width = root.getBoundingClientRect().width;
      if (width > 0) setCalendarWidth(width);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    saveTasksViewMode("calendar");
    saveTaskSidebarState({ taskView: "wszystkie", listFilter: null, tagFilter: null });
    const url = new URL(window.location.href);
    if (url.searchParams.has("widok")) {
      url.searchParams.delete("widok");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    if (!taskWorkspaceHydrated) return;
    const persistedEvents = events.filter((event) => event.text.trim().length > 0);
    const nextWorkspace = replaceCalendarTasks(workspaceRef.current, persistedEvents);
    setStorageFailed(!saveTaskWorkspace(nextWorkspace));
    workspaceRef.current = nextWorkspace;
  }, [events, taskWorkspaceHydrated]);

  useEffect(() => {
    const syncWorkspace = () => {
      const result = loadTaskWorkspaceResult();
      const nextWorkspace = result.workspace;
      workspaceRef.current = nextWorkspace;
      setEvents(nextWorkspace.tasks.filter(isTasksCalendarEvent));
      setLists(nextWorkspace.lists);
      setTags(nextWorkspace.tags);
      setSelectedId((current) => current !== null && nextWorkspace.tasks.some((task) => task.id === current && isCalendarTask(task)) ? current : null);
      if (result.status !== "missing") setTaskWorkspaceHydrated(true);
    };
    const unsubscribe = subscribeToLocalWorkspace(TASK_STORAGE_KEY, syncWorkspace);
    return unsubscribe;
  }, []);

  const cells = useMemo(() => getCalendarCells(viewDate.getFullYear(), viewDate.getMonth()), [viewDate]);
  const calendarRows = useMemo(
    () => Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7)),
    [cells],
  );
  const scopedEventIds = useMemo(
    () => new Set(tasksForCalendarView(events, activeTaskView, todayKey()).map((task) => task.id)),
    [activeTaskView, events],
  );
  const filteredEvents = useMemo(
    () => events.filter((event) => scopedEventIds.has(event.id) && taskMatchesCalendarFilter(event, calendarFilter)),
    [calendarFilter, events, scopedEventIds],
  );
  const openCalendarCount = useMemo(
    () => filteredEvents.filter((event) => !event.deleted && !event.done).length,
    [filteredEvents],
  );
  const openUndatedCount = useMemo(() => (
    sidebarTasks.filter((task) => {
      if (task.deleted || task.done || task.calendarDate) return false;
      const viewMatch = activeTaskView === "wszystkie"
        ? true
        : activeTaskView === "bezterminu"
          ? isTaskUndated(task)
          : task.view === activeTaskView;
      return viewMatch && taskMatchesCalendarFilter(task, calendarFilter);
    }).length
  ), [activeTaskView, calendarFilter, sidebarTasks]);
  const calendarFilterChoices = useMemo(() => [
    { value: "all", label: "Wszystkie zadania", filter: { kind: "all" } as CalendarFilter },
    ...lists.map((list) => ({
      value: `list:${list.id}`,
      label: `Lista: ${list.label}`,
      filter: { kind: "list", id: list.id } as CalendarFilter,
    })),
    ...tags.map((tag) => ({
      value: `tag:${tag.id}`,
      label: `Tag: #${tag.label}`,
      filter: { kind: "tag", id: tag.id } as CalendarFilter,
    })),
    ...CALENDAR_PRIORITIES.map((priority) => ({
      value: `priority:${priority.id}`,
      label: `Priorytet: ${priority.label}`,
      filter: { kind: "priority", id: priority.id } as CalendarFilter,
    })),
  ], [lists, tags]);
  const listUsage = useMemo(() => sidebarTasks.reduce<Record<string, number>>((counts, task) => {
    if (!task.deleted && task.list) counts[task.list] = (counts[task.list] ?? 0) + 1;
    return counts;
  }, {}), [sidebarTasks]);
  const tagUsage = useMemo(() => sidebarTasks.reduce<Record<string, number>>((counts, task) => {
    if (!task.deleted) for (const tag of task.tags ?? []) counts[tag] = (counts[tag] ?? 0) + 1;
    return counts;
  }, {}), [sidebarTasks]);
  const sidebarViewCounts = useMemo(() => {
    const habits = workspaceRef.current.habits;
    const currentDay = todayKey();
    return Object.fromEntries(SMART_VIEWS.map((view) => {
      if (view.id === "nawyki") {
        return [view.id, habits.filter((habit) => isHabitScheduledOnDate(habit, currentDay) && !isHabitDoneOnDate(habit, currentDay)).length];
      }
      const taskSource = smartDateViewRange(view.id, currentDay)
        ? tasksForSmartDateView(sidebarTasks, view.id, currentDay).tasks
        : sidebarTasks;
      return [
        view.id,
        view.id === "bezterminu"
          ? sidebarTasks.filter((task) => !task.deleted && !task.done && isTaskUndated(task)).length
          : taskSource.filter((task) => !task.deleted && !task.done && (
            view.id === "wszystkie" || view.id === "podsumowanie" || smartDateViewRange(view.id, currentDay)
              ? true
              : task.view === view.id
          )).length,
      ];
    }));
  }, [sidebarTasks]);
  const visibleLists = useMemo(() => [...lists]
    .sort((a, b) => (listUsage[b.id] ?? 0) - (listUsage[a.id] ?? 0))
    .slice(0, showAllLists ? undefined : VISIBLE_TAG_LIMIT), [listUsage, lists, showAllLists]);
  const visibleTags = useMemo(() => [...tags]
    .sort((a, b) => (tagUsage[b.id] ?? 0) - (tagUsage[a.id] ?? 0))
    .slice(0, showAllTags ? undefined : VISIBLE_TAG_LIMIT), [showAllTags, tagUsage, tags]);
  const visibleOccurrences = useMemo(() => {
    const first = cells[0];
    const last = cells.at(-1);
    if (!first || !last) return [] as CalendarOccurrence[];
    return selectTaskCalendarOccurrences(
      filteredEvents,
      dateKey(first.year, first.month, first.day),
      dateKey(last.year, last.month, last.day),
    ).filter((occurrence) => !occurrence.status.completed);
  }, [cells, filteredEvents]);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarOccurrence[]>();
    visibleOccurrences.forEach((event) => grouped.set(event.calendarDate, [...(grouped.get(event.calendarDate) ?? []), event]));
    return grouped;
  }, [visibleOccurrences]);
  const selectedDayOccurrences = selectedCalendarDate ? eventsByDate.get(selectedCalendarDate) ?? [] : [];
  const selectedTask = selectedId === null ? null : events.find((event) => event.id === selectedId && !event.deleted) ?? null;
  const selectedExternalOccurrence = selectedExternalKey === null
    ? null
    : visibleOccurrences.find((occurrence) => occurrence.kind !== "task" && occurrence.key === selectedExternalKey) ?? null;
  const selectedVirtualOccurrence = useMemo(() => {
    if (!selectedTask || !selectedOccurrenceDate) return null;
    return projectTaskOccurrences(
      [selectedTask],
      selectedOccurrenceDate,
      selectedOccurrenceDate,
    ).find((occurrence) => occurrence.occurrence.virtual) ?? null;
  }, [selectedOccurrenceDate, selectedTask]);
  const selectedDetailId = selectedTask
    ? `task:${selectedTask.id}`
    : selectedExternalOccurrence?.key ?? null;

  useEffect(() => {
    if (cells.some((cell) => dateKey(cell.year, cell.month, cell.day) === focusedDateKey)) return;
    const today = todayKey();
    const next = cells.find((cell) => dateKey(cell.year, cell.month, cell.day) === today) ?? cells[0];
    if (next) setFocusedDateKey(dateKey(next.year, next.month, next.day));
  }, [cells, focusedDateKey]);

  useEffect(() => {
    const currentViewMonth = `${viewDate.getFullYear()}-${viewDate.getMonth()}`;
    const previousViewMonth = calendarViewMonthRef.current;
    calendarViewMonthRef.current = currentViewMonth;
    if (!selectedCalendarDate || previousViewMonth === currentViewMonth) return;
    const parsed = new Date(`${selectedCalendarDate}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    const day = Math.min(parsed.getDate(), new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate());
    const nextDate = dateKey(viewDate.getFullYear(), viewDate.getMonth(), day);
    if (nextDate !== selectedCalendarDate) setSelectedCalendarDate(nextDate);
  }, [selectedCalendarDate, viewDate]);

  useLayoutEffect(() => {
    const pending = pendingKeyboardMoveRef.current;
    if (!pending) return;
    const frame = requestAnimationFrame(() => {
      const movedEvent = calendarRootRef.current?.querySelector<HTMLElement>(
        `[data-calendar-event-id="${pending.id}"]`,
      );
      const destinationCell = calendarRootRef.current?.querySelector<HTMLElement>(
        `[data-calendar-cell="${pending.dateKey}"]`,
      );
      (movedEvent ?? destinationCell)?.focus();
      pendingKeyboardMoveRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [events, viewDate]);

  const focusCalendarCell = (index: number) => {
    const next = cells[Math.max(0, Math.min(cells.length - 1, index))];
    if (!next) return;
    const key = dateKey(next.year, next.month, next.day);
    setFocusedDateKey(key);
    requestAnimationFrame(() => {
      calendarRootRef.current?.querySelector<HTMLElement>(`[data-calendar-cell="${key}"]`)?.focus();
    });
  };

  const handleCellKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number, key: string) => {
    if (event.target !== event.currentTarget) return;
    const movement: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in movement) {
      event.preventDefault();
      focusCalendarCell(index + movement[event.key]);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusCalendarCell(event.key === "Home" ? index - (index % 7) : index + (6 - (index % 7)));
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const current = new Date(`${key}T12:00:00`);
      current.setMonth(current.getMonth() + (event.key === "PageUp" ? -1 : 1));
      const nextKey = dateKey(current.getFullYear(), current.getMonth(), current.getDate());
      setViewDate(new Date(current.getFullYear(), current.getMonth(), 1));
      setFocusedDateKey(nextKey);
      requestAnimationFrame(() => {
        calendarRootRef.current?.querySelector<HTMLElement>(`[data-calendar-cell="${nextKey}"]`)?.focus();
      });
    }
  };

  useLayoutEffect(() => {
    if ((!selectedTask && !selectedExternalOccurrence) || !anchorDateKey) return;
    const repositionDetail = () => {
      const cell = calendarRootRef.current?.querySelector<HTMLElement>(`[data-calendar-cell="${anchorDateKey}"]`);
      if (!cell) return;
      const cellRect = cell.getBoundingClientRect();
      const width = Math.min(Math.max(cellRect.width * 1.5, 320), 520, window.innerWidth - 16);
      const height = Math.min(Math.max(cellRect.height * 1.5, 300), 520, window.innerHeight - 16);
      const gap = 8;
      let left = cellRect.right + gap;
      let top = cellRect.top;
      if (left + width > window.innerWidth - 8) left = cellRect.left - width - gap;
      if (top + height > window.innerHeight - 8) top = cellRect.bottom - height;
      setDetailPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
        width,
        height,
        ready: true,
      });
    };
    repositionDetail();
    window.addEventListener("resize", repositionDetail);
    window.addEventListener("scroll", repositionDetail, true);
    return () => {
      window.removeEventListener("resize", repositionDetail);
      window.removeEventListener("scroll", repositionDetail, true);
    };
  }, [selectedExternalOccurrence, selectedTask, anchorDateKey, viewDate]);

  const closeTaskDetail = useCallback((restoreFocus = true) => {
    const currentState = window.history.state as { rootineCalendarDetail?: unknown } | null;
    if (!skipDetailHistoryRef.current && currentState?.rootineCalendarDetail) {
      window.history.back();
      return;
    }
    if (draftId !== null) {
      setEvents((current) => current.filter((event) => event.id !== draftId || Boolean(event.text.trim())));
      setDraftId(null);
    }
    setSelectedId(null);
    setSelectedOccurrenceDate(null);
    setSelectedExternalKey(null);
    setAnchorDateKey(null);
    setDetailPosition((current) => ({ ...current, ready: false }));
    if (restoreFocus) requestAnimationFrame(() => detailReturnFocusRef.current?.focus());
  }, [draftId]);

  const switchRoute = (path: string) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const openTaskView = (view: string, resetFilters = true) => {
    if (view === "wszystkie") {
      if (resetFilters) setCalendarFilter({ kind: "all" });
      const current = new Date();
      const currentKey = dateKey(current.getFullYear(), current.getMonth(), current.getDate());
      setViewDate(new Date(current.getFullYear(), current.getMonth(), 1));
      setFocusedDateKey(currentKey);
      setSelectedCalendarDate(currentKey);
      setAgendaDateKey(null);
      closeTaskDetail(false);
      saveTaskSidebarState({ taskView: "wszystkie", listFilter: null, tagFilter: null });
      return;
    }

    saveTasksViewMode("list");
    if (resetFilters) setCalendarFilter({ kind: "all" });
    saveTaskSidebarState({ taskView: view, listFilter: null, tagFilter: null });
    switchRoute(view === "dzis" ? "/zadania" : `/zadania?widok=${encodeURIComponent(view)}`);
  };

  const switchTasksViewMode = (mode: "list" | "calendar") => {
    if (mode === "calendar") return;
    saveTasksViewMode("list");
    saveTaskSidebarState({ taskView: "wszystkie", listFilter: null, tagFilter: null });
    switchRoute("/zadania");
  };

  const applyCalendarFilter = (nextFilter: CalendarFilter) => {
    setCalendarFilter(nextFilter);
    saveTaskSidebarState({
      listFilter: nextFilter.kind === "list" ? nextFilter.id : null,
      tagFilter: nextFilter.kind === "tag" ? nextFilter.id : null,
    });
    setAgendaDateKey(null);
    closeTaskDetail(false);
  };

  const selectEvent = (event: CalendarOccurrence, trigger?: HTMLElement) => {
    if (trigger) detailReturnFocusRef.current = trigger;
    if (event.kind !== "task") {
      if (selectedExternalKey === event.key) {
        closeTaskDetail();
        return;
      }
      closeTaskDetail(false);
      setAnchorDateKey(event.calendarDate);
      setSelectedExternalKey(event.key);
      window.history.pushState({
        ...(window.history.state ?? {}),
        rootineCalendarDetail: { kind: "external", key: event.key, date: event.calendarDate },
      }, "", window.location.href);
      return;
    }
    const id = event.task.occurrence.sourceTaskId;
    if (draftId !== null && draftId !== id) closeTaskDetail();
    if (draftId === id) {
      closeTaskDetail();
      return;
    }
    setAnchorDateKey(event.calendarDate);
    setSelectedExternalKey(null);
    setSelectedId(id);
    setSelectedOccurrenceDate(event.task.occurrence.virtual ? event.task.occurrence.date : null);
    window.history.pushState({
      ...(window.history.state ?? {}),
      rootineCalendarDetail: { kind: "task", id, date: event.task.occurrence.date },
    }, "", window.location.href);
  };

  useEffect(() => {
    const restoreCalendarDetail = () => {
      const state = window.history.state as {
        rootineCalendarDetail?: { kind?: "task" | "external"; id?: number; key?: string; date?: string };
      } | null;
      const detail = state?.rootineCalendarDetail;
      skipDetailHistoryRef.current = true;
      if (detail?.kind === "task" && typeof detail.id === "number") {
        setSelectedExternalKey(null);
        setAnchorDateKey(detail.date ?? null);
        setSelectedId(detail.id);
        setSelectedOccurrenceDate(detail.date ?? null);
      } else if (detail?.kind === "external" && detail.key) {
        setSelectedId(null);
        setSelectedOccurrenceDate(null);
        setAnchorDateKey(detail.date ?? null);
        setSelectedExternalKey(detail.key);
      } else {
        closeTaskDetail();
      }
      queueMicrotask(() => { skipDetailHistoryRef.current = false; });
    };
    window.addEventListener("popstate", restoreCalendarDetail);
    return () => window.removeEventListener("popstate", restoreCalendarDetail);
  }, [closeTaskDetail]);

  useEffect(() => {
    if (selectedDetailId === null) {
      detailInitialFocusIdRef.current = null;
      return;
    }
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (detailRef.current?.contains(target as Node)) return;
      if (target instanceof Element && target.closest(".ui-modal, .ui-modal-backdrop")) return;
      if (target instanceof Element && target.closest(".calendar-event")) return;
      if (target instanceof Element && target.closest(".calendar-cell")) suppressCellClickRef.current = true;
      closeTaskDetail(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof Element && event.target.closest(".ui-modal")) return;
      event.preventDefault();
      closeTaskDetail(true);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    const shouldMoveFocus = detailInitialFocusIdRef.current !== selectedDetailId;
    detailInitialFocusIdRef.current = selectedDetailId;
    const frame = shouldMoveFocus
      ? requestAnimationFrame(() => {
        const initialFocus = draftId !== null && selectedId === draftId
          ? detailRef.current?.querySelector<HTMLElement>(".task-detail__title")
          : detailRef.current?.querySelector<HTMLElement>("input, textarea, button:not([disabled])");
        initialFocus?.focus();
      })
      : null;
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeTaskDetail, draftId, selectedDetailId, selectedId]);

  const moveMonth = (amount: number) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
    setAgendaDateKey(null);
    closeTaskDetail();
  };
  const goToday = () => {
    const current = new Date();
    const currentKey = dateKey(current.getFullYear(), current.getMonth(), current.getDate());
    setViewDate(new Date(current.getFullYear(), current.getMonth(), 1));
    setFocusedDateKey(currentKey);
    setSelectedCalendarDate(currentKey);
    setAgendaDateKey(null);
    closeTaskDetail();
  };
  const updateTask = (id: number, patch: Partial<CalendarEvent>) => {
    const completedAt = patch.done === true ? new Date().toISOString() : undefined;
    if (typeof patch.done === "boolean") persistTaskCompletion(id, patch.done, completedAt);
    const applyTaskPatch = (task: Task) => {
      const withCompletion = typeof patch.done === "boolean"
        ? setTaskDoneState(task, patch.done, completedAt)
        : task;
      return { ...withCompletion, ...patch };
    };
    const applyEventPatch = (event: CalendarEvent): CalendarEvent => ({
      ...applyTaskPatch(event),
      calendarDate: patch.calendarDate || event.calendarDate,
    });
    const dateWasCleared = Object.prototype.hasOwnProperty.call(patch, "calendarDate") && !patch.calendarDate;
    if (dateWasCleared) {
      const tasks = workspaceRef.current.tasks.map((task) => task.id === id
        ? { ...applyTaskPatch(task), calendarDate: undefined }
        : task);
      const nextWorkspace = { ...workspaceRef.current, tasks };
      setStorageFailed(!saveTaskWorkspace(nextWorkspace));
      workspaceRef.current = nextWorkspace;
      setEvents((current) => current.filter((event) => event.id !== id));
      if (draftId === id) setDraftId(null);
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedOccurrenceDate(null);
        setAnchorDateKey(null);
        setDetailPosition((current) => ({ ...current, ready: false }));
      }
      return;
    }
    setEvents((current) => current.map((event) => event.id === id ? applyEventPatch(event) : event));
    if (selectedId === id && patch.calendarDate) {
      const nextDate = new Date(`${patch.calendarDate}T12:00:00`);
      setAnchorDateKey(patch.calendarDate);
      if (!Number.isNaN(nextDate.getTime())) setViewDate(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    }
  };
  const setVirtualOccurrenceCompletion = (
    sourceTaskId: number,
    occurrenceDate: string,
    done: boolean,
  ) => {
    setEvents((current) => current.map((event) => (
      event.id === sourceTaskId
        ? {
            ...setTaskOccurrenceCompletion(event, occurrenceDate, done),
            calendarDate: event.calendarDate,
          }
        : event
    )));
  };
  const toggleOccurrence = (occurrence: TaskOccurrence) => {
    if (!occurrence.occurrence.virtual) {
      updateTask(occurrence.occurrence.sourceTaskId, { done: !occurrence.done });
      return;
    }
    setVirtualOccurrenceCompletion(
      occurrence.occurrence.sourceTaskId,
      occurrence.occurrence.date,
      !occurrence.done,
    );
  };
  const moveTaskToDate = (id: number, calendarDate: string) => {
    const source = events.find((event) => event.id === id);
    updateTask(id, {
      calendarDate,
      date: formatTaskDate(calendarDate),
      view: taskViewForCalendarDate(calendarDate),
      ...(source?.schedule?.recurrence && source.calendarDate !== calendarDate
        ? { schedule: { ...source.schedule, completedDates: undefined, completedAtByDate: undefined } }
        : {}),
    });
  };
  const moveTaskByDays = (task: CalendarEvent, amount: number) => {
    const nextDateKey = shiftCalendarDate(task.calendarDate, amount);
    const parsed = new Date(`${nextDateKey}T12:00:00`);
    pendingKeyboardMoveRef.current = { id: task.id, dateKey: nextDateKey };
    setFocusedDateKey(nextDateKey);
    setAgendaDateKey(null);
    if (!cells.some((cell) => dateKey(cell.year, cell.month, cell.day) === nextDateKey)) {
      setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
    moveTaskToDate(task.id, nextDateKey);
    setCalendarAnnouncement(
      `Przeniesiono zadanie „${task.text || "bez nazwy"}” na ${parsed.toLocaleDateString("pl-PL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })}.`,
    );
  };
  const deleteTask = (id: number) => {
    const removedTask = events.find((event) => event.id === id) ?? null;
    const nextWorkspace = trashTask(workspaceRef.current, id);
    workspaceRef.current = nextWorkspace;
    setStorageFailed(!saveTaskWorkspace(nextWorkspace));
    setEvents((current) => current.map((event) => event.id === id ? { ...event, deleted: true } : event));
    if (removedTask) {
      setTrashedTask(removedTask);
    }
    if (draftId === id) setDraftId(null);
    setSelectedId(null);
    setSelectedOccurrenceDate(null);
  };
  const undoDeleteTask = () => {
    if (!trashedTask) return;
    const restoredWorkspace = restoreTask(workspaceRef.current, trashedTask.id);
    workspaceRef.current = restoredWorkspace;
    setStorageFailed(!saveTaskWorkspace(restoredWorkspace));
    setEvents((current) => current.map((event) => event.id === trashedTask.id
      ? { ...event, deleted: false }
      : event));
    setCalendarAnnouncement(`Przywrócono zadanie „${trashedTask.text || "bez nazwy"}”.`);
    setTrashedTask(null);
  };
  const dismissTrashUndo = useCallback(() => setTrashedTask(null), []);
  const retryTaskSave = useCallback(() => {
    const nextWorkspace = replaceCalendarTasks(
      workspaceRef.current,
      events.filter((event) => event.text.trim().length > 0),
    );
    workspaceRef.current = nextWorkspace;
    setStorageFailed(!saveTaskWorkspace(nextWorkspace));
  }, [events]);
  const createDraft = (calendarDate = todayKey()) => {
    const parsed = new Date(`${calendarDate}T12:00:00`);
    const event: CalendarEvent = {
      id: Date.now(), calendarDate, text: "", done: false, date: formatTaskDate(calendarDate),
      view: taskViewForCalendarDate(calendarDate),
      ...(calendarFilter.kind === "list" ? { list: calendarFilter.id } : {}),
      ...(calendarFilter.kind === "tag" ? { tags: [calendarFilter.id] } : {}),
      ...(calendarFilter.kind === "priority" ? { priority: calendarFilter.id } : {}),
    };
    setAgendaDateKey(null);
    detailReturnFocusRef.current = calendarRootRef.current?.querySelector<HTMLElement>(`[data-calendar-cell="${calendarDate}"]`) ?? null;
    if (draftId !== null) closeTaskDetail();
    setEvents((current) => [...current, event]);
    setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    setAnchorDateKey(calendarDate);
    setDraftId(event.id);
    setSelectedId(event.id);
    setSelectedOccurrenceDate(null);
  };
  const selectCalendarDate = (calendarDate: string) => {
    setFocusedDateKey(calendarDate);
    setAgendaDateKey(null);
    closeTaskDetail(false);
    setSelectedCalendarDate((current) => calendarMode === "compact" && current === calendarDate ? null : calendarDate);
  };
  const activateCalendarDate = (calendarDate: string) => {
    if (calendarMode === "full") createDraft(calendarDate);
    else selectCalendarDate(calendarDate);
  };

  return (
    <ModuleShell
      pageWidth="fluid"
      className="task-module calendar-module"
      memoryKey="calendar"
    >
      <ModuleSidebar
        label="Widoki i listy zadań"
        className="task-context-sidebar calendar-context-sidebar"
      >
        <div className="task-nav__primary-section">
          <SectionHeader title="Główne" level={2} variant="label" className="task-nav__section-heading" />
          <div className="task-nav__items">
            {PRIMARY_SMART_VIEWS.map(view => {
              const Icon = view.icon;
              return (
                <ContextNavItem
                  key={view.id}
                  active={activeTaskView === view.id}
                  onClick={() => openTaskView(view.id)}
                  icon={<Icon />}
                  label={view.label}
                  meta={view.id !== "podsumowanie" && Number(sidebarViewCounts[view.id] ?? 0) > 0 ? Number(sidebarViewCounts[view.id]) : undefined}
                />
              );
            })}
          </div>
        </div>

        <div className="task-nav__divider" />
        <div className="task-nav__special-section">
          <SectionHeader title="Widoki specjalne" level={2} variant="label" className="task-nav__section-heading" />
          <div className="task-nav__items">
            {SPECIAL_SMART_VIEWS.map(view => {
              const Icon = view.icon;
              return (
                <ContextNavItem
                  key={view.id}
                  active={activeTaskView === view.id}
                  onClick={() => openTaskView(view.id)}
                  icon={<Icon />}
                  label={view.label}
                  meta={view.id !== "podsumowanie" && Number(sidebarViewCounts[view.id] ?? 0) > 0 ? Number(sidebarViewCounts[view.id]) : undefined}
                />
              );
            })}
          </div>
        </div>

        <div className="task-nav__divider" />
            <div className="task-nav__taxonomy-section">
              <div className="task-nav__taxonomy-header">
                <button type="button" className="task-nav__group-toggle" aria-expanded={listyOpen} onClick={() => setListyOpen((open) => { const next = !open; saveTaskSidebarState({ listyOpen: next }); return next; })}>
                  <ChevronRight size={11} strokeWidth={2} className={listyOpen ? "is-open" : undefined} />
                  <span className="task-nav__group-label">Listy</span>
                </button>
              </div>
              {listyOpen && <div className="task-nav__items">
                {visibleLists.map((list) => {
                  const filter: CalendarFilter = { kind: "list", id: list.id };
                  const count = sidebarTasks.filter((task) => !task.deleted && !task.done && task.list === list.id).length;
                  return (
                    <ContextNavItem
                      key={list.id}
                      active={calendarFilterKey(calendarFilter) === calendarFilterKey(filter)}
                      onClick={() => applyCalendarFilter(filter)}
                      icon={<span className="task-nav__dot" style={{ background: list.color }} />}
                      label={list.label}
                      meta={count || undefined}
                    />
                  );
                })}
                {lists.length > VISIBLE_TAG_LIMIT && (
                  <button type="button" className="task-nav__show-all" onClick={() => setShowAllLists(open => !open)}>
                    {showAllLists ? "Pokaż mniej" : "Pokaż wszystkie"}
                  </button>
                )}
              </div>}
            </div>
        <div className="task-nav__divider" />
            <div className="task-nav__taxonomy-section">
              <div className="task-nav__taxonomy-header">
                <button type="button" className="task-nav__group-toggle" aria-expanded={tagiOpen} onClick={() => setTagiOpen((open) => { const next = !open; saveTaskSidebarState({ tagiOpen: next }); return next; })}>
                  <ChevronRight size={11} strokeWidth={2} className={tagiOpen ? "is-open" : undefined} />
                  <span className="task-nav__group-label">Tagi</span>
                </button>
              </div>
              {tagiOpen && <div className="task-nav__items">
                {visibleTags.map((tag) => {
                  const filter: CalendarFilter = { kind: "tag", id: tag.id };
                  const count = sidebarTasks.filter((task) => !task.deleted && !task.done && task.tags?.includes(tag.id)).length;
                  return (
                    <ContextNavItem
                      key={tag.id}
                      active={calendarFilterKey(calendarFilter) === calendarFilterKey(filter)}
                      onClick={() => applyCalendarFilter(filter)}
                      icon={<span className="task-nav__dot" style={{ background: tag.color }} />}
                      label={`#${tag.label}`}
                      meta={count || undefined}
                    />
                  );
                })}
                {tags.length > VISIBLE_TAG_LIMIT && (
                  <button type="button" className="task-nav__show-all" onClick={() => setShowAllTags(open => !open)}>
                    {showAllTags ? "Pokaż mniej" : "Pokaż wszystkie"}
                  </button>
                )}
              </div>}
            </div>
        <div className="task-nav__spacer" />
        <div className="task-nav__footer">
          <ContextNavItem label="Ukończone" icon={<RotateCcw />} onClick={() => openTaskView("ukonczone")} />
          <ContextNavItem label="Kosz" icon={<Trash2 />} onClick={() => openTaskView("kosz")} />
        </div>
      </ModuleSidebar>

      <ModuleMain className="calendar-module-main" transitionKey={`${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}-01`}>
        <ContentHeader
          headingLevel={1}
          title={formatHeaderDate(viewDate)}
          meta={storageFailed ? <Button variant="quiet" size="sm" onClick={retryTaskSave}>Spróbuj zapisać ponownie</Button> : undefined}
          // The open count belongs in the description, exactly as in the task list. As a badge in
          // `meta` it sat next to a 28px button and made the calendar header 9px taller than the
          // list header, so switching views nudged the whole grid down.
          description={openCalendarCount > 0
            ? `${formatOpenTaskCount(openCalendarCount)} · Kalendarz zadań`
            : "Kalendarz zadań"}
          mobileNavigation={<Select
              aria-label="Filtr kalendarza"
              fieldClassName="context-mobile-select"
              compact
              value={calendarFilterKey(calendarFilter)}
              options={calendarFilterChoices.map(({ value, label }) => ({ value, label }))}
              onChange={(event) => {
                const choice = calendarFilterChoices.find((item) => item.value === event.target.value);
                if (choice) applyCalendarFilter(choice.filter);
              }}
            />}
          actions={<>
          {openUndatedCount > 0 && (
            <Button className="calendar-undated-button" variant="quiet" size="sm" onClick={() => openTaskView("bezterminu")}>
              Bez terminu · {openUndatedCount}
            </Button>
          )}
          <div className="calendar-period-controls">
            <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni miesiąc" onClick={() => moveMonth(-1)}><ChevronLeft size={16} strokeWidth={1.5} /></Button>
            <Button variant="quiet" size="sm" onClick={goToday}>Dziś</Button>
            <Button variant="ghost" size="sm" iconOnly aria-label="Następny miesiąc" onClick={() => moveMonth(1)}><ChevronRight size={16} strokeWidth={1.5} /></Button>
          </div>
          <div className="task-toolbar-actions">
            <div className="task-priority-filters" aria-label="Filtr priorytetu">
              {CALENDAR_PRIORITIES.map((item) => {
                const active = calendarFilter.kind === "priority" && calendarFilter.id === item.id;
                const color = item.id === "high" ? uiColors.danger : item.id === "medium" ? uiColors.warning : C.blueText;
                return (
                  <Button
                    key={item.id}
                    className="task-priority-filter"
                    variant="ghost"
                    size="sm"
                    aria-pressed={active}
                    onClick={() => applyCalendarFilter(active ? { kind: "all" } : { kind: "priority", id: item.id })}
                    style={{ color: active ? color : C.muted, background: active ? `${color}14` : undefined }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </div>
            <Button className="calendar-print-button" size="sm" variant="ghost" iconOnly aria-label="Drukuj kalendarz" onClick={() => window.print()}><Printer size={16} strokeWidth={1.5} /></Button>
            <div className="ui-view-switch" role="group" aria-label="Sposób wyświetlania zadań">
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Widok listy"
                aria-pressed="false"
                title="Lista"
                onClick={() => switchTasksViewMode("list")}
              >
                <List size={13} strokeWidth={1.7} />
              </Button>
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                aria-label="Widok kalendarza"
                aria-pressed="true"
                title="Kalendarz"
              >
                <CalendarDays size={13} strokeWidth={1.7} />
              </Button>
            </div>
            <Button className="ui-button--icon-mobile" variant="primary" onClick={() => createDraft()} leadingIcon={<Plus size={13} strokeWidth={1.7} />}><span className="header-action-label">Dodaj zadanie</span></Button>
          </div>
          </>}
        />

        <p id="calendar-keyboard-move-instructions" className="ui-sr-only">
          Aby przesunąć zadanie o jeden dzień, użyj Alt i strzałki w lewo lub w prawo.
        </p>
        <p className="ui-sr-only" role="status" aria-live="polite" aria-atomic="true">
          {calendarAnnouncement}
        </p>
        {trashedTask && (
          <ToastViewport>
            <Toast
              tone="neutral"
              actionLabel="Cofnij"
              onAction={undoDeleteTask}
              onDismiss={dismissTrashUndo}
            >
              Przeniesiono {trashedTask.schedule?.recurrence ? "całą serię" : "zadanie"} „{trashedTask.text || "Zadanie bez nazwy"}” do Kosza.
            </Toast>
          </ToastViewport>
        )}

        {/* A <div> rather than <section>: ARIA does not allow role="grid" on a sectioning
            element, and the grid already carries its own accessible name. */}
        <div ref={calendarRootRef} className={`calendar-workspace calendar-workspace--${calendarMode}`}>
        <div
          role="grid"
          aria-label={`Kalendarz: ${formatHeaderDate(viewDate)}`}
          aria-colcount={7}
          aria-rowcount={calendarRows.length + 1}
          className="calendar-page"
        >
          <div role="row" aria-rowindex={1} className="calendar-weekdays">
            {WEEKDAYS.map((day) => <div key={day} role="columnheader" className="calendar-weekday">{day}</div>)}
          </div>

          <div role="rowgroup" className="calendar-grid-rows" style={{ "--calendar-row-count": calendarRows.length } as React.CSSProperties}>
        {calendarRows.map((row, rowIndex) => (
          <div key={`${row[0]?.year}-${row[0]?.month}-${row[0]?.day}`} role="row" aria-rowindex={rowIndex + 2} className="calendar-grid-row">
        {row.map((cell, columnIndex) => {
          const cellIndex = rowIndex * 7 + columnIndex;
          const key = dateKey(cell.year, cell.month, cell.day);
          const dayEvents = eventsByDate.get(key) ?? [];
          const isToday = key === todayKey();
          return (
            <div
              key={key}
              role="gridcell"
              tabIndex={focusedDateKey === key ? 0 : -1}
              aria-colindex={(cellIndex % 7) + 1}
              aria-label={`${cell.day} ${MONTHS[cell.month]} ${cell.year}. ${dayEvents.length > 0 ? `${formatCalendarOccurrenceCount(dayEvents.length)}: ${dayEvents.map((event) => event.title || "wpis bez nazwy").join(", ")}. ` : ""}Enter, aby ${calendarMode === "full" ? "dodać zadanie" : "wybrać dzień"}.`}
              data-calendar-cell={key}
              className={`calendar-cell${isToday ? " is-today" : ""}${selectedCalendarDate === key ? " is-selected" : ""}${dragOverDateKey === key ? " is-drop-target" : ""}`}
              onFocus={() => setFocusedDateKey(key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  if (event.target !== event.currentTarget) return;
                  event.preventDefault();
                  if (selectedTask || selectedExternalOccurrence) closeTaskDetail();
                  else activateCalendarDate(key);
                  return;
                }
                handleCellKeyDown(event, cellIndex, key);
              }}
              onClick={() => {
                if (suppressCellClickRef.current) {
                  suppressCellClickRef.current = false;
                  return;
                }
                activateCalendarDate(key);
              }}
              onDragOver={(event) => {
                if (draggedId === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverDateKey(key);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragOverDateKey((current) => current === key ? null : current);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                suppressCellClickRef.current = true;
                window.setTimeout(() => { suppressCellClickRef.current = false; }, 0);
                const transferredId = Number(event.dataTransfer.getData("application/x-rootine-task-id"));
                const taskId = Number.isFinite(transferredId) && transferredId !== 0 ? transferredId : draggedId;
                if (taskId !== null) moveTaskToDate(taskId, key);
                setDraggedId(null);
                setDragOverDateKey(null);
              }}
            >
              <div className="calendar-cell__date-row">
                <span className={`calendar-cell__date${isToday ? " is-today" : ""}${cell.current ? "" : " is-outside"}`}>{cell.day}</span>
              </div>
              <div className="calendar-cell__events">
                {dayEvents.slice(0, visibleEventLimit).map((event) => (
                  <CalendarEventBar
                    key={event.key}
                    event={event}
                    mode={calendarMode}
                    dragging={event.kind === "task" && draggedId === event.task.id}
                    onClick={(trigger) => selectEvent(event, trigger)}
                    onToggle={event.kind === "task" ? () => toggleOccurrence(event.task) : undefined}
                    onMoveByDay={event.kind === "task" ? (amount) => moveTaskByDays(event.task, amount) : undefined}
                    onDragStart={event.kind === "task"
                      ? (dragEvent) => {
                          dragEvent.stopPropagation();
                          dragEvent.dataTransfer.effectAllowed = "move";
                          dragEvent.dataTransfer.setData("application/x-rootine-task-id", String(event.task.occurrence.sourceTaskId));
                          setDraggedId(event.task.occurrence.sourceTaskId);
                        }
                      : undefined}
                    onDragEnd={event.kind === "task"
                      ? () => {
                          setDraggedId(null);
                          setDragOverDateKey(null);
                        }
                      : undefined}
                  />
                ))}
                {dayEvents.length > visibleEventLimit && (
                  <>
                    <button
                      id={`calendar-overflow-trigger-${key}`}
                      type="button"
                      className="calendar-overflow-trigger"
                      aria-label={`Pokaż pozostałe wpisy z ${cell.day} ${MONTHS[cell.month]}: ${dayEvents.length - visibleEventLimit}`}
                      aria-haspopup="menu"
                      aria-expanded={agendaDateKey === key}
                      aria-controls={agendaDateKey === key ? `calendar-agenda-${key}` : undefined}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        if (agendaDateKey === key) {
                          setAgendaDateKey(null);
                          return;
                        }
                        agendaTriggerRef.current = clickEvent.currentTarget;
                        setAgendaDateKey(key);
                      }}
                    >
                      <span className="calendar-overflow-trigger__full">+{dayEvents.length - visibleEventLimit} więcej</span>
                      <span
                        className="calendar-overflow-trigger__compact"
                        aria-hidden="true"
                        data-count={dayEvents.length - visibleEventLimit}
                      />
                    </button>
                    {agendaDateKey === key && agendaTriggerRef.current && (
                      <AnchoredPopover
                        open
                        anchorRef={agendaTriggerRef}
                        align="start"
                        layer="featurePopup"
                        minWidth={288}
                        maxHeight={320}
                        viewportPadding={8}
                        onDismiss={() => setAgendaDateKey(null)}
                      >
                        <Menu
                          id={`calendar-agenda-${key}`}
                          className={`calendar-agenda${hideCalendarTime ? " calendar-agenda--compact" : ""}`}
                          aria-labelledby={`calendar-overflow-trigger-${key}`}
                          triggerRef={agendaTriggerRef}
                          density="comfortable"
                          initialFocus="first"
                          onClick={(menuEvent) => menuEvent.stopPropagation()}
                        >
                        {dayEvents.slice(visibleEventLimit).map((hiddenEvent) => {
                          const task = hiddenEvent.kind === "task" ? hiddenEvent.task : null;
                          return (
                            <MenuItem
                              key={hiddenEvent.key}
                              data-calendar-event-id={task?.id ?? hiddenEvent.key}
                              aria-describedby={task && !task.occurrence.virtual ? "calendar-keyboard-move-instructions" : undefined}
                              aria-keyshortcuts={task && !task.occurrence.virtual ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
                              onClick={() => {
                                const returnTarget = agendaTriggerRef.current;
                                setAgendaDateKey(null);
                                selectEvent(hiddenEvent, returnTarget ?? undefined);
                              }}
                              onKeyDown={(keyboardEvent) => {
                                if (!task || task.occurrence.virtual) return;
                                if (!keyboardEvent.altKey || (keyboardEvent.key !== "ArrowLeft" && keyboardEvent.key !== "ArrowRight")) return;
                                keyboardEvent.preventDefault();
                                keyboardEvent.stopPropagation();
                                moveTaskByDays(task, keyboardEvent.key === "ArrowLeft" ? -1 : 1);
                              }}
                            >
                              <span className="calendar-agenda-item">
                                <span className="calendar-agenda-item__title">
                                  {hiddenEvent.title || "Wpis bez nazwy"}
                                </span>
                                {(hiddenEvent.time || task?.occurrence.virtual || hiddenEvent.source.label || hiddenEvent.status.label) && (
                                  <span className="calendar-agenda-item__meta">
                                    {[
                                      hiddenEvent.time ? { key: "time", label: hiddenEvent.time, className: "calendar-agenda-item__time" } : null,
                                      task?.occurrence.virtual ? { key: "recurrence", label: "Cykliczne" } : null,
                                      hiddenEvent.source.label ? { key: "source", label: hiddenEvent.source.label } : null,
                                      hiddenEvent.status.label ? { key: "status", label: hiddenEvent.status.label } : null,
                                    ].filter((item): item is { key: string; label: string; className?: string } => Boolean(item)).map((item, index, items) => (
                                      <span key={item.key} className={`calendar-agenda-item__meta-part${item.className ? ` ${item.className}` : ""}`}>
                                        {item.label}
                                        {index < items.length - 1 && <span aria-hidden="true"> · </span>}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </span>
                            </MenuItem>
                          );
                        })}
                        </Menu>
                      </AnchoredPopover>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
          </div>
        ))}
          </div>
        </div>
        {selectedCalendarDate && calendarMode !== "full" && (
          <CalendarDayPanel
            calendarDate={selectedCalendarDate}
            events={selectedDayOccurrences}
            mode={calendarMode}
            onClose={() => setSelectedCalendarDate(null)}
            onAddTask={() => createDraft(selectedCalendarDate)}
            onSelectEvent={selectEvent}
            onToggle={toggleOccurrence}
          />
        )}
        </div>
      </ModuleMain>

      <TaskReminderCenter tasks={events} habits={workspaceRef.current.habits} />

      {selectedTask && (
        <DetailPanel
          ref={detailRef}
          className={`calendar-task-detail${detailPosition.ready ? " is-ready" : ""}`}
          label={selectedVirtualOccurrence ? "Szczegóły wystąpienia cyklicznego" : "Szczegóły zadania"}
          onDismiss={closeTaskDetail}
          style={{
            left: detailPosition.left,
            top: detailPosition.top,
            width: detailPosition.width,
            height: detailPosition.height,
          }}
        >
          <TaskDetail
            task={selectedTask}
            isDraft={draftId === selectedTask.id}
            occurrence={selectedVirtualOccurrence
              ? {
                  date: selectedVirtualOccurrence.occurrence.date,
                  done: selectedVirtualOccurrence.done,
                }
              : undefined}
            onClose={closeTaskDetail}
            onToggleCompletion={(done) => {
              if (selectedVirtualOccurrence) {
                setVirtualOccurrenceCompletion(
                  selectedTask.id,
                  selectedVirtualOccurrence.occurrence.date,
                  done,
                );
                return;
              }
              updateTask(selectedTask.id, { done });
            }}
            onUpdate={updateTask}
            onDelete={deleteTask}
            listy={lists}
            tagi={tags}
          />
        </DetailPanel>
      )}

      {selectedExternalOccurrence && (
        <div
          ref={detailRef}
          className={`calendar-task-detail calendar-source-detail${detailPosition.ready ? " is-ready" : ""}`}
          role="dialog"
          aria-modal="false"
          aria-label={`Szczegóły: ${selectedExternalOccurrence.title}`}
          style={{
            left: detailPosition.left,
            top: detailPosition.top,
            width: detailPosition.width,
            maxHeight: detailPosition.height,
          }}
        >
          <header className="calendar-source-detail__header">
            <div className="calendar-source-detail__heading">
              <span>{selectedExternalOccurrence.source.label}</span>
              <strong>{selectedExternalOccurrence.title}</strong>
            </div>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Zamknij szczegóły"
              onClick={() => closeTaskDetail()}
            >
              <X size={13} />
            </Button>
          </header>
          <div className="calendar-source-detail__body">
            <Badge tone={occurrenceStatusTone(selectedExternalOccurrence.status.key)} dot>
              {selectedExternalOccurrence.status.label}
            </Badge>
            <dl className="calendar-source-detail__facts">
              <div>
                <dt>Data</dt>
                <dd>{formatTaskDate(selectedExternalOccurrence.calendarDate)}</dd>
              </div>
              {selectedExternalOccurrence.time && (
                <div>
                  <dt>Godzina</dt>
                  <dd>{selectedExternalOccurrence.time}</dd>
                </div>
              )}
              {selectedExternalOccurrence.source.context && (
                <div>
                  <dt>Kontekst</dt>
                  <dd>{selectedExternalOccurrence.source.context}</dd>
                </div>
              )}
              {selectedExternalOccurrence.kind === "affair" && selectedExternalOccurrence.amount !== undefined && (
                <div>
                  <dt>Kwota</dt>
                  <dd>{currencyFormatter.format(selectedExternalOccurrence.amount)}</dd>
                </div>
              )}
              {selectedExternalOccurrence.metadata.map((item) => (
                <div key={item}>
                  <dt>Informacja</dt>
                  <dd>{item}</dd>
                </div>
              ))}
            </dl>
            <p className="calendar-source-detail__notice">
              Ten wpis zachowuje dane modułu źródłowego. Edycja jest dostępna w module {selectedExternalOccurrence.source.label}.
            </p>
          </div>
          <footer className="calendar-source-detail__footer">
            <a className="ui-button ui-button--primary" href={selectedExternalOccurrence.source.href}>
              Otwórz w module {selectedExternalOccurrence.source.label}
            </a>
          </footer>
        </div>
      )}
    </ModuleShell>
  );
}
