import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ChevronLeft, ChevronRight,
  CalendarDays, List, Plus, Printer, RotateCcw, Trash2, X,
} from "lucide-react";
import { TaskDetail } from "./tasks/TaskViews";
import {
  CALENDAR_SOURCE_STORAGE_KEYS,
  loadCalendarOccurrenceSources,
  selectCalendarOccurrences,
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
  loadTaskWorkspace,
  replaceCalendarTasks,
  restoreTask,
  saveTaskWorkspace,
  taskViewForCalendarDate,
  trashTask,
  type WorkspaceList as ListItem,
  type WorkspaceTag as TagItem,
  type WorkspaceTask as Task,
} from "../data/taskWorkspace";
import {
  Badge,
  Button,
  ContextNavItem,
  ContextSidebar,
  Menu,
  MenuItem,
  ModuleMain,
  ModuleShell,
  PageHeader,
  SectionHeader,
  Select,
  WorkspaceToolbar,
  uiColors,
} from "../ui";
import {
  loadTaskSidebarState,
  saveTaskSidebarState,
  SMART_VIEWS,
  PRIMARY_SMART_VIEWS,
  SPECIAL_SMART_VIEWS,
  VISIBLE_TAG_LIMIT,
  formatOpenTaskCount,
  smartDateViewRange,
  tasksForSmartDateView,
} from "./tasks/taskPageModel";
import { TaskReminderCenter } from "./tasks/TaskReminderCenter";
import "../../styles/calendar.css";
import "../../styles/tasks.css";

const C = {
  bg: uiColors.graphiteCanvas,
  grid: uiColors.graphiteCanvas,
  border: uiColors.borderSubtle,
  text: uiColors.chalkWhite,
  second: uiColors.textSecondary,
  muted: uiColors.textMuted,
  disabled: uiColors.textDisabled,
  blue: uiColors.precisionBlueStrong,
  blueText: uiColors.precisionBlueText,
  blueSoft: uiColors.precisionBlueSoft,
  panel: uiColors.graphitePanel,
  hover: uiColors.graphiteHover,
} as const;

const MONTHS = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];
const WEEKDAYS = ["pon.", "wt.", "śr.", "czw.", "pt.", "sob.", "niedz."];

type CalendarEvent = Task & { calendarDate: string };
type CalendarPriority = NonNullable<Task["priority"]>;
type CalendarFilter =
  | { kind: "all" }
  | { kind: "list"; id: string }
  | { kind: "tag"; id: string }
  | { kind: "priority"; id: CalendarPriority };

const CALENDAR_PRIORITIES: Array<{ id: CalendarPriority; label: string }> = [
  { id: "high", label: "Wysoki" },
  { id: "medium", label: "Średni" },
  { id: "low", label: "Niski" },
];

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

function CalendarEventBar({ event, dragging, onClick, onToggle, onMoveByDay, onDragStart, onDragEnd }: {
  event: CalendarOccurrence;
  dragging: boolean;
  onClick: (trigger: HTMLButtonElement) => void;
  onToggle?: () => void;
  onMoveByDay?: (amount: number) => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  const task = event.kind === "task" ? event.task : null;
  const virtual = task?.occurrence.virtual ?? false;
  const draggable = Boolean(task && !virtual);
  return (
    <div
      role="group"
      aria-label={`${event.source.label}: ${event.title || "bez nazwy"}; status ${event.status.label}${virtual ? "; wystąpienie cykliczne" : ""}${event.source.context ? `; ${event.source.context}` : ""}`}
      className={`calendar-event ${task ? "" : "calendar-event--readonly"}`}
      draggable={draggable}
      aria-grabbed={draggable ? dragging : undefined}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      style={{
        width: "100%", minWidth: 0, display: "flex", alignItems: "center", gap: 4,
        border: "none", borderRadius: 4, padding: "0 5px",
        background: task ? C.blueSoft : C.panel, color: C.text, textAlign: "left",
        fontSize: 11, lineHeight: "var(--leading-tight)", overflow: "hidden", cursor: draggable ? dragging ? "grabbing" : "grab" : "default",
        opacity: dragging ? 0.48 : 1, transition: "background-color 140ms ease-out, opacity 140ms ease-out",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = task ? C.blueSoft : C.panel; }}
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
          {event.status.completed && <span style={{ fontSize: 11, lineHeight: 1, fontWeight: 600 }}>✓</span>}
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
        className="flex min-h-6 min-w-0 flex-1 items-center gap-1 border-0 bg-transparent p-0 text-left"
        style={{ color: "inherit", cursor: "pointer" }}
      >
        <span className="calendar-event__title" title={event.title} style={{ minWidth: 0, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: event.status.completed ? "line-through" : "none", opacity: event.status.completed ? 0.6 : 1 }}>{event.title}</span>
        {virtual && <span aria-hidden="true" title="Wystąpienie cykliczne" style={{ color: C.blueText, flexShrink: 0 }}>↻</span>}
        <span className="calendar-event__source" style={{ flexShrink: 0, fontSize: 11, color: C.second }}>{event.source.label}</span>
        {event.time && <span className="calendar-event__time" style={{ fontFamily: "var(--font-data)", fontSize: 11, color: C.blueText, flexShrink: 0 }}>{event.time}</span>}
      </button>
    </div>
  );
}

export default function Kalendarz() {
  const now = new Date();
  const [initialWorkspace] = useState(loadTaskWorkspace);
  const initialSidebarState = loadTaskSidebarState();
  const [occurrenceSources, setOccurrenceSources] = useState(loadCalendarOccurrenceSources);
  const [viewDate, setViewDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>(() => initialWorkspace.tasks.filter(isCalendarTask));
  const [lists, setLists] = useState<ListItem[]>(initialWorkspace.lists);
  const [tags, setTags] = useState<TagItem[]>(initialWorkspace.tags);
  const [listyOpen, setListyOpen] = useState(initialSidebarState.listyOpen);
  const [tagiOpen, setTagiOpen] = useState(initialSidebarState.tagiOpen);
  const [showAllLists, setShowAllLists] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>(() => (
    initialSidebarState.listFilter
      ? { kind: "list", id: initialSidebarState.listFilter }
      : initialSidebarState.tagFilter
        ? { kind: "tag", id: initialSidebarState.tagFilter }
        : { kind: "all" }
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
  const [agendaPosition, setAgendaPosition] = useState({ left: 8, top: 8 });
  const [calendarAnnouncement, setCalendarAnnouncement] = useState("");
  const [trashedTask, setTrashedTask] = useState<CalendarEvent | null>(null);
  const calendarRootRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const agendaMenuRef = useRef<HTMLDivElement>(null);
  const agendaTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);
  const detailInitialFocusIdRef = useRef<string | null>(null);
  const pendingKeyboardMoveRef = useRef<{ id: number; dateKey: string } | null>(null);
  const trashUndoTimerRef = useRef<number | null>(null);
  const workspaceRef = useRef(initialWorkspace);
  const suppressCellClickRef = useRef(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [focusedDateKey, setFocusedDateKey] = useState(todayKey);

  useEffect(() => {
    const persistedEvents = events.filter((event) => event.text.trim().length > 0);
    const nextWorkspace = replaceCalendarTasks(workspaceRef.current, persistedEvents);
    setStorageFailed(!saveTaskWorkspace(nextWorkspace));
    workspaceRef.current = nextWorkspace;
  }, [events]);

  useEffect(() => () => {
    if (trashUndoTimerRef.current !== null) window.clearTimeout(trashUndoTimerRef.current);
  }, []);

  useEffect(() => {
    const syncWorkspace = () => {
      const nextWorkspace = loadTaskWorkspace();
      setOccurrenceSources(loadCalendarOccurrenceSources());
      workspaceRef.current = nextWorkspace;
      setEvents(nextWorkspace.tasks.filter(isCalendarTask));
      setLists(nextWorkspace.lists);
      setTags(nextWorkspace.tags);
      setSelectedId((current) => current !== null && nextWorkspace.tasks.some((task) => task.id === current && isCalendarTask(task)) ? current : null);
    };
    const unsubscribers = CALENDAR_SOURCE_STORAGE_KEYS.map((key) => (
      subscribeToLocalWorkspace(key, syncWorkspace)
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const cells = useMemo(() => getCalendarCells(viewDate.getFullYear(), viewDate.getMonth()), [viewDate]);
  const calendarRows = useMemo(
    () => Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7)),
    [cells],
  );
  const filteredEvents = useMemo(
    () => events.filter((event) => taskMatchesCalendarFilter(event, calendarFilter)),
    [calendarFilter, events],
  );
  const openCalendarCount = useMemo(
    () => filteredEvents.filter((event) => !event.deleted && !event.done).length,
    [filteredEvents],
  );
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
  const listUsage = useMemo(() => events.reduce<Record<string, number>>((counts, event) => {
    if (!event.deleted && event.list) counts[event.list] = (counts[event.list] ?? 0) + 1;
    return counts;
  }, {}), [events]);
  const tagUsage = useMemo(() => events.reduce<Record<string, number>>((counts, event) => {
    if (!event.deleted) for (const tag of event.tags ?? []) counts[tag] = (counts[tag] ?? 0) + 1;
    return counts;
  }, {}), [events]);
  const sidebarTasks = workspaceRef.current.tasks;
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
        taskSource.filter((task) => !task.deleted && !task.done && (
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
    return selectCalendarOccurrences(
      { ...occurrenceSources, tasks: filteredEvents },
      dateKey(first.year, first.month, first.day),
      dateKey(last.year, last.month, last.day),
    );
  }, [cells, filteredEvents, occurrenceSources]);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarOccurrence[]>();
    visibleOccurrences.forEach((event) => grouped.set(event.calendarDate, [...(grouped.get(event.calendarDate) ?? []), event]));
    return grouped;
  }, [visibleOccurrences]);
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

  useLayoutEffect(() => {
    if (!agendaDateKey) return;
    const repositionAgenda = () => {
      const trigger = agendaTriggerRef.current;
      const menu = agendaMenuRef.current;
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const gap = 4;
      const left = Math.max(8, Math.min(triggerRect.left, window.innerWidth - menuRect.width - 8));
      const preferredTop = triggerRect.bottom + gap;
      const top = preferredTop + menuRect.height <= window.innerHeight - 8
        ? preferredTop
        : Math.max(8, triggerRect.top - menuRect.height - gap);
      setAgendaPosition((current) => current.left === left && current.top === top ? current : { left, top });
    };
    repositionAgenda();
    window.addEventListener("resize", repositionAgenda);
    window.addEventListener("scroll", repositionAgenda, true);
    return () => {
      window.removeEventListener("resize", repositionAgenda);
      window.removeEventListener("scroll", repositionAgenda, true);
    };
  }, [agendaDateKey]);

  useEffect(() => {
    if (cells.some((cell) => dateKey(cell.year, cell.month, cell.day) === focusedDateKey)) return;
    const today = todayKey();
    const next = cells.find((cell) => dateKey(cell.year, cell.month, cell.day) === today) ?? cells[0];
    if (next) setFocusedDateKey(dateKey(next.year, next.month, next.day));
  }, [cells, focusedDateKey]);

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
    saveTaskSidebarState(resetFilters
      ? { taskView: view, listFilter: null, tagFilter: null }
      : { taskView: view });
    switchRoute(view === "dzis" ? "/zadania" : `/zadania?widok=${view}`);
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
  };

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
        detailRef.current?.querySelector<HTMLElement>("input, textarea, button:not([disabled])")?.focus();
      })
      : null;
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeTaskDetail, selectedDetailId]);

  const moveMonth = (amount: number) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
    setAgendaDateKey(null);
    closeTaskDetail();
  };
  const goToday = () => {
    const current = new Date();
    setViewDate(new Date(current.getFullYear(), current.getMonth(), 1));
    setAgendaDateKey(null);
    closeTaskDetail();
  };
  const updateTask = (id: number, patch: Partial<CalendarEvent>) => {
    if (typeof patch.done === "boolean") persistTaskCompletion(id, patch.done);
    const dateWasCleared = Object.prototype.hasOwnProperty.call(patch, "calendarDate") && !patch.calendarDate;
    if (dateWasCleared) {
      const tasks = workspaceRef.current.tasks.map((task) => task.id === id ? { ...task, ...patch, calendarDate: undefined } : task);
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
    setEvents((current) => current.map((event) => event.id === id ? { ...event, ...patch } : event));
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
        ? { schedule: { ...source.schedule, completedDates: undefined } }
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
      if (trashUndoTimerRef.current !== null) window.clearTimeout(trashUndoTimerRef.current);
      trashUndoTimerRef.current = window.setTimeout(() => {
        setTrashedTask(null);
        trashUndoTimerRef.current = null;
      }, 8_000);
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
    if (trashUndoTimerRef.current !== null) {
      window.clearTimeout(trashUndoTimerRef.current);
      trashUndoTimerRef.current = null;
    }
  };
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

  return (
    <ModuleShell
      pageWidth="canvas"
      className="task-module calendar-module"
      ambient={{
        scene: "calendar",
        dayProgress: ((now.getHours() * 60) + now.getMinutes()) / 1440,
        progress: filteredEvents.length ? 1 - (openCalendarCount / filteredEvents.length) : 0,
        signal: `${openCalendarCount}:${anchorDateKey ?? "month"}`,
      }}
      header={(
        <PageHeader
          title="Kalendarz"
          description={`Plan zadań · ${formatHeaderDate(viewDate)}`}
          meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
          actions={<Button className="ui-button--icon-mobile" variant="primary" onClick={() => createDraft()} leadingIcon={<Plus size={14} strokeWidth={1.7} />}><span className="header-action-label">Dodaj zadanie</span></Button>}
        />
      )}
    >
      <ContextSidebar
        label="Widoki i listy zadań"
        collapsible={false}
        className="task-context-sidebar calendar-context-sidebar overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="px-2 pb-4 pt-4">
          <SectionHeader title="Główne" level={2} variant="label" className="px-1.5" />
          <div className="space-y-px">
            {PRIMARY_SMART_VIEWS.map(view => {
              const Icon = view.icon;
              return (
                <ContextNavItem
                  key={view.id}
                  active={initialSidebarState.taskView === view.id && !initialSidebarState.listFilter && !initialSidebarState.tagFilter}
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
        <div className="px-2 pb-2 pt-2">
          <SectionHeader title="Widoki specjalne" level={2} variant="label" className="px-1.5" />
          <div className="space-y-px">
            {SPECIAL_SMART_VIEWS.map(view => {
              const Icon = view.icon;
              return (
                <ContextNavItem
                  key={view.id}
                  active={initialSidebarState.taskView === view.id && !initialSidebarState.listFilter && !initialSidebarState.tagFilter}
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
            <div className="px-2 mb-2">
              <div className="flex items-center justify-between px-1.5 mb-1.5">
                <button type="button" className="task-nav__group-toggle" aria-expanded={listyOpen} onClick={() => setListyOpen((open) => { const next = !open; saveTaskSidebarState({ listyOpen: next }); return next; })}>
                  <ChevronRight size={10} strokeWidth={2} className={listyOpen ? "is-open" : undefined} />
                  <span className="task-nav__group-label">Listy</span>
                </button>
              </div>
              {listyOpen && <div className="space-y-px">
                {visibleLists.map((list) => {
                  const filter: CalendarFilter = { kind: "list", id: list.id };
                  const count = sidebarTasks.filter((task) => !task.deleted && !task.done && task.list === list.id).length;
                  return (
                    <ContextNavItem
                      key={list.id}
                      active={calendarFilterKey(calendarFilter) === calendarFilterKey(filter)}
                      onClick={() => applyCalendarFilter(filter)}
                      icon={<span className="h-2 w-2 rounded-full" style={{ background: list.color }} />}
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
            <div className="px-2 mb-2">
              <div className="flex items-center justify-between px-1.5 mb-1.5">
                <button type="button" className="task-nav__group-toggle" aria-expanded={tagiOpen} onClick={() => setTagiOpen((open) => { const next = !open; saveTaskSidebarState({ tagiOpen: next }); return next; })}>
                  <ChevronRight size={10} strokeWidth={2} className={tagiOpen ? "is-open" : undefined} />
                  <span className="task-nav__group-label">Tagi</span>
                </button>
              </div>
              {tagiOpen && <div className="space-y-px">
                {visibleTags.map((tag) => {
                  const filter: CalendarFilter = { kind: "tag", id: tag.id };
                  const count = sidebarTasks.filter((task) => !task.deleted && !task.done && task.tags?.includes(tag.id)).length;
                  return (
                    <ContextNavItem
                      key={tag.id}
                      active={calendarFilterKey(calendarFilter) === calendarFilterKey(filter)}
                      onClick={() => applyCalendarFilter(filter)}
                      icon={<span className="h-2 w-2 rounded-full" style={{ background: tag.color }} />}
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
        <div className="flex-1" />
        <div className="task-nav__footer">
          <ContextNavItem label="Ukończone" icon={<RotateCcw />} onClick={() => openTaskView("ukonczone")} />
          <ContextNavItem label="Kosz" icon={<Trash2 />} onClick={() => openTaskView("kosz")} />
        </div>
      </ContextSidebar>

      <ModuleMain>
        <WorkspaceToolbar>
          <div className="flex items-center gap-1">
            <Select
              aria-label="Filtr kalendarza"
              fieldClassName="context-mobile-select"
              compact
              value={calendarFilterKey(calendarFilter)}
              options={calendarFilterChoices.map(({ value, label }) => ({ value, label }))}
              onChange={(event) => {
                const choice = calendarFilterChoices.find((item) => item.value === event.target.value);
                if (choice) applyCalendarFilter(choice.filter);
              }}
            />
            <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni miesiąc" onClick={() => moveMonth(-1)}><ChevronLeft size={15} strokeWidth={1.5} /></Button>
            <Button variant="quiet" size="sm" onClick={goToday}>Dziś</Button>
            <Button variant="ghost" size="sm" iconOnly aria-label="Następny miesiąc" onClick={() => moveMonth(1)}><ChevronRight size={15} strokeWidth={1.5} /></Button>
            <span className="calendar-toolbar-period workspace-context-label capitalize">{formatHeaderDate(viewDate)}</span>
          </div>
          <div className="task-toolbar-actions">
            <div className="task-priority-filters flex items-center gap-1" aria-label="Filtr priorytetu">
              {CALENDAR_PRIORITIES.map((item) => {
                const active = calendarFilter.kind === "priority" && calendarFilter.id === item.id;
                const color = item.id === "high" ? uiColors.danger : item.id === "medium" ? uiColors.warning : C.blueText;
                return (
                  <Button
                    key={item.id}
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
              {openCalendarCount > 0 && (
                <Badge tone="neutral">
                  {formatOpenTaskCount(openCalendarCount)}
                </Badge>
              )}
            </div>
            <Button size="sm" variant="ghost" iconOnly aria-label="Drukuj kalendarz" onClick={() => window.print()}><Printer size={15} strokeWidth={1.5} /></Button>
            <div className="task-view-switch" role="group" aria-label="Sposób wyświetlania zadań">
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Widok listy"
                aria-pressed="false"
                title="Lista"
                onClick={() => openTaskView("dzis", false)}
              >
                <List size={14} strokeWidth={1.7} />
              </Button>
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                aria-label="Widok kalendarza"
                aria-pressed="true"
                title="Kalendarz"
              >
                <CalendarDays size={14} strokeWidth={1.7} />
              </Button>
            </div>
          </div>
        </WorkspaceToolbar>

        <p id="calendar-keyboard-move-instructions" className="ui-sr-only">
          Aby przesunąć zadanie o jeden dzień, użyj Alt i strzałki w lewo lub w prawo.
        </p>
        <p className="ui-sr-only" role="status" aria-live="polite" aria-atomic="true">
          {calendarAnnouncement}
        </p>
        {trashedTask && (
          <div className="calendar-undo" role="status" aria-live="polite">
            <span>
              Przeniesiono {trashedTask.schedule?.recurrence ? "całą serię" : "zadanie"} „{trashedTask.text || "Zadanie bez nazwy"}” do Kosza.
            </span>
            <Button variant="quiet" size="sm" onClick={undoDeleteTask}>Cofnij</Button>
          </div>
        )}

        {/* A <div> rather than <section>: ARIA does not allow role="grid" on a sectioning
            element, and the grid already carries its own accessible name. */}
        <div
          ref={calendarRootRef}
          role="grid"
          aria-label={`Kalendarz: ${formatHeaderDate(viewDate)}`}
          aria-colcount={7}
          aria-rowcount={calendarRows.length + 1}
          className="calendar-page flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          style={{ color: C.text }}
        >
          <div role="row" aria-rowindex={1} className="calendar-weekdays" style={{ borderBottom: `1px solid ${C.border}` }}>
            {WEEKDAYS.map((day) => <div key={day} role="columnheader" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: "var(--text-label)" }}>{day}</div>)}
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
              aria-label={`${cell.day} ${MONTHS[cell.month]} ${cell.year}. Enter, aby dodać zadanie.`}
              data-calendar-cell={key}
              className={`calendar-cell${isToday ? " is-today" : ""}${dragOverDateKey === key ? " is-drop-target" : ""}`}
              onFocus={() => setFocusedDateKey(key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  if (event.target !== event.currentTarget) return;
                  event.preventDefault();
                  if (selectedTask || selectedExternalOccurrence) closeTaskDetail();
                  else createDraft(key);
                  return;
                }
                handleCellKeyDown(event, cellIndex, key);
              }}
              onClick={() => {
                if (suppressCellClickRef.current) {
                  suppressCellClickRef.current = false;
                  return;
                }
                createDraft(key);
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
              style={{
                minWidth: 0, minHeight: 0, position: "relative", padding: "7px 5px 4px",
                borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
                cursor: "pointer", transition: "background-color 140ms ease-out, box-shadow 140ms ease-out",
              }}
            >
              <div style={{ height: 25, display: "flex", alignItems: "flex-start" }}>
                <span style={{ width: 25, height: 25, display: "grid", placeItems: "center", borderRadius: "50%", background: isToday ? C.blue : "transparent", color: isToday ? C.text : cell.current ? C.text : C.disabled, fontSize: 12, fontWeight: isToday ? 600 : 400 }}>{cell.day}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                {dayEvents.slice(0, 3).map((event) => (
                  <CalendarEventBar
                    key={event.key}
                    event={event}
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
                {dayEvents.length > 3 && (
                  <>
                    <button
                      id={`calendar-overflow-trigger-${key}`}
                      type="button"
                      className="calendar-overflow-trigger"
                      aria-label={`Pokaż pozostałe wpisy z ${cell.day} ${MONTHS[cell.month]}: ${dayEvents.length - 3}`}
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
                      +{dayEvents.length - 3} więcej
                    </button>
                    {agendaDateKey === key && (
                      <Menu
                        ref={agendaMenuRef}
                        id={`calendar-agenda-${key}`}
                        className="calendar-agenda"
                        aria-labelledby={`calendar-overflow-trigger-${key}`}
                        triggerRef={agendaTriggerRef}
                        initialFocus="first"
                        onDismiss={() => setAgendaDateKey(null)}
                        style={{ left: agendaPosition.left, top: agendaPosition.top }}
                        onClick={(menuEvent) => menuEvent.stopPropagation()}
                      >
                        {dayEvents.slice(3).map((hiddenEvent) => {
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
                                {(hiddenEvent.time || task?.occurrence.virtual || hiddenEvent.source.label) && (
                                  <span className="calendar-agenda-item__meta">
                                    {[hiddenEvent.time, task?.occurrence.virtual ? "Cykliczne" : null, hiddenEvent.source.label, hiddenEvent.status.label].filter(Boolean).join(" · ")}
                                  </span>
                                )}
                              </span>
                            </MenuItem>
                          );
                        })}
                      </Menu>
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
      </ModuleMain>

      <TaskReminderCenter tasks={events} habits={workspaceRef.current.habits} />

      {selectedTask && (
        <div
          ref={detailRef}
          className="calendar-task-detail"
          role="dialog"
          aria-modal="false"
          aria-label={selectedVirtualOccurrence ? "Szczegóły wystąpienia cyklicznego" : "Szczegóły zadania"}
          style={{
            position: "fixed", zIndex: 40, left: detailPosition.left, top: detailPosition.top,
            visibility: detailPosition.ready ? "visible" : "hidden",
            width: detailPosition.width, height: detailPosition.height, overflow: "hidden",
            border: `1px solid ${C.border}`, borderRadius: 15,
            boxShadow: "0 12px 36px rgba(0,0,0,.38)",
          }}
        >
          <TaskDetail
            task={selectedTask}
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
        </div>
      )}

      {selectedExternalOccurrence && (
        <div
          ref={detailRef}
          className="calendar-task-detail calendar-source-detail"
          role="dialog"
          aria-modal="false"
          aria-label={`Szczegóły: ${selectedExternalOccurrence.title}`}
          style={{
            position: "fixed", zIndex: 40, left: detailPosition.left, top: detailPosition.top,
            visibility: detailPosition.ready ? "visible" : "hidden",
            width: detailPosition.width, maxHeight: detailPosition.height, overflow: "auto",
            border: `1px solid ${C.border}`, borderRadius: 15,
            boxShadow: "0 12px 36px rgba(0,0,0,.38)",
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
              <X size={14} />
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
