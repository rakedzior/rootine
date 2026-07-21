import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight,
  MoreHorizontal, Plus, Calendar, Printer,
} from "lucide-react";
import { TaskDetail, type ListItem, type TagItem, type Task } from "./Zadania";
import { CALENDAR_TASKS } from "../data/calendarTasks";
import { hydrateTaskCompletion, persistTaskCompletion } from "../data/taskCompletion";

const C = {
  bg: "#242424",
  grid: "#242424",
  border: "#383838",
  borderStrong: "#484848",
  text: "#F0F0F0",
  second: "#9A9A9A",
  muted: "#646464",
  disabled: "#444444",
  blue: "#4772FA",
  blueSoft: "rgba(71,114,250,0.62)",
} as const;

const MONTHS = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];
const WEEKDAYS = ["pon.", "wt.", "śr.", "czw.", "pt.", "sob.", "niedz."];

const LISTS: ListItem[] = [
  { id: "hobby", label: "Hobby", color: "#8EA5C8" },
  { id: "dom", label: "Dom", color: "#D4AA68" },
  { id: "praca", label: "Praca", color: "#4772FA" },
];
const TAGS: TagItem[] = [
  { id: "hobby", label: "hobby", color: "#8EA5C8" },
  { id: "dom", label: "dom", color: "#D4AA68" },
  { id: "praca", label: "praca", color: "#4772FA" },
];

type CalendarEvent = Task & { calendarDate: string };

const INITIAL_EVENTS: CalendarEvent[] = CALENDAR_TASKS.map((task) => ({
  ...task,
  date: task.dateLabel,
  view: "kalendarz",
}));

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

function CalendarEventBar({ event, onClick, onToggle }: { event: CalendarEvent; onClick: () => void; onToggle: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="calendar-event"
      style={{
        width: "100%", minWidth: 0, display: "flex", alignItems: "center", gap: 4,
        border: "1px solid rgba(148,165,255,0.58)", borderRadius: 3, padding: "2px 4px",
        background: C.blueSoft, color: "#F0F2FF", cursor: "pointer", textAlign: "left",
        fontSize: 11, lineHeight: 1.25, overflow: "hidden", transition: "background .15s, border-color .15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(71,114,250,0.82)"; e.currentTarget.style.borderColor = "rgba(148,165,255,0.85)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.blueSoft; e.currentTarget.style.borderColor = "rgba(148,165,255,0.58)"; }}
    >
      <button
        type="button"
        aria-label={event.done ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        onKeyDown={(e) => e.stopPropagation()}
        style={{ width: 11, height: 11, display: "grid", placeItems: "center", border: `1px solid ${event.done ? "#70B89F" : "rgba(200,208,255,0.72)"}`, borderRadius: 2, background: event.done ? "rgba(112,184,159,0.2)" : "transparent", color: "#70B89F", flexShrink: 0, cursor: "pointer", padding: 0 }}
      >
        {event.done && <span style={{ fontSize: 8, lineHeight: 1, fontWeight: 700 }}>✓</span>}
      </button>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: event.done ? "line-through" : "none", opacity: event.done ? 0.6 : 1 }}>{event.text}</span>
      {event.time && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#C3CAFF", flexShrink: 0 }}>{event.time}</span>}
    </div>
  );
}

export default function Kalendarz() {
  const now = new Date();
  const [viewDate, setViewDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>(() => hydrateTaskCompletion(INITIAL_EVENTS));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [anchorDateKey, setAnchorDateKey] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState({ left: 8, top: 73, width: 440, height: 400, ready: false });
  const [viewMode, setViewMode] = useState("Miesiąc");
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const calendarRootRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const suppressCellClickRef = useRef(false);

  const cells = useMemo(() => getCalendarCells(viewDate.getFullYear(), viewDate.getMonth()), [viewDate]);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    events.forEach((event) => grouped.set(event.calendarDate, [...(grouped.get(event.calendarDate) ?? []), event]));
    return grouped;
  }, [events]);
  const selectedTask = selectedId === null ? null : events.find((event) => event.id === selectedId) ?? null;
  const calendarAnchorEl = anchorDateKey
    ? calendarRootRef.current?.querySelector<HTMLElement>(`[data-calendar-cell="${anchorDateKey}"]`) ?? null
    : null;

  useLayoutEffect(() => {
    if (!selectedTask || !anchorDateKey) return;
    const repositionDetail = () => {
      const cell = calendarRootRef.current?.querySelector<HTMLElement>(`[data-calendar-cell="${anchorDateKey}"]`);
      const panel = detailRef.current;
      if (!cell || !panel) return;
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
    return () => { window.removeEventListener("resize", repositionDetail); window.removeEventListener("scroll", repositionDetail, true); };
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
      if (target instanceof Element && target.closest(".calendar-cell")) {
        suppressCellClickRef.current = true;
      }
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
  };
  const updateTask = (id: number, patch: Partial<Task>) => {
    if (typeof patch.done === "boolean") persistTaskCompletion(id, patch.done);
    setEvents((current) => current.map((event) => event.id === id ? { ...event, ...patch } : event));
  };
  const deleteTask = (id: number) => {
    setEvents((current) => current.filter((event) => event.id !== id));
    if (draftId === id) setDraftId(null);
    setSelectedId(null);
  };
  const createDraft = (calendarDate = todayKey()) => {
    const parsed = new Date(`${calendarDate}T12:00:00`);
    const label = parsed.toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" });
    const event: CalendarEvent = {
      id: Date.now(), calendarDate, text: "", done: false, date: label,
      view: "kalendarz", list: "hobby", tags: ["hobby"],
    };
    if (draftId !== null) closeTaskDetail();
    setEvents((current) => [...current, event]);
    setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    setAnchorDateKey(calendarDate);
    setDraftId(event.id);
    setSelectedId(event.id);
  };

  return (
    <section ref={calendarRootRef} className="calendar-page" style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: C.bg, color: C.text }}>
      <header style={{ height: 58, padding: "0 15px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <CalendarDays size={18} strokeWidth={1.5} style={{ color: C.text, flexShrink: 0 }} />
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 500, textTransform: "lowercase", whiteSpace: "nowrap" }}>{formatHeaderDate(viewDate)}</h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          <button type="button" aria-label="Dodaj zadanie" onClick={() => { createDraft(); setShowViewMenu(false); setShowMoreMenu(false); }} style={{ width: 31, height: 31, display: "grid", placeItems: "center", border: `1px solid ${C.borderStrong}`, borderRadius: 9, background: "transparent", color: C.text, cursor: "pointer" }}>
            <Plus size={16} strokeWidth={1.5} />
          </button>
          <button type="button" onClick={() => { setShowViewMenu((value) => !value); setShowMoreMenu(false); }} style={{ height: 31, display: "flex", alignItems: "center", gap: 5, padding: "0 11px", border: `1px solid ${C.borderStrong}`, borderRadius: 9, background: "transparent", color: C.text, cursor: "pointer", fontSize: 12 }}>
            {viewMode}<ChevronDown size={12} strokeWidth={1.5} />
          </button>
          <div style={{ display: "flex", height: 31, border: `1px solid ${C.borderStrong}`, borderRadius: 9, overflow: "hidden" }}>
            <button type="button" aria-label="Poprzedni miesiąc" onClick={() => moveMonth(-1)} style={{ width: 32, border: 0, borderRight: `1px solid ${C.borderStrong}`, background: "transparent", color: C.second, cursor: "pointer" }}><ChevronLeft size={15} strokeWidth={1.5} /></button>
            <button type="button" onClick={goToday} style={{ padding: "0 11px", border: 0, background: "transparent", color: C.text, cursor: "pointer", fontSize: 12 }}>Dziś</button>
            <button type="button" aria-label="Następny miesiąc" onClick={() => moveMonth(1)} style={{ width: 32, border: 0, borderLeft: `1px solid ${C.borderStrong}`, background: "transparent", color: C.second, cursor: "pointer" }}><ChevronRight size={15} strokeWidth={1.5} /></button>
          </div>
          <button type="button" aria-label="Więcej opcji" onClick={() => { setShowMoreMenu((value) => !value); setShowViewMenu(false); }} style={{ width: 29, height: 31, display: "grid", placeItems: "center", border: 0, borderRadius: 8, background: "transparent", color: C.text, cursor: "pointer" }}><MoreHorizontal size={18} strokeWidth={1.5} /></button>

          {showViewMenu && (
            <div className="calendar-float-menu" style={{ position: "absolute", zIndex: 20, right: 108, top: 38, width: 185, padding: 5, border: `1px solid ${C.borderStrong}`, borderRadius: 13, background: "#292929", boxShadow: "0 12px 30px rgba(0,0,0,.45)" }}>
              {["Dzień", "Tydzień", "Miesiąc", "Rok", "Harmonogram"].map((mode) => (
                <button key={mode} type="button" onClick={() => { setViewMode(mode); setShowViewMenu(false); }} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 9px", border: 0, borderRadius: 7, background: mode === viewMode ? "rgba(91,114,244,.12)" : "transparent", color: mode === viewMode ? C.blue : C.text, cursor: "pointer", textAlign: "left", fontSize: 12 }}>
                  {mode}<span style={{ color: mode === viewMode ? C.blue : C.muted, fontSize: 11 }}>{mode === "Dzień" ? "D/1" : mode === "Tydzień" ? "W/2" : mode === "Miesiąc" ? "M/3" : mode === "Rok" ? "Y/4" : "A/5"}</span>
                </button>
              ))}
            </div>
          )}
          {showMoreMenu && (
            <div className="calendar-float-menu" style={{ position: "absolute", zIndex: 20, right: 0, top: 38, width: 205, padding: 5, border: `1px solid ${C.borderStrong}`, borderRadius: 13, background: "#292929", boxShadow: "0 12px 30px rgba(0,0,0,.45)" }}>
              {[
                { label: "Zobacz opcje", icon: CalendarDays },
                { label: "Zaplanuj zadania", icon: Calendar },
                { label: "Subskrybuj kalendarz", icon: CalendarDays },
                { label: "Drukuj", icon: Printer },
              ].map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => { if (label === "Drukuj") window.print(); setShowMoreMenu(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", border: 0, borderRadius: 7, background: "transparent", color: C.text, cursor: "pointer", textAlign: "left", fontSize: 12 }}><Icon size={15} strokeWidth={1.5} style={{ color: C.second }} />{label}</button>)}
            </div>
          )}
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", height: 31, flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
        {WEEKDAYS.map((day) => <div key={day} style={{ display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 10 }}>{day}</div>)}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridTemplateRows: `repeat(${cells.length / 7}, minmax(88px, 1fr))`, overflow: "hidden" }}>
        {cells.map((cell) => {
          const key = dateKey(cell.year, cell.month, cell.day);
          const dayEvents = eventsByDate.get(key) ?? [];
          const isToday = key === todayKey();
          return (
            <div key={key} data-calendar-cell={key} className="calendar-cell" onClick={() => { if (suppressCellClickRef.current) { suppressCellClickRef.current = false; return; } createDraft(key); }} style={{ minWidth: 0, minHeight: 0, position: "relative", padding: "7px 5px 4px", borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: isToday ? "rgba(71,114,250,.018)" : C.grid, cursor: "pointer" }}>
              <div style={{ height: 25, display: "flex", alignItems: "flex-start" }}>
                <span style={{ width: 25, height: 25, display: "grid", placeItems: "center", borderRadius: "50%", background: isToday ? C.blue : "transparent", color: isToday ? "white" : cell.current ? C.text : C.disabled, fontSize: 12, fontWeight: isToday ? 600 : 400 }}>{cell.day}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                {dayEvents.map((event) => <CalendarEventBar key={event.id} event={event} onClick={() => selectEvent(event.id)} onToggle={() => updateTask(event.id, { done: !event.done })} />)}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <div ref={detailRef} className="calendar-task-detail" style={{ position: "fixed", zIndex: 40, left: detailPosition.left, top: detailPosition.top, visibility: detailPosition.ready ? "visible" : "hidden", width: detailPosition.width, height: detailPosition.height, overflow: "hidden", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 15, boxShadow: "0 12px 36px rgba(0,0,0,.38)" }}>
          <TaskDetail task={selectedTask} onClose={closeTaskDetail} onUpdate={updateTask} onDelete={deleteTask} listy={LISTS} tagi={TAGS} calendarAnchorEl={calendarAnchorEl} surface="calendar" />
        </div>
      )}
    </section>
  );
}
