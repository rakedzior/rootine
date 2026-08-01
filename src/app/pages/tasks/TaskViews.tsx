import { useEffect, useRef, useState } from "react";
import type React from "react";
import { Link } from "react-router";
import {
  Calendar,
  Check,
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
import { commitmentSourceLabel } from "../../data/commitmentRepository";
import { Button, ListRow, Menu, MenuItem, Modal } from "../../ui";
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
  task, selected, onToggle, onSelect, onUpdate, tagi, deadlineLabel, railLabel,
  bulkMode = false, bulkSelected = false, bulkDisabled = false, onBulkToggle,
}: {
  task: Task; selected: boolean;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  onUpdate: (id: number, patch: Partial<Task>) => void;
  tagi: TagItem[];
  deadlineLabel?: string;
  bulkMode?: boolean;
  bulkSelected?: boolean;
  bulkDisabled?: boolean;
  onBulkToggle?: (id: number) => void;
  /**
   * Value for the fixed-width "when" rail. A clock time inside a single day, "9 dni" in the
   * overdue group. Pass an empty string to keep the row aligned without showing a value.
   */
  railLabel?: string;
}) {
  const taskTags = task.source
    ? []
    : (task.tags ?? []).map(id => tagi.find(t => t.id === id)).filter(Boolean) as TagItem[];
  const priorityColor = task.priority === "high" ? C.danger : task.priority === "medium" ? C.warning : task.priority === "low" ? C.seaGlass : null;
  const sourceLabel = task.source ? commitmentSourceLabel(task.source.kind) : null;

  const subtitle = task.source
    ? `${sourceLabel} · ${task.source.context}`
    : task.date && !deadlineLabel
      ? task.date
      : undefined;

  return (
    <ListRow
      className="task-row"
      // Start time only: the rail answers "when does this begin", and a full range would not
      // fit the fixed width without pushing every checkbox out of line.
      rail={railLabel ?? (task.time || "")}
      density="compact"
      divided={false}
      selected={bulkMode ? bulkSelected : selected}
      completed={task.done}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input, textarea, select")) return;
        if (bulkMode && !bulkDisabled) onBulkToggle?.(task.id);
        else onSelect(task.id);
      }}
      title={task.text}
      subtitle={subtitle}
      // The rail shows the start; a finish time only appears when one is set.
      meta={task.time && task.endTime ? <span className="task-row__range">do {task.endTime}</span> : undefined}
      leading={(
        <button
          type="button"
          aria-label={bulkMode
            ? bulkDisabled
              ? `Zadanie cykliczne: operacje zbiorcze są niedostępne; zarządzaj wystąpieniem w szczegółach`
              : bulkSelected ? `Odznacz zadanie: ${task.text}` : `Zaznacz zadanie: ${task.text}`
            : task.done ? "Oznacz zadanie jako niewykonane" : "Oznacz zadanie jako wykonane"}
          disabled={bulkMode && bulkDisabled}
          onClick={e => {
            e.stopPropagation();
            if (bulkMode && !bulkDisabled) onBulkToggle?.(task.id);
            else onToggle(task.id);
          }}
          className={`task-checkbox ${(bulkMode ? bulkSelected : task.done) ? "is-checked" : ""}`}
          style={{ "--task-checkbox-color": (bulkMode ? bulkSelected : task.done) ? C.iceBlue : priorityColor ?? C.borderStrong } as React.CSSProperties}
        >
          {(bulkMode ? bulkSelected : task.done) && <Check size={8} strokeWidth={2.5} />}
        </button>
      )}
      onTitleClick={() => bulkMode
        ? !bulkDisabled && onBulkToggle?.(task.id)
        : onSelect(task.id)}
      titleLabel={bulkMode
        ? bulkDisabled
          ? `Zadanie cykliczne poza operacjami zbiorczymi: ${task.text}`
          : `${bulkSelected ? "Odznacz" : "Zaznacz"} zadanie: ${task.text}`
        : `Otwórz szczegóły zadania: ${task.text}`}
      trailing={(taskTags.length > 0 || task.source) ? (
        <>
          {taskTags.map(td => (
            <button
              type="button"
              key={td.id}
              onClick={e => { e.stopPropagation(); onUpdate(task.id, { tags: (task.tags ?? []).filter(id => id !== td.id) }); }}
              title={`Usuń tag #${td.label}`}
              className="task-tag-control task-row__tag"
              // Only the stripe is data-driven; the rest lives in tasks.css.
              style={{ boxShadow: `inset 2px 0 0 ${td.color}` }}>
              #{td.label}
              <X size={7} strokeWidth={2.2} />
            </button>
          ))}
          {/* Neither the clock time nor the overdue age is repeated here: the rail carries it. */}
          {task.source && (
            <Link
              to={task.source.href}
              aria-label={`Otwórz zadanie w module ${sourceLabel}: ${task.source.context}`}
              className="task-source-link rounded-md px-1.5 text-[11px] no-underline"
              style={{ color: C.iceBlue, background: C.iceBlueBg }}
            >
              {sourceLabel}
            </Link>
          )}
        </>
      ) : undefined}
    />
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
      <div className="task-menu__search">
        <div>
          <Search size={11} strokeWidth={1.5} />
          <input autoFocus placeholder="Szukaj" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      {all.map(l => (
        <MenuItem
          key={String(l.id)}
          selected={current === l.id}
          onClick={() => onSelect(l.id)}
          // The dot carries each list's own colour, so it stays inline.
          leadingIcon={<span className="task-menu__dot" style={{ background: l.color }} />}
          trailingIcon={current === l.id ? <Check /> : undefined}
        >
          {l.label}
        </MenuItem>
      ))}
      <div className="task-menu__footer">
        <Inbox size={11} strokeWidth={1.5} />
        <span>{currentLabel}</span>
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
          ? <div key={i} className="task-menu__separator" />
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
  const sourceLabel = task.source ? commitmentSourceLabel(task.source.kind) : null;
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

  return (
    <div className={`task-detail${completionDone ? " is-completed" : ""}`}>

      {/* ── Top toolbar ── */}
      <div className="task-detail__toolbar">
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
        <div className="task-detail__divider" />

        {/* Date chip — opens DatePickerPopup */}
        <button
          ref={dateBtnRef}
          type="button"
          aria-label={occurrence ? "Edytuj harmonogram całej serii" : "Zmień termin zadania"}
          onClick={() => { setShowDatePicker(v => !v); closeAll(); }}
          className="task-detail__date"
        >
          <Calendar size={12} strokeWidth={1.5} />
          <span>{occurrence ? `Harmonogram serii: ${dateStr}${timeStr}` : `${dateStr}${timeStr}`}</span>
        </button>

        {/* Priority flag */}
        <button
          ref={flagBtnRef}
          type="button"
          aria-label={task.source?.kind === "travel" ? "Priorytet jest zarządzany w module źródłowym" : "Zmień priorytet zadania"}
          disabled={task.source?.kind === "travel"}
          onClick={() => { setShowPriority(v => !v); setShowListPick(false); setShowMore(false); }}
          className="task-detail__icon-btn"
        >
          {/* Priority colour is data, so it stays inline. */}
          <Flag size={15} strokeWidth={1.5} fill={task.priority ? flagColor : "none"} style={{ color: flagColor }} />
        </button>

        <button
          type="button"
          aria-label="Zamknij szczegóły zadania"
          onClick={onClose}
          className="task-detail__icon-btn"
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
        <div className="task-detail__source">
          <span>Źródło: {sourceLabel} · {task.source.context}</span>
          <Link to={task.source.href}>Otwórz źródło</Link>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="task-detail__body">

        {/* Title row — auto-height */}
        <div className="task-detail__title-row">
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
            className="task-detail__title"
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
          className="task-detail__notes"
        />

        {/* Tags */}
        {!task.source && (taskTagDefs.length > 0 || showTagInput) && (
          <div className="task-detail__tags">
            {taskTagDefs.map(td => (
              // The inset stripe carries the tag's own colour, so it stays inline.
              <span key={td.id} className="task-detail__tag" style={{ boxShadow: `inset 2px 0 0 ${td.color}` }}>
                #{td.label}
                <button
                  type="button"
                  aria-label={`Usuń tag ${td.label} z zadania`}
                  className="task-tag-control"
                  onClick={() => onUpdate(task.id, { tags: (task.tags ?? []).filter(id => id !== td.id) })}
                >
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
                className="task-detail__tag-input"
              />
            ) : (
              <button
                type="button"
                className="task-tag-control task-detail__tag-add"
                onClick={() => setShowTagInput(true)}
              >
                <Plus size={9} strokeWidth={2} /> tag
              </button>
            )}
          </div>
        )}
        {!task.source && taskTagDefs.length === 0 && !showTagInput && (
          <button
            type="button"
            className="task-tag-control task-detail__tag-empty"
            onClick={() => setShowTagInput(true)}
          >
            <Tag size={11} strokeWidth={1.5} /> Dodaj tag
          </button>
        )}

        {/* Subtasks */}
        {!task.source && (task.subtasks ?? []).length > 0 && (
          <div className="task-detail__subtasks">
            {(task.subtasks ?? []).map(st => (
              <div key={st.id} className={`task-detail__subtask${st.done ? " is-done" : ""}`}>
                <button
                  type="button"
                  aria-label={st.done ? `Oznacz podzadanie ${st.text || "bez nazwy"} jako niewykonane` : `Oznacz podzadanie ${st.text || "bez nazwy"} jako wykonane`}
                  onClick={() => toggleSubtask(st.id)}
                  className={`task-checkbox ${st.done ? "is-checked" : ""}`}
                  style={{ "--task-checkbox-color": st.done ? C.iceBlue : C.borderStrong } as React.CSSProperties}
                >
                  {st.done && <Check size={7} strokeWidth={2.5} />}
                </button>
                <span>{st.text || "Nowe podzadanie"}</span>
              </div>
            ))}
            <div className="task-detail__subtask-hint">
              <i aria-hidden="true" />
              <span>Naciśnij klawisz "Enter", aby dodać pozycję do listy</span>
            </div>
          </div>
        )}

        {/* Comments section */}
        {!task.source && showComments && comments.length > 0 && (
          <div className="task-detail__comments">
            <p className="task-detail__comments-title">Komentarze {comments.length}</p>
            {comments.map(c => (
              <div key={c.id} className="task-detail__comment">
                <div className="task-detail__avatar">{c.author[0]}</div>
                <div>
                  <div className="task-detail__comment-head">
                    <span className="task-detail__comment-author">{c.author}</span>
                    <span className="task-detail__comment-time">{c.time}</span>
                  </div>
                  <p className="task-detail__comment-text">{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Comment input ── */}
      {!task.source && showComments && (
        <div className="task-detail__composer">
          <div>
            <input
              aria-label="Nowy komentarz"
              placeholder="Napisz komentarz"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addComment()}
            />
          </div>
        </div>
      )}

      {/* ── Footer bar ── */}
      {task.source && (
        <div className="task-detail__note">
          Tytuł, ukończenie i termin synchronizują się ze źródłem. Pozostałe pola edytuj w module {sourceLabel}.
        </div>
      )}
      <div className={`task-detail__footer${task.source ? " is-hidden" : ""}`}>
        {/* List picker */}
        <button ref={listBtnRef}
          onClick={() => { setShowListPick(v => !v); setShowMore(false); setShowPriority(false); }}
          className="task-detail__list-btn"
        >
          {/* The dot carries the list's own colour. */}
          <span className="task-detail__list-dot" style={{ background: listColor }} />
          <span>{listLabel}</span>
        </button>

        <div className="task-detail__footer-actions">
          {/* Comments toggle */}
          <button type="button" aria-label="Pokaż komentarze" aria-expanded={showComments} onClick={() => setShowComments(v => !v)}
            className="task-detail__toggle">
            <MessageSquare size={13} strokeWidth={1.5} />
            {comments.length > 0 && <span>{comments.length}</span>}
          </button>
          {/* More (...) */}
          <button
            ref={moreBtnRef}
            type="button"
            aria-label={occurrence ? "Więcej akcji całej serii" : "Więcej akcji zadania"}
            aria-expanded={showMore}
            onClick={() => { setShowMore(v => !v); setShowListPick(false); setShowPriority(false); }}
            className="task-detail__toggle task-detail__toggle--plain">
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
