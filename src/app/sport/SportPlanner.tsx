import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  CalendarClock,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Copy,
  Ellipsis,
  GripVertical,
  MoveRight,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  DatePicker,
  EmptyState,
  Input,
  Modal,
  SectionHeader,
  Select,
} from "../ui";
import { AddToTasksButton } from "../ui";
import {
  DAY_LABELS,
  createPlannerId,
  cycleDateRange,
  cycleWeekCount,
  cycleWeekDate,
  cycleWorkoutDate,
  isIndefiniteCycle,
  todayCycleWeek,
  type CycleWorkout,
  type TrainingCycle,
} from "./plannerModel";
import {
  addDays,
  formatShortDate,
  fromDateKey,
  normalizeSearch,
  startOfWeekKey,
  templateSections,
  toDateKey,
  type Discipline,
  type WorkoutTemplate,
} from "./model";
import { DisciplineLabel } from "./Shared";
import { DISCIPLINE_META } from "./theme";

const DISCIPLINE_OPTIONS = Object.entries(DISCIPLINE_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

function formatLongDate(dateKey: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(fromDateKey(dateKey)).replace(".", "");
}

function workoutContentCount(template: WorkoutTemplate) {
  const count = template.stages?.length ?? template.exercises.length;
  if (!count) return "Bez rozpiski";
  if (template.stages?.length) return `${count} ${count === 1 ? "etap" : "etapów"}`;
  return `${count} ${count === 1 ? "ćwiczenie" : "ćwiczeń"}`;
}

export function TemplateLibrary({
  templates,
  onCreate,
  onEdit,
  onDuplicate,
  onAddToCycle,
  onUseToday,
}: {
  templates: WorkoutTemplate[];
  onCreate: () => void;
  onEdit: (template: WorkoutTemplate) => void;
  onDuplicate: (template: WorkoutTemplate) => void;
  onAddToCycle: (template: WorkoutTemplate) => void;
  onUseToday: (template: WorkoutTemplate) => void;
}) {
  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState<"all" | Discipline>("all");
  const [sort, setSort] = useState<"name" | "duration" | "content">("name");
  const query = normalizeSearch(search);
  const visibleTemplates = templates
    .filter((template) => discipline === "all" || template.discipline === discipline)
    .filter((template) => (
      !query
      || normalizeSearch(`${template.name} ${template.description} ${DISCIPLINE_META[template.discipline].label}`).includes(query)
    ))
    .sort((left, right) => {
      if (sort === "duration") return right.durationMinutes - left.durationMinutes;
      if (sort === "content") {
        const leftCount = left.stages?.length ?? left.exercises.length;
        const rightCount = right.stages?.length ?? right.exercises.length;
        return rightCount - leftCount || left.name.localeCompare(right.name, "pl");
      }
      return left.name.localeCompare(right.name, "pl");
    });
  const groups = Object.entries(DISCIPLINE_META)
    .map(([discipline, meta]) => ({
      discipline: discipline as Discipline,
      label: meta.label,
      templates: visibleTemplates.filter((template) => template.discipline === discipline),
    }))
    .filter((group) => group.templates.length > 0);

  return (
    <div className="sport-planner-section">
      <SectionHeader
        title="Szablony treningów"
        description={`${templates.length} zapisanych jednostek · wybierz szablon, aby go edytować albo dodać do planu.`}
        action={(
          <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={onCreate}>
            Nowy szablon
          </Button>
        )}
      />
      <div className="sport-template-tools" aria-label="Filtry szablonów">
        <div className="sport-template-search">
          <Search size={14} aria-hidden="true" />
          <Input
            aria-label="Szukaj szablonu"
            type="search"
            placeholder="Szukaj po nazwie lub opisie"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          compact
          fieldClassName="sport-template-filter"
          aria-label="Filtruj szablony po kategorii"
          value={discipline}
          options={[
            { value: "all", label: "Wszystkie kategorie" },
            ...Object.entries(DISCIPLINE_META).map(([value, meta]) => ({ value, label: meta.label })),
          ]}
          onChange={(event) => setDiscipline(event.target.value as "all" | Discipline)}
        />
        <Select
          compact
          fieldClassName="sport-template-sort"
          aria-label="Sortuj szablony"
          value={sort}
          options={[
            { value: "name", label: "Nazwa A–Z" },
            { value: "duration", label: "Najdłuższe" },
            { value: "content", label: "Najwięcej elementów" },
          ]}
          onChange={(event) => setSort(event.target.value as "name" | "duration" | "content")}
        />
      </div>
      {groups.length ? (
        <div className="sport-template-groups">
          {groups.map((group) => (
            <section key={group.discipline} className="sport-template-group" aria-labelledby={`template-group-${group.discipline}`}>
              <div className="sport-template-group__heading">
                <h3 id={`template-group-${group.discipline}`}>{group.label}</h3>
                <span>{group.templates.length}</span>
              </div>
              <Card padding="none">
                <div className="sport-template-table-head" aria-hidden="true">
                  <span>Nazwa</span>
                  <span>Typ</span>
                  <span>Czas</span>
                  <span>Zawartość</span>
                  <span>Akcje</span>
                </div>
                <div className="sport-template-list">
                  {group.templates.map((template) => (
                    <div key={template.id} className="sport-template-row">
                      <button type="button" className="sport-template-row__main" onClick={() => onEdit(template)}>
                        <strong>{template.name}</strong>
                        <p>{template.description || "Bez opisu"}</p>
                      </button>
                      <DisciplineLabel discipline={template.discipline} compact />
                      <span>{template.durationMinutes} min</span>
                      <span>{workoutContentCount(template)}</span>
                      <details className="sport-template-actions">
                        <summary aria-label={`Akcje szablonu ${template.name}`}>
                          <Ellipsis size={16} aria-hidden="true" />
                        </summary>
                        <div>
                          <button type="button" onClick={() => onEdit(template)}>
                            <Pencil size={13} aria-hidden="true" /> Edytuj
                          </button>
                          <button type="button" onClick={() => onDuplicate(template)}>
                            <Copy size={13} aria-hidden="true" /> Duplikuj
                          </button>
                          <button type="button" onClick={() => onAddToCycle(template)}>
                            <CalendarRange size={13} aria-hidden="true" /> Dodaj do planu
                          </button>
                          <button type="button" onClick={() => onUseToday(template)}>
                            <CalendarClock size={13} aria-hidden="true" /> Trening na dziś
                          </button>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title={templates.length ? "Brak pasujących szablonów" : "Brak szablonów"}
          description={templates.length
            ? "Zmień wyszukiwanie lub wybraną kategorię."
            : "Użyj przycisku „Nowy szablon” w nagłówku, aby utworzyć pierwszą jednostkę."}
        />
      )}
    </div>
  );
}

function WeekSelector({
  cycle,
  activeWeek,
  onWeekChange,
  onMove,
}: {
  cycle: TrainingCycle;
  activeWeek: number;
  onWeekChange: (week: number) => void;
  onMove: (id: string, week: number, day?: number) => void;
}) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const totalWeeks = cycleWeekCount(cycle);
  const currentWeek = todayCycleWeek(cycle);
  const indefinite = isIndefiniteCycle(cycle);
  const weekWorkouts = cycle.workouts.filter((workout) => workout.week === activeWeek);
  const weekMinutes = weekWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const scrollCarousel = (direction: -1 | 1) => {
    stripRef.current?.scrollBy({
      left: direction * Math.max(220, stripRef.current.clientWidth * 0.72),
      behavior: "smooth",
    });
  };
  useEffect(() => {
    const strip = stripRef.current;
    const tab = document.getElementById(`sport-week-tab-${activeWeek}`);
    if (!strip || !tab) return;
    const left = tab.getBoundingClientRect().left - strip.getBoundingClientRect().left
      + strip.scrollLeft - Math.max(0, (strip.clientWidth - tab.clientWidth) / 2);
    strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [activeWeek]);
  const focusWeekTab = (week: number) => {
    window.requestAnimationFrame(() => {
      document.getElementById(`sport-week-tab-${week}`)?.focus();
    });
  };

  return (
    <section className="sport-cycle-week-carousel" aria-label="Wybór tygodnia planu">
      <div className="sport-cycle-week-header">
        <div className="sport-cycle-week-header__identity">
          <div>
            <h2>{indefinite ? "Tydzień bazowy" : `Tydzień ${activeWeek} z ${totalWeeks}`}</h2>
            <p>{formatLongDate(cycleWeekDate(cycle, activeWeek, 0))} — {formatLongDate(cycleWeekDate(cycle, activeWeek, 6))}</p>
          </div>
          <div className="sport-cycle-week-header__facts">
            <span>{weekWorkouts.length} {weekWorkouts.length === 1 ? "trening" : weekWorkouts.length >= 2 && weekWorkouts.length <= 4 ? "treningi" : "treningów"}</span>
            <span>·</span>
            <span>{weekMinutes} min</span>
            {activeWeek === currentWeek && <Badge tone="neutral">Obecny tydzień</Badge>}
          </div>
        </div>
        <div className="sport-week-navigation__arrows">
          <Button variant="ghost" size="sm" iconOnly aria-label="Przewiń tygodnie w lewo" onClick={() => scrollCarousel(-1)}>
            <ChevronLeft size={13} />
          </Button>
          <Button variant="ghost" size="sm" iconOnly aria-label="Przewiń tygodnie w prawo" onClick={() => scrollCarousel(1)}>
            <ChevronRight size={13} />
          </Button>
        </div>
      </div>
      <div className="sport-cycle-sidebar__section-heading">
        <div>
          <h3 id="sport-cycle-week-selector-heading">Tygodnie planu</h3>
          <p>{indefinite ? "Powtarzany tydzień bazowy" : `${totalWeeks} tygodni w cyklu`}</p>
        </div>
        <div className="sport-week-navigation__arrows">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Poprzedni tydzień"
            onClick={() => scrollCarousel(-1)}
          >
            <ChevronLeft size={13} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Następny tydzień"
            onClick={() => scrollCarousel(1)}
          >
            <ChevronRight size={13} />
          </Button>
        </div>
      </div>
      <div ref={stripRef} className="sport-week-strip" role="tablist" aria-label="Tygodnie planu" aria-orientation="horizontal">
        {Array.from({ length: totalWeeks }, (_, index) => index + 1).map((week) => {
          const count = cycle.workouts.filter((workout) => workout.week === week).length;
          const isCurrentWeek = week === currentWeek;
          const weekLabel = indefinite ? "Tydzień bazowy" : `Tydzień ${week}`;
          return (
            <button
              key={week}
              type="button"
              role="tab"
              id={`sport-week-tab-${week}`}
              aria-controls="sport-cycle-week-panel"
              aria-selected={week === activeWeek}
              tabIndex={week === activeWeek ? 0 : -1}
              className={`sport-week-tab ${isCurrentWeek ? "is-current" : ""} ${dropTarget === `week-${week}` ? "is-drop-target" : ""}`.trim()}
              aria-label={`${weekLabel}, ${count} ${count === 1 ? "trening" : "treningów"}${isCurrentWeek ? ", bieżący tydzień" : ""}`}
              title={isCurrentWeek ? `${weekLabel} · bieżący tydzień` : weekLabel}
              onClick={() => onWeekChange(week)}
              onKeyDown={(event) => {
                let nextWeek: number;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") nextWeek = week === totalWeeks ? 1 : week + 1;
                else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextWeek = week === 1 ? totalWeeks : week - 1;
                else if (event.key === "Home") nextWeek = 1;
                else if (event.key === "End") nextWeek = totalWeeks;
                else return;
                event.preventDefault();
                onWeekChange(nextWeek);
                focusWeekTab(nextWeek);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTarget(`week-${week}`);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/sport-cycle-workout");
                if (id) {
                  onMove(id, week);
                  onWeekChange(week);
                }
                setDropTarget(null);
              }}
            >
              <span>{indefinite ? "Bazowy" : `Tydz. ${week}`}</span>
              <small className="sport-week-tab__range">{formatShortDate(cycleWeekDate(cycle, week, 0))} — {formatShortDate(cycleWeekDate(cycle, week, 6))}</small>
              <small>{isCurrentWeek ? "Dziś" : `${count} ${count === 1 ? "trening" : "treningów"}`}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function workoutContentPreview(template?: WorkoutTemplate) {
  if (!template) return "";
  const labels = [...template.exercises.map((exercise) => exercise.name), ...(template.stages ?? []).map((stage) => stage.label)];
  return labels.length > 4 ? `${labels.slice(0, 3).join(" · ")} · +${labels.length - 3}` : labels.join(" · ");
}

function WeekBoard({
  cycle,
  templates = [],
  activeWeek,
  selectedWorkoutId,
  onWeekChange,
  onMove,
  onSelect,
  onAdd,
}: {
  cycle: TrainingCycle;
  templates?: WorkoutTemplate[];
  activeWeek: number;
  selectedWorkoutId?: string | null;
  onWeekChange: (week: number) => void;
  onMove: (id: string, week: number, day?: number) => void;
  onSelect: (workout: CycleWorkout) => void;
  onAdd: (week: number, day: number) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const workouts = useMemo(
    () => cycle.workouts.filter((workout) => workout.week === activeWeek),
    [activeWeek, cycle.workouts],
  );
  const totalWeeks = cycleWeekCount(cycle);
  const todayKey = toDateKey(new Date());

  return (
    <section className="sport-cycle-weeks" aria-label={`Rozpiska dni tygodnia ${activeWeek}`}>
      <div
        id="sport-cycle-week-panel"
        role="tabpanel"
        aria-labelledby={`sport-week-tab-${activeWeek}`}
        className="sport-cycle-board-scroll"
      >
        <div className="sport-cycle-board">
          {DAY_LABELS.map((day, dayIndex) => {
            const dateKey = cycleWeekDate(cycle, activeWeek, dayIndex);
            const dayWorkouts = workouts
              .filter((workout) => workout.day === dayIndex)
              .sort((left, right) => (left.time ?? "").localeCompare(right.time ?? ""));
            return (
              <div
                key={day.short}
                className={`sport-cycle-day ${dateKey === todayKey ? "is-today" : ""} ${dropTarget === `day-${dayIndex}` ? "is-drop-target" : ""}`.trim()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropTarget(`day-${dayIndex}`);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/sport-cycle-workout") || draggedId;
                  if (id) onMove(id, activeWeek, dayIndex);
                  setDraggedId(null);
                  setDropTarget(null);
                }}
              >
                <div className="sport-cycle-day__heading">
                  <div>
                    <strong>{day.full}</strong>
                    <span>{formatShortDate(dateKey)}</span>
                  </div>
                </div>
                <div className="sport-cycle-day__workouts">
                  {dayWorkouts.map((workout) => (
                    <button
                      key={workout.id}
                      type="button"
                      draggable
                      aria-pressed={selectedWorkoutId === workout.id}
                      aria-describedby="sport-cycle-drag-hint"
                      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
                      className={`sport-cycle-workout ${selectedWorkoutId === workout.id ? "is-selected" : ""}`.trim()}
                      style={{ opacity: draggedId === workout.id ? 0.45 : 1 }}
                      onClick={() => onSelect(workout)}
                      onKeyDown={(event) => {
                        if (!event.altKey) return;
                        let nextWeek = workout.week;
                        let nextDay = workout.day;
                        if (event.key === "ArrowLeft") {
                          if (nextDay > 0) nextDay -= 1;
                          else if (nextWeek > 1) {
                            nextWeek -= 1;
                            nextDay = 6;
                          } else return;
                        } else if (event.key === "ArrowRight") {
                          if (nextDay < 6) nextDay += 1;
                          else if (nextWeek < totalWeeks) {
                            nextWeek += 1;
                            nextDay = 0;
                          } else return;
                        } else if (event.key === "ArrowUp") {
                          if (nextWeek <= 1) return;
                          nextWeek -= 1;
                        } else if (event.key === "ArrowDown") {
                          if (nextWeek >= totalWeeks) return;
                          nextWeek += 1;
                        } else return;
                        event.preventDefault();
                        onMove(workout.id, nextWeek, nextDay);
                        if (nextWeek !== activeWeek) onWeekChange(nextWeek);
                      }}
                      onDragStart={(event) => {
                        setDraggedId(workout.id);
                        event.dataTransfer.setData("text/sport-cycle-workout", workout.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDropTarget(null);
                      }}
                    >
                      <span className="sport-cycle-workout__grip"><GripVertical size={11} /></span>
                      <strong>{workout.title}</strong>
                      <span className="sport-cycle-workout__meta">
                        {workout.time && <time>{workout.time}</time>}
                        <span>{workout.durationMinutes} min</span>
                        <DisciplineLabel discipline={workout.discipline} compact />
                      </span>
                      {workoutContentPreview(templates.find((template) => template.id === workout.templateId)) && <span className="sport-cycle-workout__preview">{workoutContentPreview(templates.find((template) => template.id === workout.templateId))}</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`sport-cycle-day__add ${dayWorkouts.length ? "is-icon" : "sport-cycle-day__empty"}`.trim()}
                    aria-label={`Dodaj trening: ${day.full}`}
                    onClick={() => onAdd(activeWeek, dayIndex)}
                  >
                    <Plus size={12} aria-hidden="true" />
                    {!dayWorkouts.length && <span>Dodaj trening</span>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p id="sport-cycle-drag-hint" className="sport-cycle-drag-hint">
        Przeciągnij trening na inny dzień albo tydzień. Klawiatura: Alt + ←/→ zmienia dzień, Alt + ↑/↓ zmienia tydzień.
      </p>
    </section>
  );
}

export function CyclePlanner({
  cycle,
  templates = [],
  cycles,
  activeWeek,
  selectedWorkoutId,
  isDirty,
  onSaveCycle,
  onDiscardChanges,
  onSelectCycle,
  onCreateNewCycle,
  onWeekChange,
  onCreateCycle,
  onEditCycle,
  onAddWorkout,
  onSelectWorkout,
  onMoveWorkout,
  onCopyWeek,
}: {
  cycle: TrainingCycle;
  templates?: WorkoutTemplate[];
  cycles: TrainingCycle[];
  activeWeek: number;
  selectedWorkoutId?: string | null;
  isDirty: boolean;
  onSaveCycle: () => void;
  onDiscardChanges: () => void;
  onSelectCycle: (cycle: TrainingCycle) => void;
  onCreateNewCycle: () => void;
  onWeekChange: (week: number) => void;
  onCreateCycle: () => void;
  onEditCycle: () => void;
  onAddWorkout: (week: number, day: number) => void;
  onSelectWorkout: (workout: CycleWorkout) => void;
  onMoveWorkout: (id: string, week: number, day?: number) => void;
  onCopyWeek: (fromWeek: number, toWeek: number) => void;
}) {
  if (!cycle) {
    return (
      <EmptyState
        title="Brak planu treningowego"
        description="Utwórz plan bezterminowy albo określ jego zakres, a następnie przypisz treningi do dni."
        action={<Button variant="primary" onClick={onCreateCycle}>Utwórz plan</Button>}
      />
    );
  }

  return (
    <CyclePlannerLayout
      cycle={cycle}
      templates={templates}
      cycles={cycles}
      activeWeek={activeWeek}
      selectedWorkoutId={selectedWorkoutId}
      isDirty={isDirty}
      onSaveCycle={onSaveCycle}
      onDiscardChanges={onDiscardChanges}
      onSelectCycle={onSelectCycle}
      onCreateNewCycle={onCreateNewCycle}
      onWeekChange={onWeekChange}
      onEditCycle={onEditCycle}
      onAddWorkout={onAddWorkout}
      onSelectWorkout={onSelectWorkout}
      onMoveWorkout={onMoveWorkout}
      onCopyWeek={onCopyWeek}
    />
  );

  const range = cycleDateRange(cycle);
  const totalWeeks = cycleWeekCount(cycle);
  const indefinite = isIndefiniteCycle(cycle);
  const weekWorkouts = cycle.workouts.filter((workout) => workout.week === activeWeek);
  const weekMinutes = weekWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const activeDays = new Set(weekWorkouts.map((workout) => workout.day)).size;
  const weekDisciplines = Object.entries(DISCIPLINE_META)
    .map(([discipline, meta]) => ({
      discipline: discipline as Discipline,
      label: meta.label,
      count: weekWorkouts.filter((workout) => workout.discipline === discipline).length,
    }))
    .filter((item) => item.count > 0);

  return (
    <div className="sport-planner-section">
      <div className="sport-cycle-summary">
        <div className="sport-cycle-summary__identity">
          <CalendarRange size={17} strokeWidth={1.5} />
          <div>
            <div className="sport-cycle-summary__title">
              <h2>{cycle.name}</h2>
              {isDirty && <Badge tone="warning">Niezapisane zmiany</Badge>}
            </div>
            <p>{formatLongDate(range.start)} {indefinite ? "· bez daty końcowej" : `— ${formatLongDate(range.end!)}`}</p>
          </div>
        </div>
        <div className="sport-cycle-summary__facts">
          <span><strong>{indefinite ? "∞" : totalWeeks}</strong> {indefinite ? "bezterminowo" : "tygodni"}</span>
          <span><strong>{cycle.workouts.length}</strong> treningów</span>
          <span><strong>{weekWorkouts.length}</strong> w tym tygodniu</span>
        </div>
        <div className="sport-cycle-summary__actions">
          <Button variant="quiet" size="sm" onClick={onEditCycle}>Ustawienia planu</Button>
          <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={() => onAddWorkout(activeWeek, 0)}>
            Dodaj trening
          </Button>
          {isDirty && (
            <div className="sport-cycle-summary__commit">
              <Button variant="ghost" size="sm" onClick={onDiscardChanges}>
                Odrzuć zmiany
              </Button>
              <Button variant="primary" size="sm" leadingIcon={<Save size={12} />} onClick={onSaveCycle}>
                Zapisz plan
              </Button>
            </div>
          )}
        </div>
      </div>

      <section className="sport-week-summary" aria-labelledby="sport-week-summary-heading">
        <div>
          <h3 id="sport-week-summary-heading">Podsumowanie tygodnia {activeWeek}</h3>
          <p>Planowana objętość przed rozpoczęciem treningów.</p>
        </div>
        <dl>
          <div><dt>Treningi</dt><dd>{weekWorkouts.length}</dd></div>
          <div><dt>Planowany czas</dt><dd>{weekMinutes} min</dd></div>
          <div><dt>Aktywne dni</dt><dd>{activeDays} z 7</dd></div>
        </dl>
        <div className="sport-week-summary__disciplines">
          {weekDisciplines.length
            ? weekDisciplines.map((item) => (
                <span key={item.discipline}>
                  <i style={{ background: DISCIPLINE_META[item.discipline].color }} />
                  {item.label} · {item.count}
                </span>
              ))
            : <span>Brak treningów w tym tygodniu</span>}
        </div>
      </section>

      <WeekBoard
        cycle={cycle}
        activeWeek={activeWeek}
        selectedWorkoutId={selectedWorkoutId}
        onWeekChange={onWeekChange}
        onMove={onMoveWorkout}
        onSelect={onSelectWorkout}
        onAdd={onAddWorkout}
      />

    </div>
  );
}

function CyclePlannerLayout({
  cycle,
  templates = [],
  cycles,
  activeWeek,
  selectedWorkoutId,
  isDirty,
  onSaveCycle,
  onDiscardChanges,
  onSelectCycle,
  onCreateNewCycle,
  onWeekChange,
  onEditCycle,
  onAddWorkout,
  onSelectWorkout,
  onMoveWorkout,
  onCopyWeek,
}: {
  cycle: TrainingCycle;
  templates?: WorkoutTemplate[];
  cycles: TrainingCycle[];
  activeWeek: number;
  selectedWorkoutId?: string | null;
  isDirty: boolean;
  onSaveCycle: () => void;
  onDiscardChanges: () => void;
  onSelectCycle: (cycle: TrainingCycle) => void;
  onCreateNewCycle: () => void;
  onWeekChange: (week: number) => void;
  onEditCycle: () => void;
  onAddWorkout: (week: number, day: number) => void;
  onSelectWorkout: (workout: CycleWorkout) => void;
  onMoveWorkout: (id: string, week: number, day?: number) => void;
  onCopyWeek: (fromWeek: number, toWeek: number) => void;
}) {
  const [copySourceWeek, setCopySourceWeek] = useState<number | null>(null);
  const range = cycleDateRange(cycle);
  const totalWeeks = cycleWeekCount(cycle);
  const indefinite = isIndefiniteCycle(cycle);
  const weekWorkouts = cycle.workouts.filter((workout) => workout.week === activeWeek);
  const weekMinutes = weekWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const activeDays = new Set(weekWorkouts.map((workout) => workout.day)).size;
  const weekDisciplines = Object.entries(DISCIPLINE_META)
    .map(([discipline, meta]) => ({
      discipline: discipline as Discipline,
      label: meta.label,
      count: weekWorkouts.filter((workout) => workout.discipline === discipline).length,
    }))
    .filter((item) => item.count > 0);
  const planItems = cycles.some((item) => item.id === cycle.id)
    ? cycles.map((item) => item.id === cycle.id ? cycle : item)
    : [cycle, ...cycles];
  const otherCycles = planItems.filter((item) => item.id !== cycle.id);

  return (
    <div className="sport-cycle-layout">
      <aside className="sport-cycle-sidebar" aria-label="Zarządzanie planem treningowym">
        <div className="sport-cycle-sidebar__heading">
          <h2>Plany treningowe</h2>
          <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={onCreateNewCycle}>Nowy plan</Button>
        </div>
        <section className="sport-cycle-sidebar__section sport-cycle-sidebar__active">
          <div className="sport-cycle-sidebar__section-heading">
            <div>
              <h3>Aktywny plan</h3>
              <div className="sport-cycle-plan-card__title-row">
                <CalendarRange size={15} strokeWidth={1.5} aria-hidden="true" />
                <h2>{cycle.name}</h2>
                {isDirty && <Badge tone="warning">Niezapisane zmiany</Badge>}
              </div>
            </div>
          </div>
          <p className="sport-cycle-plan-card__week">Tydzień {activeWeek} z {totalWeeks}</p>
          <p className="sport-cycle-plan-card__date">
            {formatLongDate(range.start)} {indefinite ? "· bez daty końcowej" : `— ${formatLongDate(range.end!)}`}
          </p>
          <div className="sport-cycle-plan-card__stats">
            <span><strong>{indefinite ? "∞" : totalWeeks}</strong>{indefinite ? "bezterminowo" : "tygodni"}</span>
            <span><strong>{cycle.workouts.length}</strong>treningów</span>
            <span><strong>{weekWorkouts.length}</strong>w tym tygodniu</span>
          </div>
          <div className="sport-cycle-sidebar__actions">
            <Button variant="quiet" size="sm" onClick={onEditCycle}>Ustawienia planu</Button>
            <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={() => onAddWorkout(activeWeek, 0)}>
              Dodaj trening
            </Button>
            {isDirty && (
              <div className="sport-cycle-summary__commit">
                <Button variant="ghost" size="sm" onClick={onDiscardChanges}>Odrzuć zmiany</Button>
                <Button variant="primary" size="sm" leadingIcon={<Save size={12} />} onClick={onSaveCycle}>Zapisz plan</Button>
              </div>
            )}
          </div>
        </section>

        <section className="sport-cycle-sidebar__section sport-cycle-sidebar__plans" aria-labelledby="sport-cycle-plans-heading">
          <div className="sport-cycle-sidebar__section-heading">
            <div>
              <h3 id="sport-cycle-plans-heading">Pozostałe plany</h3>
              <p>{otherCycles.length ? `${otherCycles.length} zapisanych planów` : "Dodaj alternatywny plan"}</p>
            </div>
          </div>
          <div className="sport-cycle-plan-list">
            {otherCycles.length ? otherCycles.map((item) => {
              const itemRange = cycleDateRange(item);
              const itemIndefinite = isIndefiniteCycle(item);
              return (
                <button key={item.id} type="button" className="sport-cycle-plan-card" onClick={() => onSelectCycle(item)}>
                  <span className="sport-cycle-plan-card__title-row">
                    <CalendarRange size={13} strokeWidth={1.5} aria-hidden="true" />
                    <strong>{item.name}</strong>
                  </span>
                  <span className="sport-cycle-plan-card__date">
                    {formatLongDate(itemRange.start)} {itemIndefinite ? "· bez daty końcowej" : `— ${formatLongDate(itemRange.end!)}`}
                  </span>
                  <span className="sport-cycle-plan-card__meta">{item.workouts.length} treningów · {itemIndefinite ? "bezterminowy" : `${item.weeks} tyg.`}</span>
                </button>
              );
            }) : <p className="sport-cycle-sidebar__empty">Nowe plany pojawią się tutaj po zapisaniu.</p>}
          </div>
        </section>

        <section className="sport-week-summary sport-cycle-sidebar__summary" aria-labelledby="sport-week-summary-heading">
          <div>
            <h3 id="sport-week-summary-heading">Podsumowanie tygodnia {activeWeek}</h3>
            <p>Planowana objętość przed rozpoczęciem treningów.</p>
          </div>
          <dl>
            <div><dt>Treningi</dt><dd>{weekWorkouts.length}</dd></div>
            <div><dt>Planowany czas</dt><dd>{weekMinutes} min</dd></div>
            <div><dt>Aktywne dni</dt><dd>{activeDays} z 7</dd></div>
          </dl>
          <div className="sport-week-summary__disciplines">
            {weekDisciplines.length
              ? weekDisciplines.map((item) => (
                  <span key={item.discipline}><i style={{ background: DISCIPLINE_META[item.discipline].color }} />{item.label} · {item.count}</span>
                ))
              : <span>Brak treningów w tym tygodniu</span>}
          </div>
        </section>
      </aside>

      <main className="sport-cycle-workspace">
        <div className="sport-cycle-workspace__heading">
          <div>
            <h2>{indefinite ? "Tydzień bazowy" : `Tydzień ${activeWeek} z ${totalWeeks}`}</h2>
            <p>{formatLongDate(cycleWeekDate(cycle, activeWeek, 0))} — {formatLongDate(cycleWeekDate(cycle, activeWeek, 6))}</p>
          </div>
          {activeWeek === todayCycleWeek(cycle) && <Badge tone="neutral">Obecny tydzień</Badge>}
          <div className="sport-cycle-workspace__actions">
            {copySourceWeek === null ? (
              <Button variant="ghost" size="sm" leadingIcon={<Copy size={12} />} onClick={() => setCopySourceWeek(activeWeek)}>
                Kopiuj tydzień
              </Button>
            ) : (
              <>
                <span className="sport-data">Źródło: tydz. {copySourceWeek}</span>
                {copySourceWeek !== activeWeek && (
                  <Button variant="quiet" size="sm" onClick={() => { onCopyWeek(copySourceWeek, activeWeek); setCopySourceWeek(null); }}>
                    Wklej do tygodnia {activeWeek}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setCopySourceWeek(null)}>Anuluj</Button>
              </>
            )}
          </div>
        </div>
        <WeekSelector cycle={cycle} activeWeek={activeWeek} onWeekChange={onWeekChange} onMove={onMoveWorkout} />
        <WeekBoard
          cycle={cycle}
          templates={templates}
          activeWeek={activeWeek}
          selectedWorkoutId={selectedWorkoutId}
          onWeekChange={onWeekChange}
          onMove={onMoveWorkout}
          onSelect={onSelectWorkout}
          onAdd={onAddWorkout}
        />
      </main>
    </div>
  );
}

export function MoveWorkoutDialog({
  cycle,
  workout,
  onClose,
  onSubmit,
}: {
  cycle: TrainingCycle;
  workout: CycleWorkout;
  onClose: () => void;
  onSubmit: (week: number, day: number) => void;
}) {
  const [week, setWeek] = useState(String(workout.week));
  const [day, setDay] = useState(String(workout.day));
  const totalWeeks = cycleWeekCount(cycle);
  const indefinite = isIndefiniteCycle(cycle);
  const parsedWeek = indefinite ? 1 : Number(week);
  const parsedDay = Number(day);
  const dateKey = cycleWeekDate(cycle, parsedWeek, parsedDay);

  return (
    <Modal
      title="Przenieś trening"
      eyebrow={workout.title}
      description="Wybierz tydzień i dzień. Przeciąganie pozostaje szybkim skrótem na planszy."
      width={460}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button
            variant="primary"
            leadingIcon={<MoveRight size={13} />}
            onClick={() => onSubmit(parsedWeek, parsedDay)}
            disabled={!Number.isInteger(parsedWeek) || !Number.isInteger(parsedDay)}
          >
            Przenieś trening
          </Button>
        </>
      )}
    >
      <div className="sport-planner-form sport-move-workout-form">
        <div className="sport-planner-form__grid">
          <Select
            label="Tydzień"
            value={indefinite ? "1" : week}
            disabled={indefinite}
            options={Array.from({ length: totalWeeks }, (_, index) => {
              const value = String(index + 1);
              return { value, label: `Tydzień ${index + 1}` };
            })}
            onChange={(event) => setWeek(event.target.value)}
          />
          <Select
            label="Dzień"
            value={day}
            options={DAY_LABELS.map((item, index) => ({ value: String(index), label: item.full }))}
            onChange={(event) => setDay(event.target.value)}
          />
        </div>
        <p className="sport-move-workout-form__preview">
          Nowy termin: <strong>{DAY_LABELS[parsedDay]?.full}</strong> · {formatShortDate(dateKey)}
        </p>
      </div>
    </Modal>
  );
}

export function TemplateDialog({
  template,
  onClose,
  onSubmit,
  onDelete,
}: {
  template?: WorkoutTemplate;
  onClose: () => void;
  onSubmit: (template: WorkoutTemplate) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [discipline, setDiscipline] = useState<Discipline>(template?.discipline ?? "strength");
  const [duration, setDuration] = useState(String(template?.durationMinutes ?? 45));
  const [description, setDescription] = useState(template?.description ?? "");
  const [error, setError] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const durationMinutes = Number(duration);
    if (!name.trim()) {
      setError("Podaj nazwę szablonu.");
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 600) {
      setError("Podaj czas od 5 do 600 minut.");
      return;
    }
    onSubmit({
      id: template?.id ?? createPlannerId("template"),
      name: name.trim(),
      discipline,
      durationMinutes,
      description: description.trim(),
      exercises: template?.exercises ?? [],
      stages: template?.stages,
    });
  };

  return (
    <Modal
      title={template ? "Edytuj szablon" : "Nowy szablon"}
      eyebrow="Biblioteka treningów"
      description="Szablon opisuje powtarzalny trening i jego kategorię sportu."
      width={560}
      onClose={onClose}
      footer={(
        <>
          {onDelete && (
            <Button
              variant="danger"
              size="sm"
              style={{ marginRight: "auto" }}
              onClick={() => {
                if (deleteArmed) onDelete();
                else setDeleteArmed(true);
              }}
            >
              {deleteArmed ? "Potwierdź usunięcie" : "Usuń szablon"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button type="submit" form="sport-template-form" variant="primary">Zapisz szablon</Button>
        </>
      )}
    >
      <form id="sport-template-form" className="sport-planner-form" onSubmit={submit}>
        <Input
          label="Nazwa"
          placeholder="np. Siłownia — góra A"
          value={name}
          data-autofocus
          onChange={(event) => { setName(event.target.value); setError(""); }}
        />
        <div className="sport-planner-form__grid">
          <Select
            label="Kategoria sportu"
            value={discipline}
            options={DISCIPLINE_OPTIONS}
            onChange={(event) => setDiscipline(event.target.value as Discipline)}
          />
          <Input
            label="Czas (min)"
            type="number"
            min="5"
            max="600"
            step="5"
            value={duration}
            onChange={(event) => { setDuration(event.target.value); setError(""); }}
          />
        </div>
        <Input
          label="Krótki opis"
          placeholder="np. Klatka, plecy i barki"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        {error && <p className="sport-planner-form__error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

export function CycleDialog({
  cycle,
  onClose,
  onSubmit,
}: {
  cycle: TrainingCycle | null;
  onClose: () => void;
  onSubmit: (cycle: TrainingCycle) => void;
}) {
  const [name, setName] = useState(cycle?.name ?? "Plan treningowy");
  const [startDate, setStartDate] = useState(cycle?.startDate ?? startOfWeekKey());
  const [weeks, setWeeks] = useState(String(cycle?.weeks ?? 12));
  const [rangeMode, setRangeMode] = useState<"indefinite" | "fixed">(
    cycle?.endDate === null ? "indefinite" : "fixed",
  );
  const [error, setError] = useState("");
  const nextWeeks = Number(weeks);
  const removedCount = cycle && rangeMode === "fixed" && Number.isFinite(nextWeeks)
    ? cycle.workouts.filter((workout) => workout.week > nextWeeks).length
    : 0;
  const collapsedCount = cycle && rangeMode === "indefinite"
    ? cycle.workouts.filter((workout) => workout.week > 1).length
    : 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedWeeks = Number(weeks);
    if (!name.trim()) {
      setError("Podaj nazwę planu.");
      return;
    }
    if (!startDate) {
      setError("Wybierz datę rozpoczęcia.");
      return;
    }
    if (rangeMode === "fixed" && (!Number.isInteger(parsedWeeks) || parsedWeeks < 1 || parsedWeeks > 52)) {
      setError("Podaj długość od 1 do 52 tygodni.");
      return;
    }
    const monday = fromDateKey(startDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const normalizedStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    const normalizedWeeks = rangeMode === "indefinite" ? 1 : parsedWeeks;
    onSubmit({
      id: cycle?.id ?? createPlannerId("cycle"),
      name: name.trim(),
      startDate: normalizedStart,
      weeks: normalizedWeeks,
      endDate: rangeMode === "indefinite" ? null : addDays(normalizedStart, normalizedWeeks * 7 - 1),
      repeatWeekly: rangeMode === "indefinite",
      workouts: (cycle?.workouts ?? [])
        .filter((workout) => rangeMode === "indefinite" ? workout.week === 1 : workout.week <= normalizedWeeks)
        .map((workout) => rangeMode === "indefinite" ? { ...workout, week: 1 } : workout),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Modal
      title={cycle ? "Ustawienia planu" : "Nowy plan treningowy"}
      eyebrow="Jeden aktywny plan"
      description="Zaplanuj tydzień powtarzany bezterminowo albo określony zakres tygodni."
      width={620}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button type="submit" form="sport-cycle-form" variant="primary">
            {cycle ? "Zapisz ustawienia" : "Utwórz plan"}
          </Button>
        </>
      )}
    >
      <form id="sport-cycle-form" className="sport-planner-form" onSubmit={submit}>
        <Input
          label="Nazwa planu"
          placeholder="np. Przygotowanie jesienne"
          value={name}
          data-autofocus
          onChange={(event) => { setName(event.target.value); setError(""); }}
        />
        <div className="sport-planner-form__grid">
          <DatePicker
            label="Start"
            value={startDate}
            hint="Plan zacznie się w poniedziałek tego tygodnia."
            onChange={(nextValue) => { setStartDate(nextValue); setError(""); }}
          />
          <Select
            label="Zakres planu"
            value={rangeMode}
            options={[
              { value: "indefinite", label: "Bez daty końcowej" },
              { value: "fixed", label: "Określona liczba tygodni" },
            ]}
            onChange={(event) => {
              setRangeMode(event.target.value as "indefinite" | "fixed");
              setError("");
            }}
          />
        </div>
        {rangeMode === "fixed" && (
          <Input
            label="Liczba tygodni"
            type="number"
            min="1"
            max="52"
            step="1"
            value={weeks}
            onChange={(event) => { setWeeks(event.target.value); setError(""); }}
          />
        )}
        {removedCount > 0 && (
          <p className="sport-planner-form__warning">
            Skrócenie planu usunie {removedCount} {removedCount === 1 ? "trening" : "treningów"} spoza nowego zakresu.
          </p>
        )}
        {collapsedCount > 0 && (
          <p className="sport-planner-form__warning">
            Plan bezterminowy zachowa tydzień bazowy. Dodatkowe treningi z dalszych tygodni zostaną usunięte: {collapsedCount}.
          </p>
        )}
        {error && <p className="sport-planner-form__error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

export function WorkoutDialog({
  cycle,
  templates,
  workout,
  initialWeek,
  initialDay,
  initialTemplateId,
  initialTitle,
  editScope = "single",
  seriesCount = 1,
  onClose,
  onSubmit,
  onDelete,
}: {
  cycle: TrainingCycle;
  templates: WorkoutTemplate[];
  workout?: CycleWorkout;
  initialWeek: number;
  initialDay: number;
  initialTemplateId?: string;
  initialTitle?: string;
  editScope?: "single" | "series";
  seriesCount?: number;
  onClose: () => void;
  onSubmit: (workouts: CycleWorkout[], editingId?: string, editScope?: "single" | "series") => void;
  onDelete?: () => void;
}) {
  const initialTemplate = workout?.templateId
    ? templates.find((template) => template.id === workout.templateId)
    : initialTemplateId
      ? templates.find((template) => template.id === initialTemplateId)
      : undefined;
  const [mode, setMode] = useState<"template" | "manual">(
    workout ? (initialTemplate ? "template" : "manual") : initialTitle ? "manual" : templates.length ? "template" : "manual",
  );
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? templates[0]?.id ?? "");
  const firstTemplate = initialTemplate ?? templates[0];
  const [title, setTitle] = useState(workout?.title ?? initialTitle ?? firstTemplate?.name ?? "");
  const [discipline, setDiscipline] = useState<Discipline>(workout?.discipline ?? firstTemplate?.discipline ?? "strength");
  const [duration, setDuration] = useState(String(workout?.durationMinutes ?? firstTemplate?.durationMinutes ?? 45));
  const [week, setWeek] = useState(String(workout?.week ?? initialWeek));
  const [day, setDay] = useState(String(workout?.day ?? initialDay));
  const [time, setTime] = useState(workout?.time ?? "");
  const [note, setNote] = useState(workout?.note ?? "");
  const [repeat, setRepeat] = useState<"once" | "weekly" | "selected">("once");
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([initialWeek]);
  const [error, setError] = useState("");
  const totalWeeks = cycleWeekCount(cycle);
  const indefinite = isIndefiniteCycle(cycle);

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setTitle(template.name);
    setDiscipline(template.discipline);
    setDuration(String(template.durationMinutes));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedDuration = Number(duration);
    const parsedWeek = Number(week);
    const parsedDay = Number(day);
    if (!title.trim()) {
      setError("Podaj nazwę treningu.");
      return;
    }
    if (!Number.isFinite(parsedDuration) || parsedDuration < 5 || parsedDuration > 600) {
      setError("Podaj czas od 5 do 600 minut.");
      return;
    }
    if (
      !Number.isInteger(parsedWeek)
      || parsedWeek < 1
      || parsedWeek > totalWeeks
      || !Number.isInteger(parsedDay)
      || parsedDay < 0
      || parsedDay > 6
    ) {
      setError("Wybierz tydzień i dzień należące do planu.");
      return;
    }
    if (mode === "template" && !templates.some((template) => template.id === templateId)) {
      setError("Wybierz istniejący szablon.");
      return;
    }

    if (!workout && repeat === "selected" && !selectedWeeks.length) {
      setError("Wybierz przynajmniej jeden tydzień.");
      return;
    }
    const weeks = indefinite
      ? [1]
      : workout || repeat === "once"
      ? [parsedWeek]
      : repeat === "weekly"
        ? Array.from({ length: cycle.weeks - parsedWeek + 1 }, (_, index) => parsedWeek + index)
        : [...selectedWeeks].sort((left, right) => left - right);
    const seriesId = workout?.seriesId ?? (weeks.length > 1 ? createPlannerId("series") : undefined);
    const sourceTemplate = mode === "template" ? templates.find((template) => template.id === templateId) : undefined;
    const now = new Date().toISOString();
    const plannedRecordMeta = {
      contentSnapshot: sourceTemplate ? templateSections(sourceTemplate) : workout?.contentSnapshot,
      sourceTemplateVersion: sourceTemplate?.updatedAt ?? sourceTemplate?.createdAt ?? workout?.sourceTemplateVersion,
      createdAt: workout?.createdAt ?? now,
      updatedAt: now,
    };
    const next = weeks.map((targetWeek) => ({
      ...plannedRecordMeta,
      id: workout?.id ?? createPlannerId("cycle-workout"),
      week: targetWeek,
      day: parsedDay,
      title: title.trim(),
      discipline,
      durationMinutes: parsedDuration,
      templateId: mode === "template" ? templateId : undefined,
      seriesId,
      time: time || undefined,
      note: note.trim() || undefined,
    }));
    onSubmit(next, workout?.id, editScope);
  };

  return (
    <Modal
      title={workout ? (editScope === "series" ? "Edytuj serię treningów" : "Edytuj trening") : "Dodaj trening"}
      eyebrow={indefinite ? "Tydzień bazowy" : `Tydzień ${workout?.week ?? initialWeek}`}
      description={workout && editScope === "series"
        ? `Zmiany obejmą wszystkie wystąpienia tej serii (${seriesCount}).`
        : "Wybierz szablon albo dodaj pojedynczy trening ręcznie."}
      width={650}
      onClose={onClose}
      footer={(
        <>
          {onDelete && (
            <Button variant="danger" size="sm" style={{ marginRight: "auto" }} leadingIcon={<Trash2 size={12} />} onClick={onDelete}>
              Usuń trening
            </Button>
          )}
          {workout && <AddToTasksButton compact input={{
            source: {
              kind: "sport",
              entity: `${encodeURIComponent(cycle.id)}/${encodeURIComponent(workout.id)}`,
              context: `${cycle.name} · tydzień ${workout.week}`,
              href: `/sport?widok=cycle&tydzien=${workout.week}`,
            },
            text: title || workout.title,
            done: false,
            calendarDate: cycleWorkoutDate(cycle, workout),
            date: cycleWorkoutDate(cycle, workout),
            time: time || workout.time,
            list: "sport",
            tags: ["sport"],
            notes: note || workout.note,
          }} />}
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button type="submit" form="sport-workout-form" variant="primary">
            {workout
              ? editScope === "series" ? `Zapisz całą serię (${seriesCount})` : "Zapisz ten trening"
              : repeat === "once" ? "Dodaj trening" : "Dodaj serię treningów"}
          </Button>
        </>
      )}
    >
      <form id="sport-workout-form" className="sport-planner-form" onSubmit={submit}>
        <div className="sport-planner-form__grid">
          <Select
            label="Źródło"
            value={mode}
            options={[
              { value: "template", label: "Z szablonu", disabled: templates.length === 0 },
              { value: "manual", label: "Trening ręczny" },
            ]}
            onChange={(event) => {
              const nextMode = event.target.value as "template" | "manual";
              setMode(nextMode);
              if (nextMode === "template" && templates[0]) chooseTemplate(templateId || templates[0].id);
            }}
          />
          {mode === "template" ? (
            <Select
              label="Szablon"
              value={templateId}
              options={templates.map((template) => ({
                value: template.id,
                label: `${template.name} · ${DISCIPLINE_META[template.discipline].label}`,
              }))}
              onChange={(event) => chooseTemplate(event.target.value)}
            />
          ) : (
            <Select
              label="Kategoria sportu"
              value={discipline}
              options={DISCIPLINE_OPTIONS}
              onChange={(event) => setDiscipline(event.target.value as Discipline)}
            />
          )}
        </div>

        <div className="sport-planner-form__grid">
          <Input
            label="Nazwa"
            value={title}
            data-autofocus
            onChange={(event) => { setTitle(event.target.value); setError(""); }}
          />
          <Input
            label="Czas (min)"
            type="number"
            min="5"
            max="600"
            step="5"
            value={duration}
            onChange={(event) => { setDuration(event.target.value); setError(""); }}
          />
        </div>

        <div className={`sport-planner-form__schedule ${(workout && editScope === "series") || (!workout && repeat === "selected") ? "sport-planner-form__schedule--series" : ""}`.trim()}>
          {(!workout || editScope !== "series") && repeat !== "selected" && (
            <Select
              label="Tydzień"
              value={week}
              options={Array.from({ length: totalWeeks }, (_, index) => ({
                value: String(index + 1),
                label: `Tydzień ${index + 1}`,
              }))}
              onChange={(event) => setWeek(event.target.value)}
            />
          )}
          <Select
            label="Dzień"
            value={day}
            options={DAY_LABELS.map((item, index) => ({ value: String(index), label: item.full }))}
            onChange={(event) => setDay(event.target.value)}
          />
          <Input
            label="Godzina opcjonalnie"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>

        {!workout && !indefinite && (
          <Select
            label="Powtarzalność"
            value={repeat}
            options={[
              { value: "once", label: "Tylko ten termin" },
              { value: "weekly", label: "Co tydzień do końca planu" },
              { value: "selected", label: "Tylko wybrane tygodnie" },
            ]}
            hint={repeat === "weekly"
              ? `Szablon zostanie dodany od tygodnia ${week} do ${cycle.weeks}.`
              : repeat === "selected"
                ? "Możesz wskazać dowolną kombinację tygodni."
                : undefined}
            onChange={(event) => {
              const nextRepeat = event.target.value as "once" | "weekly" | "selected";
              setRepeat(nextRepeat);
              if (nextRepeat === "selected" && !selectedWeeks.length) setSelectedWeeks([Number(week)]);
            }}
          />
        )}
        {!workout && !indefinite && repeat === "selected" && (
          <fieldset className="sport-repeat-weeks">
            <legend>Wybierz tygodnie</legend>
            <div>
              {Array.from({ length: totalWeeks }, (_, index) => index + 1).map((weekNumber) => {
                const selected = selectedWeeks.includes(weekNumber);
                return (
                  <button
                    key={weekNumber}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedWeeks((current) => selected
                        ? current.filter((item) => item !== weekNumber)
                        : [...current, weekNumber]);
                      setError("");
                    }}
                  >
                    T{weekNumber}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        <Input
          label="Notatka opcjonalnie"
          placeholder="np. spokojne tempo, bez maksów"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {error && <p className="sport-planner-form__error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
