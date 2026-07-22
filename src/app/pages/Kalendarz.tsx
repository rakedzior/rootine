import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight,
  Plus, Printer,
} from "lucide-react";
import { TaskDetail } from "./Zadania";
import { persistTaskCompletion } from "../data/taskCompletion";
import {
  isCalendarTask,
  loadTaskWorkspace,
  replaceCalendarTasks,
  saveTaskWorkspace,
  taskViewForCalendarDate,
  type WorkspaceList as ListItem,
  type WorkspaceTag as TagItem,
  type WorkspaceTask as Task,
} from "../data/taskWorkspace";
import { Badge, Button, ModuleMain, ModuleShell, PageHeader, WorkspaceToolbar, uiColors } from "../ui";

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

function CalendarEventBar({ event, dragging, onClick, onToggle, onDragStart, onDragEnd }: {
  event: CalendarEvent;
  dragging: boolean;
  onClick: () => void;
  onToggle: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Zadanie: ${event.text || "bez nazwy"}`}
      className="calendar-event"
      draggable
      aria-grabbed={dragging}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        width: "100%", minWidth: 0, display: "flex", alignItems: "center", gap: 4,
        border: "none", borderRadius: 4, padding: "3px 5px",
        background: C.blueSoft, color: C.text, textAlign: "left",
        fontSize: 11, lineHeight: 1.25, overflow: "hidden", cursor: dragging ? "grabbing" : "grab",
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
        style={{ borderColor: event.done ? C.blueText : C.second }}
      >
        {event.done && <span style={{ fontSize: 8, lineHeight: 1, fontWeight: 700 }}>✓</span>}
      </button>
      <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} className="flex min-w-0 flex-1 items-center gap-1 border-0 bg-transparent p-0 text-left" style={{ color: "inherit", cursor: "pointer" }} aria-label={`Otwórz zadanie ${event.text || "bez nazwy"}`}>
        <span title={event.text} style={{ minWidth: 0, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: event.done ? "line-through" : "none", opacity: event.done ? 0.6 : 1 }}>{event.text}</span>
        {event.time && <span style={{ fontFamily: "var(--font-data)", fontSize: 9, color: C.blueText, flexShrink: 0 }}>{event.time}</span>}
      </button>
    </div>
  );
}

export default function Kalendarz() {
  const now = new Date();
  const [viewDate, setViewDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadTaskWorkspace().tasks.filter(isCalendarTask).filter((event) => !event.deleted));
  const [lists] = useState<ListItem[]>(() => loadTaskWorkspace().lists);
  const [tags] = useState<TagItem[]>(() => loadTaskWorkspace().tags);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [anchorDateKey, setAnchorDateKey] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState({ left: 8, top: 73, width: 440, height: 400, ready: false });
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const calendarRootRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const suppressCellClickRef = useRef(false);
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => {
    const workspace = loadTaskWorkspace();
    const persistedEvents = events.filter((event) => event.text.trim().length > 0);
    setStorageFailed(!saveTaskWorkspace(replaceCalendarTasks(workspace, persistedEvents)));
  }, [events]);

  const cells = useMemo(() => getCalendarCells(viewDate.getFullYear(), viewDate.getMonth()), [viewDate]);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    events.forEach((event) => grouped.set(event.calendarDate, [...(grouped.get(event.calendarDate) ?? []), event]));
    return grouped;
  }, [events]);
  const selectedTask = selectedId === null ? null : events.find((event) => event.id === selectedId) ?? null;

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

  const closeTaskDetail = () => {
    if (draftId !== null) {
      setEvents((current) => current.filter((event) => event.id !== draftId || Boolean(event.text.trim())));
      setDraftId(null);
    }
    setSelectedId(null);
    setAnchorDateKey(null);
    setDetailPosition((current) => ({ ...current, ready: false }));
  };

  const selectEvent = (id: number) => {
    if (draftId !== null && draftId !== id) closeTaskDetail();
    if (draftId === id) {
      closeTaskDetail();
      return;
    }
    setAnchorDateKey(events.find((event) => event.id === id)?.calendarDate ?? null);
    setSelectedId((current) => current === id ? null : id);
  };

  useEffect(() => {
    if (!selectedTask) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (detailRef.current?.contains(target as Node)) return;
      if (target instanceof Element && target.closest(".calendar-event")) return;
      if (target instanceof Element && target.closest(".calendar-cell")) suppressCellClickRef.current = true;
      closeTaskDetail();
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [selectedTask, draftId]);

  const moveMonth = (amount: number) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
    closeTaskDetail();
  };
  const goToday = () => {
    const current = new Date();
    setViewDate(new Date(current.getFullYear(), current.getMonth(), 1));
    closeTaskDetail();
  };
  const updateTask = (id: number, patch: Partial<CalendarEvent>) => {
    if (typeof patch.done === "boolean") persistTaskCompletion(id, patch.done);
    const dateWasCleared = Object.prototype.hasOwnProperty.call(patch, "calendarDate") && !patch.calendarDate;
    if (dateWasCleared) {
      const workspace = loadTaskWorkspace();
      const tasks = workspace.tasks.map((task) => task.id === id ? { ...task, ...patch, calendarDate: undefined } : task);
      setStorageFailed(!saveTaskWorkspace({ ...workspace, tasks }));
      setEvents((current) => current.filter((event) => event.id !== id));
      if (draftId === id) setDraftId(null);
      if (selectedId === id) {
        setSelectedId(null);
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
  const moveTaskToDate = (id: number, calendarDate: string) => {
    updateTask(id, { calendarDate, date: formatTaskDate(calendarDate), view: taskViewForCalendarDate(calendarDate) });
  };
  const deleteTask = (id: number) => {
    setEvents((current) => current.filter((event) => event.id !== id));
    if (draftId === id) setDraftId(null);
    setSelectedId(null);
  };
  const createDraft = (calendarDate = todayKey()) => {
    const parsed = new Date(`${calendarDate}T12:00:00`);
    const event: CalendarEvent = {
      id: Date.now(), calendarDate, text: "", done: false, date: formatTaskDate(calendarDate),
      view: taskViewForCalendarDate(calendarDate), list: "hobby", tags: ["hobby"],
    };
    if (draftId !== null) closeTaskDetail();
    setEvents((current) => [...current, event]);
    setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    setAnchorDateKey(calendarDate);
    setDraftId(event.id);
    setSelectedId(event.id);
  };

  return (
    <ModuleShell>
      <ModuleMain>
        <PageHeader
          title="Kalendarz"
          description={formatHeaderDate(viewDate)}
          leading={<CalendarDays size={18} strokeWidth={1.5} />}
          meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
          actions={<Button className="ui-button--icon-mobile" variant="primary" onClick={() => createDraft()} leadingIcon={<Plus size={14} strokeWidth={1.7} />}><span className="header-action-label">Nowe wydarzenie</span></Button>}
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

        <section ref={calendarRootRef} className="calendar-page flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ background: C.bg, color: C.text }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", height: 31, flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
            {WEEKDAYS.map((day) => <div key={day} style={{ display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: "var(--text-label)" }}>{day}</div>)}
          </div>

          <div role="grid" aria-label={`Kalendarz: ${formatHeaderDate(viewDate)}`} style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridTemplateRows: `repeat(${cells.length / 7}, minmax(88px, 1fr))`, overflow: "hidden" }}>
        {cells.map((cell) => {
          const key = dateKey(cell.year, cell.month, cell.day);
          const dayEvents = eventsByDate.get(key) ?? [];
          const isToday = key === todayKey();
          return (
            <div
              key={key}
              role="gridcell"
              tabIndex={0}
              aria-label={`${cell.day} ${MONTHS[cell.month]} ${cell.year}. Enter, aby dodać zadanie.`}
              data-calendar-cell={key}
              className="calendar-cell"
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault();
                if (selectedTask) closeTaskDetail();
                else createDraft(key);
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
                const taskId = Number.isFinite(transferredId) && transferredId > 0 ? transferredId : draggedId;
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
                {dayEvents.map((event) => (
                  <CalendarEventBar
                    key={event.id}
                    event={event}
                    dragging={draggedId === event.id}
                    onClick={() => selectEvent(event.id)}
                    onToggle={() => updateTask(event.id, { done: !event.done })}
                    onDragStart={(dragEvent) => {
                      dragEvent.stopPropagation();
                      dragEvent.dataTransfer.effectAllowed = "move";
                      dragEvent.dataTransfer.setData("application/x-rootine-task-id", String(event.id));
                      setDraggedId(event.id);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverDateKey(null);
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
          </div>
        </section>
      </ModuleMain>

      {selectedTask && (
        <div
          ref={detailRef}
          className="calendar-task-detail"
          role="dialog"
          aria-label="Szczegóły wydarzenia"
          style={{
            position: "fixed", zIndex: 40, left: detailPosition.left, top: detailPosition.top,
            visibility: detailPosition.ready ? "visible" : "hidden",
            width: detailPosition.width, height: detailPosition.height, overflow: "hidden",
            border: `1px solid ${C.border}`, borderRadius: 15,
            boxShadow: "0 12px 36px rgba(0,0,0,.38)",
          }}
        >
          <TaskDetail task={selectedTask} onClose={closeTaskDetail} onUpdate={updateTask} onDelete={deleteTask} listy={lists} tagi={tags} />
        </div>
      )}
    </ModuleShell>
  );
}
