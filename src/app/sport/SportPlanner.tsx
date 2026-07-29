import { useMemo, useState, type FormEvent } from "react";
import {
  CalendarClock,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Copy,
  Ellipsis,
  GripVertical,
  Pencil,
  Plus,
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
  cycleWeekDate,
  cycleWorkoutDate,
  type CycleWorkout,
  type TrainingCycle,
} from "./plannerModel";
import {
  formatShortDate,
  fromDateKey,
  normalizeSearch,
  startOfWeekKey,
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
  onEdit,
  onDuplicate,
  onAddToCycle,
  onUseToday,
}: {
  templates: WorkoutTemplate[];
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
                            <CalendarRange size={13} aria-hidden="true" /> Dodaj do cyklu
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

function WeekBoard({
  cycle,
  activeWeek,
  selectedWorkoutId,
  onWeekChange,
  onMove,
  onSelect,
  onAdd,
}: {
  cycle: TrainingCycle;
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
  const focusWeekTab = (week: number) => {
    window.requestAnimationFrame(() => {
      document.getElementById(`sport-week-tab-${week}`)?.focus();
    });
  };

  return (
    <section className="sport-cycle-weeks" aria-labelledby="cycle-week-heading">
      <div className="sport-week-navigation">
        <div>
          <h3 id="cycle-week-heading">Tydzień {activeWeek} z {cycle.weeks}</h3>
          <p>{formatShortDate(cycleWeekDate(cycle, activeWeek, 0))} — {formatShortDate(cycleWeekDate(cycle, activeWeek, 6))}</p>
        </div>
        <div className="sport-week-navigation__arrows">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Poprzedni tydzień"
            disabled={activeWeek === 1}
            onClick={() => onWeekChange(activeWeek - 1)}
          >
            <ChevronLeft size={13} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Następny tydzień"
            disabled={activeWeek === cycle.weeks}
            onClick={() => onWeekChange(activeWeek + 1)}
          >
            <ChevronRight size={13} />
          </Button>
        </div>
      </div>

      <div className="sport-week-strip" role="tablist" aria-label="Tygodnie cyklu">
        {Array.from({ length: cycle.weeks }, (_, index) => index + 1).map((week) => {
          const count = cycle.workouts.filter((workout) => workout.week === week).length;
          return (
            <button
              key={week}
              type="button"
              role="tab"
              id={`sport-week-tab-${week}`}
              aria-controls="sport-cycle-week-panel"
              aria-selected={week === activeWeek}
              tabIndex={week === activeWeek ? 0 : -1}
              className={`sport-week-tab ${dropTarget === `week-${week}` ? "is-drop-target" : ""}`.trim()}
              onClick={() => onWeekChange(week)}
              onKeyDown={(event) => {
                let nextWeek: number;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") nextWeek = week === cycle.weeks ? 1 : week + 1;
                else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextWeek = week === 1 ? cycle.weeks : week - 1;
                else if (event.key === "Home") nextWeek = 1;
                else if (event.key === "End") nextWeek = cycle.weeks;
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
                const id = event.dataTransfer.getData("text/sport-cycle-workout") || draggedId;
                if (id) {
                  onMove(id, week);
                  onWeekChange(week);
                }
                setDraggedId(null);
                setDropTarget(null);
              }}
            >
              <span>T{week}</span>
              <small>{count} tr.</small>
            </button>
          );
        })}
      </div>

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
                className={`sport-cycle-day ${dropTarget === `day-${dayIndex}` ? "is-drop-target" : ""}`.trim()}
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
                    <strong>{day.short}</strong>
                    <span>{formatShortDate(dateKey)}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label={`Dodaj trening: ${day.full}`}
                    onClick={() => onAdd(activeWeek, dayIndex)}
                  >
                    <Plus size={11} />
                  </Button>
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
                          else if (nextWeek < cycle.weeks) {
                            nextWeek += 1;
                            nextDay = 0;
                          } else return;
                        } else if (event.key === "ArrowUp") {
                          if (nextWeek <= 1) return;
                          nextWeek -= 1;
                        } else if (event.key === "ArrowDown") {
                          if (nextWeek >= cycle.weeks) return;
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
                      </span>
                      <DisciplineLabel discipline={workout.discipline} compact />
                    </button>
                  ))}
                  {!dayWorkouts.length && (
                    <button type="button" className="sport-cycle-day__empty" onClick={() => onAdd(activeWeek, dayIndex)}>
                      Dodaj trening
                    </button>
                  )}
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
  activeWeek,
  selectedWorkoutId,
  isDirty,
  onWeekChange,
  onCreateCycle,
  onEditCycle,
  onAddWorkout,
  onSelectWorkout,
  onMoveWorkout,
}: {
  cycle: TrainingCycle | null;
  activeWeek: number;
  selectedWorkoutId?: string | null;
  isDirty: boolean;
  onWeekChange: (week: number) => void;
  onCreateCycle: () => void;
  onEditCycle: () => void;
  onAddWorkout: (week: number, day: number) => void;
  onSelectWorkout: (workout: CycleWorkout) => void;
  onMoveWorkout: (id: string, week: number, day?: number) => void;
}) {
  if (!cycle) {
    return (
      <EmptyState
        title="Brak cyklu treningowego"
        description="Utwórz jeden cykl, wybierz liczbę tygodni i zacznij przypisywać szablony do dni."
        action={<Button variant="primary" onClick={onCreateCycle}>Utwórz cykl</Button>}
      />
    );
  }

  const range = cycleDateRange(cycle);
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
            <p>{formatLongDate(range.start)} — {formatLongDate(range.end)}</p>
          </div>
        </div>
        <div className="sport-cycle-summary__facts">
          <span><strong>{cycle.weeks}</strong> tygodni</span>
          <span><strong>{cycle.workouts.length}</strong> treningów</span>
          <span><strong>{weekWorkouts.length}</strong> w tym tygodniu</span>
        </div>
        <div className="sport-cycle-summary__actions">
          <Button variant="quiet" size="sm" onClick={onEditCycle}>Ustawienia cyklu</Button>
          <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={() => onAddWorkout(activeWeek, 0)}>
            Dodaj trening
          </Button>
        </div>
      </div>

      <WeekBoard
        cycle={cycle}
        activeWeek={activeWeek}
        selectedWorkoutId={selectedWorkoutId}
        onWeekChange={onWeekChange}
        onMove={onMoveWorkout}
        onSelect={onSelectWorkout}
        onAdd={onAddWorkout}
      />

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
    </div>
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
  const [name, setName] = useState(cycle?.name ?? "Cykl 12 tygodni");
  const [startDate, setStartDate] = useState(cycle?.startDate ?? startOfWeekKey());
  const [weeks, setWeeks] = useState(String(cycle?.weeks ?? 12));
  const [error, setError] = useState("");
  const nextWeeks = Number(weeks);
  const removedCount = cycle && Number.isFinite(nextWeeks)
    ? cycle.workouts.filter((workout) => workout.week > nextWeeks).length
    : 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedWeeks = Number(weeks);
    if (!name.trim()) {
      setError("Podaj nazwę cyklu.");
      return;
    }
    if (!startDate) {
      setError("Wybierz datę rozpoczęcia.");
      return;
    }
    if (!Number.isInteger(parsedWeeks) || parsedWeeks < 1 || parsedWeeks > 52) {
      setError("Podaj długość od 1 do 52 tygodni.");
      return;
    }
    const monday = fromDateKey(startDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const normalizedStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    onSubmit({
      id: cycle?.id ?? createPlannerId("cycle"),
      name: name.trim(),
      startDate: normalizedStart,
      weeks: parsedWeeks,
      workouts: cycle?.workouts.filter((workout) => workout.week <= parsedWeeks) ?? [],
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Modal
      title={cycle ? "Ustawienia cyklu" : "Nowy cykl treningowy"}
      eyebrow="Jeden aktywny cykl"
      description="Ustal początek i liczbę tygodni. Treningi przypiszesz bezpośrednio w kalendarzu."
      width={620}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button type="submit" form="sport-cycle-form" variant="primary">
            {cycle ? "Zapisz ustawienia" : "Utwórz cykl"}
          </Button>
        </>
      )}
    >
      <form id="sport-cycle-form" className="sport-planner-form" onSubmit={submit}>
        <Input
          label="Nazwa cyklu"
          placeholder="np. Przygotowanie jesienne"
          value={name}
          data-autofocus
          onChange={(event) => { setName(event.target.value); setError(""); }}
        />
        <div className="sport-planner-form__grid">
          <DatePicker
            label="Start"
            value={startDate}
            hint="Cykl zacznie się w poniedziałek tego tygodnia."
            onChange={(nextValue) => { setStartDate(nextValue); setError(""); }}
          />
          <Input
            label="Liczba tygodni"
            type="number"
            min="1"
            max="52"
            step="1"
            value={weeks}
            onChange={(event) => { setWeeks(event.target.value); setError(""); }}
          />
        </div>
        {removedCount > 0 && (
          <p className="sport-planner-form__warning">
            Skrócenie cyklu usunie {removedCount} {removedCount === 1 ? "trening" : "treningów"} spoza nowego zakresu.
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
    workout ? (initialTemplate ? "template" : "manual") : templates.length ? "template" : "manual",
  );
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? templates[0]?.id ?? "");
  const firstTemplate = initialTemplate ?? templates[0];
  const [title, setTitle] = useState(workout?.title ?? firstTemplate?.name ?? "");
  const [discipline, setDiscipline] = useState<Discipline>(workout?.discipline ?? firstTemplate?.discipline ?? "strength");
  const [duration, setDuration] = useState(String(workout?.durationMinutes ?? firstTemplate?.durationMinutes ?? 45));
  const [week, setWeek] = useState(String(workout?.week ?? initialWeek));
  const [day, setDay] = useState(String(workout?.day ?? initialDay));
  const [time, setTime] = useState(workout?.time ?? "");
  const [note, setNote] = useState(workout?.note ?? "");
  const [repeat, setRepeat] = useState<"once" | "weekly" | "selected">("once");
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([initialWeek]);
  const [error, setError] = useState("");

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
      || parsedWeek > cycle.weeks
      || !Number.isInteger(parsedDay)
      || parsedDay < 0
      || parsedDay > 6
    ) {
      setError("Wybierz tydzień i dzień należące do cyklu.");
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
    const weeks = workout || repeat === "once"
      ? [parsedWeek]
      : repeat === "weekly"
        ? Array.from({ length: cycle.weeks - parsedWeek + 1 }, (_, index) => parsedWeek + index)
        : [...selectedWeeks].sort((left, right) => left - right);
    const seriesId = workout?.seriesId ?? (weeks.length > 1 ? createPlannerId("series") : undefined);
    const next = weeks.map((targetWeek) => ({
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
      eyebrow={`Tydzień ${workout?.week ?? initialWeek}`}
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
              options={Array.from({ length: cycle.weeks }, (_, index) => ({
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

        {!workout && (
          <Select
            label="Powtarzalność"
            value={repeat}
            options={[
              { value: "once", label: "Tylko ten termin" },
              { value: "weekly", label: "Co tydzień do końca cyklu" },
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
        {!workout && repeat === "selected" && (
          <fieldset className="sport-repeat-weeks">
            <legend>Wybierz tygodnie</legend>
            <div>
              {Array.from({ length: cycle.weeks }, (_, index) => index + 1).map((weekNumber) => {
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
