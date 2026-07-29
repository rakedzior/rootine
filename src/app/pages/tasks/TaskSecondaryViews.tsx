import { useRef, useState } from "react";
import type React from "react";
import { Check, Flame, Plus, Star } from "lucide-react";
import {
  isHabitDoneOnDate,
  toCalendarDateKey,
} from "../../data/taskWorkspace";
import { Button, Menu } from "../../ui";
import { SummaryEditor } from "./SummaryEditor";
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
  const done  = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const doneH = habits.filter(h => h.done).length;
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
            { label: "Nawyki", done: doneH, total: habits.length },
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
          <span className="task-summary__meta">{doneH}/{habits.length}</span>
        </div>
        <div>
          {habits.map(h => (
            <button
              key={h.id}
              type="button"
              aria-pressed={h.done}
              onClick={() => onToggleHabit(h.id)}
              className={`task-summary__habit${h.done ? " is-done" : ""}`}
            >
              <span className="task-summary__habit-check">
                {h.done && <Check size={11} strokeWidth={2.5} />}
              </span>
              <span className="task-summary__habit-copy">
                <span className="task-summary__habit-name">{h.name}</span>
                {h.streak > 0 && (
                  <span className="task-summary__habit-streak">
                    <Flame size={11} strokeWidth={1.5} />
                    {h.streak} dni
                  </span>
                )}
              </span>
              {h.done && <Star size={11} strokeWidth={1.5} className="task-summary__streak" />}
            </button>
          ))}
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
  onAddHabit,
}: {
  habits: Habit[];
  onToggleHabit: (id: number) => void;
  onAddHabit: (name: string) => void;
}) {
  const [newHabit, setNewHabit] = useState("");
  const todayKey = toCalendarDateKey(new Date());
  const completed = habits.filter((habit) => isHabitDoneOnDate(habit, todayKey)).length;
  const progress = habits.length ? Math.round(completed / habits.length * 100) : 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newHabit.trim();
    if (!name) return;
    onAddHabit(name);
    setNewHabit("");
  };

  return (
    <div className="task-habits-workspace">
      <section className="task-habits-overview" aria-labelledby="task-habits-title">
        <div>
          <h2 id="task-habits-title">Nawyki na dziś</h2>
          <p>Odhacz dzisiejszy rytm. Każdy dzień jest zapisywany osobno, więc jutro zaczniesz z czystą listą.</p>
        </div>
        <div className="task-habits-progress">
          <div>
            <span>Wykonanie</span>
            <strong>{progress}%</strong>
          </div>
          <div
            className="task-habits-progress__track"
            role="progressbar"
            aria-label="Dzisiejszy postęp nawyków"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <i style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
          <small>{completed} z {habits.length} ukończonych</small>
        </div>
      </section>

      <form className="task-habits-add" onSubmit={submit}>
        <input
          value={newHabit}
          onChange={(event) => setNewHabit(event.target.value)}
          placeholder="Dodaj nowy nawyk"
          aria-label="Nazwa nowego nawyku"
        />
        <Button type="submit" variant="primary" leadingIcon={<Plus size={13} />} disabled={!newHabit.trim()}>
          Dodaj nawyk
        </Button>
      </form>

      {habits.length ? (
        <div className="task-habits-list">
          {habits.map((habit) => {
            const doneToday = isHabitDoneOnDate(habit, todayKey);
            return (
              <button
                key={habit.id}
                type="button"
                className={`task-habit-row ${doneToday ? "is-done" : ""}`}
                aria-pressed={doneToday}
                aria-label={doneToday
                  ? `Oznacz nawyk jako niewykonany: ${habit.name}`
                  : `Ukończ nawyk: ${habit.name}`}
                onClick={() => onToggleHabit(habit.id)}
              >
                <span className="task-habit-row__check" aria-hidden="true">
                  {doneToday && <Check size={10} strokeWidth={2.5} />}
                </span>
                <span className="task-habit-row__copy">
                  <strong>{habit.name}</strong>
                  <small>
                    <Flame size={11} aria-hidden="true" />
                    {habit.streak > 0 ? `${habit.streak} dni serii` : "Nowy rytm"}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="task-habits-empty">
          <span>Nie masz jeszcze nawyków. Dodaj pierwszy powyżej.</span>
        </div>
      )}
    </div>
  );
}

// ── Podsumowanie: document main area ──────────────────────
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
      <div className="task-doc__head">
        <div className="task-doc__title-row">
          <span className="task-doc__title">
            <span className="task-doc__glyph" aria-hidden="true"><i /><i /><i /></span>
            Podsumowanie
          </span>
          <span className="task-doc__week">{weekLabel}</span>
        </div>
      </div>

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
  return (
    <Menu ref={ref} triggerRef={triggerRef} onDismiss={onClose} initialFocus="selected" style={{
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      minWidth: 170,
      zIndex: 9999,
    }}>
      {children}
    </Menu>
  );
}

// ── Main page ─────────────────────────────────────────────
