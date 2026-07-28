import { useRef, useState } from "react";
import type React from "react";
import { Check, Flame, Plus, Star } from "lucide-react";
import {
  isHabitDoneOnDate,
  toCalendarDateKey,
} from "../../data/taskWorkspace";
import { Button, Menu } from "../../ui";
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
  const panelBg = C.card;
  const panelBorder = C.borderSubtle;
  const headingColor = C.textMuted;
  const secondaryText = C.textMuted;
  const DL = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 py-5 space-y-6">
      <section>
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: headingColor }}>Podsumowanie dnia</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { label: "Zadania", done, total, accent: done > 0 ? C.seaGlass : C.textPrimary },
            { label: "Nawyki", done: doneH, total: habits.length, accent: doneH > 0 ? C.seaGlass : C.textPrimary },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-3 text-center" style={{ background: panelBg, border: `1px solid ${panelBorder}` }}>
              <div className="font-semibold leading-none" style={{ fontFamily: "'DM Mono',monospace", color: s.accent }}>
                <span className="text-[22px]">{s.done}</span>
                <span className="text-[22px]" style={{ color: secondaryText }}>/{s.total}</span>
              </div>
              <div className="text-[9px] mt-1.5 uppercase tracking-widest" style={{ color: secondaryText }}>{s.label} · wykonane</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-3.5" style={{ background: panelBg, border: `1px solid ${panelBorder}` }}>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px]" style={{ color: headingColor }}>Postęp dnia</span>
            <span className="text-[16px] font-semibold leading-none" style={{ fontFamily: "'DM Mono',monospace", color: pct === 100 ? C.seaGlass : C.iceBlue }}>{pct}%</span>
          </div>
          <div className="h-[4px] rounded-full overflow-hidden" style={{ background: C.borderSubtle }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: pct === 100 ? C.seaGlass : C.iceBlueSolid }} />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: headingColor }}>Nawyki na dziś</p>
          <span className="text-[10px]" style={{ fontFamily: "'DM Mono',monospace", color: secondaryText }}>{doneH}/{habits.length}</span>
        </div>
        <div className="space-y-1.5">
          {habits.map(h => (
            <button key={h.id} type="button" aria-pressed={h.done} onClick={() => onToggleHabit(h.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer text-left transition-all duration-150"
              style={{ background: panelBg, border: `1px solid ${panelBorder}` }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = panelBg)}>
              <div className="w-[14px] h-[14px] rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={{ border: `1.5px solid ${h.done ? C.seaGlass : C.borderStrong}`, background: h.done ? C.seaGlassBg : "transparent" }}>
                {h.done && <Check size={7} strokeWidth={2.5} style={{ color: C.seaGlass }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] leading-none" style={{ color: h.done ? C.textMuted : C.textSecond, textDecoration: h.done ? "line-through" : "none" }}>{h.name}</div>
                {h.streak > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Flame size={9} strokeWidth={1.5} style={{ color: C.warning }} />
                    <span className="text-[10px]" style={{ color: secondaryText }}>{h.streak} dni</span>
                  </div>
                )}
              </div>
              {h.done && <Star size={10} strokeWidth={1.5} style={{ color: C.warning, flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: headingColor }}>Ten tydzień</p>
        <div className="rounded-xl p-3.5" style={{ background: panelBg, border: `1px solid ${panelBorder}` }}>
          <div className="flex gap-1.5">
            {week.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex items-center justify-center rounded-lg text-[10px] font-medium transition-all"
                  style={{
                    aspectRatio: "1",
                    background: d.today ? C.iceBlueBg : i < todayIdx ? C.seaGlassBg : "transparent",
                    color: d.today ? C.iceBlue : i < todayIdx ? C.seaGlass : secondaryText,
                    border: `1px solid ${d.today ? C.blueBorder : "transparent"}`,
                  }}>
                  {i < todayIdx ? <Check size={8} strokeWidth={2.5} /> : d.n}
                </div>
                <span className="text-[9px]" style={{ color: d.today ? C.iceBlue : secondaryText }}>{DL[i]}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: panelBorder }}>
            <span className="text-[11px]" style={{ color: headingColor }}>Seria aktywna</span>
            <div className="flex items-center gap-1">
              <Flame size={11} strokeWidth={1.5} style={{ color: C.warning }} />
              <span className="text-[11px] font-medium" style={{ fontFamily: "'DM Mono',monospace", color: C.warning }}>{todayIdx} dni</span>
            </div>
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
            <i style={{ width: `${progress}%` }} />
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

  const tbBtns = [
    "H1","H2","H3","|","B","I","U","S","|","🔗","</>","«»",
  ];

  function Line({ task, showDate }: { task: Task; showDate: boolean }) {
    const col = listy.find(l => l.id === task.list)?.color ?? C.danger;
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3.5px 0" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: col, flexShrink: 0, marginTop: 6, opacity: 0.9 }} />
        {showDate && task.date && (
          <span style={{ fontSize: 12, color: C.textMuted, flexShrink: 0 }}>[{fmtTaskDate(task.date)}]</span>
        )}
        <span style={{ fontSize: 12, color: C.textSecond, lineHeight: 1.55 }}>{task.text}</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: C.bg }}>
      {/* Header */}
      <div style={{ padding: "18px 26px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3.5, flexShrink: 0 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 14, height: 1.5, background: C.textMuted, borderRadius: 1 }} />)}
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary, fontFamily: "var(--font-sans)" }}>
              Podsumowanie
            </span>
          </div>
          <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "var(--font-data)" }}>{weekLabel}</span>
        </div>
        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 1,
          padding: "5px 8px", marginBottom: 18,
          background: C.card, borderRadius: 10,
          border: `1px solid ${C.borderSubtle}`,
        }}>
          {tbBtns.map((b, i) => b === "|" ? (
            <div key={i} style={{ width: 1, height: 13, background: C.borderStrong, margin: "0 4px" }} />
          ) : (
            <button key={i} style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "3px 7px", borderRadius: 5,
              fontSize: 10.5, fontWeight: 700, color: C.textMuted,
              fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", lineHeight: 1,
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.elevated)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Date range hero */}
      <div style={{ padding: "0 26px 16px", flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: C.textPrimary, fontFamily: "var(--font-sans)" }}>
          {weekLabel}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 26px 16px", scrollbarWidth: "none" }}>
        {/* Ukończone */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.seaGlass, marginBottom: 8, fontFamily: "var(--font-sans)" }}>
            Ukończone
          </div>
          {done.length === 0
            ? <p style={{ fontSize: 12, color: C.textMuted, paddingLeft: 14 }}>Brak ukończonych zadań w tym okresie.</p>
            : done.map(t => <Line key={t.id} task={t} showDate={true} />)
          }
        </div>
        {/* Niewykonane */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.danger, marginBottom: 8, fontFamily: "var(--font-sans)" }}>
            Niewykonane
          </div>
          {undone.length === 0
            ? <p style={{ fontSize: 12, color: C.textMuted, paddingLeft: 14 }}>Brak niewykonanych. Świetna robota!</p>
            : undone.map(t => <Line key={t.id} task={t} showDate={false} />)
          }
        </div>
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
