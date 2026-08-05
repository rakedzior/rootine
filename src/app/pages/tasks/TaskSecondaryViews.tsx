import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Flag,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Repeat2,
  Star,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import {
  getHabitBestStreak,
  getHabitCompletionStats,
  getHabitCurrentStreak,
  habitDayState,
  isHabitDoneOnDate,
  isHabitScheduledOnDate,
  type HabitSchedule,
  type HabitTimeOfDay,
  type TaskPriority,
  toCalendarDateKey,
} from "../../data/taskWorkspace";
import { formatLocalDate, parseLocalDateKey, shiftLocalDateKey } from "../../data/localDate";
import { Button, DatePicker, EmptyState, ListRow, Menu, MenuItem, Select } from "../../ui";
import { SummaryEditor } from "./SummaryEditor";
import { DurationTimePicker } from "./TaskSchedulePicker";
import {
  C,
  fmtTaskDate,
  getMiniWeek,
  getWeekRangeLabel,
  type Habit,
  type ListItem,
  type Task,
} from "./taskPageModel";

export function SummaryPanel({ tasks, habits, onToggleHabit }: {
  tasks: Task[]; habits: Habit[]; onToggleHabit: (id: number) => void;
}) {
  const todayKey = toCalendarDateKey(new Date());
  const dueHabits = habits.filter((habit) => isHabitScheduledOnDate(habit, todayKey));
  const done  = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const doneH = dueHabits.filter(h => isHabitDoneOnDate(h, todayKey)).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const week  = getMiniWeek();
  const todayIdx = week.findIndex(d => d.today);
  const DL = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];

  return (
    <div className="task-summary">
      <section>
        <p className="task-summary__label">Podsumowanie dnia</p>
        <div className="task-summary__grid">
          {[
            { label: "Zadania", done, total },
            { label: "Nawyki", done: doneH, total: dueHabits.length },
          ].map((s, i) => (
            <div key={i} className="task-summary__card task-summary__stat">
              <div className={`task-summary__stat-value${s.done > 0 ? " is-positive" : ""}`}>
                {s.done}<span>/{s.total}</span>
              </div>
              <div className="task-summary__stat-label">{s.label} · wykonane</div>
            </div>
          ))}
        </div>
        <div className="task-summary__card">
          <div className="task-summary__progress-head">
            <span className="task-summary__meta">Postęp dnia</span>
            <span className={`task-summary__progress-value${pct === 100 ? " is-complete" : ""}`}>{pct}%</span>
          </div>
          <div className="task-progress-track">
            <div
              className={`task-progress-fill${pct === 100 ? " is-complete" : ""}`}
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="task-summary__heading">
          <p className="task-summary__label">Nawyki na dziś</p>
          <span className="task-summary__meta">{doneH}/{dueHabits.length}</span>
        </div>
        <div>
          {dueHabits.map(h => (
            <button
              key={h.id}
              type="button"
              aria-pressed={isHabitDoneOnDate(h, todayKey)}
              onClick={() => onToggleHabit(h.id)}
              className={`task-summary__habit${isHabitDoneOnDate(h, todayKey) ? " is-done" : ""}`}
            >
              <span className="task-summary__habit-check">
                {isHabitDoneOnDate(h, todayKey) && <Check size={11} strokeWidth={2.5} />}
              </span>
              <span className="task-summary__habit-copy">
                <span className="task-summary__habit-name">{h.name}</span>
                {getHabitCurrentStreak(h, todayKey) > 0 && (
                  <span className="task-summary__habit-streak">
                    <Flame size={11} strokeWidth={1.5} />
                    {getHabitCurrentStreak(h, todayKey)} dni
                  </span>
                )}
              </span>
              {isHabitDoneOnDate(h, todayKey) && <Star size={11} strokeWidth={1.5} className="task-summary__streak" />}
            </button>
          ))}
          {dueHabits.length === 0 && <p className="task-summary__empty">Brak nawyków zaplanowanych na dziś.</p>}
        </div>
      </section>

      <section>
        <p className="task-summary__label">Ten tydzień</p>
        <div className="task-summary__card">
          <div className="task-week">
            {week.map((d, i) => (
              <div key={i} className={`task-week__day${d.today ? " is-today" : ""}`}>
                <div className={`task-week__cell${d.today ? " is-today" : i < todayIdx ? " is-past" : ""}`}>
                  {i < todayIdx ? <Check size={11} strokeWidth={2.5} /> : d.n}
                </div>
                <span className="task-week__label">{DL[i]}</span>
              </div>
            ))}
          </div>
          <div className="task-summary__footer">
            <span>Seria aktywna</span>
            <span className="task-summary__streak">
              <Flame size={11} strokeWidth={1.5} />
              {todayIdx} dni
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

export function HabitsWorkspace({
  habits,
  onToggleHabit,
  selectedHabitId,
  onSelectHabit,
  onAddHabit,
  quickCaptureTitle,
  quickCaptureRevision = 0,
}: {
  habits: Habit[];
  onToggleHabit: (id: number) => void;
  selectedHabitId?: number | null;
  onSelectHabit: (id: number) => void;
  onAddHabit: (name: string, draft: HabitMetaDraft) => void;
  quickCaptureTitle?: string;
  quickCaptureRevision?: number;
}) {
  const [newHabit, setNewHabit] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [completingHabitId, setCompletingHabitId] = useState<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const todayKey = toCalendarDateKey(new Date());
  const [draft, setDraft] = useState<HabitMetaDraft>({
    schedule: { type: "daily", startDate: todayKey },
  });

  useEffect(() => {
    if (quickCaptureRevision <= 0) return;
    setNewHabit(quickCaptureTitle ?? "");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [quickCaptureRevision, quickCaptureTitle]);

  useEffect(() => () => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newHabit.trim();
    if (!name) return;
    onAddHabit(name, draft);
    setNewHabit("");
  };

  return (
    <div className="task-habits-workspace task-habits-workspace--list">
      <form className="task-habits-add task-entry" aria-label="Dodaj nawyk" onSubmit={submit}>
        <span className="task-entry__lead" aria-hidden="true"><Plus size={13} /></span>
        <input
          ref={inputRef}
          className="task-entry-input task-habits-add__name"
          value={newHabit}
          onChange={(event) => setNewHabit(event.target.value)}
          placeholder="Dodaj nowy nawyk"
          aria-label="Nazwa nowego nawyku"
        />
        <div className="task-habits-add__controls">
          <HabitScheduleFields
            value={draft.schedule}
            compact
            onChange={(schedule) => setDraft((current) => ({ ...current, schedule }))}
          />
          <HabitMetaFields
            draft={draft}
            compact
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          />
        </div>
      </form>

      {habits.length ? (
        <div className="task-habits-list task-list task-list--pending">
          {habits.map((habit) => {
            const doneToday = isHabitDoneOnDate(habit, todayKey);
            const scheduledToday = isHabitScheduledOnDate(habit, todayKey);
            return (
              <ListRow
                key={habit.id}
                className={`task-row${completingHabitId === habit.id ? " is-completion-ritual" : ""}`}
                density="compact"
                divided={false}
                completed={doneToday}
                leading={(
                  <button
                    type="button"
                    disabled={!scheduledToday || completingHabitId === habit.id}
                    aria-label={doneToday
                      ? `Oznacz nawyk jako niewykonany: ${habit.name}`
                      : scheduledToday ? `Ukończ nawyk: ${habit.name}` : `Nawyk nie jest zaplanowany na dziś: ${habit.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (doneToday) {
                        onToggleHabit(habit.id);
                        return;
                      }
                      setCompletingHabitId(habit.id);
                      completionTimerRef.current = window.setTimeout(() => {
                        onToggleHabit(habit.id);
                        setCompletingHabitId(null);
                        completionTimerRef.current = null;
                      }, 260);
                    }}
                    className={`task-checkbox ${doneToday || completingHabitId === habit.id ? "is-checked" : ""}`}
                  >
                    {(doneToday || completingHabitId === habit.id) && <Check size={9} strokeWidth={2.5} />}
                  </button>
                )}
                title={habit.name}
                subtitle={!scheduledToday
                  ? (habitDayState(habit, todayKey) === "paused" ? "Wstrzymany" : "Dziś wolne")
                  : getHabitCurrentStreak(habit, todayKey) > 0 ? `${getHabitCurrentStreak(habit, todayKey)} dni serii` : "Nowy rytm"}
                onTitleClick={() => onSelectHabit(habit.id)}
                trailing={<span className="task-habit-row__schedule">{habitScheduleLabel(habit.schedule ?? { type: "daily", startDate: todayKey })}</span>}
                selected={selectedHabitId === habit.id}
                titleLabel={selectedHabitId === habit.id
                  ? `Zamknij szczegóły nawyku: ${habit.name}`
                  : `Otwórz szczegóły nawyku: ${habit.name}`}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState
          className="task-empty-state"
          icon={<Repeat2 size={18} />}
          title="Zbuduj pierwszy rytm"
          description="Dodaj nawyk powyżej i wybierz dni, w których ma pojawiać się w planie."
        />
      )}
    </div>
  );
}

const HABIT_WEEKDAYS = [
  { value: 1, label: "Pn" },
  { value: 2, label: "Wt" },
  { value: 3, label: "Śr" },
  { value: 4, label: "Cz" },
  { value: 5, label: "Pt" },
  { value: 6, label: "So" },
  { value: 7, label: "Nd" },
];

export type HabitMetaDraft = {
  schedule: HabitSchedule;
  priority?: TaskPriority;
  time?: string;
  timeOfDay?: HabitTimeOfDay;
  reminderMinutes?: number;
};

const HABIT_PRIORITY_OPTIONS = [
  { value: "high" as TaskPriority, label: "Wysoki", color: C.danger },
  { value: "medium" as TaskPriority, label: "Średni", color: C.warning },
  { value: "low" as TaskPriority, label: "Niski", color: C.iceBlue },
  { value: "", label: "Brak", color: C.textMuted },
] as const;

function HabitSelectField({
  label,
  value,
  options,
  icon,
  compact = false,
  active = false,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  icon: React.ReactNode;
  compact?: boolean;
  active?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={`task-habit-setting${compact ? " task-habit-setting--icon" : ""}${compact && active ? " is-set" : ""}`}
      title={compact ? label : undefined}
    >
      {icon}
      <span className="ui-sr-only">{label}</span>
      <Select
        aria-label={label}
        value={value}
        options={options}
        compact={compact}
        fieldClassName={compact ? "task-habit-select-field--icon" : ""}
        className={compact ? "task-habit-select-trigger--icon" : ""}
        menuPlacement={compact ? "end" : "start"}
        menuClassName={compact ? "task-habit-select-menu" : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function HabitPriorityField({ value, compact = false, onChange }: {
  value?: TaskPriority;
  compact?: boolean;
  onChange: (priority: TaskPriority | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const currentValue = value ?? "";
  const currentOption = HABIT_PRIORITY_OPTIONS.find((option) => option.value === currentValue) ?? HABIT_PRIORITY_OPTIONS.at(-1)!;

  if (!compact) {
    return (
      <HabitSelectField
        label="Priorytet nawyku"
        value={currentValue}
        options={HABIT_PRIORITY_OPTIONS.map(({ value: optionValue, label }) => ({ value: optionValue, label }))}
        icon={<Flag size={13} strokeWidth={1.6} aria-hidden="true" />}
        active={Boolean(value)}
        onChange={(next) => onChange((next || undefined) as TaskPriority | undefined)}
      />
    );
  }

  const color = currentOption.color;

  return (
    <div
      className={`task-habit-setting task-habit-setting--icon${value ? " is-set" : ""}`}
      title="Priorytet nawyku"
      style={{ color }}
    >
      <Flag size={13} strokeWidth={1.6} fill={value ? color : "none"} aria-hidden="true" />
      <span className="ui-sr-only">Priorytet nawyku</span>
      <button
        ref={triggerRef}
        type="button"
        className="task-habit-select-trigger--icon task-habit-priority-trigger"
        aria-label="Priorytet nawyku"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      />
      {open && (
        <Menu
          triggerRef={triggerRef}
          onDismiss={() => setOpen(false)}
          initialFocus="selected"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 148,
            zIndex: 70,
          }}
        >
          {HABIT_PRIORITY_OPTIONS.map(({ value: priority, label, color: priorityColor }) => (
            <MenuItem
              key={priority || "none"}
              selected={currentValue === priority}
              onClick={() => {
                onChange((priority || undefined) as TaskPriority | undefined);
                setOpen(false);
              }}
              leadingIcon={<Flag fill={priority ? priorityColor : "none"} style={{ color: priorityColor }} />}
              trailingIcon={currentValue === priority ? <Check /> : undefined}
            >
              {label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  );
}

function HabitScheduleFields({ value, onChange, compact = false }: {
  value: HabitSchedule;
  onChange: (schedule: HabitSchedule) => void;
  compact?: boolean;
}) {
  const [weekdayPickerOpen, setWeekdayPickerOpen] = useState(false);
  const changeType = (type: HabitSchedule["type"]) => {
    if (type === "daily") {
      setWeekdayPickerOpen(false);
      onChange({ type, startDate: value.startDate });
    }
    if (type === "weekly") {
      onChange({
        type,
        startDate: value.startDate,
        weekdays: value.weekdays?.length ? value.weekdays : [1, 2, 3, 4, 5],
        interval: value.interval ?? 1,
      });
      if (compact) setWeekdayPickerOpen(true);
    }
    if (type === "interval") {
      setWeekdayPickerOpen(false);
      onChange({ type, startDate: value.startDate, interval: value.interval ?? 2 });
    }
  };
  return (
    <div className={`task-habit-schedule-fields${compact ? " is-compact" : ""}`}>
      {compact ? (
        <div className="task-habit-schedule-control">
          <HabitSelectField
            label="Cykliczność nawyku"
            value={value.type}
            options={[
              { value: "daily", label: "Codziennie" },
              { value: "weekly", label: "Wybrane dni" },
              { value: "interval", label: "Co kilka dni" },
            ]}
            icon={<Repeat2 size={13} strokeWidth={1.6} aria-hidden="true" />}
            compact
            active={value.type !== "daily"}
            onChange={(next) => changeType(next as HabitSchedule["type"])}
          />
          {value.type === "weekly" && weekdayPickerOpen && (
            <HabitWeekdayPopover
              value={value}
              onChange={onChange}
              onClose={() => setWeekdayPickerOpen(false)}
            />
          )}
        </div>
      ) : (
        <HabitSelectField
          label="Cykliczność nawyku"
          value={value.type}
          options={[
            { value: "daily", label: "Codziennie" },
            { value: "weekly", label: "Wybrane dni" },
            { value: "interval", label: "Co kilka dni" },
          ]}
          icon={<Repeat2 size={13} strokeWidth={1.6} aria-hidden="true" />}
          active={value.type !== "daily"}
          onChange={(next) => changeType(next as HabitSchedule["type"])}
        />
      )}

      {value.type === "weekly" && !compact && <HabitWeekdayButtons value={value} onChange={onChange} />}

      {value.type === "interval" && (
        <label className="task-habit-interval-input">
          <span>co</span>
          <input
            aria-label="Co ile dni"
            type="number"
            min={2}
            max={365}
            value={value.interval ?? 2}
            onChange={(event) => onChange({ ...value, interval: Math.max(2, Number(event.target.value) || 2) })}
          />
          <span>dni</span>
        </label>
      )}
    </div>
  );
}

function HabitWeekdayButtons({ value, onChange, className = "" }: {
  value: HabitSchedule;
  onChange: (schedule: HabitSchedule) => void;
  className?: string;
}) {
  const weekdays = value.weekdays ?? [];
  return (
    <div className={`task-habit-weekday-picker${className ? ` ${className}` : ""}`} role="group" aria-label="Dni tygodnia">
      {HABIT_WEEKDAYS.map((day) => {
        const selected = weekdays.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            className={`task-habit-day-chip${selected ? " is-selected" : ""}`}
            aria-pressed={selected}
            onClick={() => {
              const next = selected ? weekdays.filter((item) => item !== day.value) : [...weekdays, day.value];
              if (next.length > 0) onChange({ ...value, weekdays: next.sort() });
            }}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}

function HabitWeekdayPopover({ value, onChange, onClose }: {
  value: HabitSchedule;
  onChange: (schedule: HabitSchedule) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div ref={panelRef} className="task-habit-weekday-popover" role="dialog" aria-label="Wybrane dni">
      <div className="task-habit-weekday-popover__header">
        <div>
          <strong>Wybrane dni</strong>
          <span>Wybierz dni, w których nawyk ma się pojawiać.</span>
        </div>
        <button type="button" aria-label="Zamknij wybór dni" onClick={onClose}>
          <X size={13} strokeWidth={1.8} />
        </button>
      </div>
      <HabitWeekdayButtons value={value} onChange={onChange} className="task-habit-weekday-picker--popover" />
      <label className="task-habit-weekday-popover__interval">
        <span>Powtarzaj co</span>
        <input
          aria-label="Co ile tygodni"
          type="number"
          min={1}
          max={52}
          value={value.interval ?? 1}
          onChange={(event) => onChange({ ...value, interval: Math.max(1, Number(event.target.value) || 1) })}
        />
        <span>tydzień</span>
      </label>
    </div>
  );
}

function HabitMetaFields({ draft, onChange, compact = false }: {
  draft: HabitMetaDraft;
  onChange: (patch: Partial<HabitMetaDraft>) => void;
  compact?: boolean;
}) {
  return (
    <div className={`task-habit-meta-fields${compact ? " is-compact" : ""}`}>
      <HabitPriorityField
        value={draft.priority}
        compact={compact}
        onChange={(priority) => onChange({ priority })}
      />
      <HabitSelectField
        label="Pora dnia"
        value={draft.timeOfDay ?? ""}
        options={[
          { value: "", label: "Bez pory dnia" },
          { value: "morning", label: "Rano" },
          { value: "afternoon", label: "W dzień" },
          { value: "evening", label: "Wieczorem" },
        ]}
        icon={<Sun size={13} strokeWidth={1.6} aria-hidden="true" />}
        compact={compact}
        active={Boolean(draft.timeOfDay)}
        onChange={(next) => onChange({ timeOfDay: (next || undefined) as HabitTimeOfDay | undefined })}
      />
      <HabitTimeField
        value={draft.time ?? ""}
        compact={compact}
        onChange={(time) => onChange({ time: time || undefined })}
      />
      <HabitSelectField
        label="Przypomnienie"
        value={draft.reminderMinutes === undefined ? "" : String(draft.reminderMinutes)}
        options={[
          { value: "", label: "Bez przypomnienia" },
          { value: "5", label: "5 min przed" },
          { value: "15", label: "15 min przed" },
          { value: "30", label: "30 min przed" },
          { value: "60", label: "1 godz. przed" },
        ]}
        icon={<Bell size={13} strokeWidth={1.6} aria-hidden="true" />}
        compact={compact}
        active={draft.reminderMinutes !== undefined}
        onChange={(next) => onChange({ reminderMinutes: next === "" ? undefined : Number(next) })}
      />
    </div>
  );
}

function HabitTimeField({ value, compact = false, onChange }: {
  value: string;
  compact?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState<"options" | "manual">("options");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className={`task-habit-setting task-habit-time-field${compact ? " task-habit-setting--icon" : ""}${compact && value ? " is-set" : ""}`} title={compact ? "Godzina" : undefined}>
      <Clock3 size={13} strokeWidth={1.6} aria-hidden="true" />
      <span className="ui-sr-only">Godzina nawyku</span>
      <button
        type="button"
        className="task-habit-time-trigger"
        aria-label="Godzina nawyku"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            setOpen(true);
            setEditMode("options");
          } else {
            setEditMode((mode) => mode === "options" ? "manual" : "options");
          }
        }}
      >
        {value || "--:--"}
      </button>
      {open && (
        <div className="task-habit-time-popover">
          <DurationTimePicker
            value={value}
            label="Godzina nawyku"
            editMode={editMode}
            onChange={onChange}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function habitScheduleLabel(schedule: HabitSchedule) {
  if (schedule.type === "daily") return "Codziennie";
  if (schedule.type === "interval") return `Co ${schedule.interval ?? 2} dni`;
  const weekdays = (schedule.weekdays ?? []).map((day) => HABIT_WEEKDAYS.find((item) => item.value === day)?.label).filter(Boolean).join(", ");
  const interval = schedule.interval && schedule.interval > 1 ? ` · co ${schedule.interval} tyg.` : "";
  return `${weekdays || "Wybrane dni"}${interval}`;
}

function monthCells(monthKey: string) {
  const monthStart = parseLocalDateKey(`${monthKey}-01`);
  if (!monthStart) return [] as string[];
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const offset = (monthStart.getDay() + 6) % 7;
  const cells: string[] = [];
  for (let index = 0; index < offset; index += 1) cells.push("");
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toCalendarDateKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), day)));
  }
  while (cells.length % 7 !== 0) cells.push("");
  return cells;
}

function shiftMonth(monthKey: string, amount: number) {
  const date = parseLocalDateKey(`${monthKey}-01`);
  if (!date) return monthKey;
  date.setMonth(date.getMonth() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string) {
  const date = parseLocalDateKey(`${monthKey}-01`);
  return date ? new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(date) : monthKey;
}

function weekKeys(referenceKey: string) {
  const date = parseLocalDateKey(referenceKey);
  if (!date) return [] as string[];
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => toCalendarDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + index)));
}

// ── Podsumowanie: document main area ──────────────────────
export function HabitDetail({
  habit,
  onClose,
  onUpdate,
  onSetCompletion,
  onDelete,
}: {
  habit: Habit;
  onClose: () => void;
  onUpdate: (id: number, patch: Partial<Habit>) => void;
  onSetCompletion: (id: number, dateKey: string, done: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const todayKey = toCalendarDateKey(new Date());
  const [name, setName] = useState(habit.name);
  const [schedule, setSchedule] = useState<HabitSchedule>(habit.schedule ?? { type: "daily", startDate: todayKey });
  const [priority, setPriority] = useState<TaskPriority | undefined>(habit.priority);
  const [time, setTime] = useState(habit.time ?? "");
  const [timeOfDay, setTimeOfDay] = useState<HabitTimeOfDay | undefined>(habit.timeOfDay);
  const [reminderMinutes, setReminderMinutes] = useState<number | undefined>(habit.reminderMinutes);
  const [monthKey, setMonthKey] = useState(todayKey.slice(0, 7));
  const [pauseStart, setPauseStart] = useState(todayKey);
  const [pauseEnd, setPauseEnd] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const habitIdRef = useRef(habit.id);

  useEffect(() => {
    setName(habit.name);
    setSchedule(habit.schedule ?? { type: "daily", startDate: todayKey });
    setPriority(habit.priority);
    setTime(habit.time ?? "");
    setTimeOfDay(habit.timeOfDay);
    setReminderMinutes(habit.reminderMinutes);
    const activePause = (habit.pausePeriods ?? []).find((period) => !period.endDate && todayKey >= period.startDate);
    setPauseStart(activePause?.startDate ?? todayKey);
    setPauseEnd(activePause?.endDate ?? "");
    if (habitIdRef.current !== habit.id) {
      habitIdRef.current = habit.id;
      setMonthKey(todayKey.slice(0, 7));
      setShowHistory(false);
      setShowSettings(false);
      setShowPause(false);
      setActionsOpen(false);
    }
  }, [habit, todayKey]);

  const updateMeta = (patch: Partial<HabitMetaDraft>) => {
    if (patch.priority !== undefined || "priority" in patch) setPriority(patch.priority);
    if (patch.time !== undefined || "time" in patch) setTime(patch.time ?? "");
    if (patch.timeOfDay !== undefined || "timeOfDay" in patch) setTimeOfDay(patch.timeOfDay);
    if (patch.reminderMinutes !== undefined || "reminderMinutes" in patch) setReminderMinutes(patch.reminderMinutes);
    onUpdate(habit.id, patch as Partial<Habit>);
  };

  const todayScheduled = isHabitScheduledOnDate(habit, todayKey);
  const todayDone = isHabitDoneOnDate(habit, todayKey);
  const currentStreak = getHabitCurrentStreak(habit, todayKey);
  const bestStreak = getHabitBestStreak(habit, todayKey);
  const monthDays = monthCells(monthKey);
  const monthDates = monthDays.filter(Boolean);
  const monthStats = monthDates.length > 0
    ? getHabitCompletionStats(habit, monthDates[0], monthDates[monthDates.length - 1])
    : { scheduled: 0, completed: 0 };
  const week = weekKeys(todayKey);
  const activePause = (habit.pausePeriods ?? []).find((period) => !period.endDate && todayKey >= period.startDate);

  const savePause = () => {
    if (!parseLocalDateKey(pauseStart)) return;
    if (pauseEnd && (!parseLocalDateKey(pauseEnd) || pauseEnd < pauseStart)) return;
    const periods = (habit.pausePeriods ?? []).filter((period) => period !== activePause);
    onUpdate(habit.id, { pausePeriods: [...periods, { startDate: pauseStart, endDate: pauseEnd || undefined }] });
  };

  const resumeToday = () => {
    if (!activePause) return;
    const yesterday = shiftLocalDateKey(todayKey, -1);
    const periods = (habit.pausePeriods ?? []).flatMap((period) => {
      if (period !== activePause) return [period];
      return period.startDate < todayKey ? [{ ...period, endDate: yesterday }] : [];
    });
    onUpdate(habit.id, { pausePeriods: periods });
  };

  const confirmDelete = () => {
    if (window.confirm(`Usunąć nawyk „${habit.name}” i jego historię?`)) onDelete(habit.id);
  };

  return (
    <div className="task-habit-detail">
      <div className="task-habit-detail__toolbar">
        <button
          type="button"
          disabled={!todayScheduled}
          className={`task-checkbox task-checkbox--detail ${todayDone ? "is-checked" : ""}`}
          aria-label={todayDone ? "Oznacz dzisiejszy nawyk jako niewykonany" : "Oznacz dzisiejszy nawyk jako wykonany"}
          onClick={() => onSetCompletion(habit.id, todayKey, !todayDone)}
        >
          {todayDone && <Check size={9} strokeWidth={2.5} />}
        </button>
        <span className="task-habit-detail__status">{todayScheduled ? (todayDone ? "Wykonany dziś" : "Do wykonania dziś") : "Dziś wolne"}</span>
        <div className="task-habit-detail__actions">
          <Button
            ref={actionsRef}
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Więcej akcji nawyku"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen((open) => !open)}
          >
            <MoreHorizontal size={16} strokeWidth={1.5} />
          </Button>
          {actionsOpen && (
            <Menu
              triggerRef={actionsRef}
              onDismiss={() => setActionsOpen(false)}
              initialFocus="first"
              className="task-habit-detail__actions-menu"
            >
              <MenuItem
                leadingIcon={<Pause size={13} />}
                onClick={() => { setShowPause(true); setActionsOpen(false); }}
              >
                {activePause ? "Edytuj wstrzymanie" : "Wstrzymaj nawyk"}
              </MenuItem>
              <MenuItem tone="danger" leadingIcon={<Trash2 size={13} />} onClick={() => { setActionsOpen(false); confirmDelete(); }}>
                Usuń nawyk
              </MenuItem>
            </Menu>
          )}
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij szczegóły nawyku" onClick={onClose}><X size={16} strokeWidth={1.5} /></Button>
      </div>

      <div className="task-habit-detail__body">
        <input
          className="task-habit-detail__title"
          aria-label="Nazwa nawyku"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== habit.name) onUpdate(habit.id, { name: name.trim() }); }}
        />

        <div className="task-habit-detail__stats">
          <div><strong>{currentStreak}</strong><span>bieżąca seria</span></div>
          <div><strong>{bestStreak}</strong><span>najdłuższa seria</span></div>
        </div>

        <section className="task-habit-detail__section" aria-labelledby="habit-week-heading">
          <div className="task-habit-detail__section-head">
            <h3 id="habit-week-heading">Ten tydzień</h3>
            <span>{week.filter((dateKey) => habitDayState(habit, dateKey) === "completed").length}/{week.filter((dateKey) => isHabitScheduledOnDate(habit, dateKey)).length} wykonane</span>
          </div>
          <div className="task-habit-week">
            {week.map((dateKey, index) => {
              const state = habitDayState(habit, dateKey);
              const isFuture = dateKey > todayKey;
              const editable = !isFuture && state !== "paused";
              return (
                <button
                  key={dateKey}
                  type="button"
                  disabled={!editable}
                  className={`task-habit-week__day is-${state}${dateKey < todayKey ? " is-past" : ""}${dateKey === todayKey ? " is-today" : ""}`}
                  aria-label={`${HABIT_WEEKDAYS[index].label} ${formatLocalDate(dateKey)}: ${state === "completed" ? "wykonano" : state === "scheduled" ? "zaplanowano" : state === "paused" ? "wstrzymano" : "dzień wolny"}`}
                  onClick={() => onSetCompletion(habit.id, dateKey, state !== "completed")}
                >
                  <span>{HABIT_WEEKDAYS[index].label}</span>
                  <strong>{state === "completed" ? <Check size={13} strokeWidth={2.4} /> : new Date(`${dateKey}T12:00:00`).getDate()}</strong>
                </button>
              );
            })}
          </div>
        </section>

        <section className="task-habit-detail__section task-habit-detail__section--collapsible" aria-labelledby="habit-month-heading">
          <button
            type="button"
            className="task-habit-detail__section-toggle"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((open) => !open)}
          >
            <span>
              <strong id="habit-month-heading">Historia</strong>
              <small>{monthStats.completed}/{monthStats.scheduled} w tym miesiącu</small>
            </span>
            <ChevronRight size={13} className={showHistory ? "is-expanded" : ""} aria-hidden="true" />
          </button>
          {showHistory && <div className="task-habit-history">
            <div className="task-habit-month-nav">
              <button type="button" aria-label="Poprzedni miesiąc" onClick={() => setMonthKey((current) => shiftMonth(current, -1))}><ChevronLeft size={13} /></button>
              <span>{monthLabel(monthKey)}</span>
              <button type="button" aria-label="Następny miesiąc" onClick={() => setMonthKey((current) => shiftMonth(current, 1))}><ChevronRight size={13} /></button>
            </div>
          <div className="task-habit-month__labels">{HABIT_WEEKDAYS.map((day) => <span key={day.value}>{day.label}</span>)}</div>
          <div className="task-habit-month">
            {monthDays.map((dateKey, index) => {
              if (!dateKey) return <span key={`empty-${index}`} className="task-habit-month__empty" />;
              const state = habitDayState(habit, dateKey);
              const isFuture = dateKey > todayKey;
              const interactive = !isFuture && state !== "paused";
              return (
                <button
                  key={dateKey}
                  type="button"
                  disabled={!interactive}
                  className={`task-habit-month__day is-${state}${dateKey < todayKey ? " is-past" : ""}${dateKey === todayKey ? " is-today" : ""}`}
                  aria-label={`${formatLocalDate(dateKey)}: ${state === "completed" ? "wykonano" : state === "scheduled" ? "zaplanowano" : state === "paused" ? "wstrzymano" : "dzień wolny"}`}
                  onClick={() => onSetCompletion(habit.id, dateKey, state !== "completed")}
                >
                  {new Date(`${dateKey}T12:00:00`).getDate()}
                </button>
              );
            })}
          </div>
          <div className="task-habit-month__legend"><span><i className="is-completed" /> wykonano</span><span><i className="is-scheduled" /> zaplanowano</span><span><i className="is-overdue" /> zaległe</span><span><i className="is-paused" /> wstrzymano</span></div>
          </div>}
        </section>

        <section className="task-habit-detail__section" aria-labelledby="habit-settings-heading">
          <button
            type="button"
            className="task-habit-detail__section-toggle"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((open) => !open)}
          >
            <span>
              <strong id="habit-settings-heading">Ustawienia</strong>
              <small>{habitScheduleLabel(schedule)}{time ? ` · ${time}` : ""}{reminderMinutes !== undefined ? ` · przypomnienie ${reminderMinutes} min` : ""}</small>
            </span>
            <ChevronRight size={13} className={showSettings ? "is-expanded" : ""} aria-hidden="true" />
          </button>
          {showSettings && <div className="task-habit-settings-content">
          <HabitScheduleFields
            value={schedule}
            onChange={(next) => { setSchedule(next); onUpdate(habit.id, { schedule: next }); }}
          />
          <HabitMetaFields
            draft={{ schedule, priority, time, timeOfDay, reminderMinutes }}
            onChange={updateMeta}
          />
          <label className="task-habit-date-setting">
            <span>Aktywny od</span>
            <DatePicker aria-label="Aktywny od" value={schedule.startDate} onChange={(value) => {
              const next = { ...schedule, startDate: value || todayKey };
              setSchedule(next); onUpdate(habit.id, { schedule: next });
            }} />
          </label>
          <label className="task-habit-date-setting">
            <span>Aktywny do</span>
            <DatePicker aria-label="Aktywny do" min={schedule.startDate} value={schedule.endDate ?? ""} onChange={(value) => {
              const next = { ...schedule, endDate: value || undefined };
              setSchedule(next); onUpdate(habit.id, { schedule: next });
            }} />
          </label>
          </div>}
        </section>

        {activePause && (
          <div className="task-habit-detail__pause-banner">
            <span>Nawyk jest obecnie wstrzymany</span>
            <Button variant="quiet" size="sm" leadingIcon={<Play size={13} />} onClick={resumeToday}>Wznów dziś</Button>
          </div>
        )}

        {showPause && <section className="task-habit-detail__section" aria-labelledby="habit-pause-heading">
          <div className="task-habit-detail__section-head">
            <h3 id="habit-pause-heading">Wstrzymanie</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowPause(false)}>Gotowe</Button>
          </div>
          <div className="task-habit-pause-form">
            <div className="task-habit-pause-form__field"><span id="habit-pause-from">Od</span><DatePicker aria-labelledby="habit-pause-from" value={pauseStart} onChange={setPauseStart} /></div>
            <div className="task-habit-pause-form__field"><span id="habit-pause-to">Do</span><DatePicker aria-labelledby="habit-pause-to" min={pauseStart} value={pauseEnd} onChange={setPauseEnd} /></div>
            <Button variant="quiet" size="sm" leadingIcon={activePause ? <Play size={13} /> : <Pause size={13} />} onClick={activePause ? resumeToday : savePause}>{activePause ? "Wznów dziś" : "Wstrzymaj"}</Button>
          </div>
          {!activePause && (habit.pausePeriods ?? []).length > 0 && <p className="task-habit-detail__hint">Wcześniejsze przerwy: {(habit.pausePeriods ?? []).length}</p>}
        </section>}
      </div>

    </div>
  );
}

export function SummaryDocument({ tasks, listy }: { tasks: Task[]; listy: ListItem[] }) {
  const done   = tasks.filter(t => t.done);
  const undone = tasks.filter(t => !t.done);
  const weekLabel = getWeekRangeLabel();

  function Line({ task, showDate }: { task: Task; showDate: boolean }) {
    // The dot carries the list's own colour, so it stays inline.
    const col = listy.find(l => l.id === task.list)?.color ?? C.danger;
    return (
      <div className="task-doc__line">
        <span className="task-doc__dot" style={{ background: col }} />
        {showDate && task.date && <span className="task-doc__date">[{fmtTaskDate(task.date)}]</span>}
        <span className="task-doc__text">{task.text}</span>
      </div>
    );
  }

  return (
    <div className="task-doc">
      <div className="task-doc__hero">{weekLabel}</div>

      <div className="task-doc__body">
        <SummaryEditor />
        <section className="task-doc__section">
          <h3 className="task-doc__section-title is-done">Ukończone</h3>
          {done.length === 0
            ? <p className="task-doc__empty">Brak ukończonych zadań w tym okresie.</p>
            : done.map(t => <Line key={t.id} task={t} showDate={true} />)}
        </section>
        <section className="task-doc__section">
          <h3 className="task-doc__section-title is-open">Niewykonane</h3>
          {undone.length === 0
            ? <p className="task-doc__empty">Brak niewykonanych. Świetna robota!</p>
            : undone.map(t => <Line key={t.id} task={t} showDate={false} />)}
        </section>
      </div>
    </div>
  );
}

// ── Lightweight floating menu for input bar dropdowns ─────
export function InputFloatMenu({ anchorEl, onClose, children }: {
  anchorEl: HTMLElement; onClose: () => void; children: React.ReactNode;
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(anchorEl);
  triggerRef.current = anchorEl;
  const rect = anchorEl.getBoundingClientRect();
  const viewportGap = 12;
  const menuWidth = Math.min(190, Math.max(0, window.innerWidth - viewportGap * 2));
  const left = Math.max(viewportGap, Math.min(rect.left, window.innerWidth - menuWidth - viewportGap));
  return (
    <Menu ref={ref} triggerRef={triggerRef} onDismiss={onClose} initialFocus="selected" style={{
      position: "fixed",
      top: rect.bottom + 6,
      left,
      width: menuWidth,
      minWidth: Math.min(170, menuWidth),
      zIndex: 9999,
    }}>
      {children}
    </Menu>
  );
}

// ── Main page ─────────────────────────────────────────────
