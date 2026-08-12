import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DetailPanel,
  EmptyState,
  Input,
  Menu,
  MenuItem,
  MenuTrigger,
  Modal,
  Select,
  SectionHeader,
} from "../ui";
import { createPlannerId } from "./plannerModel";
import { DISCIPLINE_META } from "./theme";
import {
  templateSections,
  type Discipline,
  type Exercise,
  type WorkoutExercise,
  type WorkoutTemplate,
  type WorkoutTemplateItem,
  type WorkoutTemplateSection,
  type WorkoutItemParameters,
  type WorkoutMetricMode,
  type WorkoutTemplateSeries,
} from "./model";

function itemLabel(item: WorkoutTemplateItem, exercises: Exercise[]) {
  if (item.exerciseId) return exercises.find((exercise) => exercise.id === item.exerciseId)?.name ?? "Ćwiczenie usunięte z biblioteki";
  return item.stageDefinition?.name ?? "Własny etap";
}

const metricModeOptions = [
  { value: "strength", label: "Siła · powtórzenia i ciężar" },
  { value: "time", label: "Czas" },
  { value: "distance", label: "Dystans" },
  { value: "time-distance", label: "Czas i dystans" },
  { value: "all", label: "Wszystkie metryki" },
] satisfies Array<{ value: WorkoutMetricMode; label: string }>;

function defaultMetricMode(exercise?: Exercise): WorkoutMetricMode {
  if (exercise?.exerciseType === "duration" || exercise?.exerciseType === "mobility") return "time";
  if (exercise?.exerciseType === "distance") return "distance";
  return "strength";
}

function firstNumber(value: string | undefined) {
  return Number(value?.match(/\d+/)?.[0] ?? 0) || undefined;
}

function createTemplateSeries(parameters: WorkoutItemParameters | undefined, exercise?: Exercise): WorkoutTemplateSeries[] {
  const count = Math.max(1, Math.round(parameters?.sets ?? exercise?.defaultParameters.sets ?? 3));
  const fallback = {
    reps: firstNumber(parameters?.repRange ?? exercise?.defaultParameters.repRange),
    weight: parameters?.weight,
    rir: parameters?.rir ?? exercise?.defaultParameters.rir,
    rpe: parameters?.rpe ?? exercise?.defaultParameters.rpe,
    tempo: parameters?.tempo ?? exercise?.defaultParameters.tempo,
    durationSeconds: parameters?.durationSeconds ?? exercise?.defaultParameters.durationSeconds,
    distanceMeters: parameters?.distanceMeters ?? exercise?.defaultParameters.distanceMeters,
    restSeconds: parameters?.restSeconds ?? exercise?.defaultParameters.restSeconds,
  };
  return Array.from({ length: count }, (_, index) => ({
    ...fallback,
    ...(parameters?.series?.[index] ?? {}),
    id: parameters?.series?.[index]?.id ?? createPlannerId("template-series"),
  }));
}

function itemDetail(item: WorkoutTemplateItem, _exercises: Exercise[]) {
  const parameters = item.parametersOverride;
  if (item.stageDefinition) return item.stageDefinition.target ?? "Etap czasowy lub dystansowy";
  const firstSeries = parameters?.series?.[0];
  const parts = [`${parameters?.series?.length ?? parameters?.sets ?? 3} ser.`];
  if (firstSeries?.reps !== undefined) parts.push(`${firstSeries.reps} powt.`);
  else if (parameters?.repRange) parts.push(`${parameters.repRange} powt.`);
  if (firstSeries?.durationSeconds !== undefined) parts.push(`${firstSeries.durationSeconds} s`);
  else if (parameters?.durationSeconds !== undefined) parts.push(`${parameters.durationSeconds} s`);
  if (firstSeries?.distanceMeters !== undefined) parts.push(`${firstSeries.distanceMeters} m`);
  else if (parameters?.distanceMeters !== undefined) parts.push(`${parameters.distanceMeters} m`);
  const restSeconds = firstSeries?.restSeconds ?? parameters?.restSeconds;
  if (restSeconds !== undefined) parts.push(`${restSeconds} s przerwy`);
  const rir = firstSeries?.rir ?? parameters?.rir;
  const rpe = firstSeries?.rpe ?? parameters?.rpe;
  if (rir !== undefined) parts.push(`RIR ${rir}`);
  if (rpe !== undefined) parts.push(`RPE ${rpe}`);
  return parts.join(" · ");
}

function templateItems(template: WorkoutTemplate) {
  return templateSections(template)
    .sort((left, right) => left.order - right.order)
    .flatMap((section) => [...section.items].sort((left, right) => left.order - right.order));
}

function seriesCount(template: WorkoutTemplate) {
  return template.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
}

function muscleSummary(template: WorkoutTemplate, exercises: Exercise[]) {
  return [...new Set(templateItems(template).map((item) => item.exerciseId ? exercises.find((exercise) => exercise.id === item.exerciseId)?.primaryMuscle : undefined).filter(Boolean))].slice(0, 3).join(" · ");
}

export function SportTemplates({
  templates,
  exercises,
  onSave,
  onDuplicate,
  onDelete,
  onAddToPlan,
  onTrainToday,
  selectedId,
  onSelect,
  onCreateExercise,
  editRequest,
  onEditorClose,
}: {
  templates: WorkoutTemplate[];
  exercises: Exercise[];
  onSave: (template: WorkoutTemplate) => void;
  onDuplicate: (template: WorkoutTemplate) => void;
  onDelete: (template: WorkoutTemplate, returnFocusTarget: HTMLButtonElement) => void;
  onAddToPlan: (template: WorkoutTemplate) => void;
  onTrainToday: (template: WorkoutTemplate) => void;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onCreateExercise?: () => void;
  editRequest?: { id: string; token: number } | null;
  onEditorClose?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState<Discipline | "all">("all");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const actionTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (editRequest) setEditingId(editRequest.id);
  }, [editRequest]);
  const filtered = useMemo(() => {
    const normalized = query.toLocaleLowerCase("pl-PL").trim();
    return templates.filter((template) => !template.archived && (discipline === "all" || template.discipline === discipline)).filter((template) => !normalized || [template.name, template.description, template.discipline, ...templateItems(template).map((item) => itemLabel(item, exercises)), muscleSummary(template, exercises)].some((value) => value.toLocaleLowerCase("pl-PL").includes(normalized)));
  }, [discipline, exercises, query, templates]);
  const groups = Object.keys(DISCIPLINE_META) as Discipline[];
  return (
    <section className="sport-record-view sport-templates-view" aria-label="Szablony treningów">
      <Card padding="none" className="sport-record-table sport-template-table sport-record-module">
        <SectionHeader
          variant="label"
          className="sport-record-module__header"
          title="Zapisane szablony"
          description="Powtarzalne definicje treningów z liczbą ćwiczeń i serii."
          action={<Button variant="primary" size="sm" leadingIcon={<Plus size={13} />} onClick={() => setCreating(true)}>Dodaj szablon</Button>}
        />
        <div className="sport-record-toolbar" role="search" aria-label="Filtry szablonów">
          <Input fieldClassName="sport-record-toolbar__search-field" className="sport-record-toolbar__search-input" aria-label="Szukaj szablonów po nazwie, ćwiczeniu lub kategorii" placeholder="Szukaj szablonów…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Select compact fieldClassName="sport-record-toolbar__field" aria-label="Kategoria szablonu" value={discipline} options={[{ value: "all", label: "Wszystkie kategorie" }, ...groups.map((value) => ({ value, label: DISCIPLINE_META[value].label }))]} onChange={(event) => setDiscipline(event.target.value as Discipline | "all")} />
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="Brak pasujących szablonów" description="Zmień wyszukiwanie albo dodaj nowy szablon." />
        ) : (
          <div className="sport-record-table__body" role="table" aria-label="Zapisane szablony treningów">
          <div className="sport-record-table__head sport-template-table__head" role="row">
            <span role="columnheader">Nazwa</span>
            <span role="columnheader">Kategoria</span>
            <span role="columnheader">Ćwiczenia</span>
            <span role="columnheader">Serie</span>
            <span role="columnheader">Czas</span>
            <span role="columnheader" aria-label="Akcje" />
          </div>
          {filtered.map((template) => {
            const exerciseCount = template.exercises.length;
            const sets = seriesCount(template);
            return (
              <div key={template.id} className={`sport-record-table__row sport-template-table__row ${selectedId === template.id ? "is-selected" : ""}`} role="row">
                <div className="sport-record-table__main-cell" role="cell">
                  <button type="button" className="sport-record-table__main" onClick={() => onSelect(template.id)}>
                    <span className="sport-record-table__name">{template.name}</span>
                    <span className="sport-record-table__sub">{template.description || "Bez opisu"}</span>
                  </button>
                </div>
                <span role="cell">{DISCIPLINE_META[template.discipline].label}</span>
                <span role="cell" className="sport-data">{exerciseCount}</span>
                <span role="cell" className="sport-data">{sets}</span>
                <span role="cell" className="sport-data">{template.durationMinutes} min</span>
                <span role="cell" className="sport-record-table__actions">
                  <MenuTrigger
                    ref={(element) => {
                      if (element) actionTriggerRefs.current.set(template.id, element);
                      else actionTriggerRefs.current.delete(template.id);
                    }}
                    open={menuId === template.id}
                    menuId={`template-menu-${template.id}`}
                    className="sport-icon-button"
                    aria-label={`Akcje: ${template.name}`}
                    onClick={() => setMenuId((current) => current === template.id ? null : template.id)}
                  ><MoreHorizontal size={16} /></MenuTrigger>
                  {menuId === template.id && (
                    <Menu id={`template-menu-${template.id}`} className="sport-row-menu" onDismiss={() => setMenuId(null)}>
                      <MenuItem leadingIcon={<Pencil size={13} />} onClick={() => { setEditingId(template.id); setMenuId(null); }}>Edytuj</MenuItem>
                      <MenuItem leadingIcon={<Copy size={13} />} onClick={() => { onDuplicate(template); setMenuId(null); }}>Duplikuj</MenuItem>
                      <MenuItem onClick={() => { onAddToPlan(template); setMenuId(null); }}>Dodaj do planu</MenuItem>
                      <MenuItem onClick={() => { onTrainToday(template); setMenuId(null); }}>Trening na dziś</MenuItem>
                      <MenuItem tone="danger" leadingIcon={<Trash2 size={13} />} onClick={() => {
                        const returnFocusTarget = actionTriggerRefs.current.get(template.id);
                        if (returnFocusTarget) onDelete(template, returnFocusTarget);
                        setMenuId(null);
                      }}>Usuń</MenuItem>
                    </Menu>
                  )}
                </span>
              </div>
            );
          })}
          </div>
        )}
      </Card>
      {(editingId || creating) && <TemplateEditor key={editingId ?? "new"} template={editingId ? templates.find((template) => template.id === editingId) : undefined} exercises={exercises} onClose={() => { setEditingId(null); setCreating(false); onEditorClose?.(); }} onSave={(template) => { onSave(template); setEditingId(null); setCreating(false); onEditorClose?.(); }} onCreateExercise={onCreateExercise} />}
    </section>
  );
}

export function TemplateDetailPanel({ template, exercises, onClose, onEdit, onAddToPlan, onTrainToday }: { template?: WorkoutTemplate; exercises: Exercise[]; onClose: () => void; onEdit: () => void; onAddToPlan: () => void; onTrainToday: () => void }) {
  if (!template) return null;
  const items = templateItems(template);
  return <DetailPanel label={`Szczegóły szablonu: ${template.name}`} onDismiss={onClose} className="sport-record-detail sport-template-detail"><header className="sport-record-detail__header"><div><span className="sport-panel-kicker">Szablon</span><h2>{template.name}</h2><Badge tone="primary">{DISCIPLINE_META[template.discipline].label}</Badge></div><Button variant="ghost" size="sm" leadingIcon={<X size={13} />} aria-label="Zamknij szczegóły" onClick={onClose} /></header><div className="sport-record-detail__actions"><Button variant="primary" size="sm" leadingIcon={<Pencil size={13} />} onClick={onEdit}>Edytuj szablon</Button><Button variant="quiet" size="sm" onClick={onAddToPlan}>Dodaj do planu</Button><Button variant="ghost" size="sm" onClick={onTrainToday}>Trening na dziś</Button></div><p className="sport-record-detail__lead">{template.description || "Bez opisu"}</p><dl className="sport-detail-list"><div><dt>Szacowany czas</dt><dd className="sport-data">{template.durationMinutes} min</dd></div><div><dt>Zawartość</dt><dd>{items.length} {items.length === 1 ? "element" : "elementów"} · {seriesCount(template)} ser.</dd></div><div><dt>Główne partie</dt><dd>{muscleSummary(template, exercises) || "Nie dotyczy"}</dd></div></dl><section className="sport-record-detail__section"><h3>Pełna zawartość</h3><ol className="sport-template-detail__list">{items.map((item) => <li key={item.id}><span>{itemLabel(item, exercises)}</span><small>{itemDetail(item, exercises)}</small></li>)}</ol></section></DetailPanel>;
}

type EditorItem = WorkoutTemplateItem & { sectionId: string };

function flattenEditor(template: WorkoutTemplate | undefined): { sections: WorkoutTemplateSection[]; items: EditorItem[] } {
  const sections = template ? templateSections(template) : [{ id: createPlannerId("section"), name: "Część główna", order: 0, items: [] }];
  return { sections: sections.map((section) => ({ ...section, items: [] })), items: sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionId: section.id }))) };
}

function numberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function TemplateSeriesRow({ series, index, metricMode, onUpdate, onRemove }: {
  series: WorkoutTemplateSeries;
  index: number;
  metricMode: WorkoutMetricMode;
  onUpdate: (patch: Partial<WorkoutTemplateSeries>) => void;
  onRemove: () => void;
}) {
  const showStrength = metricMode === "strength" || metricMode === "all";
  const showTime = metricMode === "time" || metricMode === "time-distance" || metricMode === "all";
  const showDistance = metricMode === "distance" || metricMode === "time-distance" || metricMode === "all";
  const showRir = metricMode === "strength" || metricMode === "all";
  const showRpe = true;
  const showTempo = true;
  const showRest = true;
  const tempoLabel = metricMode === "strength" ? "Tempo" : "Tempo / pace";
  return (
    <div className="sport-template-editor__series-row">
      <span className="sport-template-editor__series-index" aria-label={`Seria ${index + 1}`}>{index + 1}</span>
      {showStrength && <Input label="Powtórzenia" aria-label={`Powtórzenia — seria ${index + 1}`} type="number" min="0" value={series.reps ?? ""} onChange={(event) => onUpdate({ reps: numberOrUndefined(event.target.value) })} />}
      {showStrength && <Input label="Ciężar (kg)" aria-label={`Ciężar — seria ${index + 1}`} type="number" min="0" step="0.5" value={series.weight ?? ""} onChange={(event) => onUpdate({ weight: numberOrUndefined(event.target.value) })} />}
      {showRir && <Input label="RIR" aria-label={`RIR — seria ${index + 1}`} type="number" min="0" max="10" value={series.rir ?? ""} onChange={(event) => onUpdate({ rir: numberOrUndefined(event.target.value) })} />}
      {showRpe && <Input label="RPE" aria-label={`RPE — seria ${index + 1}`} type="number" min="0" max="10" step="0.5" value={series.rpe ?? ""} onChange={(event) => onUpdate({ rpe: numberOrUndefined(event.target.value) })} />}
      {showTempo && <Input label={tempoLabel} aria-label={`${tempoLabel} — seria ${index + 1}`} placeholder={metricMode === "strength" ? "3-1-1" : "5:30/km"} value={series.tempo ?? ""} onChange={(event) => onUpdate({ tempo: event.target.value || undefined })} />}
      {showTime && <Input label="Czas (s)" aria-label={`Czas — seria ${index + 1}`} type="number" min="0" value={series.durationSeconds ?? ""} onChange={(event) => onUpdate({ durationSeconds: numberOrUndefined(event.target.value) })} />}
      {showDistance && <Input label="Dystans (m)" aria-label={`Dystans — seria ${index + 1}`} type="number" min="0" value={series.distanceMeters ?? ""} onChange={(event) => onUpdate({ distanceMeters: numberOrUndefined(event.target.value) })} />}
      {showRest && <Input label="Przerwa (s)" aria-label={`Przerwa — seria ${index + 1}`} type="number" min="0" value={series.restSeconds ?? ""} onChange={(event) => onUpdate({ restSeconds: numberOrUndefined(event.target.value) })} />}
      <Button variant="ghost" size="sm" className="ui-button--ghost-danger" aria-label={`Usuń serię ${index + 1}`} disabled={index === 0} onClick={onRemove}><Trash2 size={13} /></Button>
    </div>
  );
}

function TemplateEditorItem({ item, index, sectionItems, exercises, supersetOptions, expanded, dropTarget, isDragging, onToggle, onEnsureSeries, onUpdate, onUpdateSeries, onAddSeries, onRemoveSeries, onMoveUp, onMoveDown, onDuplicate, onRemove, onDragStart, onDragEnd, onSectionDragOver, onDrop }: {
  item: EditorItem;
  index: number;
  sectionItems: EditorItem[];
  exercises: Exercise[];
  supersetOptions: Array<{ id: string; label: string }>;
  expanded: boolean;
  dropTarget: boolean;
  isDragging: boolean;
  onToggle: () => void;
  onEnsureSeries: () => void;
  onUpdate: (id: string, patch: Partial<WorkoutTemplateItem>) => void;
  onUpdateSeries: (itemId: string, seriesId: string, patch: Partial<WorkoutTemplateSeries>) => void;
  onAddSeries: (itemId: string) => void;
  onRemoveSeries: (itemId: string, seriesId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onSectionDragOver: () => void;
  onDrop: () => void;
}) {
  const parameters = item.parametersOverride ?? {};
  const stage = item.stageDefinition;
  const exercise = item.exerciseId ? exercises.find((candidate) => candidate.id === item.exerciseId) : undefined;
  const metricMode = parameters.metricMode ?? defaultMetricMode(exercise);
  const series = parameters.series ?? [];
  const selectedSupersetIds = item.supersetExerciseIds ?? [];
  const selectedSupersetLabels = supersetOptions.filter((option) => selectedSupersetIds.includes(option.id)).map((option) => option.label);
  return (
    <div className={`sport-template-editor__item-wrap ${expanded ? "is-expanded" : ""} ${dropTarget ? "is-drop-target" : ""} ${isDragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); onSectionDragOver(); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(); }}>
      <div className="sport-template-editor__item">
        <Button variant="ghost" size="sm" className="sport-template-editor__item-expand" aria-label={expanded ? `Zwiń ${itemLabel(item, exercises)}` : `Rozwiń ${itemLabel(item, exercises)}`} aria-expanded={expanded} onClick={() => { onEnsureSeries(); onToggle(); }}>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</Button>
        <span className="sport-template-editor__drag-handle" draggable aria-label="Przeciągnij, aby zmienić kolejność" onDragStart={(event) => { event.stopPropagation(); onDragStart(); }} onDragEnd={onDragEnd}><GripVertical size={13} aria-hidden="true" /></span>
        <button type="button" className="sport-template-editor__item-toggle" aria-expanded={expanded} onClick={() => { onEnsureSeries(); onToggle(); }}>
          <span className="sport-template-editor__item-copy"><strong>{index + 1}. {itemLabel(item, exercises)}</strong><small>{itemDetail(item, exercises)}{item.supersetExerciseIds?.length ? ` · Superseria: ${item.supersetExerciseIds.length}` : item.supersetId ? ` · Superseria ${item.supersetId}` : ""}</small></span>
        </button>
        <div className="sport-template-editor__item-order-actions"><Button variant="ghost" size="sm" aria-label="Przenieś element wyżej" disabled={index === 0} onClick={onMoveUp}><ChevronUp size={13} /></Button><Button variant="ghost" size="sm" aria-label="Przenieś element niżej" disabled={index === sectionItems.length - 1} onClick={onMoveDown}><ChevronDown size={13} /></Button></div>
        <div className="sport-template-editor__item-actions"><Button variant="ghost" size="sm" aria-label="Duplikuj element" onClick={onDuplicate}><Copy size={13} /></Button><Button variant="ghost" size="sm" className="ui-button--ghost-danger" aria-label="Usuń element" onClick={onRemove}><Trash2 size={13} /></Button></div>
      </div>
      {expanded && (
        <div className="sport-template-editor__item-details">
          {stage ? (
            <>
              <div className="sport-planner-form__grid">
                <Input label="Nazwa etapu" value={stage.name} onChange={(event) => onUpdate(item.id, { stageDefinition: { ...stage, name: event.target.value } })} />
                <Input label="Cel / opis" value={stage.target ?? ""} onChange={(event) => onUpdate(item.id, { stageDefinition: { ...stage, target: event.target.value } })} />
              </div>
              <div className="sport-planner-form__grid">
                <Input label="Czas (s)" type="number" min="0" value={stage.durationSeconds ?? ""} onChange={(event) => onUpdate(item.id, { stageDefinition: { ...stage, durationSeconds: numberOrUndefined(event.target.value) } })} />
                <Input label="Dystans (m)" type="number" min="0" value={stage.distanceMeters ?? ""} onChange={(event) => onUpdate(item.id, { stageDefinition: { ...stage, distanceMeters: numberOrUndefined(event.target.value) } })} />
                <Input label="Tempo" value={stage.pace ?? ""} onChange={(event) => onUpdate(item.id, { stageDefinition: { ...stage, pace: event.target.value } })} />
              </div>
            </>
          ) : (
            <>
              <div className="sport-template-editor__series-toolbar"><div><strong>Serie</strong><small>Każdy wiersz ma własne parametry wykonania.</small></div><div className="sport-template-editor__series-toolbar-actions"><Select label="Metryki" compact value={metricMode} options={metricModeOptions} onChange={(event) => onUpdate(item.id, { parametersOverride: { ...parameters, metricMode: event.target.value as WorkoutMetricMode } })} /><Button variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={() => onAddSeries(item.id)}>Dodaj serię</Button></div></div>
              {!series.length && <Button variant="quiet" size="sm" onClick={onEnsureSeries}>Przygotuj serie</Button>}
              {series.length > 0 && <div className="sport-template-editor__series-scroll"><div className="sport-template-editor__series-list" data-metric-mode={metricMode}>{series.map((row, rowIndex) => <TemplateSeriesRow key={row.id} series={row} index={rowIndex} metricMode={metricMode} onUpdate={(patch) => onUpdateSeries(item.id, row.id, patch)} onRemove={() => onRemoveSeries(item.id, row.id)} />)}</div></div>}
            </>
          )}
          <div className="sport-template-editor__exercise-settings">
            <details className="sport-superset-picker">
              <summary><span>Superseria</span><small>{selectedSupersetLabels.length ? selectedSupersetLabels.join(" + ") : "Nieprzypisana"}</small></summary>
              <div className="sport-superset-picker__body"><p>Wybierz ćwiczenia wykonywane razem z tym ćwiczeniem.</p>{supersetOptions.length ? supersetOptions.map((option) => <Checkbox key={option.id} label={option.label} checked={selectedSupersetIds.includes(option.id)} onChange={(event) => { const nextIds = event.target.checked ? [...selectedSupersetIds, option.id] : selectedSupersetIds.filter((id) => id !== option.id); onUpdate(item.id, { supersetExerciseIds: nextIds.length ? nextIds : undefined, supersetId: undefined }); }} />) : <small>Dodaj inne ćwiczenie do szablonu, aby utworzyć superserię.</small>}</div>
            </details>
            <Input label="Notatka do ćwiczenia" placeholder="Wskazówka wykonania lub zakres" value={item.note ?? ""} onChange={(event) => onUpdate(item.id, { note: event.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ template, exercises, onClose, onSave, onCreateExercise }: { template?: WorkoutTemplate; exercises: Exercise[]; onClose: () => void; onSave: (template: WorkoutTemplate) => void; onCreateExercise?: () => void }) {
  const initial = useMemo(() => flattenEditor(template), [template]);
  const [name, setName] = useState(template?.name ?? "");
  const [discipline, setDiscipline] = useState<Discipline>(template?.discipline ?? "strength");
  const [description, setDescription] = useState(template?.description ?? "");
  const [duration, setDuration] = useState(String(template?.durationMinutes ?? 45));
  const [sections, setSections] = useState(initial.sections);
  const [items, setItems] = useState(initial.items);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [customSection, setCustomSection] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionDraftName, setSectionDraftName] = useState("");
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<string[]>([]);
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);
  const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(null);
  const [pendingSectionDelete, setPendingSectionDelete] = useState<WorkoutTemplateSection | null>(null);
  const pendingSectionDeleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  if (!template && !name && !sections.length) return null;
  const normalizeItems = (nextItems: EditorItem[]) => sections.flatMap((section) => nextItems.filter((item) => item.sectionId === section.id).sort((left, right) => left.order - right.order).map((item, index) => ({ ...item, order: index })));
  const updateItem = (id: string, patch: Partial<WorkoutTemplateItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const ensureSeries = (itemId: string) => setItems((current) => current.map((item) => {
    if (item.id !== itemId || !item.exerciseId || item.parametersOverride?.series?.length) return item;
    const exercise = exercises.find((candidate) => candidate.id === item.exerciseId);
    const parameters = item.parametersOverride ?? {};
    return { ...item, parametersOverride: { ...parameters, metricMode: parameters.metricMode ?? defaultMetricMode(exercise), series: createTemplateSeries(parameters, exercise) } };
  }));
  const updateSeries = (itemId: string, seriesId: string, patch: Partial<WorkoutTemplateSeries>) => setItems((current) => current.map((item) => {
    if (item.id !== itemId) return item;
    const series = item.parametersOverride?.series ?? [];
    return { ...item, parametersOverride: { ...item.parametersOverride, sets: series.length, series: series.map((row) => row.id === seriesId ? { ...row, ...patch } : row) } };
  }));
  const addSeries = (itemId: string) => setItems((current) => current.map((item) => {
    if (item.id !== itemId || !item.exerciseId) return item;
    const exercise = exercises.find((candidate) => candidate.id === item.exerciseId);
    const parameters = item.parametersOverride ?? {};
    const series = parameters.series?.length ? parameters.series : createTemplateSeries(parameters, exercise);
    const last = series[series.length - 1];
    return { ...item, parametersOverride: { ...parameters, sets: series.length + 1, series: [...series, { ...last, id: createPlannerId("template-series") }] } };
  }));
  const removeSeries = (itemId: string, seriesId: string) => setItems((current) => current.map((item) => {
    if (item.id !== itemId) return item;
    const series = item.parametersOverride?.series ?? [];
    const nextSeries = series.filter((row) => row.id !== seriesId);
    return { ...item, parametersOverride: { ...item.parametersOverride, sets: nextSeries.length, series: nextSeries } };
  }));
  const toggleItem = (itemId: string) => setExpandedItemIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
  const toggleSectionItems = (sectionId: string) => {
    const sectionItemIds = items.filter((item) => item.sectionId === sectionId && item.exerciseId).map((item) => item.id);
    const allExpanded = sectionItemIds.length > 0 && sectionItemIds.every((id) => expandedItemIds.includes(id));
    setExpandedItemIds((current) => allExpanded ? current.filter((id) => !sectionItemIds.includes(id)) : [...new Set([...current, ...sectionItemIds])]);
  };
  const toggleAllItems = () => {
    const itemIds = items.filter((item) => item.exerciseId).map((item) => item.id);
    const allExpanded = itemIds.length > 0 && itemIds.every((id) => expandedItemIds.includes(id));
    setExpandedItemIds(allExpanded ? [] : itemIds);
  };
  const toggleSectionCollapsed = (sectionId: string) => setCollapsedSectionIds((current) => current.includes(sectionId) ? current.filter((id) => id !== sectionId) : [...current, sectionId]);
  const moveSection = (id: string, beforeId?: string) => setSections((current) => {
    const moving = current.find((section) => section.id === id);
    if (!moving) return current;
    const rest = current.filter((section) => section.id !== id);
    const position = beforeId ? rest.findIndex((section) => section.id === beforeId) : rest.length;
    rest.splice(position < 0 ? rest.length : position, 0, moving);
    return rest.map((section, index) => ({ ...section, order: index }));
  });
  const moveSectionBy = (id: string, direction: -1 | 1) => setSections((current) => {
    const index = current.findIndex((section) => section.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
    const next = [...current];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next.map((section, sectionIndex) => ({ ...section, order: sectionIndex }));
  });
  const clearDragState = () => { setDraggedId(null); setDraggedSectionId(null); setDropTargetItemId(null); setDropTargetSectionId(null); };
  const openPicker = (sectionId?: string) => { setPickerSectionId(sectionId ?? sections[0]?.id ?? null); setPickerOpen(true); };
  const chooseExercise = (exercise: Exercise) => {
    const section = sections.find((candidate) => candidate.id === pickerSectionId) ?? sections[0];
    if (!section) return;
    const item: EditorItem = { id: createPlannerId("template-item"), sectionId: section.id, exerciseId: exercise.id, order: items.filter((candidate) => candidate.sectionId === section.id).length, parametersOverride: { ...exercise.defaultParameters }, note: "" };
    setItems((current) => [...current, item]);
    setPickerOpen(false);
  };
  const addSection = () => {
    const label = customSection.trim();
    if (label.length < 2) { setError("Podaj nazwę sekcji."); return; }
    setSections((current) => [...current, { id: createPlannerId("section"), name: label, order: current.length, items: [] }]);
    setCustomSection("");
    setError("");
  };
  const startSectionEdit = (section: WorkoutTemplateSection) => { setEditingSectionId(section.id); setSectionDraftName(section.name); };
  const saveSectionName = () => {
    const label = sectionDraftName.trim();
    if (!editingSectionId || label.length < 2) { setError("Nazwa sekcji musi mieć co najmniej 2 znaki."); return; }
    setSections((current) => current.map((section) => section.id === editingSectionId ? { ...section, name: label } : section));
    setEditingSectionId(null);
    setSectionDraftName("");
    setError("");
  };
  const commitSectionDelete = (section: WorkoutTemplateSection) => {
    const fallback = sections.find((candidate) => candidate.id !== section.id);
    setItems((current) => normalizeItems(current.map((item) => item.sectionId === section.id && fallback ? { ...item, sectionId: fallback.id } : item).filter((item) => item.sectionId !== section.id)));
    setSections((current) => current.filter((candidate) => candidate.id !== section.id).map((candidate, index) => ({ ...candidate, order: index })));
  };
  const deleteSection = (section: WorkoutTemplateSection, trigger: HTMLButtonElement) => {
    if (sections.length === 1) { setError("Szablon musi mieć co najmniej jedną sekcję."); return; }
    const sectionItems = items.filter((item) => item.sectionId === section.id);
    if (sectionItems.length) {
      pendingSectionDeleteTriggerRef.current = trigger;
      setPendingSectionDelete(section);
      return;
    }
    commitSectionDelete(section);
  };
  const moveItem = (id: string, targetSectionId: string, beforeId?: string) => {
    setItems((current) => {
      const moving = current.find((item) => item.id === id);
      if (!moving) return current;
      const groups = new Map(sections.map((section) => [section.id, current.filter((item) => item.sectionId === section.id).sort((left, right) => left.order - right.order)]));
      const source = groups.get(moving.sectionId) ?? [];
      const target = groups.get(targetSectionId) ?? [];
      groups.set(moving.sectionId, source.filter((item) => item.id !== id));
      const nextTarget = target.filter((item) => item.id !== id);
      const position = beforeId ? nextTarget.findIndex((item) => item.id === beforeId) : nextTarget.length;
      nextTarget.splice(position < 0 ? nextTarget.length : position, 0, { ...moving, sectionId: targetSectionId });
      groups.set(targetSectionId, nextTarget);
      return sections.flatMap((section) => (groups.get(section.id) ?? []).map((item, index) => ({ ...item, order: index })));
    });
  };
  const duplicateItem = (item: EditorItem) => {
    const duplicate: EditorItem = { ...item, id: createPlannerId("template-item"), parametersOverride: item.parametersOverride ? { ...item.parametersOverride } : undefined, stageDefinition: item.stageDefinition ? { ...item.stageDefinition, id: createPlannerId("stage") } : undefined, order: item.order + 1 };
    setItems((current) => normalizeItems([...current, duplicate]));
  };
  const removeItem = (id: string) => setItems((current) => normalizeItems(current.filter((item) => item.id !== id)));
  const submit = () => {
    const parsedDuration = Number(duration);
    if (name.trim().length < 2) { setError("Podaj nazwę szablonu."); return; }
    if (!Number.isFinite(parsedDuration) || parsedDuration < 5 || parsedDuration > 600) { setError("Podaj czas od 5 do 600 minut."); return; }
    const nextSections = sections.map((section, sectionIndex) => ({ ...section, order: sectionIndex, items: items.filter((item) => item.sectionId === section.id).sort((left, right) => left.order - right.order).map((item, index) => ({ ...item, order: index, sectionId: undefined })) as WorkoutTemplateItem[] }));
    const nextExercises: WorkoutExercise[] = items.filter((item) => item.exerciseId).map((item) => {
      const exercise = exercises.find((candidate) => candidate.id === item.exerciseId);
      const templateSeries = item.parametersOverride?.series ?? [];
      const sets = Math.max(1, templateSeries.length || Math.round(item.parametersOverride?.sets ?? exercise?.defaultParameters.sets ?? 3));
      const reps = Number((item.parametersOverride?.repRange ?? exercise?.defaultParameters.repRange ?? "8").match(/\d+/)?.[0] ?? 8);
      return { id: item.id, exerciseId: item.exerciseId!, name: exercise?.name ?? "Ćwiczenie", restSeconds: item.parametersOverride?.restSeconds ?? exercise?.defaultParameters.restSeconds ?? 90, note: item.note, sets: Array.from({ length: sets }, (_, setIndex) => { const row = templateSeries[setIndex]; return { id: row?.id ?? `${item.id}-set-${setIndex + 1}`, plannedReps: row?.reps ?? reps, plannedWeight: row?.weight, plannedSeconds: row?.durationSeconds ?? item.parametersOverride?.durationSeconds, rir: row?.rir ?? item.parametersOverride?.rir ?? exercise?.defaultParameters.rir, tempo: row?.tempo ?? item.parametersOverride?.tempo ?? exercise?.defaultParameters.tempo, done: false }; }) };
    });
    const nextStages = items.filter((item) => item.stageDefinition).map((item) => ({ id: item.id, label: item.stageDefinition!.name, kind: item.stageDefinition!.kind === "rest" ? "recovery" : item.stageDefinition!.kind, target: item.stageDefinition!.target ?? "", done: false }));
    onSave({ id: template?.id ?? createPlannerId("template"), name: name.trim(), discipline, sportCategory: discipline, description: description.trim(), exercises: nextExercises, stages: nextStages.length ? nextStages : undefined, sections: nextSections, durationMinutes: parsedDuration, archived: template?.archived ?? false, createdAt: template?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() });
  };
  const filteredPicker = exercises.filter((exercise) => !exercise.archived && (!pickerQuery || `${exercise.name} ${exercise.primaryMuscle}`.toLocaleLowerCase("pl-PL").includes(pickerQuery.toLocaleLowerCase("pl-PL"))));
  return (
    <Modal title={template ? "Edytuj szablon" : "Nowy szablon"} eyebrow="Pełny edytor zawartości" description="Parametry zapisane w szablonie są niezależne od domyślnych parametrów biblioteki ćwiczeń." size="xl" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Anuluj</Button><Button variant="primary" onClick={submit}>{template ? "Zapisz szablon" : "Dodaj szablon"}</Button></>}>
      <div className="sport-template-editor">
        <div className="sport-planner-form__grid"><Input label="Nazwa" value={name} data-autofocus onChange={(event) => setName(event.target.value)} /><Select label="Kategoria sportu" value={discipline} options={Object.entries(DISCIPLINE_META).map(([value, meta]) => ({ value, label: meta.label }))} onChange={(event) => setDiscipline(event.target.value as Discipline)} /></div>
        <div className="sport-planner-form__grid"><Input label="Opis" value={description} onChange={(event) => setDescription(event.target.value)} /><Input label="Szacowany czas (min)" type="number" min="5" max="600" value={duration} onChange={(event) => setDuration(event.target.value)} /></div>
        <div className="sport-template-editor__toolbar">
          <div className="sport-template-editor__actions"><Button variant="quiet" leadingIcon={<Plus size={13} />} onClick={() => openPicker()}>Dodaj ćwiczenie</Button><Button variant="ghost" onClick={onCreateExercise}>Dodaj nowe ćwiczenie</Button><Button variant="ghost" size="sm" onClick={toggleAllItems}>{items.some((item) => item.exerciseId) && items.filter((item) => item.exerciseId).every((item) => expandedItemIds.includes(item.id)) ? "Zwiń wszystkie" : "Rozwiń wszystkie"}</Button></div>
          <form className="sport-template-editor__section-create" onSubmit={(event) => { event.preventDefault(); addSection(); }}><Input label="Nowa sekcja" aria-label="Nazwa nowej sekcji" placeholder="np. Akcesoria" value={customSection} onChange={(event) => setCustomSection(event.target.value)} /><Button variant="ghost" type="submit">Dodaj sekcję</Button></form>
        </div>
        {sections.map((section, sectionIndex) => {
          const sectionItems = items.filter((item) => item.sectionId === section.id).sort((left, right) => left.order - right.order);
          const exerciseIds = sectionItems.filter((item) => item.exerciseId).map((item) => item.id);
          const sectionItemsExpanded = exerciseIds.length > 0 && exerciseIds.every((id) => expandedItemIds.includes(id));
          const sectionCollapsed = collapsedSectionIds.includes(section.id);
          const sectionDropTarget = dropTargetSectionId === section.id && (draggedSectionId !== null || draggedId !== null);
          return <section key={section.id} className={`sport-template-editor__section ${sectionCollapsed ? "is-collapsed" : ""} ${sectionDropTarget ? "is-drop-target" : ""} ${draggedSectionId === section.id ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (draggedSectionId && draggedSectionId !== section.id) setDropTargetSectionId(section.id); else if (draggedId) setDropTargetSectionId(section.id); }} onDrop={(event) => { event.preventDefault(); if (draggedSectionId) moveSection(draggedSectionId, section.id); else if (draggedId) moveItem(draggedId, section.id); clearDragState(); }}>
            <header>
              <div className="sport-template-editor__section-heading">
                <span className="sport-template-editor__section-drag-handle" draggable aria-label={`Przeciągnij sekcję ${section.name}`} onDragStart={(event) => { event.stopPropagation(); setDraggedSectionId(section.id); setDraggedId(null); setDropTargetSectionId(null); }} onDragEnd={clearDragState}><GripVertical size={16} aria-hidden="true" /></span>
                {editingSectionId === section.id ? <form className="sport-template-editor__section-edit" onSubmit={(event) => { event.preventDefault(); saveSectionName(); }}><Input aria-label="Nazwa sekcji" value={sectionDraftName} data-autofocus onChange={(event) => setSectionDraftName(event.target.value)} /><Button variant="quiet" size="sm" type="submit">Zapisz sekcję</Button><Button variant="ghost" size="sm" type="button" onClick={() => setEditingSectionId(null)}>Anuluj</Button></form> : <div><strong>{section.name}</strong><small>{sectionItems.length} {sectionItems.length === 1 ? "element" : "elementów"}</small></div>}
              </div>
              {editingSectionId !== section.id && <div className="sport-template-editor__section-heading-actions"><div className="sport-template-editor__section-position"><span>Pozycja</span><div><Button variant="ghost" size="sm" aria-label={`Przenieś sekcję ${section.name} wyżej`} disabled={sectionIndex === 0} onClick={() => moveSectionBy(section.id, -1)}><ChevronUp size={13} /></Button><Button variant="ghost" size="sm" aria-label={`Przenieś sekcję ${section.name} niżej`} disabled={sectionIndex === sections.length - 1} onClick={() => moveSectionBy(section.id, 1)}><ChevronDown size={13} /></Button></div></div><Button variant="ghost" size="sm" onClick={() => toggleSectionCollapsed(section.id)}>{sectionCollapsed ? "Rozwiń sekcję" : "Zwiń sekcję"}</Button><Button variant="ghost" size="sm" onClick={() => toggleSectionItems(section.id)}>{sectionItemsExpanded ? "Zwiń ćwiczenia" : "Rozwiń ćwiczenia"}</Button><Button variant="ghost" size="sm" leadingIcon={<Pencil size={13} />} onClick={() => startSectionEdit(section)}>Edytuj</Button><Button variant="danger" size="sm" leadingIcon={<Trash2 size={13} />} onClick={(event) => deleteSection(section, event.currentTarget)}>Usuń</Button></div>}
            </header>
            {!sectionCollapsed && sectionItems.length > 0 && <div className="sport-template-editor__item-columns"><span aria-hidden="true" /><span aria-hidden="true" /><span>Ćwiczenie / etap</span><span>Pozycja</span><span>Akcje</span></div>}
            {!sectionCollapsed && sectionItems.map((item, index) => <TemplateEditorItem key={item.id} item={item} index={index} sectionItems={sectionItems} exercises={exercises} supersetOptions={items.filter((candidate) => candidate.id !== item.id && candidate.exerciseId).map((candidate) => ({ id: candidate.id, label: itemLabel(candidate, exercises) }))} expanded={expandedItemIds.includes(item.id)} dropTarget={dropTargetItemId === item.id} isDragging={draggedId === item.id} onToggle={() => toggleItem(item.id)} onEnsureSeries={() => ensureSeries(item.id)} onUpdate={updateItem} onUpdateSeries={updateSeries} onAddSeries={addSeries} onRemoveSeries={removeSeries} onMoveUp={() => { const previous = sectionItems[index - 1]; if (previous) moveItem(item.id, section.id, previous.id); }} onMoveDown={() => { const next = sectionItems[index + 1]; if (next) moveItem(next.id, section.id, item.id); }} onDuplicate={() => duplicateItem(item)} onRemove={() => removeItem(item.id)} onDragStart={() => { setDraggedId(item.id); setDraggedSectionId(null); setDropTargetItemId(null); setDropTargetSectionId(null); }} onDragEnd={clearDragState} onSectionDragOver={() => { if (draggedSectionId && draggedSectionId !== section.id) setDropTargetSectionId(section.id); else if (draggedId) setDropTargetItemId(item.id); }} onDrop={() => { if (draggedSectionId) moveSection(draggedSectionId, section.id); else if (draggedId) moveItem(draggedId, section.id, item.id); clearDragState(); }} />)}
            {!sectionCollapsed && sectionItems.length === 0 && <p className="sport-template-editor__empty">Ta sekcja jest pusta. Dodaj ćwiczenie z biblioteki.</p>}
            {!sectionCollapsed && <div className="sport-template-editor__section-actions"><Button variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={() => openPicker(section.id)}>Dodaj ćwiczenie</Button></div>}
          </section>;
        })}
        {error && <p className="sport-planner-form__error" role="alert">{error}</p>}
      </div>
      {pickerOpen && <Modal title="Dodaj ćwiczenie" eyebrow="Picker biblioteki" description="Wybierz ćwiczenie. Jego domyślne parametry zostaną skopiowane do tego szablonu." size="md" onClose={() => setPickerOpen(false)} footer={<Button variant="ghost" onClick={onCreateExercise}>Dodaj nowe ćwiczenie</Button>}><Input label="Szukaj" value={pickerQuery} data-autofocus onChange={(event) => setPickerQuery(event.target.value)} /><div className="sport-exercise-picker">{filteredPicker.map((exercise) => <button key={exercise.id} type="button" onClick={() => chooseExercise(exercise)}><span><strong>{exercise.name}</strong><small>{exercise.primaryMuscle} · {exercise.equipment.join(", ") || "Bez sprzętu"}</small></span><Plus size={13} /></button>)}</div></Modal>}
      {pendingSectionDelete && (
        <ConfirmDialog
          title={`Usunąć sekcję „${pendingSectionDelete.name}”?`}
          description={`${items.filter((item) => item.sectionId === pendingSectionDelete.id).length} elementów zostanie przeniesionych do sekcji „${sections.find((section) => section.id !== pendingSectionDelete.id)?.name ?? "innej sekcji"}”.`}
          confirmLabel="Przenieś i usuń"
          cancelLabel="Zostaw sekcję"
          returnFocusRef={pendingSectionDeleteTriggerRef}
          onCancel={() => setPendingSectionDelete(null)}
          onConfirm={() => {
            commitSectionDelete(pendingSectionDelete);
            setPendingSectionDelete(null);
          }}
        >
          <p className="ui-confirm-dialog__note">Elementy treningu pozostaną w szablonie; zmieni się tylko ich sekcja.</p>
        </ConfirmDialog>
      )}
    </Modal>
  );
}
