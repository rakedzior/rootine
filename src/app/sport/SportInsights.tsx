import { useEffect, useState } from "react";
import {
  Activity,
  Bike,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Footprints,
  GripVertical,
  HeartPulse,
  Layers3,
  ListChecks,
  Pencil,
  PersonStanding,
  Play,
  Repeat2,
  RotateCcw,
  Search,
  TimerReset,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Button,
  Card,
  DetailPanel,
  EmptyState,
  Input,
  SectionHeader,
  Select,
  AddToTasksButton,
} from "../ui";
import {
  DAY_LABELS,
  cycleDateRange,
  cycleWeekDate,
  cycleWorkoutDate,
  historyEntryFromSession,
  todayCycleWeek,
  type CycleWorkout,
  type TrainingCycle,
  type WorkoutHistoryEntry,
  type WorkoutOutcome,
} from "./plannerModel";
import {
  addDays,
  formatLongDate,
  formatShortDate,
  fromDateKey,
  normalizeSearch,
  startOfWeekKey,
  toDateKey,
  type Discipline,
  type WorkoutSession,
  type WorkoutTemplate,
} from "./model";
import { DisciplineLabel, StatusLabel } from "./Shared";
import { DISCIPLINE_META } from "./theme";

const DISCIPLINE_ICONS: Record<Discipline, LucideIcon> = {
  strength: Dumbbell,
  running: Footprints,
  rehab: HeartPulse,
  mobility: PersonStanding,
  cycling: Bike,
  custom: Activity,
};

function workoutCountLabel(count: number) {
  if (count === 1) return "trening";
  if (count >= 2 && count <= 4) return "treningi";
  return "treningów";
}

function formatDayHeading(dateKey: string) {
  const date = fromDateKey(dateKey);
  const weekday = new Intl.DateTimeFormat("pl-PL", { weekday: "long" }).format(date);
  return {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    date: new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long" }).format(date),
  };
}

function formatDateWithYear(dateKey: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(fromDateKey(dateKey)).replace(".", "");
}

function isDateInsideCycle(cycle: TrainingCycle, dateKey: string) {
  const range = cycleDateRange(cycle);
  return dateKey >= range.start && dateKey <= range.end;
}

function formatStopwatch(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function activeSessionSnapshot(session: WorkoutSession, now: number) {
  const elapsedSeconds = session.startedAt ? Math.max(0, (now - session.startedAt) / 1000) : 0;
  const stages = session.stages ?? [];
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  const usesStages = stages.length > 0;
  const done = usesStages
    ? stages.filter((stage) => stage.done).length
    : sets.filter((set) => set.done).length;
  const total = usesStages ? stages.length : sets.length;
  const currentStage = usesStages
    ? stages.find((stage) => !stage.done) ?? stages.at(-1)
    : undefined;
  const currentExercise = !usesStages
    ? session.exercises.find((exercise) => exercise.sets.some((set) => !set.done))
      ?? session.exercises.at(-1)
    : undefined;
  const currentSetIndex = currentExercise
    ? Math.max(0, currentExercise.sets.findIndex((set) => !set.done))
    : -1;
  const currentLabel = currentStage?.label
    ?? currentExercise?.name
    ?? "Sesja bez zdefiniowanych etapów";
  const currentDetail = total > 0 && done === total
    ? usesStages ? "Wszystkie etapy zapisane" : "Wszystkie serie zapisane"
    : currentStage?.target
      ?? (currentExercise
        ? `Seria ${currentSetIndex + 1} z ${currentExercise.sets.length}`
        : "Zapisuj czas i rezultat w konsoli sesji");
  let restSeconds: number | null = session.restTimerRemaining ?? null;
  if (restSeconds !== null && session.restTimerRunning && session.restTimerUpdatedAt) {
    restSeconds = Math.max(0, restSeconds - Math.floor((now - session.restTimerUpdatedAt) / 1000));
  }
  return {
    elapsedSeconds,
    done,
    total,
    unit: usesStages ? "etapów" : "serii",
    currentLabel,
    currentDetail,
    restSeconds,
    progress: total ? Math.round((done / total) * 100) : 0,
  };
}

function ActiveSessionStrip({
  session,
  onResume,
}: {
  session: WorkoutSession;
  onResume: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const snapshot = activeSessionSnapshot(session, now);
  return (
    <section className="sport-active-strip" aria-labelledby="sport-active-strip-title">
      <div className="sport-active-strip__header">
        <div>
          <span><Activity size={12} aria-hidden="true" /> Trening w toku</span>
          <strong id="sport-active-strip-title">{session.title}</strong>
          <DisciplineLabel discipline={session.discipline} compact />
        </div>
        <Button variant="primary" leadingIcon={<Play size={13} />} onClick={onResume}>
          Wznów trening
        </Button>
      </div>
      <div className="sport-active-strip__facts">
        <div>
          <span><Clock3 size={11} aria-hidden="true" /> Czas sesji</span>
          <strong>{formatStopwatch(snapshot.elapsedSeconds)}</strong>
        </div>
        <div className="sport-active-strip__current">
          <span><ListChecks size={11} aria-hidden="true" /> Teraz</span>
          <strong>{snapshot.currentLabel}</strong>
          <small>{snapshot.currentDetail}</small>
        </div>
        <div>
          <span><CheckCircle2 size={11} aria-hidden="true" /> Postęp</span>
          <strong>{snapshot.done}/{snapshot.total || "—"} {snapshot.unit}</strong>
        </div>
        <div>
          <span><TimerReset size={11} aria-hidden="true" /> Przerwa</span>
          <strong>{snapshot.restSeconds === null ? "—" : formatStopwatch(snapshot.restSeconds)}</strong>
          <small>{snapshot.restSeconds === null
            ? "Uruchomi się po serii"
            : session.restTimerRunning ? "Odliczanie trwa" : "Timer wstrzymany"}</small>
        </div>
      </div>
      <div className="sport-active-strip__progress" aria-hidden="true">
        <i style={{ transform: `scaleX(${snapshot.progress / 100})` }} />
      </div>
    </section>
  );
}

function PlannedWorkoutRow({
  workout,
  selected,
  outcome,
  active,
  onSelect,
  onStart,
  onComplete,
  onResetStatus,
  onMoveTomorrow,
}: {
  workout: CycleWorkout;
  selected: boolean;
  outcome?: WorkoutOutcome;
  active: boolean;
  onSelect: () => void;
  onStart: () => void;
  onComplete: () => void;
  onResetStatus: () => void;
  onMoveTomorrow: () => void;
}) {
  const DisciplineIcon = DISCIPLINE_ICONS[workout.discipline];
  return (
    <article className={`sport-overview-workout ${selected ? "is-selected" : ""} ${active ? "is-active" : ""} ${outcome ? `is-${outcome.status}` : ""}`.trim()}>
      <button type="button" aria-pressed={selected} onClick={onSelect}>
        <span className="sport-overview-workout__icon" style={{ color: DISCIPLINE_META[workout.discipline].color }} aria-hidden="true">
          <DisciplineIcon size={18} strokeWidth={1.6} />
        </span>
        <span className="sport-overview-workout__copy">
          <strong>{workout.title}</strong>
          <span className="sport-overview-workout__meta">
            <DisciplineLabel discipline={workout.discipline} compact />
            <span aria-hidden="true">·</span>
            <span>{workout.durationMinutes} min</span>
            <span aria-hidden="true">·</span>
            <span>{workout.time || "Dowolna pora"}</span>
          </span>
        </span>
        {active
          ? <StatusLabel status="in_progress" compact />
          : <StatusLabel status={outcome?.status ?? "scheduled"} compact />}
      </button>
      {active ? (
        <div className="sport-overview-workout__actions">
          <Button variant="primary" size="sm" leadingIcon={<Play size={11} />} onClick={onStart}>Wznów</Button>
        </div>
      ) : outcome ? (
        <div className="sport-overview-workout__actions">
          <Button variant="quiet" size="sm" onClick={onSelect}>Podsumowanie</Button>
          <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={11} />} onClick={onResetStatus}>
            Przywróć plan
          </Button>
        </div>
      ) : (
        <div className="sport-overview-workout__actions">
          <Button variant="primary" size="sm" leadingIcon={<Play size={11} />} onClick={onStart}>Rozpocznij</Button>
          <Button variant="ghost" size="sm" leadingIcon={<Check size={11} />} onClick={onComplete}>Wykonany</Button>
          <Button variant="ghost" size="sm" leadingIcon={<CalendarClock size={11} />} onClick={onMoveTomorrow}>Na jutro</Button>
        </div>
      )}
    </article>
  );
}

export function SportOverview({
  cycle,
  activeSession,
  selectedWorkoutId,
  outcomes,
  onCreateCycle,
  onResumeActive,
  onSelectWorkout,
  onStartWorkout,
  onCompleteWorkout,
  onResetWorkout,
  onMoveTomorrow,
  onMoveWorkout,
  onOpenCycle,
}: {
  cycle: TrainingCycle | null;
  activeSession?: WorkoutSession;
  selectedWorkoutId?: string | null;
  outcomes: Record<string, WorkoutOutcome>;
  onCreateCycle: () => void;
  onResumeActive: () => void;
  onSelectWorkout: (workout: CycleWorkout) => void;
  onStartWorkout: (workout: CycleWorkout) => void;
  onCompleteWorkout: (workout: CycleWorkout) => void;
  onResetWorkout: (workout: CycleWorkout) => void;
  onMoveTomorrow: (workout: CycleWorkout) => void;
  onMoveWorkout: (workout: CycleWorkout, day: number) => void;
  onOpenCycle: (week: number) => void;
}) {
  const [draggedWorkoutId, setDraggedWorkoutId] = useState<string | null>(null);
  const [dropTargetDay, setDropTargetDay] = useState<number | null>(null);
  const activeWorkoutId = activeSession?.cycleWorkoutId;

  if (!cycle) {
    return (
      <div className="sport-insights">
        {activeSession && <ActiveSessionStrip session={activeSession} onResume={onResumeActive} />}
        <EmptyState
          title="Brak aktywnego cyklu"
          description="Utwórz cykl treningowy, aby zobaczyć plan na dziś i kolejne treningi."
          action={<Button variant="primary" onClick={onCreateCycle}>Utwórz cykl treningowy</Button>}
        />
      </div>
    );
  }

  const today = toDateKey(new Date());
  const week = todayCycleWeek(cycle);
  const todayInCycle = isDateInsideCycle(cycle, today);
  const todayWorkouts = todayInCycle
    ? cycle.workouts
      .filter((workout) => cycleWorkoutDate(cycle, workout) === today)
      .sort((left, right) => (left.time ?? "").localeCompare(right.time ?? ""))
    : [];
  const todayHeading = formatDayHeading(today);
  const todayMinutes = todayWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const remainingWorkouts = todayWorkouts.filter((workout) => (
    !outcomes[workout.id] && workout.id !== activeWorkoutId
  )).length;
  const completedToday = todayWorkouts.filter((workout) => outcomes[workout.id]?.status === "completed").length;
  const weekWorkouts = cycle.workouts.filter((workout) => workout.week === week);
  const weekMinutes = weekWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const upcomingWorkouts = cycle.workouts
    .map((workout) => ({ workout, date: cycleWorkoutDate(cycle, workout) }))
    .filter((item) => item.date > today && item.workout.id !== activeWorkoutId)
    .sort((left, right) => (
      left.date.localeCompare(right.date)
      || (left.workout.time ?? "").localeCompare(right.workout.time ?? "")
    ))
    .slice(0, 3);

  return (
    <div className="sport-insights sport-overview">
      <section className="sport-today-card" aria-labelledby="sport-today-heading">
        <div className="sport-today-card__intro">
          <div className="sport-today-card__heading">
            <span>Dzisiaj</span>
            <h2 id="sport-today-heading">
              {todayHeading.weekday}
              <span>{todayHeading.date}</span>
            </h2>
          </div>
          <div className="sport-today-card__summary" aria-label="Podsumowanie planu na dziś">
            <div>
              <strong>{todayWorkouts.length}</strong>
              <span>{workoutCountLabel(todayWorkouts.length)}</span>
            </div>
            <div>
              <strong>{todayMinutes}</strong>
              <span>min łącznie</span>
            </div>
          </div>
          <Button variant="quiet" size="sm" onClick={() => onOpenCycle(week)}>
            Otwórz tydzień w cyklu
          </Button>
        </div>
        <div className="sport-today-card__agenda">
          <header className="sport-today-card__agenda-header">
            <div>
              <span>Plan dnia</span>
              <strong>
                {activeSession
                  ? "Trening w toku — wróć do bieżącego ćwiczenia"
                  : todayWorkouts.length
                  ? remainingWorkouts
                    ? `${remainingWorkouts} ${workoutCountLabel(remainingWorkouts)} do wykonania`
                    : "Wszystkie treningi wykonane"
                  : "Bez zaplanowanych treningów"}
              </strong>
            </div>
            {todayWorkouts.length > 0 && (
              <span className="sport-today-card__progress-copy">
                {completedToday} z {todayWorkouts.length} wykonanych
              </span>
            )}
          </header>
          {activeSession && <ActiveSessionStrip session={activeSession} onResume={onResumeActive} />}
          {todayWorkouts.length ? (
            <div className="sport-today-card__workouts">
              {todayWorkouts.map((workout) => (
                <PlannedWorkoutRow
                  key={workout.id}
                  workout={workout}
                  selected={selectedWorkoutId === workout.id}
                  outcome={outcomes[workout.id]}
                  active={workout.id === activeWorkoutId}
                  onSelect={() => onSelectWorkout(workout)}
                  onStart={() => onStartWorkout(workout)}
                  onComplete={() => onCompleteWorkout(workout)}
                  onResetStatus={() => onResetWorkout(workout)}
                  onMoveTomorrow={() => onMoveTomorrow(workout)}
                />
              ))}
            </div>
          ) : (
            <div className="sport-today-card__rest">
              <Activity size={21} aria-hidden="true" />
              <div>
                <strong>{todayInCycle ? "Regeneracja albo trening spontaniczny" : "Cykl nie obejmuje dzisiejszej daty"}</strong>
                <p>{todayInCycle
                  ? "W planie nie ma dziś żadnej jednostki."
                  : `Pokazujemy najbliższy tydzień cyklu: T${week}.`}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="sport-current-week" aria-label={`Tydzień ${week}`}>
        <SectionHeader
          title={`Tydzień ${week}`}
          description={`${formatShortDate(cycleWeekDate(cycle, week, 0))} — ${formatShortDate(cycleWeekDate(cycle, week, 6))}`}
          action={<span className="sport-current-week__summary">{weekWorkouts.length} treningów · {weekMinutes} min</span>}
        />
        <Card padding="none">
          <div className="sport-overview-week-grid">
            {DAY_LABELS.map((day, dayIndex) => {
              const workouts = weekWorkouts
                .filter((workout) => workout.day === dayIndex)
                .sort((left, right) => (left.time ?? "").localeCompare(right.time ?? ""));
              const dateKey = cycleWeekDate(cycle, week, dayIndex);
              return (
                <div
                  key={day.short}
                  className={[
                    "sport-overview-day",
                    dateKey === today ? "is-today" : "",
                    dropTargetDay === dayIndex ? "is-drop-target" : "",
                  ].filter(Boolean).join(" ")}
                  onDragOver={(event) => {
                    if (!draggedWorkoutId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTargetDay(dayIndex);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData("text/sport-overview-workout") || draggedWorkoutId;
                    const workout = weekWorkouts.find((item) => item.id === id);
                    if (workout && workout.day !== dayIndex) onMoveWorkout(workout, dayIndex);
                    setDraggedWorkoutId(null);
                    setDropTargetDay(null);
                  }}
                >
                  <div className="sport-overview-day__heading">
                    <strong>{day.short}</strong>
                    <span>{formatShortDate(dateKey)}</span>
                  </div>
                  <div>
                    {workouts.map((workout) => {
                      const canMove = !outcomes[workout.id] && workout.id !== activeWorkoutId;
                      return (
                        <button
                          key={workout.id}
                          type="button"
                          draggable={canMove}
                          className={[
                            selectedWorkoutId === workout.id ? "is-selected" : "",
                            draggedWorkoutId === workout.id ? "is-dragging" : "",
                            canMove ? "is-movable" : "",
                          ].filter(Boolean).join(" ")}
                          aria-pressed={selectedWorkoutId === workout.id}
                          aria-describedby={canMove ? "sport-overview-drag-hint" : undefined}
                          title={canMove
                            ? "Przeciągnij na inny dzień"
                            : workout.id === activeWorkoutId
                              ? "Trening w toku — najpierw zakończ sesję"
                              : "Zapisany wynik treningu blokuje zmianę dnia"}
                          onClick={() => onSelectWorkout(workout)}
                          onKeyDown={(event) => {
                            if (!canMove || !event.altKey) return;
                            const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
                            if (!direction) return;
                            const nextDay = workout.day + direction;
                            if (nextDay < 0 || nextDay > 6) return;
                            event.preventDefault();
                            onMoveWorkout(workout, nextDay);
                          }}
                          onDragStart={(event) => {
                            if (!canMove) {
                              event.preventDefault();
                              return;
                            }
                            setDraggedWorkoutId(workout.id);
                            event.dataTransfer.setData("text/sport-overview-workout", workout.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDraggedWorkoutId(null);
                            setDropTargetDay(null);
                          }}
                        >
                          {canMove && (
                            <span className="sport-overview-day__grip" aria-hidden="true">
                              <GripVertical size={11} />
                            </span>
                          )}
                          <strong>{workout.title}</strong>
                          <span>{workout.time || `${workout.durationMinutes} min`}</span>
                          {outcomes[workout.id] && <StatusLabel status={outcomes[workout.id].status} compact />}
                        </button>
                      );
                    })}
                    {!workouts.length && <span className="sport-overview-day__empty">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <p id="sport-overview-drag-hint" className="sport-overview-drag-hint">
          Przeciągnij trening na inny dzień. Klawiatura: Alt + ←/→.
        </p>
      </section>

      <section className="sport-mobile-upcoming" aria-labelledby="sport-mobile-upcoming-heading">
        <div className="sport-mobile-upcoming__heading">
          <div>
            <span>Co dalej</span>
            <h2 id="sport-mobile-upcoming-heading">Następne treningi</h2>
          </div>
          <span>{upcomingWorkouts.length ? `${upcomingWorkouts.length} najbliższe` : "Brak kolejnych"}</span>
        </div>
        {upcomingWorkouts.length ? (
          <div className="sport-mobile-upcoming__list">
            {upcomingWorkouts.map(({ workout, date }) => {
              const DisciplineIcon = DISCIPLINE_ICONS[workout.discipline];
              return (
                <button
                  key={workout.id}
                  type="button"
                  className={selectedWorkoutId === workout.id ? "is-selected" : ""}
                  aria-pressed={selectedWorkoutId === workout.id}
                  onClick={() => onSelectWorkout(workout)}
                >
                  <span className="sport-mobile-upcoming__icon" style={{ color: DISCIPLINE_META[workout.discipline].color }} aria-hidden="true">
                    <DisciplineIcon size={16} strokeWidth={1.6} />
                  </span>
                  <span>
                    <strong>{workout.title}</strong>
                    <small>{formatLongDate(date)} · {workout.time || `${workout.durationMinutes} min`}</small>
                  </span>
                  {outcomes[workout.id] && <StatusLabel status={outcomes[workout.id].status} compact />}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="sport-mobile-upcoming__empty">W aktywnym cyklu nie ma późniejszych treningów.</p>
        )}
        <Button variant="quiet" fullWidth onClick={() => onOpenCycle(week)}>
          Zobacz plan całego tygodnia
        </Button>
      </section>
    </div>
  );
}

function historyResultLabel(entry: WorkoutHistoryEntry) {
  if (entry.status === "missed") return "Nie wykonano";
  if (entry.discipline === "strength" && entry.volumeKg) {
    return `${entry.volumeKg.toLocaleString("pl-PL")} kg · ${entry.completedUnits ?? 0} serii`;
  }
  if (entry.discipline === "running" && entry.distanceKm) {
    return `${entry.distanceKm.toLocaleString("pl-PL")} km${entry.averagePace ? ` · ${entry.averagePace}` : ""}`;
  }
  if (entry.completedUnits !== undefined && entry.totalUnits !== undefined) {
    const unit = entry.unitKind === "stages" ? "etapów" : "serii";
    return `${entry.completedUnits} z ${entry.totalUnits} ${unit}`;
  }
  if (entry.rpe !== undefined) return `RPE ${entry.rpe}/10`;
  return "Tylko czas i status";
}

export function SportHistory({ history }: { history: WorkoutHistoryEntry[] }) {
  const [discipline, setDiscipline] = useState<"all" | Discipline>("all");
  const [status, setStatus] = useState<"all" | WorkoutHistoryEntry["status"]>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const query = normalizeSearch(search);
  const visible = history
    .filter((entry) => discipline === "all" || entry.discipline === discipline)
    .filter((entry) => status === "all" || entry.status === status)
    .filter((entry) => !query || normalizeSearch(entry.title).includes(query));

  return (
    <div className="sport-insights">
      <SectionHeader
        title="Historia treningów"
        description={`${visible.length} z ${history.length} wpisów · kliknij wiersz, aby zobaczyć plan i wynik.`}
      />
      <div className="sport-history-tools" aria-label="Filtry historii">
        <div className="sport-history-search">
          <Search size={14} aria-hidden="true" />
          <Input
            type="search"
            aria-label="Szukaj treningu w historii"
            placeholder="Szukaj po nazwie"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          compact
          fieldClassName="sport-history-filter"
          aria-label="Filtruj historię po kategorii"
          value={discipline}
          options={[
            { value: "all", label: "Wszystkie kategorie" },
            ...Object.entries(DISCIPLINE_META).map(([value, meta]) => ({ value, label: meta.label })),
          ]}
          onChange={(event) => setDiscipline(event.target.value as "all" | Discipline)}
        />
        <Select
          compact
          fieldClassName="sport-history-status-filter"
          aria-label="Filtruj historię po statusie"
          value={status}
          options={[
            { value: "all", label: "Wszystkie statusy" },
            { value: "completed", label: "Wykonane" },
            { value: "incomplete", label: "Niedokończone" },
            { value: "missed", label: "Pominięte" },
          ]}
          onChange={(event) => setStatus(event.target.value as "all" | WorkoutHistoryEntry["status"])}
        />
      </div>
      {visible.length ? (
        <Card padding="none">
          <div className="sport-history-list" aria-label="Historia treningów">
            <div className="sport-history-head">
              <span>Data</span>
              <span>Trening</span>
              <span>Kategoria</span>
              <span>Czas rzeczywisty</span>
              <span>Wynik</span>
              <span>Status</span>
            </div>
            {visible.map((entry) => (
              <div key={entry.id} className={`sport-history-entry ${expandedId === entry.id ? "is-expanded" : ""}`.trim()}>
                <button
                  type="button"
                  className="sport-history-row"
                  aria-expanded={expandedId === entry.id}
                  onClick={() => setExpandedId((current) => current === entry.id ? null : entry.id)}
                >
                  <span className="sport-history-row__date">{formatDateWithYear(entry.date)}</span>
                  <strong className="sport-history-row__title">{entry.title}</strong>
                  <span className="sport-history-row__discipline">
                    <DisciplineLabel discipline={entry.discipline} compact />
                  </span>
                  <span className="sport-history-row__duration">
                    <strong>{entry.status === "missed" ? "—" : `${entry.durationMinutes} min`}</strong>
                    <small>plan {entry.plannedDurationMinutes ?? entry.durationMinutes} min</small>
                  </span>
                  <span className="sport-history-row__result">{historyResultLabel(entry)}</span>
                  <span className="sport-history-row__status">
                    <StatusLabel status={entry.status} compact />
                  </span>
                </button>
                {expandedId === entry.id && (
                  <div className="sport-history-detail">
                    <div><span>Plan</span><strong>{entry.plannedDurationMinutes ?? entry.durationMinutes} min</strong></div>
                    <div><span>Wykonanie</span><strong>{entry.status === "missed" ? "Pominięto" : `${entry.durationMinutes} min`}</strong></div>
                    <div><span>Rezultat</span><strong>{historyResultLabel(entry)}</strong></div>
                    {entry.rpe !== undefined && <div><span>Odczuwalny wysiłek</span><strong>RPE {entry.rpe}/10</strong></div>}
                    {entry.pain !== undefined && <div><span>Ból</span><strong>{entry.pain}/10</strong></div>}
                    {entry.averageHeartRate !== undefined && <div><span>Średnie tętno</span><strong>{entry.averageHeartRate} bpm</strong></div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState title="Brak treningów w tym filtrze" description="Zmień kategorię, aby zobaczyć pozostałe wpisy." />
      )}
    </div>
  );
}

export function SportAnalysis({ history }: { history: WorkoutHistoryEntry[] }) {
  const [range, setRange] = useState("8");
  const [discipline, setDiscipline] = useState<"all" | Discipline>("all");
  const rangeWeeks = Number(range);
  const thisWeek = startOfWeekKey();
  const firstWeek = addDays(thisWeek, -(rangeWeeks - 1) * 7);
  const lastDay = addDays(thisWeek, 6);
  const previousFirstWeek = addDays(firstWeek, -rangeWeeks * 7);
  const previousLastDay = addDays(firstWeek, -1);
  const inDiscipline = (entry: WorkoutHistoryEntry) => discipline === "all" || entry.discipline === discipline;
  const allVisible = history.filter((entry) => entry.date >= firstWeek && entry.date <= lastDay);
  const visible = allVisible.filter(inDiscipline);
  const completed = visible.filter((entry) => entry.status === "completed");
  const previousCompleted = history.filter((entry) => (
    entry.date >= previousFirstWeek
    && entry.date <= previousLastDay
    && entry.status === "completed"
    && inDiscipline(entry)
  ));
  const plannedCount = visible.length;
  const completedMinutes = completed.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const previousMinutes = previousCompleted.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const completion = plannedCount ? Math.round((completed.length / plannedCount) * 100) : 0;
  const averageMinutes = Math.round(completedMinutes / rangeWeeks);
  const completedDelta = completed.length - previousCompleted.length;
  const minutesDelta = completedMinutes - previousMinutes;
  const strengthVolume = completed.reduce((sum, entry) => sum + (entry.volumeKg ?? 0), 0);
  const runningDistance = completed.reduce((sum, entry) => sum + (entry.distanceKm ?? 0), 0);
  const completedUnits = completed.reduce((sum, entry) => sum + (entry.completedUnits ?? 0), 0);
  const totalUnits = completed.reduce((sum, entry) => sum + (entry.totalUnits ?? 0), 0);
  const rpeValues = completed.map((entry) => entry.rpe).filter((value): value is number => value !== undefined);
  const painValues = completed.map((entry) => entry.pain).filter((value): value is number => value !== undefined);
  const averageRpe = rpeValues.length ? (rpeValues.reduce((sum, value) => sum + value, 0) / rpeValues.length).toFixed(1) : "—";
  const averagePain = painValues.length ? (painValues.reduce((sum, value) => sum + value, 0) / painValues.length).toFixed(1) : "—";
  const weeks = Array.from({ length: rangeWeeks }, (_, index) => {
    const start = addDays(firstWeek, index * 7);
    const end = addDays(start, 6);
    const entries = completed.filter((entry) => entry.date >= start && entry.date <= end);
    return {
      key: start,
      label: `T${index + 1}`,
      count: entries.length,
      minutes: entries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
      end,
    };
  });
  const rawMaxMinutes = Math.max(1, ...weeks.map((week) => week.minutes), averageMinutes);
  const maxMinutes = Math.max(30, Math.ceil(rawMaxMinutes / 30) * 30);
  const disciplineStats = Object.entries(DISCIPLINE_META)
    .map(([discipline, meta]) => {
      const entries = allVisible.filter((entry) => entry.status === "completed" && entry.discipline === discipline);
      return {
        discipline: discipline as Discipline,
        label: meta.label,
        count: entries.length,
        minutes: entries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
      };
    })
    .filter((item) => item.count > 0)
    .sort((left, right) => right.minutes - left.minutes);
  const disciplineMinutes = disciplineStats.reduce((sum, item) => sum + item.minutes, 0);
  const scopeLabel = discipline === "all" ? "Wszystkie sporty" : DISCIPLINE_META[discipline].label;
  const signed = (value: number, suffix: string) => value === 0
    ? `bez zmian vs poprzedni okres`
    : `${value > 0 ? "+" : ""}${value}${suffix} vs poprzedni okres`;

  const metrics = discipline === "strength"
    ? [
        { icon: CheckCircle2, label: "Treningi siłowe", value: String(completed.length), detail: signed(completedDelta, "") },
        { icon: Layers3, label: "Objętość", value: strengthVolume ? `${strengthVolume.toLocaleString("pl-PL")} kg` : "Brak danych", detail: `${completedUnits} wykonanych serii` },
        { icon: Activity, label: "Średnie RPE", value: averageRpe, detail: rpeValues.length ? `${rpeValues.length} zapisanych ocen` : "Zapisz RPE po treningu" },
      ]
    : discipline === "running"
      ? [
          { icon: Footprints, label: "Biegi", value: String(completed.length), detail: signed(completedDelta, "") },
          { icon: Activity, label: "Dystans", value: runningDistance ? `${runningDistance.toLocaleString("pl-PL")} km` : "Brak danych", detail: "na podstawie zapisanych wyników" },
          { icon: Clock3, label: "Czas biegu", value: `${completedMinutes} min`, detail: signed(minutesDelta, " min") },
        ]
      : discipline === "rehab"
        ? [
            { icon: HeartPulse, label: "Sesje rehabilitacji", value: String(completed.length), detail: signed(completedDelta, "") },
            { icon: ListChecks, label: "Wykonane serie", value: String(completedUnits), detail: totalUnits ? `${completedUnits} z ${totalUnits} zaplanowanych` : "Brak rozpiski serii" },
            { icon: Activity, label: "Średni ból", value: averagePain === "—" ? "Brak danych" : `${averagePain}/10`, detail: painValues.length ? `${painValues.length} zapisanych ocen` : "Zapisz ból po sesji" },
          ]
        : [
            { icon: CheckCircle2, label: "Wykonane treningi", value: String(completed.length), detail: signed(completedDelta, "") },
            { icon: Clock3, label: "Łączny czas", value: `${completedMinutes} min`, detail: `średnio ${averageMinutes} min/tydzień` },
            { icon: Activity, label: "Realizacja", value: `${completion}%`, detail: `${completed.length} z ${plannedCount} zapisanych jednostek` },
          ];

  return (
    <div className="sport-insights">
      <SectionHeader
        title="Postępy treningowe"
        description={`${scopeLabel} · porównanie z poprzednim okresem o tej samej długości.`}
        action={<div className="sport-analysis-controls">
          <Select
            compact
            fieldClassName="sport-analysis-discipline"
            aria-label="Kategoria analizy"
            value={discipline}
            options={[
              { value: "all", label: "Wszystkie sporty" },
              ...Object.entries(DISCIPLINE_META).map(([value, meta]) => ({ value, label: meta.label })),
            ]}
            onChange={(event) => setDiscipline(event.target.value as "all" | Discipline)}
          />
          <Select
            compact
            fieldClassName="sport-analysis-range"
            aria-label="Zakres analizy"
            value={range}
            options={[
              { value: "4", label: "Ostatnie 4 tygodnie" },
              { value: "8", label: "Ostatnie 8 tygodni" },
              { value: "12", label: "Ostatnie 12 tygodni" },
            ]}
            onChange={(event) => setRange(event.target.value)}
          />
        </div>}
      />

      <div className="sport-analysis-metrics">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <metric.icon size={16} aria-hidden="true" />
            <div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </div>
          </Card>
        ))}
      </div>

      <div className="sport-analysis-grid">
        <Card>
          <div className="sport-analysis-card-heading">
            <h3>Minuty treningu tygodniowo</h3>
            <span>Średnia {averageMinutes} min</span>
          </div>
          <div className="sport-analysis-chart-layout">
            <div className="sport-analysis-y-axis" aria-hidden="true">
              <span>{maxMinutes}</span>
              <span>{Math.round(maxMinutes / 2)}</span>
              <span>0</span>
            </div>
            <div className="sport-analysis-chart" aria-label="Wykres minut treningu w kolejnych tygodniach">
              <div
                className="sport-analysis-average"
                style={{ bottom: `${Math.min(100, (averageMinutes / maxMinutes) * 100)}%` }}
                aria-hidden="true"
              />
              <div className="sport-analysis-bars">
                {weeks.map((week) => (
                  <div key={week.key} title={`${formatShortDate(week.key)}–${formatShortDate(week.end)}: ${week.minutes} min, ${week.count} treningów`}>
                    <span>{week.minutes || "0"}</span>
                    <div><i style={{ transform: `scaleY(${Math.max(week.minutes ? 8 : 2, (week.minutes / maxMinutes) * 100) / 100})` }} /></div>
                    <small>{formatShortDate(week.key)}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <h3>Aktywność według kategorii</h3>
          {disciplineStats.length ? (
            <div className="sport-analysis-disciplines">
              {disciplineStats.map((item) => (
                <div key={item.discipline}>
                  <div className="sport-analysis-discipline-name">
                    <DisciplineLabel discipline={item.discipline} compact />
                    <strong>{item.minutes} min</strong>
                  </div>
                  <div className="sport-analysis-discipline-bar" aria-hidden="true">
                    <i
                      style={{
                        width: `${disciplineMinutes ? (item.minutes / disciplineMinutes) * 100 : 0}%`,
                        background: DISCIPLINE_META[item.discipline].color,
                      }}
                    />
                  </div>
                  <span>{item.count} treningów · {disciplineMinutes ? Math.round((item.minutes / disciplineMinutes) * 100) : 0}% czasu</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="sport-analysis-empty">Brak wykonanych treningów w tym zakresie.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

export function WorkoutDetailPanel({
  workout,
  cycle,
  template,
  session,
  seriesCount,
  outcome,
  active = false,
  onClose,
  onStart,
  onComplete,
  onIncomplete,
  onMiss,
  onMoveTomorrow,
  onClearOutcome,
  onEditSingle,
  onEditSeries,
  onDelete,
}: {
  workout: CycleWorkout;
  cycle: TrainingCycle;
  template?: WorkoutTemplate;
  session?: WorkoutSession;
  seriesCount: number;
  outcome?: WorkoutOutcome;
  active?: boolean;
  onClose: () => void;
  onStart: () => void;
  onComplete: () => void;
  onIncomplete: () => void;
  onMiss: () => void;
  onMoveTomorrow: () => void;
  onClearOutcome: () => void;
  onEditSingle: () => void;
  onEditSeries: () => void;
  onDelete: () => void;
}) {
  const date = cycleWorkoutDate(cycle, workout);
  const sessionHistory = session ? historyEntryFromSession(session) : null;
  return (
    <DetailPanel label="Szczegóły treningu" className="sport-workout-detail" onDismiss={onClose}>
      <div className="sport-workout-detail__header">
        <div>
          <span>Szczegóły treningu</span>
          <h2>{workout.title}</h2>
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij szczegóły" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>
      <div className="sport-workout-detail__body">
        <div className="sport-workout-detail__status">
          <DisciplineLabel discipline={workout.discipline} />
          {active
            ? <StatusLabel status="in_progress" />
            : <StatusLabel status={outcome?.status ?? "scheduled"} />}
        </div>
        <dl className="sport-workout-detail__facts">
          <div>
            <dt><CalendarDays size={13} /> Termin</dt>
            <dd>{formatLongDate(date)}</dd>
            <small>Tydzień {workout.week} · {DAY_LABELS[workout.day].full}</small>
          </div>
          <div>
            <dt><Clock3 size={13} /> Czas</dt>
            <dd>{session && outcome ? `${session.durationMinutes} min faktycznie` : `${workout.durationMinutes} min`}</dd>
            <small>
              {session && outcome ? `Plan ${session.plannedDurationMinutes ?? workout.durationMinutes} min` : "Czas planowany"}
              {workout.time ? ` · start o ${workout.time}` : ""}
            </small>
          </div>
          {session && outcome && (
            <div>
              <dt><ListChecks size={13} /> Wynik</dt>
              <dd>{sessionHistory ? historyResultLabel(sessionHistory) : "Tylko czas i status"}</dd>
              {(session.metrics?.rpe !== undefined || session.metrics?.pain !== undefined) && (
                <small>
                  {session.metrics?.rpe !== undefined ? `RPE ${session.metrics.rpe}/10` : ""}
                  {session.metrics?.rpe !== undefined && session.metrics?.pain !== undefined ? " · " : ""}
                  {session.metrics?.pain !== undefined ? `ból ${session.metrics.pain}/10` : ""}
                </small>
              )}
            </div>
          )}
          <div>
            <dt><Layers3 size={13} /> Źródło</dt>
            <dd>{template ? template.name : "Trening ręczny"}</dd>
            {template && <small>Szablon · {template.exercises.length || template.stages?.length || 0} elementów</small>}
          </div>
          {workout.seriesId && (
            <div>
              <dt><Repeat2 size={13} /> Seria</dt>
              <dd>{seriesCount} wystąpień</dd>
              <small>Zmiany można zastosować do jednego lub wszystkich.</small>
            </div>
          )}
        </dl>
        {workout.note && (
          <div className="sport-workout-detail__note">
            <span>Notatka</span>
            <p>{workout.note}</p>
          </div>
        )}
      </div>
      <div className="sport-workout-detail__actions">
        <AddToTasksButton compact input={{
          source: {
            kind: "sport",
            entity: `${encodeURIComponent(cycle.id)}/${encodeURIComponent(workout.id)}`,
            context: `${cycle.name} · tydzień ${workout.week}`,
            href: `/sport?widok=cycle&tydzien=${workout.week}`,
          },
          text: workout.title,
          done: outcome?.status === "completed",
          calendarDate: date,
          date,
          time: workout.time,
          list: "sport",
          tags: ["sport"],
          notes: workout.note,
        }} />
        {active ? (
          <Button variant="primary" leadingIcon={<Play size={13} />} onClick={onStart}>
            Wznów trening
          </Button>
        ) : (
          <>
            {!outcome && (
              <Button variant="primary" leadingIcon={<Play size={13} />} onClick={onStart}>
                Rozpocznij trening
              </Button>
            )}
            <div className="sport-workout-detail__status-editor">
              <span>Zmień status</span>
              <div>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={!outcome}
                  leadingIcon={<RotateCcw size={12} />}
                  onClick={onClearOutcome}
                >
                  Zaplanowany
                </Button>
                <Button variant="quiet" size="sm" disabled={outcome?.status === "completed"} leadingIcon={<Check size={12} />} onClick={onComplete}>
                  Wykonany
                </Button>
                <Button variant="quiet" size="sm" disabled={outcome?.status === "incomplete"} onClick={onIncomplete}>
                  Niedokończony
                </Button>
                <Button variant="quiet" size="sm" disabled={outcome?.status === "missed"} onClick={onMiss}>
                  Pominięty
                </Button>
              </div>
            </div>
            {!outcome && (
              <Button variant="quiet" size="sm" leadingIcon={<CalendarClock size={12} />} onClick={onMoveTomorrow}>
                Przełóż na jutro
              </Button>
            )}
          </>
        )}
        <Button variant="quiet" leadingIcon={<Pencil size={13} />} onClick={onEditSingle}>
          Edytuj ten trening
        </Button>
        {seriesCount > 1 && (
          <Button variant="quiet" leadingIcon={<Repeat2 size={13} />} onClick={onEditSeries}>
            Edytuj całą serię ({seriesCount})
          </Button>
        )}
        <Button variant="danger" size="sm" leadingIcon={<Trash2 size={12} />} onClick={onDelete}>
          Usuń ten trening
        </Button>
      </div>
    </DetailPanel>
  );
}
