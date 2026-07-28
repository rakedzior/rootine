import { useEffect, useRef, useState } from "react";
import type React from "react";
import { Link } from "react-router";
import {
  Calendar,
  Check,
  Clock,
  Flag,
  Inbox,
  ListPlus,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  taskViewForCalendarDate,
  toCalendarDateKey,
  type TaskComment,
} from "../../data/taskWorkspace";
import { Button, Menu, MenuItem, Modal } from "../../ui";
import { DatePickerPopup } from "./TaskSchedulePicker";
import {
  C,
  formatDateLabel,
  scheduleFromDateValue,
  type DateVal,
  type ListItem,
  type Priority,
  type Subtask,
  type TagItem,
  type Task,
} from "./taskPageModel";

export function TaskRow({
  task, selected, onToggle, onSelect, onUpdate, tagi, deadlineLabel,
}: {
  task: Task; selected: boolean;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  onUpdate: (id: number, patch: Partial<Task>) => void;
  tagi: TagItem[];
  deadlineLabel?: string;
}) {
  const taskTags = task.source
    ? []
    : (task.tags ?? []).map(id => tagi.find(t => t.id === id)).filter(Boolean) as TagItem[];
  const priorityColor = task.priority === "high" ? C.danger : task.priority === "medium" ? C.warning : task.priority === "low" ? C.seaGlass : null;
  const timeLabel = task.time ? `${task.time}${task.endTime ? `–${task.endTime}` : ""}` : null;
  const sourceLabel = task.source?.kind === "work" ? "Praca" : task.source ? "Podróże" : null;

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-100 group"
      style={{
        background: selected ? C.card : "transparent",
        borderLeft: selected ? `2px solid ${C.iceBlue}` : "2px solid transparent",
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = C.card + "88"; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <button
        type="button"
        aria-label={task.done ? "Oznacz zadanie jako niewykonane" : "Oznacz zadanie jako wykonane"}
        onClick={e => { e.stopPropagation(); onToggle(task.id); }}
        className={`task-checkbox mt-[2px] ${task.done ? "is-checked" : ""}`}
        style={{ "--task-checkbox-color": task.done ? C.iceBlue : priorityColor ?? C.borderStrong } as React.CSSProperties}
      >
        {task.done && <Check size={8} strokeWidth={2.5} />}
      </button>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Otwórz szczegóły zadania: ${task.text}`}
        onClick={() => onSelect(task.id)}
        className="flex-1 min-w-0 border-0 bg-transparent p-0 text-left"
      >
        <span className="text-[13px] leading-snug block" style={{
          color: task.done ? C.textMuted : C.textPrimary,
          textDecoration: task.done ? "line-through" : "none",
        }}>
          {task.text}
        </span>
        {task.date && !deadlineLabel && (
          <div className="flex items-center gap-1 mt-1">
            <Calendar size={9} strokeWidth={1.5} style={{ color: C.textMuted }} />
            <span style={{ fontSize: "10px", color: C.textMuted }}>{task.date}</span>
          </div>
        )}
        {task.source && (
          <span className="mt-1 block truncate text-[10px]" style={{ color: C.textMuted }}>
            {sourceLabel} · {task.source.context}
          </span>
        )}
      </button>
      {(taskTags.length > 0 || timeLabel || deadlineLabel || task.source) && (
        <div className="flex items-center gap-1.5 flex-shrink-0 self-center ml-2">
          {taskTags.map(td => (
            <button
              type="button"
              key={td.id}
              onClick={e => { e.stopPropagation(); onUpdate(task.id, { tags: (task.tags ?? []).filter(id => id !== td.id) }); }}
              title={`Usuń tag #${td.label}`}
              className="task-tag-control flex items-center gap-0.5 rounded-md"
              style={{
                fontSize: "10px", color: C.textSecond, background: C.inputBg,
                border: `1px solid ${C.borderSubtle}`, boxShadow: `inset 2px 0 0 ${td.color}`,
                padding: "3px 5px 3px 7px", cursor: "pointer", whiteSpace: "nowrap",
              }}>
              #{td.label}
              <X size={7} strokeWidth={2.2} />
            </button>
          ))}
          {timeLabel && (
            <div className="flex items-center gap-1" style={{ paddingLeft: taskTags.length > 0 ? 4 : 0 }}>
              <Clock size={9} strokeWidth={1.5} style={{ color: C.iceBlue }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: C.iceBlue, whiteSpace: "nowrap" }}>
                {timeLabel}
              </span>
            </div>
          )}
          {deadlineLabel && (
            <div className="task-overdue-deadline">
              <Calendar size={9} strokeWidth={1.6} aria-hidden="true" />
              <span>{deadlineLabel}</span>
            </div>
          )}
          {task.source && (
            <Link
              to={task.source.href}
              aria-label={`Otwórz zadanie w module ${sourceLabel}: ${task.source.context}`}
              className="task-source-link rounded-md px-1.5 text-[10px] no-underline"
              style={{ color: C.iceBlue, background: C.iceBlueBg }}
            >
              {sourceLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ── Priority dropdown ─────────────────────────────────────
const PRIORITY_FLAGS = [
  { p: "high"   as Priority, label: "Wysoki", color: C.danger  },
  { p: "medium" as Priority, label: "Średni", color: C.warning },
  { p: "low"    as Priority, label: "Niski",  color: C.iceBlue },
  { p: null,                 label: "Brak",   color: C.textMuted },
] as const;

function PriorityDropdown({ current, anchorEl, onSelect, onClose }: {
  current: Priority | null; anchorEl: HTMLElement;
  onSelect: (p: Priority | null) => void; onClose: () => void;
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const rect = anchorEl.getBoundingClientRect();
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [anchorEl, onClose]);
  return (
    <Menu ref={ref} style={{
      position: "fixed", top: rect.bottom + 4, right: window.innerWidth - rect.right,
      width: 148, zIndex: 9999,
    }}>
      {PRIORITY_FLAGS.map(({ p, label, color }) => (
        <MenuItem
          key={String(p)}
          selected={current === p}
          onClick={() => onSelect(p as Priority | null)}
          leadingIcon={<Flag fill={p ? color : "none"} style={{ color }} />}
          trailingIcon={current === p ? <Check /> : undefined}
        >
          {label}
        </MenuItem>
      ))}
    </Menu>
  );
}

// ── List picker dropdown ───────────────────────────────────
function ListPicker({ current, anchorEl, onSelect, onClose, listy }: {
  current: string | null; anchorEl: HTMLElement;
  onSelect: (id: string | null) => void; onClose: () => void;
  listy: ListItem[];
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const rect = anchorEl.getBoundingClientRect();
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [anchorEl, onClose]);

  const all = [
    { id: null as string | null, label: "Skrzynka zadań", color: C.textMuted },
    ...listy.map(l => ({ id: l.id as string | null, label: l.label, color: l.color })),
  ].filter(l => l.label.toLowerCase().includes(q.toLowerCase()));

  const currentLabel = listy.find(l => l.id === current)?.label ?? "Skrzynka zadań";

  return (
    <Menu ref={ref} style={{
      position: "fixed", bottom: window.innerHeight - rect.top + 4, left: rect.left,
      width: 210, zIndex: 9999,
    }}>
      <div style={{ padding: "8px", borderBottom: `1px solid ${C.borderSubtle}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.inputBg, borderRadius: 7, padding: "5px 9px" }}>
          <Search size={11} strokeWidth={1.5} style={{ color: C.textDisabled, flexShrink: 0 }} />
          <input autoFocus placeholder="Szukaj" value={q} onChange={e => setQ(e.target.value)}
            style={{ background: "none", border: "none", outline: "none", fontSize: 10, color: C.textPrimary, flex: 1, fontFamily: "var(--font-sans)" }} />
        </div>
      </div>
      {all.map(l => (
        <MenuItem
          key={String(l.id)}
          selected={current === l.id}
          onClick={() => onSelect(l.id)}
          leadingIcon={<span className="h-2 w-2 rounded-full" style={{ background: l.color }} />}
          trailingIcon={current === l.id ? <Check /> : undefined}
        >
          {l.label}
        </MenuItem>
      ))}
      <div style={{ borderTop: `1px solid ${C.borderSubtle}`, padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}>
        <Inbox size={11} strokeWidth={1.5} style={{ color: C.textDisabled }} />
        <span style={{ fontSize: 11, color: C.textMuted }}>{currentLabel}</span>
      </div>
    </Menu>
  );
}

// ── More menu ─────────────────────────────────────────────
const moreItems = (seriesScoped: boolean): ({
  action: string;
  label: string;
  icon: React.ComponentType<{size?:number;strokeWidth?:number;style?:React.CSSProperties}>;
  danger?: boolean;
} | null)[] => [
  { action: "subtask", label: seriesScoped ? "Dodaj podzadanie do serii" : "Dodaj podzadanie", icon: ListPlus },
  { action: "print", label: seriesScoped ? "Drukuj całą serię" : "Drukuj", icon: Printer },
  null,
  {
    action: "delete",
    label: seriesScoped ? "Przenieś całą serię do Kosza" : "Usuń",
    icon: Trash2,
    danger: true,
  },
];

function MoreMenu({ anchorEl, onAction, onClose, seriesScoped = false }: {
  anchorEl: HTMLElement;
  onAction: (action: string) => void;
  onClose: () => void;
  seriesScoped?: boolean;
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const rect = anchorEl.getBoundingClientRect();
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      anchorEl.focus();
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorEl, onClose]);
  return (
    <Menu ref={ref} aria-label={seriesScoped ? "Akcje całej serii" : "Akcje zadania"} style={{
      position: "fixed", bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right,
      width: 210, zIndex: 9999,
    }}>
      {moreItems(seriesScoped).map((item, i) =>
        item === null
          ? <div key={i} style={{ height: 1, background: C.borderSubtle, margin: "3px 0" }} />
          : (
            <MenuItem key={item.action} tone={item.danger ? "danger" : "default"} onClick={() => onAction(item.action)} leadingIcon={<item.icon />}>
              {item.label}
            </MenuItem>
          )
      )}
    </Menu>
  );
}

// ── Task detail panel ─────────────────────────────────────
export type VirtualTaskOccurrenceContext = {
  date: string;
  done: boolean;
};

function formatVirtualOccurrenceDate(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

export function TaskDetail({
  task,
  occurrence,
  onClose,
  onToggleCompletion,
  onUpdate,
  onDelete,
  listy,
  tagi,
}: {
  task: Task; onClose: () => void;
  occurrence?: VirtualTaskOccurrenceContext;
  onToggleCompletion: (done: boolean) => void;
  onUpdate: (id: number, patch: Partial<Task>) => void;
  onDelete: (id: number) => void;
  listy: ListItem[];
  tagi: TagItem[];
}) {
  const [showPriority,  setShowPriority]  = useState(false);
  const [showListPick,  setShowListPick]  = useState(false);
  const [showMore,      setShowMore]      = useState(false);
  const [showComments,  setShowComments]  = useState(false);
  const [confirmSeriesDelete, setConfirmSeriesDelete] = useState(false);
  const [newComment,    setNewComment]    = useState("");
  const comments = task.comments ?? [];
  const [editTitle,     setEditTitle]     = useState(task.text);
  const [editNotes,     setEditNotes]     = useState(task.notes ?? "");

  const [showDatePicker, setShowDatePicker] = useState(false);
  const taskCalendarDate = task.calendarDate;
  const parsedTaskDate = taskCalendarDate ? new Date(`${taskCalendarDate}T12:00:00`) : null;
  const storedSchedule = task.schedule;
  const [taskDateVal,    setTaskDateVal]    = useState<DateVal>({
    date: parsedTaskDate && !Number.isNaN(parsedTaskDate.getTime()) ? parsedTaskDate : null,
    time: (storedSchedule?.endTime ?? task.endTime) ? "" : storedSchedule?.startTime ?? task.time ?? "",
    reminder: storedSchedule?.reminderMinutes === undefined ? "" : String(storedSchedule.reminderMinutes),
    repeat: storedSchedule?.recurrence ?? "",
    startTime: storedSchedule?.startTime || task.time || "09:00",
    endTime: storedSchedule?.endTime || task.endTime || "10:00",
    duration: Boolean(storedSchedule?.endTime ?? task.endTime),
    allDay: storedSchedule?.allDay ?? !task.time,
  });
  useEffect(() => {
    const nextDate = taskCalendarDate ? new Date(`${taskCalendarDate}T12:00:00`) : null;
    const schedule = task.schedule;
    setTaskDateVal((current) => ({
      ...current,
      date: nextDate && !Number.isNaN(nextDate.getTime()) ? nextDate : null,
      time: (schedule?.endTime ?? task.endTime) ? "" : schedule?.startTime ?? task.time ?? "",
      reminder: schedule?.reminderMinutes === undefined ? "" : String(schedule.reminderMinutes),
      repeat: schedule?.recurrence ?? "",
      startTime: schedule?.startTime || task.time || "09:00",
      endTime: schedule?.endTime || task.endTime || "10:00",
      duration: Boolean(schedule?.endTime ?? task.endTime),
      allDay: schedule?.allDay ?? !task.time,
    }));
  }, [task.id, taskCalendarDate, task.time, task.endTime, task.schedule]);

  const flagBtnRef = useRef<HTMLButtonElement>(null);
  const listBtnRef = useRef<HTMLButtonElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const dateBtnRef = useRef<HTMLButtonElement>(null);

  // Sync title/notes when task changes
  useEffect(() => { setEditTitle(task.text); }, [task.text]);
  useEffect(() => { setEditNotes(task.notes ?? ""); }, [task.notes]);

  const closeAll = () => { setShowPriority(false); setShowListPick(false); setShowMore(false); };

  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  const flagColor = task.priority === "high" ? C.danger : task.priority === "medium" ? C.warning : task.priority === "low" ? C.iceBlue : C.textMuted;
  const listLabel = listy.find(l => l.id === task.list)?.label ?? "Skrzynka zadań";
  const listColor = listy.find(l => l.id === task.list)?.color ?? C.textMuted;
  const taskTagDefs = (task.tags ?? []).map(id => tagi.find(t => t.id === id)).filter(Boolean) as TagItem[];
  const dateStr   = task.date ?? "Bez terminu";
  const timeStr   = task.time ? `, ${task.time}${task.endTime ? `–${task.endTime}` : ""}` : "";
  const sourceLabel = task.source?.kind === "work" ? "Praca" : task.source ? "Podróże" : null;
  const occurrenceDateLabel = occurrence ? formatVirtualOccurrenceDate(occurrence.date) : null;
  const completionDone = occurrence?.done ?? task.done;

  const addComment = () => {
    if (!newComment.trim()) return;
    const comment: TaskComment = {
      id: Date.now(),
      author: "Ty",
      text: newComment.trim(),
      time: new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date()),
    };
    onUpdate(task.id, { comments: [...comments, comment] });
    setNewComment("");
  };

  const toggleSubtask = (subId: number) => {
    const updated = (task.subtasks ?? []).map(s => s.id === subId ? { ...s, done: !s.done } : s);
    onUpdate(task.id, { subtasks: updated });
  };

  const D = {
    bg:     C.subSidebar,
    border: C.borderSubtle,
    hover:  C.elevated,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>

      {/* ── Top toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
        {/* Done checkbox (square) */}
        <button
          type="button"
          aria-label={occurrenceDateLabel
            ? `${completionDone ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"} wystąpienie z ${occurrenceDateLabel}`
            : completionDone
              ? "Oznacz zadanie jako niewykonane"
              : "Oznacz zadanie jako wykonane"}
          onClick={() => onToggleCompletion(!completionDone)}
          className={`task-checkbox task-checkbox--detail ${completionDone ? "is-checked" : ""}`}
          style={{ "--task-checkbox-color": completionDone ? C.iceBlue : C.borderStrong } as React.CSSProperties}
        >
          {completionDone && <Check size={9} strokeWidth={2.5} />}
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: D.border, flexShrink: 0 }} />

        {/* Date chip — opens DatePickerPopup */}
        <button
          ref={dateBtnRef}
          type="button"
          aria-label={occurrence ? "Edytuj harmonogram całej serii" : "Zmień termin zadania"}
          onClick={() => { setShowDatePicker(v => !v); closeAll(); }}
          style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, overflow: "hidden", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          <Calendar size={12} strokeWidth={1.5} style={{ color: C.iceBlue, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.iceBlue, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {occurrence ? `Harmonogram serii: ${dateStr}${timeStr}` : `${dateStr}${timeStr}`}
          </span>
        </button>

        {/* Priority flag */}
        <button
          ref={flagBtnRef}
          type="button"
          aria-label={task.source?.kind === "travel" ? "Priorytet jest zarządzany w module źródłowym" : "Zmień priorytet zadania"}
          disabled={task.source?.kind === "travel"}
          onClick={() => { setShowPriority(v => !v); setShowListPick(false); setShowMore(false); }}
          style={{ background: "none", border: "none", cursor: task.source?.kind === "travel" ? "not-allowed" : "pointer", padding: 3, display: "flex", flexShrink: 0, opacity: task.source?.kind === "travel" ? 0.55 : 1 }}
        >
          <Flag size={15} strokeWidth={1.5} fill={task.priority ? flagColor : "none"} style={{ color: flagColor }} />
        </button>

        <button
          type="button"
          aria-label="Zamknij szczegóły zadania"
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex", flexShrink: 0, color: C.textMuted }}
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>

      {occurrenceDateLabel && (
        <section id="task-occurrence-scope" className="task-occurrence-context" aria-label="Wybrane wystąpienie cykliczne">
          <div className="task-occurrence-context__heading">
            <Calendar size={13} strokeWidth={1.6} aria-hidden="true" />
            <div>
              <span>Wystąpienie cykliczne</span>
              <strong>{occurrenceDateLabel}</strong>
            </div>
          </div>
          <p>
            Ukończenie dotyczy tylko tego dnia. Tytuł, harmonogram i pozostałe zmiany obejmują całą serię.
          </p>
        </section>
      )}

      {task.source && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: `1px solid ${D.border}`, background: C.iceBlueBg }}>
          <span style={{ minWidth: 0, flex: 1, fontSize: 10.5, color: C.textSecond, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Źródło: {sourceLabel} · {task.source.context}
          </span>
          <Link to={task.source.href} style={{ flexShrink: 0, fontSize: 10.5, color: C.iceBlue, textDecoration: "none" }}>
            Otwórz źródło
          </Link>
        </div>
      )}

      {/* ── Main content ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none", padding: "14px 14px 8px", display: "flex", flexDirection: "column" }}>

        {/* Title row — auto-height */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8, flexShrink: 0 }}>
          <textarea
            aria-label={occurrence ? "Tytuł całej serii" : "Tytuł zadania"}
            aria-describedby={occurrence ? "task-occurrence-scope" : undefined}
            value={editTitle}
            placeholder="Co chciałbyś zrobić?"
            onChange={e => {
              setEditTitle(e.target.value);
              const t = e.target;
              t.style.height = "auto";
              t.style.height = t.scrollHeight + "px";
            }}
            onBlur={() => onUpdate(task.id, { text: editTitle })}
            ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
            rows={1}
            style={{
              flex: 1, background: "none", border: "none", outline: "none", resize: "none", overflow: "hidden",
              fontSize: 16, fontWeight: 600, color: C.textPrimary, lineHeight: 1.3,
              fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", padding: 0,
              textDecoration: completionDone ? "line-through" : "none",
            }}
          />
        </div>

        {/* Notes — fills remaining space */}
        <textarea
          aria-label={occurrence ? "Notatki całej serii" : "Notatki zadania"}
          aria-describedby={occurrence ? "task-occurrence-scope" : undefined}
          value={editNotes}
          disabled={Boolean(task.source)}
          onChange={e => { if (!task.source) setEditNotes(e.target.value); }}
          onBlur={() => { if (!task.source) onUpdate(task.id, { notes: editNotes }); }}
          placeholder={task.source ? "Notatki są zarządzane w module źródłowym." : "Wpisz treść lub wpisz /, aby wyświetlić menu"}
          style={{
            flex: 1, minHeight: 80, width: "100%", background: "none", border: "none", outline: "none", resize: "none",
            fontSize: 12, color: C.textSecond, lineHeight: 1.6,
            fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", padding: 0,
          }}
        />

        {/* Tags */}
        {!task.source && (taskTagDefs.length > 0 || showTagInput) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, alignItems: "center" }}>
            {taskTagDefs.map(td => (
              <span key={td.id} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 20,
                color: C.textSecond, background: C.inputBg,
                border: `1px solid ${C.borderSubtle}`, boxShadow: `inset 2px 0 0 ${td.color}`,
              }}>
                #{td.label}
                <button
                  type="button"
                  aria-label={`Usuń tag ${td.label} z zadania`}
                  className="task-tag-control"
                  onClick={() => onUpdate(task.id, { tags: (task.tags ?? []).filter(id => id !== td.id) })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", padding: 0, lineHeight: 1 }}>
                  <X size={9} strokeWidth={2.5} />
                </button>
              </span>
            ))}
            {showTagInput ? (
              <input
                autoFocus
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    const raw = tagInput.replace(/^#/, "").trim().toLowerCase();
                    if (raw) {
                      const exists = tagi.find(t => t.id === raw || t.label.toLowerCase() === raw);
                      const tagId = exists ? exists.id : raw;
                      if (!(task.tags ?? []).includes(tagId)) {
                        onUpdate(task.id, { tags: [...(task.tags ?? []), tagId] });
                      }
                    }
                    setTagInput(""); setShowTagInput(false);
                  }
                  if (e.key === "Escape") { setTagInput(""); setShowTagInput(false); }
                }}
                onBlur={() => { setTagInput(""); setShowTagInput(false); }}
                placeholder="#tag"
                style={{
                  background: C.subSidebar, border: `1px solid ${C.blueBorder}`, borderRadius: 20,
                  outline: "none", fontSize: 11, color: C.textSecond, padding: "3px 8px",
                  fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", width: 72,
                }}
              />
            ) : (
              <button
                type="button"
                className="task-tag-control"
                onClick={() => setShowTagInput(true)}
                style={{ background: "none", border: `1px dashed ${C.borderStrong}`, borderRadius: 20, cursor: "pointer", fontSize: 11, color: C.textMuted, padding: "3px 8px", display: "flex", alignItems: "center", gap: 3 }}>
                <Plus size={9} strokeWidth={2} /> tag
              </button>
            )}
          </div>
        )}
        {!task.source && taskTagDefs.length === 0 && !showTagInput && (
          <button
            type="button"
            className="task-tag-control"
            onClick={() => setShowTagInput(true)}
            style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 11, padding: 0 }}>
            <Tag size={11} strokeWidth={1.5} /> Dodaj tag
          </button>
        )}

        {/* Subtasks */}
        {!task.source && (task.subtasks ?? []).length > 0 && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${D.border}`, paddingTop: 12 }}>
            {(task.subtasks ?? []).map(st => (
              <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <button
                  type="button"
                  aria-label={st.done ? `Oznacz podzadanie ${st.text || "bez nazwy"} jako niewykonane` : `Oznacz podzadanie ${st.text || "bez nazwy"} jako wykonane`}
                  onClick={() => toggleSubtask(st.id)}
                  className={`task-checkbox ${st.done ? "is-checked" : ""}`}
                  style={{ "--task-checkbox-color": st.done ? C.iceBlue : C.borderStrong } as React.CSSProperties}
                >
                  {st.done && <Check size={7} strokeWidth={2.5} />}
                </button>
                <span style={{ fontSize: 12, color: st.done ? C.textMuted : C.textSecond, textDecoration: st.done ? "line-through" : "none" }}>{st.text || "Nowe podzadanie"}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${C.borderSubtle}`, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: C.textMuted }}>Naciśnij klawisz "Enter", aby dodać pozycję do listy</span>
            </div>
          </div>
        )}

        {/* Comments section */}
        {!task.source && showComments && comments.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, marginBottom: 12 }}>Komentarze {comments.length}</p>
            {comments.map(c => (
              <div key={c.id} style={{ display: "flex", gap: 9, marginBottom: 12 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, background: C.iceBlueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: C.iceBlue }}>
                  {c.author[0]}
                </div>
                <div>
                  <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: C.textPrimary }}>{c.author}</span>
                    <span style={{ fontSize: 10, color: C.textMuted }}>{c.time}</span>
                  </div>
                  <p style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Comment input ── */}
      {!task.source && showComments && (
        <div style={{ borderTop: `1px solid ${D.border}`, padding: "8px 12px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${newComment ? C.iceBlue : C.borderSubtle}`, borderRadius: 8, padding: "7px 10px", transition: "border-color .2s" }}>
            <input
              aria-label="Nowy komentarz"
              placeholder="Napisz komentarz"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addComment()}
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}
            />
          </div>
        </div>
      )}

      {/* ── Footer bar ── */}
      {task.source && (
        <div style={{ borderTop: `1px solid ${D.border}`, padding: "9px 12px", fontSize: 10, lineHeight: 1.45, color: C.textMuted }}>
          Tytuł, ukończenie i termin synchronizują się ze źródłem. Pozostałe pola edytuj w module {sourceLabel}.
        </div>
      )}
      <div style={{ borderTop: `1px solid ${D.border}`, display: task.source ? "none" : "flex", alignItems: "center", padding: "7px 10px", flexShrink: 0, gap: 4 }}>
        {/* List picker */}
        <button ref={listBtnRef}
          onClick={() => { setShowListPick(v => !v); setShowMore(false); setShowPriority(false); }}
          style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "left", minWidth: 0, padding: "2px 0" }}
        >
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: listColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listLabel}</span>
        </button>

        <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
          {/* Comments toggle */}
          <button type="button" aria-label="Pokaż komentarze" aria-expanded={showComments} onClick={() => setShowComments(v => !v)}
            style={{ padding: "4px 6px", borderRadius: 6, background: showComments ? C.iceBlueBg : "none", border: "none", cursor: "pointer", color: showComments ? C.iceBlue : C.textMuted, display: "flex", alignItems: "center", gap: 3 }}>
            <MessageSquare size={13} strokeWidth={1.5} />
            {comments.length > 0 && <span style={{ fontSize: 9, color: C.iceBlue, fontWeight: 700 }}>{comments.length}</span>}
          </button>
          {/* More (...) */}
          <button
            ref={moreBtnRef}
            type="button"
            aria-label={occurrence ? "Więcej akcji całej serii" : "Więcej akcji zadania"}
            aria-expanded={showMore}
            onClick={() => { setShowMore(v => !v); setShowListPick(false); setShowPriority(false); }}
            style={{ padding: "4px 5px", borderRadius: 6, background: showMore ? C.elevated : "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", alignItems: "center" }}>
            <MoreHorizontal size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ── Floating menus ── */}
      {showDatePicker && dateBtnRef.current && (
        <DatePickerPopup
          value={taskDateVal}
          onConfirm={v => {
            setTaskDateVal(v);
            const label = formatDateLabel(v);
            const calendarDate = v.date ? toCalendarDateKey(v.date) : undefined;
            if (task.source) {
              onUpdate(task.id, {
                date: label || undefined,
                calendarDate,
                ...(calendarDate ? { view: taskViewForCalendarDate(calendarDate) } : {}),
              });
              setShowDatePicker(false);
              return;
            }
            onUpdate(task.id, {
              date: label || undefined,
              time: v.allDay ? undefined : v.duration ? v.startTime : v.time || undefined,
              endTime: !v.allDay && v.duration ? v.endTime : undefined,
              calendarDate,
              schedule: scheduleFromDateValue(
                v,
                calendarDate === task.calendarDate && v.repeat === task.schedule?.recurrence
                  ? task.schedule?.completedDates
                  : undefined,
              ),
              ...(calendarDate ? { view: taskViewForCalendarDate(calendarDate) } : {}),
            });
            setShowDatePicker(false);
          }}
          onClose={() => setShowDatePicker(false)}
          anchorEl={dateBtnRef.current}
          dateOnly={Boolean(task.source)}
        />
      )}
      {showPriority && task.source?.kind !== "travel" && flagBtnRef.current && (
        <PriorityDropdown
          current={task.priority ?? null}
          anchorEl={flagBtnRef.current}
          onSelect={p => { onUpdate(task.id, { priority: p ?? undefined }); setShowPriority(false); }}
          onClose={() => setShowPriority(false)}
        />
      )}
      {showListPick && !task.source && listBtnRef.current && (
        <ListPicker
          current={task.list ?? null}
          anchorEl={listBtnRef.current}
          onSelect={id => { onUpdate(task.id, { list: id ?? undefined }); setShowListPick(false); }}
          onClose={() => setShowListPick(false)}
          listy={listy}
        />
      )}
      {showMore && !task.source && moreBtnRef.current && (
        <MoreMenu
          anchorEl={moreBtnRef.current}
          seriesScoped={Boolean(occurrence)}
          onAction={action => {
            if (action === "delete") {
              if (occurrence) setConfirmSeriesDelete(true);
              else onDelete(task.id);
            }
            if (action === "subtask") {
              const sub: Subtask = { id: Date.now(), text: "Nowe podzadanie", done: false };
              onUpdate(task.id, { subtasks: [...(task.subtasks ?? []), sub] });
            }
            if (action === "print") window.print();
            setShowMore(false);
          }}
          onClose={() => setShowMore(false)}
        />
      )}
      {confirmSeriesDelete && occurrenceDateLabel && (
        <Modal
          eyebrow="Zadanie cykliczne"
          title="Przenieść całą serię do Kosza?"
          description={`Wybrane wystąpienie przypada na ${occurrenceDateLabel}. Nie zostanie usunięte osobno.`}
          onClose={() => setConfirmSeriesDelete(false)}
          width={480}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setConfirmSeriesDelete(false)}>Anuluj</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmSeriesDelete(false);
                  onDelete(task.id);
                }}
              >
                Przenieś całą serię
              </Button>
            </>
          )}
        >
          <p className="task-series-delete-copy">
            Do Kosza trafi zadanie źródłowe wraz ze wszystkimi wystąpieniami. Operację można później cofnąć w module Zadania.
          </p>
        </Modal>
      )}
    </div>
  );
}

// ── Summary right panel ───────────────────────────────────
