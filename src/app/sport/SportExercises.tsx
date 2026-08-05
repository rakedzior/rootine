import { useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Dumbbell,
  Heart,
  MoreHorizontal,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  DetailPanel,
  EmptyState,
  Input,
  Menu,
  MenuItem,
  MenuTrigger,
  Modal,
  Select,
} from "../ui";
import { createPlannerId } from "./plannerModel";
import { exerciseCountForTemplate, exercisePreview } from "./sportRecordHelpers";
import { DISCIPLINE_META } from "./theme";
import type { Discipline, Exercise, ExerciseType, WorkoutTemplate } from "./model";

const MUSCLES = ["Wszystkie partie", "Klatka piersiowa", "Plecy", "Barki", "Czworogłowe uda", "Pośladki", "Dwugłowe uda", "Core"];
const EQUIPMENT = ["Każdy sprzęt", "Sztanga", "Hantle", "Wyciąg", "Guma oporowa", "Mata", "Bez sprzętu"];
const TYPES: Array<{ value: ExerciseType | "all"; label: string }> = [
  { value: "all", label: "Każdy typ" },
  { value: "strength", label: "Siłowe" },
  { value: "duration", label: "Czasowe" },
  { value: "distance", label: "Dystansowe" },
  { value: "mobility", label: "Mobilność" },
  { value: "stage", label: "Etapowe" },
];

function exerciseTypeLabel(type: ExerciseType) {
  return TYPES.find((item) => item.value === type)?.label ?? type;
}

function parametersLabel(exercise: Exercise) {
  const parameters = exercise.defaultParameters;
  if (parameters.repRange || parameters.sets) {
    return `${parameters.sets ?? 3} × ${parameters.repRange ?? "—"} · ${parameters.restSeconds ?? 0} s`;
  }
  if (parameters.durationSeconds) return `${Math.round(parameters.durationSeconds / 60)} min`;
  if (parameters.distanceMeters) return `${(parameters.distanceMeters / 1000).toLocaleString("pl-PL")} km`;
  return "Bez domyślnych parametrów";
}

function createBlankExercise(): Exercise {
  const now = new Date().toISOString();
  return {
    id: createPlannerId("exercise"),
    name: "",
    sportCategory: "strength",
    primaryMuscle: "Klatka piersiowa",
    secondaryMuscles: [],
    equipment: [],
    exerciseType: "strength",
    description: "",
    instructions: "",
    defaultParameters: { sets: 3, repRange: "8–12", restSeconds: 90, rir: 2 },
    favorite: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function SportExercises({
  exercises,
  templates,
  onCreate,
  onUpdate,
  onDuplicate,
  onDelete,
  onSelect,
}: {
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  onCreate: (exercise: Exercise) => void;
  onUpdate: (exercise: Exercise) => void;
  onDuplicate: (exercise: Exercise) => void;
  onDelete: (exercise: Exercise) => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState<Discipline | "all">("all");
  const [muscle, setMuscle] = useState("Wszystkie partie");
  const [equipment, setEquipment] = useState("Każdy sprzęt");
  const [type, setType] = useState<ExerciseType | "all">("all");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [sort, setSort] = useState<"name" | "updated">("name");
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.toLocaleLowerCase("pl-PL").trim();
    return exercises
      .filter((exercise) => status === "archived" ? exercise.archived : !exercise.archived)
      .filter((exercise) => discipline === "all" || exercise.sportCategory === discipline)
      .filter((exercise) => muscle === "Wszystkie partie" || exercise.primaryMuscle === muscle)
      .filter((exercise) => equipment === "Każdy sprzęt" || exercise.equipment.includes(equipment) || (equipment === "Bez sprzętu" && !exercise.equipment.length))
      .filter((exercise) => type === "all" || exercise.exerciseType === type)
      .filter((exercise) => !favoriteOnly || exercise.favorite)
      .filter((exercise) => !normalized || [exercise.name, exercise.description, exercise.primaryMuscle, ...exercise.equipment].some((value) => value.toLocaleLowerCase("pl-PL").includes(normalized)))
      .sort((left, right) => sort === "name"
        ? left.name.localeCompare(right.name, "pl")
        : right.updatedAt.localeCompare(left.updatedAt));
  }, [discipline, equipment, exercises, favoriteOnly, muscle, query, sort, status, type]);

  const submitEditor = (exercise: Exercise) => {
    if (!exercise.name.trim()) return;
    if (exercises.some((candidate) => candidate.id === exercise.id)) onUpdate(exercise);
    else onCreate(exercise);
    setEditing(null);
  };

  return (
    <section className="sport-record-view sport-exercises-view" aria-label="Biblioteka ćwiczeń">
      <div className="sport-record-view__intro">
        <div>
          <p>Jedna biblioteka dla siłowni, rehabilitacji, mobilności i treningów etapowych.</p>
        </div>
        <Button variant="primary" leadingIcon={<Plus size={14} />} onClick={() => setEditing(createBlankExercise())}>
          Dodaj ćwiczenie
        </Button>
      </div>

      <div className="sport-record-toolbar" role="toolbar" aria-label="Filtry ćwiczeń">
        <Input
          aria-label="Szukaj ćwiczeń"
          className="sport-record-toolbar__search"
          placeholder="Szukaj po nazwie, partii lub sprzęcie…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select compact aria-label="Kategoria sportu" value={discipline} options={[{ value: "all", label: "Każdy sport" }, ...Object.entries(DISCIPLINE_META).map(([value, meta]) => ({ value, label: meta.label }))]} onChange={(event) => setDiscipline(event.target.value as Discipline | "all")} />
        <Select compact aria-label="Partia główna" value={muscle} options={MUSCLES.map((value) => ({ value, label: value }))} onChange={(event) => setMuscle(event.target.value)} />
        <Select compact aria-label="Sprzęt" value={equipment} options={EQUIPMENT.map((value) => ({ value, label: value }))} onChange={(event) => setEquipment(event.target.value)} />
        <Select compact aria-label="Typ ćwiczenia" value={type} options={TYPES.map((item) => ({ value: item.value, label: item.label }))} onChange={(event) => setType(event.target.value as ExerciseType | "all")} />
        <Button variant={favoriteOnly ? "quiet" : "ghost"} size="sm" leadingIcon={<Heart size={13} fill={favoriteOnly ? "currentColor" : "none"} />} aria-pressed={favoriteOnly} onClick={() => setFavoriteOnly((current) => !current)}>
          Ulubione
        </Button>
        <Select compact aria-label="Status biblioteki" value={status} options={[{ value: "active", label: "Aktywne" }, { value: "archived", label: "Zarchiwizowane" }]} onChange={(event) => setStatus(event.target.value as "active" | "archived")} />
        <Select compact aria-label="Sortowanie" value={sort} options={[{ value: "name", label: "Nazwa A–Z" }, { value: "updated", label: "Ostatnio zmienione" }]} onChange={(event) => setSort(event.target.value as "name" | "updated")} />
      </div>

      <Card padding="none" className="sport-record-table">
        <div className="sport-record-table__head" role="row">
          <span>Nazwa</span><span>Partia główna</span><span>Sprzęt</span><span>Domyślne parametry</span><span>W szablonach</span><span aria-hidden="true" />
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="Brak ćwiczeń" description="Zmień filtry albo dodaj pierwsze ćwiczenie do biblioteki." action={<Button variant="quiet" onClick={() => setEditing(createBlankExercise())}>Dodaj ćwiczenie</Button>} />
        ) : filtered.map((exercise) => {
          const usage = templates.reduce((count, template) => count + (exerciseCountForTemplate(template, exercise.id) > 0 ? 1 : 0), 0);
          return (
            <div key={exercise.id} className="sport-record-table__row" role="row">
              <button type="button" className="sport-record-table__main" onClick={() => onSelect(exercise.id)}>
                <span className="sport-record-table__name"><Dumbbell size={14} aria-hidden="true" />{exercise.name}</span>
                <span className="sport-record-table__sub">{exerciseTypeLabel(exercise.exerciseType)}{exercise.favorite && <Heart size={11} fill="currentColor" aria-label="Ulubione" />}</span>
              </button>
              <span>{exercise.primaryMuscle}</span>
              <span>{exercise.equipment.length ? exercise.equipment.join(", ") : "Bez sprzętu"}</span>
              <span className="sport-data">{parametersLabel(exercise)}</span>
              <span className="sport-data">{usage}</span>
              <span className="sport-record-table__actions">
                <MenuTrigger open={menuId === exercise.id} menuId={`exercise-menu-${exercise.id}`} className="sport-icon-button" aria-label={`Akcje: ${exercise.name}`} onClick={() => setMenuId((current) => current === exercise.id ? null : exercise.id)}><MoreHorizontal size={15} /></MenuTrigger>
                {menuId === exercise.id && (
                  <Menu id={`exercise-menu-${exercise.id}`} className="sport-row-menu" onDismiss={() => setMenuId(null)} triggerRef={undefined}>
                    <MenuItem leadingIcon={<Pencil size={13} />} onClick={() => { setEditing(exercise); setMenuId(null); }}>Edytuj</MenuItem>
                    <MenuItem leadingIcon={<Copy size={13} />} onClick={() => { onDuplicate(exercise); setMenuId(null); }}>Duplikuj</MenuItem>
                    <MenuItem leadingIcon={<Heart size={13} />} onClick={() => { onUpdate({ ...exercise, favorite: !exercise.favorite, updatedAt: new Date().toISOString() }); setMenuId(null); }}>{exercise.favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}</MenuItem>
                    <MenuItem leadingIcon={exercise.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} onClick={() => { onUpdate({ ...exercise, archived: !exercise.archived, updatedAt: new Date().toISOString() }); setMenuId(null); }}>{exercise.archived ? "Przywróć" : "Archiwizuj"}</MenuItem>
                    <MenuItem tone="danger" leadingIcon={<Trash2 size={13} />} onClick={() => { onDelete(exercise); setMenuId(null); }}>Usuń</MenuItem>
                  </Menu>
                )}
              </span>
            </div>
          );
        })}
      </Card>

      {editing && <ExerciseEditor exercise={editing} onClose={() => setEditing(null)} onSubmit={submitEditor} />}
    </section>
  );
}

function ExerciseEditor({ exercise, onClose, onSubmit }: { exercise: Exercise; onClose: () => void; onSubmit: (exercise: Exercise) => void }) {
  const [draft, setDraft] = useState(exercise);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof Exercise>(key: K, value: Exercise[K]) => setDraft((current) => ({ ...current, [key]: value, updatedAt: new Date().toISOString() }));
  const setParameters = (key: keyof Exercise["defaultParameters"], value: number | string | undefined) => setDraft((current) => ({ ...current, updatedAt: new Date().toISOString(), defaultParameters: { ...current.defaultParameters, [key]: value } }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.name.trim().length < 2) { setError("Podaj nazwę ćwiczenia."); return; }
    onSubmit({ ...draft, name: draft.name.trim(), description: draft.description.trim(), instructions: draft.instructions.trim() });
  };
  return (
    <Modal title={exercise.name ? "Edytuj ćwiczenie" : "Nowe ćwiczenie"} eyebrow="Biblioteka ćwiczeń" description="Podstawowe pola wystarczą, a zaawansowane ustawienia możesz rozwinąć później." size="lg" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Anuluj</Button><Button variant="primary" type="submit" form="exercise-editor-form">Zapisz ćwiczenie</Button></>}>
      <form id="exercise-editor-form" className="sport-exercise-editor" onSubmit={submit}>
        <div className="sport-planner-form__grid">
          <Input label="Nazwa" value={draft.name} data-autofocus onChange={(event) => set("name", event.target.value)} />
          <Select label="Kategoria sportu" value={draft.sportCategory} options={Object.entries(DISCIPLINE_META).map(([value, meta]) => ({ value, label: meta.label }))} onChange={(event) => set("sportCategory", event.target.value as Discipline)} />
        </div>
        <div className="sport-planner-form__grid">
          <Input label="Partia główna" value={draft.primaryMuscle} onChange={(event) => set("primaryMuscle", event.target.value)} />
          <Input label="Sprzęt" placeholder="np. Sztanga, ławka" value={draft.equipment.join(", ")} onChange={(event) => set("equipment", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} />
        </div>
        <div className="sport-planner-form__grid">
          <Select label="Typ ćwiczenia" value={draft.exerciseType} options={TYPES.filter((item) => item.value !== "all").map((item) => ({ value: item.value, label: item.label }))} onChange={(event) => set("exerciseType", event.target.value as ExerciseType)} />
          <Input label="Partie dodatkowe" placeholder="np. Triceps, barki" value={draft.secondaryMuscles.join(", ")} onChange={(event) => set("secondaryMuscles", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} />
        </div>
        <Input label="Krótki opis" value={draft.description} onChange={(event) => set("description", event.target.value)} />
        <label className="sport-field"><span>Instrukcja</span><textarea value={draft.instructions} rows={3} onChange={(event) => set("instructions", event.target.value)} /></label>
        <button type="button" className="sport-disclosure" aria-expanded={advanced} onClick={() => setAdvanced((current) => !current)}><SlidersHorizontal size={14} />{advanced ? "Ukryj więcej ustawień" : "Więcej ustawień"}</button>
        {advanced && (
          <div className="sport-exercise-editor__advanced">
            <div className="sport-planner-form__grid">
              <Input label="Liczba serii" type="number" min="1" max="20" value={draft.defaultParameters.sets ?? ""} onChange={(event) => setParameters("sets", event.target.value ? Number(event.target.value) : undefined)} />
              <Input label="Zakres powtórzeń" placeholder="np. 6–8" value={draft.defaultParameters.repRange ?? ""} onChange={(event) => setParameters("repRange", event.target.value)} />
            </div>
            <div className="sport-planner-form__grid">
              <Input label="Czas trwania (s)" type="number" min="0" value={draft.defaultParameters.durationSeconds ?? ""} onChange={(event) => setParameters("durationSeconds", event.target.value ? Number(event.target.value) : undefined)} />
              <Input label="Dystans (m)" type="number" min="0" value={draft.defaultParameters.distanceMeters ?? ""} onChange={(event) => setParameters("distanceMeters", event.target.value ? Number(event.target.value) : undefined)} />
            </div>
            <div className="sport-planner-form__grid">
              <Input label="Przerwa (s)" type="number" min="0" value={draft.defaultParameters.restSeconds ?? ""} onChange={(event) => setParameters("restSeconds", event.target.value ? Number(event.target.value) : undefined)} />
              <Input label="RIR / RPE" placeholder="np. RIR 2" value={draft.defaultParameters.rir ?? draft.defaultParameters.rpe ?? ""} onChange={(event) => setParameters("rir", event.target.value ? Number(event.target.value) : undefined)} />
            </div>
            <Input label="Tempo" placeholder="np. 3–1–1" value={draft.defaultParameters.tempo ?? ""} onChange={(event) => setParameters("tempo", event.target.value)} />
            <Input label="Link instruktażowy (opcjonalnie)" type="url" value={draft.instructionalLink ?? ""} onChange={(event) => set("instructionalLink", event.target.value || undefined)} />
          </div>
        )}
        {error && <p className="sport-planner-form__error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

export function ExerciseDetailPanel({ exercise, templates, onClose, onEdit, onDuplicate, onUpdate }: { exercise?: Exercise; templates: WorkoutTemplate[]; onClose: () => void; onEdit: () => void; onDuplicate: () => void; onUpdate: (exercise: Exercise) => void }) {
  if (!exercise) return null;
  const usage = templates.filter((template) => exerciseCountForTemplate(template, exercise.id) > 0);
  return (
    <DetailPanel label={`Szczegóły ćwiczenia: ${exercise.name}`} onDismiss={onClose} className="sport-record-detail">
      <header className="sport-record-detail__header"><div><span className="sport-panel-kicker">Ćwiczenie</span><h2>{exercise.name}</h2><Badge tone="primary">{DISCIPLINE_META[exercise.sportCategory].label}</Badge></div><Button variant="ghost" size="sm" leadingIcon={<X size={14} />} aria-label="Zamknij szczegóły" onClick={onClose} /></header>
      <div className="sport-record-detail__actions"><Button variant="primary" size="sm" leadingIcon={<Pencil size={13} />} onClick={onEdit}>Edytuj</Button><Button variant="quiet" size="sm" leadingIcon={<Copy size={13} />} onClick={onDuplicate}>Duplikuj</Button><Button variant="ghost" size="sm" leadingIcon={<Heart size={13} fill={exercise.favorite ? "currentColor" : "none"} />} onClick={() => onUpdate({ ...exercise, favorite: !exercise.favorite, updatedAt: new Date().toISOString() })}>{exercise.favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}</Button></div>
      <p className="sport-record-detail__lead">{exercisePreview(exercise)}</p>
      <dl className="sport-detail-list"><div><dt>Partia główna</dt><dd>{exercise.primaryMuscle}</dd></div><div><dt>Partie dodatkowe</dt><dd>{exercise.secondaryMuscles.join(", ") || "—"}</dd></div><div><dt>Sprzęt</dt><dd>{exercise.equipment.join(", ") || "Bez sprzętu"}</dd></div><div><dt>Domyślne parametry</dt><dd className="sport-data">{parametersLabel(exercise)}</dd></div></dl>
      <section className="sport-record-detail__section"><h3>Opis</h3><p>{exercise.description || "Brak opisu."}</p><h3>Instrukcja</h3><p>{exercise.instructions || "Brak instrukcji."}</p></section>
      <section className="sport-record-detail__section"><h3>Użycie w szablonach <span className="sport-data">{usage.length}</span></h3>{usage.length ? <ul>{usage.map((template) => <li key={template.id}>{template.name}</li>)}</ul> : <p>Ćwiczenie nie jest jeszcze używane w szablonie.</p>}</section>
    </DetailPanel>
  );
}
