import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Ellipsis, Plus } from "lucide-react";
import {
  addDays, formatLongDate, formatShortDate, fromDateKey, startOfWeekKey,
  type WorkoutSession,
} from "./model";
import { DisciplineLabel, EmptyState, SectionLabel, StatusLabel } from "./Shared";
import { SPORT_COLORS as C } from "./theme";

const DAY_LABELS = ["pon.", "wt.", "śr.", "czw.", "pt.", "sob.", "niedz."];

function SessionRow({ session, onSelect, onStart }: { session: WorkoutSession; onSelect: () => void; onStart: () => void }) {
  const exerciseCount = session.exercises.length || session.stages?.length || 0;
  return (
    <article onClick={onSelect} className="sport-session-row group flex min-h-[62px] cursor-pointer flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors sm:flex-nowrap" style={{ background: C.card, borderColor: C.border }} onMouseEnter={(event) => { event.currentTarget.style.background = C.cardHover; }} onMouseLeave={(event) => { event.currentTarget.style.background = C.card; }}>
      <span className="h-7 w-0.5 flex-shrink-0 rounded-full" style={{ background: session.status === "in_progress" ? C.warning : session.status === "completed" ? C.green : C.blue, opacity: session.status === "missed" ? .35 : .8 }} />
      <div className="min-w-[180px] flex-1 sm:min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[12px] font-medium" style={{ color: session.status === "missed" ? C.textMuted : C.text }}>{session.title}</h3>
          {session.status !== "scheduled" && <StatusLabel status={session.status} compact />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[9px]" style={{ color: C.textMuted }}>
          <DisciplineLabel discipline={session.discipline} compact />
          {session.time && <span style={{ fontFamily: "'DM Mono', monospace" }}>{session.time}</span>}
          <span>{session.durationMinutes} min</span>
          {exerciseCount > 0 && <span>{exerciseCount} {session.stages?.length ? "etapy" : "ćwiczeń"}</span>}
        </div>
      </div>
      {(session.status === "scheduled" || session.status === "in_progress") && (
        <button type="button" onClick={(event) => { event.stopPropagation(); onStart(); }} className="sport-link-action ml-auto" style={{ color: session.status === "in_progress" ? C.warning : C.blue }}>
          {session.status === "in_progress" ? "Wznów →" : "Rozpocznij →"}
        </button>
      )}
      {session.status === "missed" && <button type="button" onClick={(event) => { event.stopPropagation(); onSelect(); }} className="h-7 rounded-md border px-2.5 text-[9px]" style={{ color: C.textSecond, borderColor: C.borderStrong }}>Przenieś</button>}
      <button type="button" aria-label="Więcej opcji" onClick={(event) => { event.stopPropagation(); onSelect(); }} className="flex h-7 w-7 items-center justify-center rounded-md opacity-60 transition-opacity group-hover:opacity-100" style={{ color: C.textMuted }}><Ellipsis size={14} /></button>
    </article>
  );
}

export function WeekBoard({ sessions, weekStart, onWeekChange, onMove, onSelect, onAdd, expanded = false }: { sessions: WorkoutSession[]; weekStart: string; onWeekChange: (key: string) => void; onMove: (sessionId: string, date: string) => void; onSelect: (id: string) => void; onAdd: (date: string) => void; expanded?: boolean }) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const today = new Date().toDateString();
  const range = `${formatShortDate(days[0])} — ${formatShortDate(days[6])}`;

  return (
    <section className={expanded ? "flex min-h-0 flex-1 flex-col" : ""}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-[13px] font-semibold" style={{ color: C.text }}>{expanded ? "Tydzień" : "Obecny tydzień"}</h2>
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="Poprzedni tydzień" onClick={() => onWeekChange(addDays(weekStart, -7))} className="flex h-7 w-7 items-center justify-center rounded-lg border" style={{ borderColor: C.border, color: C.textMuted }}><ChevronLeft size={12} /></button>
            <span className="min-w-[105px] text-center text-[10px]" style={{ color: C.textMuted, fontFamily: "'DM Mono', monospace" }}>{range}</span>
            <button type="button" aria-label="Następny tydzień" onClick={() => onWeekChange(addDays(weekStart, 7))} className="flex h-7 w-7 items-center justify-center rounded-lg border" style={{ borderColor: C.border, color: C.textMuted }}><ChevronRight size={12} /></button>
          </div>
        </div>
        {weekStart !== startOfWeekKey() && <button type="button" onClick={() => onWeekChange(startOfWeekKey())} className="text-[10px]" style={{ color: C.blue }}>Bieżący tydzień</button>}
      </div>

      <div className="min-w-0 overflow-x-auto pb-2 [scrollbar-width:thin]">
        <div className="sport-week-grid grid min-w-[980px] gap-2">
          {days.map((dateKey, dayIndex) => {
            const daySessions = sessions.filter((session) => session.date === dateKey);
            const isToday = fromDateKey(dateKey).toDateString() === today;
            return (
              <div key={dateKey} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/sport-session") || draggedId; if (id) onMove(id, dateKey); setDraggedId(null); }} className={`flex flex-col rounded-lg border p-2 ${expanded ? "min-h-[440px]" : "min-h-[268px]"}`} style={{ background: isToday ? "rgba(71,114,250,.035)" : C.input, borderColor: isToday ? "rgba(71,114,250,.42)" : C.border }}>
                <div className="mb-2 flex items-start justify-between px-1 py-0.5">
                  <div>
                    <p className="text-[10px] font-medium" style={{ color: isToday ? C.blue : C.textSecond }}>{DAY_LABELS[dayIndex]}</p>
                    <p className="mt-0.5 text-[9px]" style={{ color: isToday ? C.blue : C.textMuted, fontFamily: "'DM Mono', monospace" }}>{fromDateKey(dateKey).getDate()}</p>
                  </div>
                  {isToday && <span className="rounded px-1.5 py-0.5 text-[8px]" style={{ color: C.blue, background: C.blueBg }}>dziś</span>}
                </div>
                <div className="space-y-1.5">
                  {daySessions.map((session) => (
                    <button key={session.id} type="button" draggable onDragStart={(event) => { setDraggedId(session.id); event.dataTransfer.setData("text/sport-session", session.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedId(null)} onClick={() => onSelect(session.id)} className="w-full cursor-grab rounded-md border px-2 py-1.5 text-left active:cursor-grabbing" style={{ background: C.card, borderColor: C.border, opacity: draggedId === session.id ? .45 : 1 }}>
                      <p className="line-clamp-2 text-[10px] font-medium leading-4" style={{ color: session.status === "missed" ? C.textMuted : C.textSecond }}>{session.title}</p>
                      {session.time && <p className="mt-1 text-[8px]" style={{ color: C.textDisabled, fontFamily: "'DM Mono', monospace" }}>{session.time}</p>}
                      <div className="mt-1.5"><StatusLabel status={session.status} compact /></div>
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => onAdd(dateKey)} className="sport-day-add mt-auto" aria-label={`Dodaj trening: ${DAY_LABELS[dayIndex]}`}><Plus size={8} strokeWidth={1.5} /> Dodaj</button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[9px]" style={{ color: C.textMuted }}>
        {(["completed", "scheduled", "missed"] as const).map((status) => <StatusLabel key={status} status={status} compact />)}
        <span className="ml-auto">Przeciągnij sesję, aby zmienić termin</span>
      </div>
    </section>
  );
}

export function SportOverview({ sessions, weekStart, onWeekChange, onMove, onSelect, onStart, onAdd }: { sessions: WorkoutSession[]; weekStart: string; onWeekChange: (key: string) => void; onMove: (sessionId: string, date: string) => void; onSelect: (id: string) => void; onStart: (id: string) => void; onAdd: (date?: string) => void }) {
  const todayKey = sessions.find((session) => fromDateKey(session.date).toDateString() === new Date().toDateString())?.date;
  const today = todayKey ?? startOfWeekKey(new Date());
  const todaySessions = sessions.filter((session) => session.date === today).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  return (
    <div className="space-y-6">
      <section className="sport-today-section">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <SectionLabel>Dzisiejsze treningi · {todaySessions.length}</SectionLabel>
            <p className="text-[10px] -mt-1" style={{ color: C.textDisabled }}>{formatLongDate(today)}</p>
          </div>
        </div>
        {todaySessions.length ? <div className="space-y-2">{todaySessions.map((session) => <SessionRow key={session.id} session={session} onSelect={() => onSelect(session.id)} onStart={() => onStart(session.id)} />)}</div> : <EmptyState title="Brak treningów na dziś" description="Zaplanuj sesję albo rozpocznij szybki trening bez szablonu." action={<button type="button" onClick={() => onAdd(today)} className="rounded-lg px-3 py-2 text-[10px]" style={{ color: C.blue, background: C.blueBg }}>Dodaj trening</button>} />}
      </section>
      <WeekBoard sessions={sessions} weekStart={weekStart} onWeekChange={onWeekChange} onMove={onMove} onSelect={onSelect} onAdd={onAdd} />
    </div>
  );
}

export function FullWeekPlan(props: Parameters<typeof WeekBoard>[0]) {
  return <div className="flex h-full min-h-0 flex-col"><WeekBoard {...props} expanded /></div>;
}
