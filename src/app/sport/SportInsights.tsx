import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bike,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Dumbbell,
  Footprints,
  GripVertical,
  HeartPulse,
  Layers3,
  ListChecks,
  MoveRight,
  Moon,
  Pencil,
  Plus,
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
  Badge,
  Button,
  Card,
  CompletedSection,
  DetailPanel,
  EmptyState,
  Input,
  FilterBar,
  Pagination,
  SectionSurface,
  SectionHeader,
  Select,
  AddToTasksButton,
} from "../ui";
import {
  DAY_LABELS,
  cycleDayIndex,
  cycleDateRange,
  cycleWeekDate,
  cycleWorkoutDate,
  isIndefiniteCycle,
  isWorkoutScheduledOnDate,
  todayCycleWeek,
  workoutOutcomeForDate,
  workoutReplanBlockReason,
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
  type WorkoutExercise,
  type Exercise,
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

function exerciseCountLabel(count: number) {
  if (count === 1) return "ćwiczenie";
  if (count >= 2 && count <= 4) return "ćwiczenia";
  return "ćwiczeń";
}

function stageCountLabel(count: number) {
  if (count === 1) return "etap";
  if (count >= 2 && count <= 4) return "etapy";
  return "etapów";
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
  return dateKey >= range.start && (range.end === null || dateKey <= range.end);
}

function nextWorkoutDate(
  cycle: TrainingCycle,
  workout: CycleWorkout,
  fromDate: string,
) {
  if (isIndefiniteCycle(cycle)) {
    const offset = (workout.day - cycleDayIndex(cycle, fromDate) + 7) % 7 || 7;
    return addDays(fromDate, offset);
  }
  const date = cycleWorkoutDate(cycle, workout);
  return date > fromDate ? date : "";
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
          <span><Activity size={13} aria-hidden="true" /> Trening w toku</span>
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
}: {
  workout: CycleWorkout;
  selected: boolean;
  outcome?: WorkoutOutcome;
  active: boolean;
  onSelect: () => void;
  onStart: () => void;
  onComplete: () => void;
  onResetStatus: () => void;
}) {
  const currentStatus = active ? "in_progress" : outcome?.status ?? "scheduled";
  const completed = currentStatus === "completed";
  const statusAction = outcome ? onResetStatus : onComplete;
  const statusActionLabel = active
    ? "Trening jest w toku"
    : outcome
      ? "Oznacz trening jako niewykonany"
      : "Oznacz trening jako wykonany";
  return (
    <article className={`sport-overview-workout ${selected ? "is-selected" : ""} ${active ? "is-active" : ""} ${completed ? "is-completed" : ""} ${outcome && !completed ? `is-${outcome.status}` : ""}`.trim()}>
      <button
        type="button"
        className={`sport-overview-workout__checkbox ${completed ? "is-checked" : ""}`}
        aria-label={statusActionLabel}
        aria-pressed={completed}
        disabled={active}
        onClick={statusAction}
      >
        {completed && <Check size={9} strokeWidth={2.5} />}
      </button>
      <button className="sport-overview-workout__content" type="button" aria-pressed={selected} onClick={onSelect}>
        <span className="sport-overview-workout__copy">
          <strong>{workout.title}</strong>
          <span className="sport-overview-workout__meta">
            <DisciplineLabel discipline={workout.discipline} compact />
            <span className="sport-overview-workout__meta-details">
              <span>{workout.durationMinutes} min</span>
              <span aria-hidden="true">·</span>
              <span>{workout.time || "Dowolna pora"}</span>
              {outcome && !completed && (
                <>
                  <span aria-hidden="true">·</span>
                  <StatusLabel status={outcome.status} compact />
                </>
              )}
            </span>
          </span>
        </span>
      </button>
      {active ? (
        <div className="sport-overview-workout__actions">
          <Button variant="primary" size="sm" leadingIcon={<Play size={11} />} onClick={onStart}>Wznów</Button>
        </div>
      ) : outcome ? (
        <div className="sport-overview-workout__actions">
          <Button variant="quiet" size="sm" onClick={onSelect}>{completed ? "Podsumowanie" : "Działania"}</Button>
        </div>
      ) : (
        <div className="sport-overview-workout__actions">
          <Button variant="primary" size="sm" leadingIcon={<Play size={11} />} onClick={onStart}>Rozpocznij</Button>
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
  sessions = [],
  recoveryDays = [],
  onCreateCycle,
  onAddWorkout,
  onResumeActive,
  onSelectWorkout,
  onStartWorkout,
  onCompleteWorkout,
  onResetWorkout,
  onMoveWorkout,
  onOpenCycle,
  onToggleRecovery,
}: {
  cycle: TrainingCycle | null;
  activeSession?: WorkoutSession;
  selectedWorkoutId?: string | null;
  outcomes: Record<string, WorkoutOutcome>;
  sessions?: WorkoutSession[];
  recoveryDays?: string[];
  onCreateCycle: () => void;
  onAddWorkout: (week?: number, day?: number) => void;
  onResumeActive: () => void;
  onSelectWorkout: (workout: CycleWorkout) => void;
  onStartWorkout: (workout: CycleWorkout) => void;
  onCompleteWorkout: (workout: CycleWorkout) => void;
  onResetWorkout: (workout: CycleWorkout) => void;
  onMoveWorkout: (workout: CycleWorkout, day: number, sourceDate?: string) => void;
  onOpenCycle: (week: number) => void;
  onToggleRecovery: (date: string) => void;
}) {
  const [draggedWorkoutId, setDraggedWorkoutId] = useState<string | null>(null);
  const [dropTargetDay, setDropTargetDay] = useState<number | null>(null);
  const activeWorkoutId = activeSession?.cycleWorkoutId;

  if (!cycle) {
    return (
      <div className="sport-insights">
        {activeSession && <ActiveSessionStrip session={activeSession} onResume={onResumeActive} />}
        <EmptyState
          title="Brak planu treningowego"
          description="Utwórz plan treningowy, aby zobaczyć dzisiejsze i kolejne treningi."
          action={<Button variant="primary" onClick={onCreateCycle}>Dodaj plan</Button>}
        />
      </div>
    );
  }

  const today = toDateKey(new Date());
  const week = todayCycleWeek(cycle);
  const todayDay = cycleDayIndex(cycle, today);
  const outcomeFor = (workout: CycleWorkout, dateKey: string) => {
    return workoutOutcomeForDate(
      cycle,
      outcomes[workout.id],
      sessions,
      workout.id,
      dateKey,
    );
  };
  const todayInCycle = isDateInsideCycle(cycle, today);
  const todayWorkouts = todayInCycle
    ? cycle.workouts
      .filter((workout) => isWorkoutScheduledOnDate(cycle, workout, today))
      .sort((left, right) => (left.time ?? "").localeCompare(right.time ?? ""))
    : [];
  const todayMinutes = todayWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const todayIsRecovery = recoveryDays.includes(today);
  const remainingWorkouts = todayWorkouts.filter((workout) => (
    !outcomeFor(workout, today) && workout.id !== activeWorkoutId
  )).length;
  const weekWorkouts = cycle.workouts.filter((workout) => workout.week === week);
  const weekMinutes = weekWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const upcomingWorkouts = cycle.workouts
    .map((workout) => ({ workout, date: nextWorkoutDate(cycle, workout, today) }))
    .filter((item): item is { workout: CycleWorkout; date: string } => Boolean(item.date) && item.workout.id !== activeWorkoutId)
    .sort((left, right) => (
      left.date.localeCompare(right.date)
      || (left.workout.time ?? "").localeCompare(right.workout.time ?? "")
    ))
    .slice(0, 3);
  const completedTodayWorkouts = todayWorkouts.filter((workout) => outcomeFor(workout, today)?.status === "completed");
  const openTodayWorkouts = todayWorkouts.filter((workout) => !completedTodayWorkouts.includes(workout));
  const renderTodayWorkout = (workout: CycleWorkout) => (
    <PlannedWorkoutRow
      key={workout.id}
      workout={workout}
      selected={selectedWorkoutId === workout.id}
      outcome={outcomeFor(workout, today)}
      active={workout.id === activeWorkoutId}
      onSelect={() => onSelectWorkout(workout)}
      onStart={() => onStartWorkout(workout)}
      onComplete={() => onCompleteWorkout(workout)}
      onResetStatus={() => onResetWorkout(workout)}
    />
  );

  return (
    <div className="sport-insights sport-overview">
      <div className="sport-overview-layout">
        <div className="sport-overview-layout__today">
          <SectionSurface as="section" className="sport-today-card sport-overview-panel" aria-label="Dzisiejsze treningi">
            <SectionHeader
              variant="label"
              title="Dzisiejsze treningi"
              action={(
                <Button variant="ghost" size="sm" onClick={() => onOpenCycle(week)}>
                  Otwórz plan
                </Button>
              )}
            />
            {todayWorkouts.length > 0 && (
              <div className="sport-overview-panel__summary">
                <span>{todayWorkouts.length} {workoutCountLabel(todayWorkouts.length)}</span>
                <span>{todayMinutes} min</span>
              </div>
            )}
            <div className="sport-today-card__agenda">
              {(activeSession || (todayWorkouts.length > 0 && remainingWorkouts === 0)) && (
                <div className="sport-today-card__agenda-summary">
                  <div>
                    <strong>
                      {activeSession
                        ? "Trening w toku — wróć do bieżącego ćwiczenia"
                        : "Wszystkie treningi wykonane"}
                    </strong>
                  </div>
                </div>
              )}
              {activeSession && <ActiveSessionStrip session={activeSession} onResume={onResumeActive} />}
              {todayWorkouts.length ? (
                <div className="sport-today-card__workouts">
                  {openTodayWorkouts.map(renderTodayWorkout)}
                  {completedTodayWorkouts.length > 0 && (
                    <CompletedSection label="Wykonane" count={completedTodayWorkouts.length} className="sport-completed-section">
                      {completedTodayWorkouts.map(renderTodayWorkout)}
                    </CompletedSection>
                  )}
                </div>
              ) : (
                <div className={`sport-today-card__rest ${todayIsRecovery ? "is-recovery" : ""}`.trim()}>
                  <Moon size={22} aria-hidden="true" />
                  <div className="sport-today-card__rest-copy">
                    <strong>{todayInCycle && todayIsRecovery ? "Dzień regeneracji" : "Regeneracja albo trening spontaniczny"}</strong>
                    <p className="sport-today-card__rest-lead">{todayInCycle
                      ? "W planie nie ma dziś żadnej jednostki treningowej."
                      : "Dzisiejsza data wypada poza aktywnym planem treningowym."}</p>
                    {todayIsRecovery && (
                      <p className="sport-today-card__rest-note">Oznaczenie jest widoczne w tygodniu i w całym planie treningowym.</p>
                    )}
                  </div>
                  <div className="sport-today-card__rest-actions">
                    <Button variant="primary" size="sm" onClick={() => onAddWorkout(week, todayDay)}>Dodaj trening spontaniczny</Button>
                    <Button variant="ghost" size="sm" onClick={() => onToggleRecovery(today)}>{todayIsRecovery ? "Usuń oznaczenie regeneracji" : "Oznacz jako dzień regeneracyjny"}</Button>
                  </div>
                </div>
              )}
            </div>
          </SectionSurface>
        </div>
        <div className="sport-overview-layout__week">
          <section className="sport-current-week" aria-label={`Tydzień ${week}`}>
            <SectionSurface className="sport-current-week__surface sport-overview-panel">
              <SectionHeader variant="label" title="Obecny tydzień" />
              <div className="sport-overview-panel__summary">
                <span>{formatShortDate(cycleWeekDate(cycle, week, 0))} — {formatShortDate(cycleWeekDate(cycle, week, 6))}</span>
                <span>{weekWorkouts.length} {workoutCountLabel(weekWorkouts.length)} · {weekMinutes} min</span>
              </div>
              <div className="sport-overview-week-grid">
            {DAY_LABELS.map((day, dayIndex) => {
              const workouts = weekWorkouts
                .filter((workout) => workout.day === dayIndex)
                .sort((left, right) => (left.time ?? "").localeCompare(right.time ?? ""));
              const dateKey = cycleWeekDate(cycle, week, dayIndex);
              const isRecoveryDay = recoveryDays.includes(dateKey);
              return (
                <div
                  key={day.short}
                  className={[
                    "sport-overview-day",
                    dateKey === today ? "is-today" : "",
                    isRecoveryDay ? "is-recovery" : "",
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
                    if (workout && workout.day !== dayIndex) onMoveWorkout(workout, dayIndex, dateKey);
                    setDraggedWorkoutId(null);
                    setDropTargetDay(null);
                  }}
                >
                  <div className="sport-overview-day__heading">
                    <div>
                      <strong>{day.full}</strong>
                      <span>{formatShortDate(dateKey)}</span>
                      {isRecoveryDay && (
                        <small className="sport-overview-day__recovery"><Moon size={11} aria-hidden="true" />Regeneracja</small>
                      )}
                    </div>
                    <button
                      type="button"
                      className="sport-overview-day__add"
                      aria-label={`Dodaj trening: ${day.full}`}
                      onClick={() => onAddWorkout(week, dayIndex)}
                    >
                      <Plus size={13} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="sport-overview-day__workouts" data-count={Math.min(workouts.length, 3)}>
                    {workouts.map((workout) => {
                      const workoutOutcome = outcomeFor(workout, dateKey);
                      const workoutCompleted = workoutOutcome?.status === "completed";
                      const moveBlockReason = workoutReplanBlockReason(
                        workoutOutcome,
                        workout.id === activeWorkoutId,
                      );
                      const canMove = moveBlockReason === null;
                      return (
                        <button
                          key={workout.id}
                          type="button"
                          draggable={canMove}
                          className={[
                            selectedWorkoutId === workout.id ? "is-selected" : "",
                            draggedWorkoutId === workout.id ? "is-dragging" : "",
                            canMove ? "is-movable" : "",
                            workoutCompleted ? "is-completed" : "",
                          ].filter(Boolean).join(" ")}
                          aria-pressed={selectedWorkoutId === workout.id}
                          aria-describedby={canMove ? "sport-overview-drag-hint" : undefined}
                          title={canMove
                            ? "Przeciągnij na inny dzień"
                            : moveBlockReason === "active"
                              ? "Trening w toku — najpierw zakończ sesję"
                              : moveBlockReason === "completed"
                                ? "Wykonany trening jest zapisany w historii"
                                : "Niedokończony trening ma zapisane wykonanie"}
                          onClick={() => onSelectWorkout(workout)}
                          onKeyDown={(event) => {
                            if (!canMove || !event.altKey) return;
                            const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
                            if (!direction) return;
                            const nextDay = workout.day + direction;
                            if (nextDay < 0 || nextDay > 6) return;
                            event.preventDefault();
                            onMoveWorkout(workout, nextDay, dateKey);
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
                          <span className="sport-overview-day__discipline">
                            <DisciplineLabel discipline={workout.discipline} />
                          </span>
                          {!workoutOutcome && <Badge appearance="plain" dot tone="neutral">Zaplanowany</Badge>}
                          <span>{workout.durationMinutes} min{workout.time ? ` · ${workout.time}` : ""}</span>
                          {workoutOutcome && <StatusLabel status={workoutOutcome.status} />}
                        </button>
                      );
                    })}
                    {!workouts.length && <span className="sport-overview-day__empty">—</span>}
                  </div>
                </div>
              );
            })}
              </div>
            </SectionSurface>
            <p id="sport-overview-drag-hint" className="ui-sr-only">
              Przeciągnij trening na inny dzień. Klawiatura: Alt + ←/→.
            </p>
          </section>
        </div>
      </div>

      <section className="sport-mobile-upcoming" aria-labelledby="sport-mobile-upcoming-heading">
        <div className="sport-mobile-upcoming__heading">
          <div className="sport-workout-detail__fact sport-workout-detail__fact--wide">
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
                  {outcomeFor(workout, date) && <StatusLabel status={outcomeFor(workout, date)!.status} compact />}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="sport-mobile-upcoming__empty">W aktywnym planie nie ma późniejszych treningów.</p>
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
    return `${entry.completedUnits ?? 0} serii · ${entry.volumeKg.toLocaleString("pl-PL")} kg`;
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

const SPORT_HISTORY_PAGE_SIZE = 10;

export function SportHistory({ history, sessions = [], templates = [], exercises = [] }: { history: WorkoutHistoryEntry[]; sessions?: WorkoutSession[]; templates?: WorkoutTemplate[]; exercises?: Exercise[] }) {
  const [discipline, setDiscipline] = useState<"all" | Discipline>("all");
  const [status, setStatus] = useState<"all" | WorkoutHistoryEntry["status"]>("all");
  const [period, setPeriod] = useState<"all" | "30" | "90">("all");
  const [templateId, setTemplateId] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const query = normalizeSearch(search);
  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);
  const today = toDateKey(new Date());
  const visible = history
    .filter((entry) => discipline === "all" || entry.discipline === discipline)
    .filter((entry) => status === "all" || entry.status === status)
    .filter((entry) => period === "all" || entry.date >= addDays(today, -Number(period)))
    .filter((entry) => templateId === "all" || sessionById.get(entry.id)?.templateId === templateId)
    .filter((entry) => {
      if (!query) return true;
      const session = sessionById.get(entry.id);
      const exerciseNames = session?.exercises.map((exercise) => exercises.find((candidate) => candidate.id === exercise.exerciseId)?.name ?? exercise.name).join(" ") ?? "";
      return normalizeSearch(`${entry.title} ${entry.discipline} ${session?.note ?? ""} ${exerciseNames}`).includes(query);
    });
  const pageCount = Math.max(1, Math.ceil(visible.length / SPORT_HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageEntries = visible.slice(
    (safePage - 1) * SPORT_HISTORY_PAGE_SIZE,
    safePage * SPORT_HISTORY_PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [discipline, period, search, status, templateId]);

  return (
    <div className="sport-insights">
      <SectionSurface className="sport-history-surface sport-history-module">
        <SectionHeader
          variant="label"
          className="sport-record-module__header"
          title={`${visible.length} z ${history.length} wpisów`}
          description="Kliknij wiersz, aby zobaczyć plan i wynik."
        />
        <FilterBar
          columns={templates.length > 0 ? 5 : 4}
          className="sport-history-tools"
          role="search"
          aria-label="Filtry historii treningów"
        >
          <div className="sport-history-search">
            <Search size={13} aria-hidden="true" />
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
          <Select compact fieldClassName="sport-history-period-filter" aria-label="Filtruj historię po okresie" value={period} options={[{ value: "all", label: "Cały okres" }, { value: "30", label: "Ostatnie 30 dni" }, { value: "90", label: "Ostatnie 90 dni" }]} onChange={(event) => setPeriod(event.target.value as "all" | "30" | "90")} />
          {templates.length > 0 && <Select compact fieldClassName="sport-history-template-filter" aria-label="Filtruj historię po szablonie" value={templateId} options={[{ value: "all", label: "Wszystkie szablony" }, ...templates.map((template) => ({ value: template.id, label: template.name }))]} onChange={(event) => setTemplateId(event.target.value)} />}
        </FilterBar>
      {visible.length ? (
        <>
          <div className="sport-history-list" aria-label="Historia treningów">
            <div className="sport-history-head">
              <span>Data</span>
              <span>Trening</span>
              <span>Kategoria</span>
              <span>Czas rzeczywisty</span>
              <span>Wynik</span>
              <span>Status</span>
            </div>
            {pageEntries.map((entry) => (
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
                    {sessionById.get(entry.id) && <div className="sport-history-detail__items"><span>Zawartość</span><ul>{sessionById.get(entry.id)!.exercises.map((exercise) => <li key={exercise.id}>{exercise.name} · {exercise.sets.filter((set) => set.done).length}/{exercise.sets.length} serii</li>)}{sessionById.get(entry.id)!.stages?.map((stage) => <li key={stage.id}>{stage.label} · {stage.done ? "wykonano" : "pominięto"}</li>)}</ul></div>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <Pagination
            page={safePage}
            pageCount={pageCount}
            itemLabel="Strona"
            onPageChange={(nextPage) => {
              setPage(nextPage);
              setExpandedId(null);
            }}
          />
        </>
      ) : (
        <EmptyState title="Brak treningów w tym filtrze" description="Zmień wyszukiwanie lub filtry, aby zobaczyć pozostałe wpisy." />
      )}
      </SectionSurface>
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
    <div className="sport-insights sport-analysis-view">
      <SectionSurface className="sport-analysis-header-module">
        <SectionHeader
          variant="label"
          className="sport-record-module__header"
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
      </SectionSurface>

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

      <div className="sport-analysis-secondary-metrics">
        <Card><span>Regularność tygodniowa</span><strong>{rangeWeeks ? `${Math.round(completed.length / rangeWeeks * 10) / 10}` : "0"}</strong><small>wykonanych jednostek / tydzień</small></Card>
        <Card><span>Zaplanowane kontra wykonane</span><strong>{completed.length}/{plannedCount}</strong><small>zakres: {rangeWeeks} tygodni</small></Card>
        <Card><span>Pominięte treningi</span><strong>{visible.filter((entry) => entry.status === "missed").length}</strong><small>bez zmiany zapisanych wykonań</small></Card>
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
  onMoveToPlan,
  onMoveTomorrow,
  onClearOutcome,
  onEditSingle,
  onEditSeries,
  onEditTemplate,
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
  onMoveToPlan: () => void;
  onMoveTomorrow: () => void;
  onClearOutcome: () => void;
  onEditSingle: () => void;
  onEditSeries: () => void;
  onEditTemplate?: () => void;
  onDelete: () => void;
}) {
  const date = cycleWorkoutDate(cycle, workout);
  const previewExercises = session?.exercises.length ? session.exercises : template?.exercises ?? [];
  const previewStages = session?.stages?.length ? session.stages : template?.stages ?? [];
  const previewCount = previewStages.length || previewExercises.length;
  const previewLabel = previewStages.length
    ? `${previewStages.length} ${stageCountLabel(previewStages.length)}`
    : previewExercises.length
      ? `${previewExercises.length} ${exerciseCountLabel(previewExercises.length)}`
      : "Brak rozpiski";
  const displayStatus = active ? "in_progress" : outcome?.status ?? "scheduled";
  return (
    <DetailPanel label="Szczegóły treningu" className="sport-workout-detail" onDismiss={onClose}>
      <div className="sport-workout-detail__header">
        <div className="sport-workout-detail__header-copy">
          <h2>{workout.title}</h2>
          <DisciplineLabel discipline={workout.discipline} />
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij szczegóły" onClick={onClose}>
          <X size={13} />
        </Button>
      </div>
      <div className="sport-workout-detail__body">
        <dl className="sport-workout-detail__facts">
          <div className="sport-workout-detail__fact">
            <dt><CalendarDays size={13} /> Termin</dt>
            <dd>{formatLongDate(date)}</dd>
            <small>Tydzień {workout.week} · {DAY_LABELS[workout.day].full}</small>
          </div>
          <div className="sport-workout-detail__fact">
            <dt><Clock3 size={13} /> Czas</dt>
            <dd>{session && outcome ? `${session.durationMinutes} min` : `${workout.durationMinutes} min`}</dd>
            <small>
              {session && outcome
                ? `Plan: ${session.plannedDurationMinutes ?? workout.durationMinutes} min`
                : workout.time ? `Start: ${workout.time}` : "Czas planowany"}
            </small>
          </div>
          <div className="sport-workout-detail__fact">
            <dt><Layers3 size={13} /> Źródło</dt>
            <dd>{template ? template.name : "Trening ręczny"}</dd>
            <small>{template ? "Szablon" : "Trening ręczny"}</small>
          </div>
          {workout.seriesId && (
            <div className="sport-workout-detail__fact">
              <dt><Repeat2 size={13} /> Seria</dt>
              <dd>{seriesCount} wystąpień</dd>
              <small>Wspólny plan</small>
            </div>
          )}
        </dl>
        {workout.note && (
          <div className="sport-workout-detail__note">
            <span>Notatka</span>
            <p>{workout.note}</p>
          </div>
        )}
        <div className="sport-workout-detail__disclosures">
        {!active && (
          <details className="sport-workout-detail__status-editor">
            <summary className="sport-workout-detail__disclosure-summary">
              <span className="sport-workout-detail__disclosure-label">
                <ChevronRight size={13} aria-hidden="true" />
                <span>Status</span>
              </span>
              <StatusLabel status={displayStatus} />
            </summary>
            <div>
              <Button
                variant="quiet"
                size="sm"
                disabled={!outcome}
                leadingIcon={<RotateCcw size={13} />}
                onClick={onClearOutcome}
              >
                Zaplanowany
              </Button>
              <Button variant="quiet" size="sm" disabled={outcome?.status === "completed"} leadingIcon={<Check size={13} />} onClick={onComplete}>
                Wykonany
              </Button>
              <Button variant="quiet" size="sm" disabled={outcome?.status === "incomplete"} onClick={onIncomplete}>
                Niedokończony
              </Button>
              <Button variant="quiet" size="sm" disabled={outcome?.status === "missed"} onClick={onMiss}>
                Pominięty
              </Button>
            </div>
            <p className="sport-workout-detail__status-hint">
              Niedokończony zachowuje wykonane serie. Pominięty oznacza brak rozpoczęcia do końca dnia i jest nadawany automatycznie następnego dnia.
            </p>
          </details>
        )}
        <details className="sport-workout-detail__more">
          <summary className="sport-workout-detail__disclosure-summary">
            <span className="sport-workout-detail__disclosure-label">
              <ChevronRight size={13} aria-hidden="true" />
              <span>Więcej działań</span>
            </span>
          </summary>
          <div>
            <AddToTasksButton input={{
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
            <Button variant="quiet" size="sm" leadingIcon={<MoveRight size={13} />} onClick={onMoveToPlan}>
              Przenieś w planie
            </Button>
            {!outcome && (
              <Button variant="quiet" size="sm" leadingIcon={<CalendarClock size={13} />} onClick={onMoveTomorrow}>
                Przełóż na jutro
              </Button>
            )}
            <Button variant="quiet" size="sm" leadingIcon={<Pencil size={13} />} onClick={onEditSingle}>
              Edytuj trening
            </Button>
            {seriesCount > 1 && (
              <Button variant="quiet" size="sm" leadingIcon={<Repeat2 size={13} />} onClick={onEditSeries}>
                Edytuj serię ({seriesCount})
              </Button>
            )}
            {template && onEditTemplate && (
              <Button variant="quiet" size="sm" leadingIcon={<Layers3 size={13} />} onClick={onEditTemplate}>
                Edytuj szablon i powiązane treningi
              </Button>
            )}
            <Button variant="danger" size="sm" leadingIcon={<Trash2 size={13} />} onClick={onDelete}>
              Usuń trening
            </Button>
          </div>
        </details>
        <details className="sport-workout-detail__exercises">
          <summary className="sport-workout-detail__disclosure-summary">
            <span className="sport-workout-detail__disclosure-label">
              <ChevronRight size={13} aria-hidden="true" />
              <span>{previewStages.length ? "Przebieg treningu" : "Ćwiczenia"}</span>
            </span>
            <small>{previewCount ? previewLabel : "Dodaj ćwiczenia w szablonie"}</small>
          </summary>
          {previewCount ? (
            <div className="sport-workout-detail__exercise-list">
              {previewStages.length
                ? previewStages.map((stage, index) => (
                    <div key={stage.id} className={`sport-workout-detail__exercise ${stage.done ? "is-done" : ""}`.trim()}>
                      <span className="sport-workout-detail__exercise-index">{stage.done ? <Check size={11} /> : index + 1}</span>
                      <span className="sport-workout-detail__exercise-copy">
                        <strong>{stage.label}</strong>
                        <small>{stage.target}</small>
                      </span>
                    </div>
                  ))
                : previewExercises.map((exercise) => <WorkoutExercisePreview key={exercise.id} exercise={exercise} />)}
            </div>
          ) : (
            <p className="sport-workout-detail__exercise-empty">
              Ten trening nie ma jeszcze zapisanej rozpiski ćwiczeń.
            </p>
          )}
        </details>
        </div>
      </div>
      {(active || !outcome) && (
        <div className="sport-workout-detail__actions">
          <Button variant="primary" leadingIcon={<Play size={13} />} onClick={onStart}>
            {active ? "Wznów trening" : "Rozpocznij trening"}
          </Button>
        </div>
      )}
    </DetailPanel>
  );
}

function WorkoutExercisePreview({ exercise }: { exercise: WorkoutExercise }) {
  const completedSets = exercise.sets.filter((set) => set.done).length;
  const firstSet = exercise.sets[0];
  const targets = firstSet?.plannedSeconds
    ? `${exercise.sets.length} × ${firstSet.plannedSeconds} s`
    : `${exercise.sets.length} × ${firstSet?.plannedReps ?? "—"} powt.`;
  const weight = firstSet?.plannedWeight !== undefined ? ` · ${firstSet.plannedWeight} kg` : "";
  return (
    <div className={`sport-workout-detail__exercise ${completedSets === exercise.sets.length && exercise.sets.length ? "is-done" : ""}`.trim()}>
      <span className="sport-workout-detail__exercise-index">
        {completedSets === exercise.sets.length && exercise.sets.length ? <Check size={11} /> : "·"}
      </span>
      <span className="sport-workout-detail__exercise-copy">
        <strong>{exercise.name}</strong>
        <small>{completedSets}/{exercise.sets.length} serii · {targets}{weight}</small>
      </span>
    </div>
  );
}
