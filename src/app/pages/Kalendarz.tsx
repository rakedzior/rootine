import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight,
  Plus, Printer,
} from "lucide-react";
import { TaskDetail } from "./tasks/TaskViews";
import { persistTaskCompletion } from "../data/taskCompletion";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import {
  projectTaskOccurrences,
  setTaskOccurrenceCompletion,
  type TaskOccurrence,
} from "../data/taskSchedule";
import { TRAVEL_STORAGE_KEY } from "../data/travelWorkspace";
import { WORK_STORAGE_KEY } from "../data/workWorkspace";
import {
  isCalendarTask,
  loadTaskWorkspace,
  replaceCalendarTasks,
  restoreTask,
  saveTaskWorkspace,
  TASK_STORAGE_KEY,
  taskViewForCalendarDate,
  trashTask,
  type WorkspaceList as ListItem,
  type WorkspaceTag as TagItem,
  type WorkspaceTask as Task,
} from "../data/taskWorkspace";
import {
  Badge,
  Button,
  Menu,
  MenuItem,
  ModuleMain,
  ModuleShell,
  PageHeader,
  WorkspaceToolbar,
  uiColors,
} from "../ui";
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
  blueSignal: uiColors.precisionBlue,
  blueText: uiColors.precisionBlueText,
  blueSoft: uiColors.precisionBlueSoft,
  hover: uiColors.graphiteHover,
} as const;

const MONTHS = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];
const WEEKDAYS = ["pon.", "wt.", "śr.", "czw.", "pt.", "sob.", "niedz."];

type CalendarEvent = Task & { calendarDate: string };
type CalendarOccurrence = TaskOccurrence;

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

function CalendarEventBar({ event, dragging, onClick, onToggle, onMoveByDay, onDragStart, onDragEnd }: {
  event: CalendarOccurrence;
  dragging: boolean;
  onClick: (trigger: HTMLButtonElement) => void;
  onToggle: () => void;
  onMoveByDay: (amount: number) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  const sourceLabel = event.source?.kind === "work" ? "Praca" : event.source ? "Podróże" : null;
  const virtual = event.occurrence.virtual;
  return (
    <div
      role="group"
      aria-label={`Zadanie: ${event.text || "bez nazwy"}${virtual ? "; wystąpienie zadania cyklicznego" : ""}${event.source ? `; źródło ${sourceLabel}: ${event.source.context}` : ""}`}
      className="calendar-event"
      draggable={!virtual}
      aria-grabbed={virtual ? undefined : dragging}
      onDragStart={virtual ? undefined : onDragStart}
      onDragEnd={virtual ? undefined : onDragEnd}
      style={{
        width: "100%", minWidth: 0, display: "flex", alignItems: "center", gap: 4,
        border: "none", borderRadius: 4, padding: "0 5px",
        background: C.blueSoft, color: C.text, textAlign: "left",
        fontSize: 11, lineHeight: 1.25, overflow: "hidden", cursor: virtual ? "default" : dragging ? "grabbing" : "grab",
        opacity: dragging ? 0.48 : 1, transition: "background-color 140ms ease-out, opacity 140ms ease-out",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.blueSoft; }}
    >
      <button
        type="button"
        aria-label={event.done ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        onKeyDown={(e) => e.stopPropagation()}
        className={`task-checkbox task-checkbox--compact ${event.done ? "is-checked" : ""}`}
        style={{ "--task-checkbox-color": event.done ? C.blueText : C.second } as React.CSSProperties}
      >
        {event.done && <span style={{ fontSize: 8, lineHeight: 1, fontWeight: 700 }}>✓</span>}
      </button>
      <button
        type="button"
        data-calendar-event-id={event.id}
        aria-label={`Otwórz zadanie ${event.text || "bez nazwy"}`}
        aria-describedby={virtual ? undefined : "calendar-keyboard-move-instructions"}
        aria-keyshortcuts={virtual ? undefined : "Alt+ArrowLeft Alt+ArrowRight"}
        onClick={(e) => { e.stopPropagation(); onClick(e.currentTarget); }}
        onKeyDown={(keyboardEvent) => {
          if (virtual) return;
          if (!keyboardEvent.altKey || (keyboardEvent.key !== "ArrowLeft" && keyboardEvent.key !== "ArrowRight")) return;
          keyboardEvent.preventDefault();
          keyboardEvent.stopPropagation();
          onMoveByDay(keyboardEvent.key === "ArrowLeft" ? -1 : 1);
        }}
        className="flex min-h-6 min-w-0 flex-1 items-center gap-1 border-0 bg-transparent p-0 text-left"
        style={{ color: "inherit", cursor: "pointer" }}
      >
        <span title={event.text} style={{ minWidth: 0, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: event.done ? "line-through" : "none", opacity: event.done ? 0.6 : 1 }}>{event.text}</span>
        {virtual && <span aria-hidden="true" title="Wystąpienie cykliczne" style={{ color: C.blueText, flexShrink: 0 }}>↻</span>}
        {sourceLabel && <span style={{ flexShrink: 0, fontSize: 8, color: C.muted }}>{sourceLabel}</span>}
        {event.time && <span style={{ fontFamily: "var(--font-data)", fontSize: 9, color: C.blueText, flexShrink: 0 }}>{event.time}</span>}
      </button>
    </div>
  );
}

export default function Kalendarz() {
  const now = new Date();
  const [initialWorkspace] = useState(loadTaskWorkspace);
  const [viewDate, setViewDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>(() => initialWorkspace.tasks.filter(isCalendarTask));
  const [lists, setLists] = useState<ListItem[]>(initialWorkspace.lists);
  const [tags, setTags] = useState<TagItem[]>(initialWorkspace.tags);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedOccurrenceDate, setSelectedOccurrenceDate] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [anchorDateKey, setAnchorDateKey] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState({ left: 8, top: 73, width: 440, height: 400, ready: false });
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const [agendaDateKey, setAgendaDateKey] = useState<string | null>(null);
  const [agendaPosition, setAgendaPosition] = useState({ left: 8, top: 8 });
  const [calendarAnnouncement, setCalendarAnnouncement] = useState("");
  const [trashedTask, setTrashedTask] = useState<CalendarEvent | null>(null);
  const calendarRootRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const agendaMenuRef = useRef<HTMLDivElement>(null);
  const agendaTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);
  const detailInitialFocusIdRef = useRef<number | null>(null);
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
      workspaceRef.current = nextWorkspace;
      setEvents(nextWorkspace.tasks.filter(isCalendarTask));
      setLists(nextWorkspace.lists);
      setTags(nextWorkspace.tags);
      setSelectedId((current) => current !== null && nextWorkspace.tasks.some((task) => task.id === current && isCalendarTask(task)) ? current : null);
    };
    const unsubscribers = [
      subscribeToLocalWorkspace(TASK_STORAGE_KEY, syncWorkspace),
      subscribeToLocalWorkspace(WORK_STORAGE_KEY, syncWorkspace),
      subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, syncWorkspace),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const cells = useMemo(() => getCalendarCells(viewDate.getFullYear(), viewDate.getMonth()), [viewDate]);
  const calendarRows = useMemo(
    () => Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7)),
    [cells],
  );
  const visibleOccurrences = useMemo(() => {
    const first = cells[0];
    const last = cells.at(-1);
    if (!first || !last) return [] as CalendarOccurrence[];
    return projectTaskOccurrences(
      events,
      dateKey(first.year, first.month, first.day),
      dateKey(last.year, last.month, last.day),
    ).filter((event) => !event.deleted);
  }, [cells, events]);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarOccurrence[]>();
    visibleOccurrences.forEach((event) => grouped.set(event.calendarDate, [...(grouped.get(event.calendarDate) ?? []), event]));
    return grouped;
  }, [visibleOccurrences]);
  const selectedTask = selectedId === null ? null : events.find((event) => event.id === selectedId && !event.deleted) ?? null;
  const selectedVirtualOccurrence = useMemo(() => {
    if (!selectedTask || !selectedOccurrenceDate) return null;
    return projectTaskOccurrences(
      [selectedTask],
      selectedOccurrenceDate,
      selectedOccurrenceDate,
    ).find((occurrence) => occurrence.occurrence.virtual) ?? null;
  }, [selectedOccurrenceDate, selectedTask]);
  const selectedTaskId = selectedTask?.id ?? null;

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
    if (!selectedTask || !anchorDateKey) return;
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
  }, [selectedTask, anchorDateKey, viewDate]);

  const closeTaskDetail = useCallback((restoreFocus = true) => {
    if (draftId !== null) {
      setEvents((current) => current.filter((event) => event.id !== draftId || Boolean(event.text.trim())));
      setDraftId(null);
    }
    setSelectedId(null);
    setSelectedOccurrenceDate(null);
    setAnchorDateKey(null);
    setDetailPosition((current) => ({ ...current, ready: false }));
    if (restoreFocus) requestAnimationFrame(() => detailReturnFocusRef.current?.focus());
  }, [draftId]);

  const selectEvent = (event: CalendarOccurrence, trigger?: HTMLElement) => {
    const id = event.occurrence.sourceTaskId;
    if (trigger) detailReturnFocusRef.current = trigger;
    if (draftId !== null && draftId !== id) closeTaskDetail();
    if (draftId === id) {
      closeTaskDetail();
      return;
    }
    setAnchorDateKey(event.calendarDate);
    setSelectedId(id);
    setSelectedOccurrenceDate(event.occurrence.virtual ? event.occurrence.date : null);
  };

  useEffect(() => {
    if (selectedTaskId === null) {
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
    const shouldMoveFocus = detailInitialFocusIdRef.current !== selectedTaskId;
    detailInitialFocusIdRef.current = selectedTaskId;
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
  }, [closeTaskDetail, selectedTaskId]);

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
  const toggleOccurrence = (occurrence: CalendarOccurrence) => {
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
    <ModuleShell>
      <ModuleMain>
        <PageHeader
          title="Kalendarz"
          description={formatHeaderDate(viewDate)}
          leading={<CalendarDays size={18} strokeWidth={1.5} />}
          meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
          actions={<Button className="ui-button--icon-mobile" variant="primary" onClick={() => createDraft()} leadingIcon={<Plus size={14} strokeWidth={1.7} />}><span className="header-action-label">Nowe zadanie</span></Button>}
        />

        <WorkspaceToolbar>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni miesiąc" onClick={() => moveMonth(-1)}><ChevronLeft size={15} strokeWidth={1.5} /></Button>
            <Button variant="quiet" size="sm" onClick={goToday}>Dziś</Button>
            <Button variant="ghost" size="sm" iconOnly aria-label="Następny miesiąc" onClick={() => moveMonth(1)}><ChevronRight size={15} strokeWidth={1.5} /></Button>
            <span className="calendar-toolbar-period workspace-context-label capitalize">{formatHeaderDate(viewDate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="neutral">Miesiąc</Badge>
            <Button size="sm" variant="ghost" iconOnly aria-label="Drukuj kalendarz" onClick={() => window.print()}><Printer size={15} strokeWidth={1.5} /></Button>
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

        <section
          ref={calendarRootRef}
          role="grid"
          aria-label={`Kalendarz: ${formatHeaderDate(viewDate)}`}
          aria-colcount={7}
          aria-rowcount={calendarRows.length + 1}
          className="calendar-page flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          style={{ background: C.bg, color: C.text }}
        >
          <div role="row" aria-rowindex={1} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", height: 31, flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
            {WEEKDAYS.map((day) => <div key={day} role="columnheader" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: "var(--text-label)" }}>{day}</div>)}
          </div>

          <div role="rowgroup" style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateRows: `repeat(${calendarRows.length}, minmax(112px, 1fr))`, overflow: "auto" }}>
        {calendarRows.map((row, rowIndex) => (
          <div key={`${row[0]?.year}-${row[0]?.month}-${row[0]?.day}`} role="row" aria-rowindex={rowIndex + 2} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", minHeight: 0 }}>
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
              className="calendar-cell"
              onFocus={() => setFocusedDateKey(key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  if (event.target !== event.currentTarget) return;
                  event.preventDefault();
                  if (selectedTask) closeTaskDetail();
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
                background: dragOverDateKey === key ? C.hover : isToday ? C.blueSoft : C.grid,
                boxShadow: dragOverDateKey === key ? `inset 0 0 0 1px ${C.blueSignal}` : "none",
                cursor: "pointer", transition: "background-color 140ms ease-out, box-shadow 140ms ease-out",
              }}
            >
              <div style={{ height: 25, display: "flex", alignItems: "flex-start" }}>
                <span style={{ width: 25, height: 25, display: "grid", placeItems: "center", borderRadius: "50%", background: isToday ? C.blue : "transparent", color: isToday ? C.text : cell.current ? C.text : C.disabled, fontSize: 12, fontWeight: isToday ? 600 : 400 }}>{cell.day}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                {dayEvents.slice(0, 3).map((event) => (
                  <CalendarEventBar
                    key={event.occurrence.key}
                    event={event}
                    dragging={draggedId === event.id}
                    onClick={(trigger) => selectEvent(event, trigger)}
                    onToggle={() => toggleOccurrence(event)}
                    onMoveByDay={(amount) => moveTaskByDays(event, amount)}
                    onDragStart={(dragEvent) => {
                      dragEvent.stopPropagation();
                      dragEvent.dataTransfer.effectAllowed = "move";
                      dragEvent.dataTransfer.setData("application/x-rootine-task-id", String(event.occurrence.sourceTaskId));
                      setDraggedId(event.occurrence.sourceTaskId);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverDateKey(null);
                    }}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <>
                    <button
                      id={`calendar-overflow-trigger-${key}`}
                      type="button"
                      className="calendar-overflow-trigger"
                      aria-label={`Pokaż pozostałe zadania z ${cell.day} ${MONTHS[cell.month]}: ${dayEvents.length - 3}`}
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
                          const sourceLabel = hiddenEvent.source?.kind === "work"
                            ? "Praca"
                            : hiddenEvent.source
                              ? "Podróże"
                              : null;
                          return (
                            <MenuItem
                              key={hiddenEvent.occurrence.key}
                              data-calendar-event-id={hiddenEvent.id}
                              aria-describedby={hiddenEvent.occurrence.virtual ? undefined : "calendar-keyboard-move-instructions"}
                              aria-keyshortcuts={hiddenEvent.occurrence.virtual ? undefined : "Alt+ArrowLeft Alt+ArrowRight"}
                              onClick={() => {
                                const returnTarget = agendaTriggerRef.current;
                                setAgendaDateKey(null);
                                selectEvent(hiddenEvent, returnTarget ?? undefined);
                              }}
                              onKeyDown={(keyboardEvent) => {
                                if (hiddenEvent.occurrence.virtual) return;
                                if (!keyboardEvent.altKey || (keyboardEvent.key !== "ArrowLeft" && keyboardEvent.key !== "ArrowRight")) return;
                                keyboardEvent.preventDefault();
                                keyboardEvent.stopPropagation();
                                moveTaskByDays(hiddenEvent, keyboardEvent.key === "ArrowLeft" ? -1 : 1);
                              }}
                            >
                              <span className="calendar-agenda-item">
                                <span className="calendar-agenda-item__title">
                                  {hiddenEvent.text || "Zadanie bez nazwy"}
                                </span>
                                {(hiddenEvent.time || hiddenEvent.occurrence.virtual || sourceLabel) && (
                                  <span className="calendar-agenda-item__meta">
                                    {[hiddenEvent.time, hiddenEvent.occurrence.virtual ? "Cykliczne" : null, sourceLabel].filter(Boolean).join(" · ")}
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
        </section>
      </ModuleMain>

      <TaskReminderCenter tasks={events} />

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
    </ModuleShell>
  );
}
