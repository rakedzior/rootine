import { useMemo, useState } from "react";
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
  HeartPulse,
  Layers3,
  Pencil,
  PersonStanding,
  Play,
  Repeat2,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  DetailPanel,
  EmptyState,
  SectionHeader,
  Select,
} from "../ui";
import {
  DAY_LABELS,
  cycleDateRange,
  cycleWeekDate,
  cycleWorkoutDate,
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
  startOfWeekKey,
  toDateKey,
  type Discipline,
  type WorkoutTemplate,
} from "./model";
import { DisciplineLabel, StatusLabel } from "./Shared";
import { DISCIPLINE_META } from "./theme";

const HISTORY_STATUS = {
  completed: { label: "Wykonany", tone: "success" as const },
  incomplete: { label: "Niedokończony", tone: "warning" as const },
  missed: { label: "Pominięty", tone: "danger" as const },
};

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

function PlannedWorkoutRow({
  workout,
  selected,
  outcome,
  onSelect,
  onStart,
  onComplete,
  onMoveTomorrow,
}: {
  workout: CycleWorkout;
  selected: boolean;
  outcome?: WorkoutOutcome;
  onSelect: () => void;
  onStart: () => void;
  onComplete: () => void;
  onMoveTomorrow: () => void;
}) {
  const DisciplineIcon = DISCIPLINE_ICONS[workout.discipline];
  return (
    <article className={`sport-overview-workout ${selected ? "is-selected" : ""} ${outcome ? `is-${outcome.status}` : ""}`.trim()}>
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
        {outcome && <StatusLabel status={outcome.status} compact />}
      </button>
      {!outcome && (
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
  selectedWorkoutId,
  outcomes,
  onSelectWorkout,
  onStartWorkout,
  onCompleteWorkout,
  onMoveTomorrow,
  onOpenCycle,
}: {
  cycle: TrainingCycle | null;
  selectedWorkoutId?: string | null;
  outcomes: Record<string, WorkoutOutcome>;
  onSelectWorkout: (workout: CycleWorkout) => void;
  onStartWorkout: (workout: CycleWorkout) => void;
  onCompleteWorkout: (workout: CycleWorkout) => void;
  onMoveTomorrow: (workout: CycleWorkout) => void;
  onOpenCycle: (week: number) => void;
}) {
  if (!cycle) {
    return (
      <EmptyState
        title="Brak aktywnego cyklu"
        description="Utwórz cykl treningowy, aby zobaczyć plan na dziś i bieżący tydzień."
      />
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
  const remainingWorkouts = todayWorkouts.filter((workout) => !outcomes[workout.id]).length;
  const weekWorkouts = cycle.workouts.filter((workout) => workout.week === week);
  const weekMinutes = weekWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);

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
                {todayWorkouts.length
                  ? remainingWorkouts
                    ? `${remainingWorkouts} ${workoutCountLabel(remainingWorkouts)} przed Tobą`
                    : "Dzisiejszy plan zamknięty"
                  : "Bez zaplanowanych treningów"}
              </strong>
            </div>
            <Badge tone={remainingWorkouts ? "primary" : todayWorkouts.length ? "success" : "neutral"}>
              {remainingWorkouts ? `${remainingWorkouts} do wykonania` : todayWorkouts.length ? "Gotowe" : "Regeneracja"}
            </Badge>
          </header>
          {todayWorkouts.length ? (
            <div className="sport-today-card__workouts">
              {todayWorkouts.map((workout) => (
                <PlannedWorkoutRow
                  key={workout.id}
                  workout={workout}
                  selected={selectedWorkoutId === workout.id}
                  outcome={outcomes[workout.id]}
                  onSelect={() => onSelectWorkout(workout)}
                  onStart={() => onStartWorkout(workout)}
                  onComplete={() => onCompleteWorkout(workout)}
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

      <section className="sport-current-week" aria-labelledby="sport-current-week-heading">
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
                <div key={day.short} className={`sport-overview-day ${dateKey === today ? "is-today" : ""}`.trim()}>
                  <div className="sport-overview-day__heading">
                    <strong>{day.short}</strong>
                    <span>{formatShortDate(dateKey)}</span>
                  </div>
                  <div>
                    {workouts.map((workout) => (
                      <button
                        key={workout.id}
                        type="button"
                        className={selectedWorkoutId === workout.id ? "is-selected" : ""}
                        aria-pressed={selectedWorkoutId === workout.id}
                        onClick={() => onSelectWorkout(workout)}
                      >
                        <strong>{workout.title}</strong>
                        <span>{workout.time || `${workout.durationMinutes} min`}</span>
                        {outcomes[workout.id] && <StatusLabel status={outcomes[workout.id].status} compact />}
                      </button>
                    ))}
                    {!workouts.length && <span className="sport-overview-day__empty">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </section>
    </div>
  );
}

export function SportHistory({ history }: { history: WorkoutHistoryEntry[] }) {
  const [discipline, setDiscipline] = useState<"all" | Discipline>("all");
  const visible = history.filter((entry) => discipline === "all" || entry.discipline === discipline);

  return (
    <div className="sport-insights">
      <SectionHeader
        title="Historia treningów"
        description="Wykonane, niedokończone i pominięte jednostki."
        action={(
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
        )}
      />
      {visible.length ? (
        <Card padding="none">
          <div className="sport-history-list">
            {visible.map((entry) => (
              <div key={entry.id} className="sport-history-row">
                <span className="sport-history-row__date">{formatDateWithYear(entry.date)}</span>
                <div className="sport-history-row__main">
                  <strong>{entry.title}</strong>
                  <DisciplineLabel discipline={entry.discipline} compact />
                </div>
                <span className="sport-history-row__duration"><Clock3 size={12} /> {entry.durationMinutes} min</span>
                <Badge tone={HISTORY_STATUS[entry.status].tone}>{HISTORY_STATUS[entry.status].label}</Badge>
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
  const rangeWeeks = Number(range);
  const thisWeek = startOfWeekKey();
  const firstWeek = addDays(thisWeek, -(rangeWeeks - 1) * 7);
  const visible = history.filter((entry) => entry.date >= firstWeek && entry.date <= addDays(thisWeek, 6));
  const completed = visible.filter((entry) => entry.status === "completed");
  const plannedCount = visible.length;
  const completedMinutes = completed.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const completion = plannedCount ? Math.round((completed.length / plannedCount) * 100) : 0;
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
  const maxMinutes = Math.max(1, ...weeks.map((week) => week.minutes));
  const disciplineStats = Object.entries(DISCIPLINE_META)
    .map(([discipline, meta]) => {
      const entries = completed.filter((entry) => entry.discipline === discipline);
      return {
        discipline: discipline as Discipline,
        label: meta.label,
        count: entries.length,
        minutes: entries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
      };
    })
    .filter((item) => item.count > 0)
    .sort((left, right) => right.minutes - left.minutes);

  return (
    <div className="sport-insights">
      <SectionHeader
        title="Analiza treningów"
        description="Regularność i objętość na podstawie zapisanej historii."
        action={(
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
        )}
      />

      <div className="sport-analysis-metrics">
        <Card>
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>Wykonane treningi</span>
          <strong>{completed.length}</strong>
        </Card>
        <Card>
          <Clock3 size={15} aria-hidden="true" />
          <span>Łączny czas</span>
          <strong>{completedMinutes} min</strong>
        </Card>
        <Card>
          <Activity size={15} aria-hidden="true" />
          <span>Realizacja</span>
          <strong>{completion}%</strong>
        </Card>
      </div>

      <div className="sport-analysis-grid">
        <Card>
          <h3>Minuty treningu tygodniowo</h3>
          <div className="sport-analysis-chart" aria-label="Wykres minut treningu w kolejnych tygodniach">
            {weeks.map((week) => (
              <div key={week.key}>
                <span>{week.minutes || ""}</span>
                <div><i style={{ height: `${Math.max(week.minutes ? 10 : 2, (week.minutes / maxMinutes) * 100)}%` }} /></div>
                <small>{formatShortDate(week.key)}</small>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3>Aktywność według kategorii</h3>
          {disciplineStats.length ? (
            <div className="sport-analysis-disciplines">
              {disciplineStats.map((item) => (
                <div key={item.discipline}>
                  <DisciplineLabel discipline={item.discipline} compact />
                  <span>{item.count} treningów</span>
                  <strong>{item.minutes} min</strong>
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
  seriesCount,
  outcome,
  onClose,
  onStart,
  onComplete,
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
  seriesCount: number;
  outcome?: WorkoutOutcome;
  onClose: () => void;
  onStart: () => void;
  onComplete: () => void;
  onMiss: () => void;
  onMoveTomorrow: () => void;
  onClearOutcome: () => void;
  onEditSingle: () => void;
  onEditSeries: () => void;
  onDelete: () => void;
}) {
  const date = cycleWorkoutDate(cycle, workout);
  return (
    <DetailPanel label="Szczegóły treningu" className="sport-workout-detail">
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
          {outcome && <StatusLabel status={outcome.status} />}
        </div>
        <dl className="sport-workout-detail__facts">
          <div>
            <dt><CalendarDays size={13} /> Termin</dt>
            <dd>{formatLongDate(date)}</dd>
            <small>Tydzień {workout.week} · {DAY_LABELS[workout.day].full}</small>
          </div>
          <div>
            <dt><Clock3 size={13} /> Czas</dt>
            <dd>{workout.durationMinutes} min</dd>
            {workout.time && <small>Start o {workout.time}</small>}
          </div>
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
        {!outcome && (
          <>
            <Button variant="primary" leadingIcon={<Play size={13} />} onClick={onStart}>
              Rozpocznij trening
            </Button>
            <div className="sport-workout-detail__quick-actions">
              <Button variant="quiet" size="sm" leadingIcon={<Check size={12} />} onClick={onComplete}>Wykonany</Button>
              <Button variant="quiet" size="sm" onClick={onMiss}>Pominięty</Button>
              <Button variant="quiet" size="sm" leadingIcon={<CalendarClock size={12} />} onClick={onMoveTomorrow}>Na jutro</Button>
            </div>
          </>
        )}
        {outcome && (
          <Button variant="quiet" onClick={onClearOutcome}>Cofnij oznaczenie</Button>
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
