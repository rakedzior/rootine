import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CopyPlus,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  addDays,
  cloneExercises,
  fromDateKey,
  startOfWeekKey,
  type Discipline,
  type ExerciseLibraryItem,
  type TrainingPlan,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutTemplate,
} from "./model";
import { inputStyle, Modal } from "./Shared";
import { DISCIPLINE_META, SPORT_COLORS as C } from "./theme";
import { Select } from "../ui";

const disciplines = Object.entries(DISCIPLINE_META) as [
  Discipline,
  (typeof DISCIPLINE_META)[Discipline],
][];

export function AddWorkoutDialog({
  templates,
  initialDate,
  onClose,
  onSubmit,
}: {
  templates: WorkoutTemplate[];
  initialDate: string;
  onClose: () => void;
  onSubmit: (session: WorkoutSession) => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState<Discipline>("strength");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("18:00");
  const [duration, setDuration] = useState(45);
  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (template) {
      setTitle(template.name);
      setDiscipline(template.discipline);
      setDuration(template.durationMinutes);
    }
  };
  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const template = templates.find((item) => item.id === templateId);
    const id = `session-${Date.now()}`;
    onSubmit({
      id,
      title: cleanTitle,
      discipline,
      date,
      time,
      durationMinutes: duration,
      status: "scheduled",
      templateId: template?.id,
      exercises: template ? cloneExercises(template.exercises, id) : [],
      stages: template?.stages?.map((stage, index) => ({
        ...stage,
        id: `${id}-stage-${index}`,
      })),
    });
  };
  return (
    <Modal
      title="Dodaj trening"
      eyebrow="Nowa sesja"
      onClose={onClose}
      width={520}
    >
      <div className="space-y-4 p-5">
        <label className="block">
          <span
            className="mb-1.5 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Szablon opcjonalnie
          </span>
          <select
            value={templateId}
            onChange={(event) => chooseTemplate(event.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
            style={inputStyle}
          >
            <option value="">Szybki trening od zera</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} · {DISCIPLINE_META[template.discipline].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span
            className="mb-1.5 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Nazwa
          </span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="np. Góra A"
            className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
            style={inputStyle}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Dyscyplina
            </span>
            <select
              value={discipline}
              disabled={Boolean(templateId)}
              onChange={(event) =>
                setDiscipline(event.target.value as Discipline)
              }
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none disabled:opacity-60"
              style={inputStyle}
            >
              {disciplines.map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Czas
            </span>
            <input
              type="number"
              min={1}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
              style={inputStyle}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Data
            </span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
              style={inputStyle}
            />
          </label>
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Godzina
            </span>
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
              style={inputStyle}
            />
          </label>
        </div>
        {!templateId && (
          <p
            className="rounded-lg border px-3 py-2.5 text-[9px] leading-4"
            style={{
              color: C.textMuted,
              borderColor: C.border,
              background: C.input,
            }}
          >
            Szybki trening można rozpocząć bez szablonu. Ćwiczenia dodasz w
            panelu planu podczas sesji.
          </p>
        )}
        <div className="flex justify-end gap-1.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="sport-link-action"
            style={{ color: C.textMuted }}
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!title.trim()}
            className="sport-primary-button"
          >
            Dodaj trening
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function NewPlanDialog({
  plan,
  onClose,
  onSubmit,
}: {
  plan?: TrainingPlan;
  onClose: () => void;
  onSubmit: (plan: TrainingPlan) => void;
}) {
  const [name, setName] = useState(plan?.name ?? "");
  const [weeks, setWeeks] = useState(plan?.weeks ?? 8);
  const [days, setDays] = useState(plan?.sessionsPerWeek ?? 3);
  const [selected, setSelected] = useState<Discipline[]>(plan?.disciplines ?? ["strength"]);
  const toggle = (discipline: Discipline) =>
    setSelected((current) =>
      current.includes(discipline)
        ? current.filter((item) => item !== discipline)
        : [...current, discipline],
    );
  const submit = () => {
    if (!name.trim() || !selected.length) return;
    const adjustedBlocks = plan?.blocks
      ?.filter((block) => block.startWeek <= weeks)
      .map((block) => ({ ...block, endWeek: Math.max(block.startWeek, Math.min(block.endWeek, weeks)) }));
    onSubmit({
      id: plan?.id ?? `plan-${Date.now()}`,
      name: name.trim(),
      disciplines: selected,
      weeks,
      currentWeek: Math.min(plan?.currentWeek ?? 1, weeks),
      active: plan?.active ?? true,
      sessionsPerWeek: days,
      completedSessions: plan?.completedSessions ?? 0,
      totalSessions: weeks * days,
      templateIds: plan?.templateIds ?? [],
      source: plan?.source ?? "manual",
      blocks: adjustedBlocks?.length ? adjustedBlocks : [
        { id: `block-${Date.now()}`, name: "Blok główny", startWeek: 1, endWeek: weeks, focus: "Regularna realizacja planu" },
      ],
    });
  };
  return (
    <Modal title={plan ? "Edytuj plan treningowy" : "Nowy plan treningowy"} eyebrow={plan ? "Ustawienia planu" : "Plan ręczny"} onClose={onClose}>
      <div className="space-y-4 p-5">
        <label className="block">
          <span
            className="mb-1.5 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Nazwa planu
          </span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="np. Siła 3× w tygodniu"
            className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
            style={inputStyle}
          />
        </label>
        <div>
          <span
            className="mb-2 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Dyscypliny
          </span>
          <div className="grid grid-cols-2 gap-2">
            {disciplines.slice(0, 5).map(([value, meta]) => {
              const active = selected.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggle(value)}
                  className="sport-option-button"
                  style={{
                    color: active ? meta.color : C.textMuted,
                    borderColor: active ? `${meta.color}66` : C.border,
                    background: active ? `${meta.color}12` : C.input,
                  }}
                >
                  {meta.label}
                  {active && <Check size={10} />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Liczba tygodni
            </span>
            <input
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(event) => setWeeks(Number(event.target.value))}
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
              style={inputStyle}
            />
          </label>
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Sesje tygodniowo
            </span>
            <input
              type="number"
              min={1}
              max={14}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
              style={inputStyle}
            />
          </label>
        </div>
        <div className="flex justify-end gap-1.5 pt-2">
          <button
            onClick={onClose}
            className="sport-link-action"
            style={{ color: C.textMuted }}
          >
            Anuluj
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || !selected.length}
            className="sport-primary-button"
          >
            {plan ? "Zapisz plan" : "Utwórz plan"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function AIPlanDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (plan: TrainingPlan) => void;
}) {
  const [goal, setGoal] = useState("Zwiększenie siły i regularności");
  const [experience, setExperience] = useState("średniozaawansowany");
  const [weeks, setWeeks] = useState(8);
  const [days, setDays] = useState(4);
  const [equipment, setEquipment] = useState("Pełna siłownia");
  const [limitations, setLimitations] = useState("");
  const [selected, setSelected] = useState<Discipline[]>([
    "strength",
    "mobility",
  ]);
  const [preview, setPreview] = useState(false);
  const toggle = (discipline: Discipline) =>
    setSelected((current) =>
      current.includes(discipline)
        ? current.filter((item) => item !== discipline)
        : [...current, discipline],
    );
  const plan: TrainingPlan = {
    id: `plan-ai-${Date.now()}`,
    name: goal || "Plan utworzony z AI",
    disciplines: selected,
    weeks,
    currentWeek: 1,
    active: true,
    sessionsPerWeek: days,
    completedSessions: 0,
    totalSessions: weeks * days,
    templateIds: selected.includes("strength")
      ? [
          "tpl-upper-a",
          "tpl-lower-a",
          ...(selected.includes("mobility") ? ["tpl-mobility"] : []),
        ]
      : selected.includes("running")
        ? ["tpl-easy-run"]
        : ["tpl-rehab-knee", "tpl-mobility"],
    source: "ai",
    blocks: [
      {
        id: `block-ai-${Date.now()}`,
        name: "Blok adaptacyjny",
        startWeek: 1,
        endWeek: Math.min(4, weeks),
        focus: "Technika i regularność",
      },
      ...(weeks > 4
        ? [
            {
              id: `block-ai-progress-${Date.now()}`,
              name: "Blok progresji",
              startWeek: 5,
              endWeek: weeks,
              focus: "Stopniowe zwiększanie trudności",
            },
          ]
        : []),
    ],
  };
  return (
    <Modal
      title="Ułóż plan z AI"
      eyebrow="Asystent treningowy"
      onClose={onClose}
      width={590}
    >
      <div className="p-5">
        {preview ? (
          <>
            <div
              className="rounded-xl border p-4"
              style={{ background: C.input, borderColor: C.border }}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={12} style={{ color: C.blue }} />
                <p
                  className="text-[11px] font-medium"
                  style={{ color: C.text }}
                >
                  Propozycja: {plan.name}
                </p>
              </div>
              <p
                className="mt-2 text-[9px] leading-5"
                style={{ color: C.textMuted }}
              >
                {weeks} tygodni · {days} sesje tygodniowo · poziom {experience}.
                Plan wykorzystuje dostępne szablony Rootine i po zapisaniu
                pozostaje w pełni edytowalny.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.map((item) => (
                  <span
                    key={item}
                    className="rounded-md px-2 py-1 text-[9px]"
                    style={{
                      color: DISCIPLINE_META[item].color,
                      background: `${DISCIPLINE_META[item].color}12`,
                    }}
                  >
                    {DISCIPLINE_META[item].label}
                  </span>
                ))}
              </div>
              <div
                className="mt-4 border-t pt-4"
                style={{ borderColor: C.border }}
              >
                <p className="text-[9px]" style={{ color: C.textSecond }}>
                  Proponowany tydzień
                </p>
                <p
                  className="mt-2 text-[9px] leading-5"
                  style={{ color: C.textMuted }}
                >
                  Pon.: Góra A · Śr.: Dół A · Pt.: Góra A · Niedz.: Stretching
                  wieczorny
                </p>
              </div>
            </div>
            <div
              className="mt-4 rounded-lg border px-3 py-2.5 text-[9px] leading-4"
              style={{
                color: C.warning,
                borderColor: "color-mix(in srgb, var(--color-warning-ochre) 24%, transparent)",
                background: C.warningBg,
              }}
            >
              To demonstracyjna propozycja frontendowa. Wersja produkcyjna wyśle
              wywiad do usługi AI i pokaże pełny podgląd różnic przed zapisem.
            </div>
            <div className="mt-5 flex justify-end gap-1.5">
              <button
                onClick={() => setPreview(false)}
                className="sport-link-action"
                style={{ color: C.textMuted }}
              >
                Wróć do wywiadu
              </button>
              <button
                onClick={() => onSubmit(plan)}
                className="sport-primary-button"
              >
                Zapisz plan
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span
                className="mb-1.5 block text-[10px]"
                style={{ color: C.textMuted }}
              >
                Główny cel
              </span>
              <input
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
                style={inputStyle}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span
                  className="mb-1.5 block text-[10px]"
                  style={{ color: C.textMuted }}
                >
                  Poziom
                </span>
                <select
                  value={experience}
                  onChange={(event) => setExperience(event.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
                  style={inputStyle}
                >
                  <option>początkujący</option>
                  <option>średniozaawansowany</option>
                  <option>zaawansowany</option>
                </select>
              </label>
              <label>
                <span
                  className="mb-1.5 block text-[10px]"
                  style={{ color: C.textMuted }}
                >
                  Dostępny sprzęt
                </span>
                <input
                  value={equipment}
                  onChange={(event) => setEquipment(event.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
                  style={inputStyle}
                />
              </label>
            </div>
            <div>
              <span
                className="mb-2 block text-[10px]"
                style={{ color: C.textMuted }}
              >
                Dyscypliny
              </span>
              <div className="grid grid-cols-2 gap-2">
                {disciplines.slice(0, 5).map(([value, meta]) => {
                  const active = selected.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggle(value)}
                      className="sport-option-button"
                      style={{
                        color: active ? meta.color : C.textMuted,
                        borderColor: active ? `${meta.color}66` : C.border,
                        background: active ? `${meta.color}12` : C.input,
                      }}
                    >
                      {meta.label}
                      {active && <Check size={10} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span
                  className="mb-1.5 block text-[10px]"
                  style={{ color: C.textMuted }}
                >
                  Liczba tygodni
                </span>
                <input
                  type="number"
                  min={1}
                  value={weeks}
                  onChange={(event) => setWeeks(Number(event.target.value))}
                  className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
                  style={inputStyle}
                />
              </label>
              <label>
                <span
                  className="mb-1.5 block text-[10px]"
                  style={{ color: C.textMuted }}
                >
                  Sesje tygodniowo
                </span>
                <input
                  type="number"
                  min={1}
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                  className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
                  style={inputStyle}
                />
              </label>
            </div>
            <label className="block">
              <span
                className="mb-1.5 block text-[10px]"
                style={{ color: C.textMuted }}
              >
                Ograniczenia i preferencje
              </span>
              <textarea
                value={limitations}
                onChange={(event) => setLimitations(event.target.value)}
                placeholder="np. unikam skoków, maks. 60 min, rehabilitacja kolana"
                rows={3}
                className="w-full resize-none rounded-lg border px-3 py-2.5 text-[10px] outline-none"
                style={inputStyle}
              />
            </label>
            <div className="flex justify-end gap-1.5 pt-2">
              <button
                onClick={onClose}
                className="sport-link-action"
                style={{ color: C.textMuted }}
              >
                Anuluj
              </button>
              <button
                onClick={() => setPreview(true)}
                disabled={!goal.trim() || !selected.length}
                className="sport-primary-button"
              >
                Wygeneruj propozycję
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function NewTemplateDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (template: WorkoutTemplate) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discipline, setDiscipline] = useState<Discipline>("strength");
  const [duration, setDuration] = useState(45);
  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      id: `tpl-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      discipline,
      durationMinutes: duration,
      exercises: [],
      stages:
        discipline === "running"
          ? [
              {
                id: `${Date.now()}-warm`,
                label: "Rozgrzewka",
                kind: "warmup",
                target: "10 min",
              },
              {
                id: `${Date.now()}-main`,
                label: "Część główna",
                kind: "steady",
                target: "20 min",
              },
            ]
          : undefined,
    });
  };
  return (
    <Modal
      title="Nowy szablon"
      eyebrow="Powtarzalna jednostka"
      onClose={onClose}
    >
      <div className="space-y-4 p-5">
        <label className="block">
          <span
            className="mb-1.5 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Nazwa
          </span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="np. Dół B"
            className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
            style={inputStyle}
          />
        </label>
        <label className="block">
          <span
            className="mb-1.5 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Opis
          </span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Krótki opis jednostki"
            className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
            style={inputStyle}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Dyscyplina
            </span>
            <select
              value={discipline}
              onChange={(event) =>
                setDiscipline(event.target.value as Discipline)
              }
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
              style={inputStyle}
            >
              {disciplines.map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Czas
            </span>
            <input
              type="number"
              min={1}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
              style={inputStyle}
            />
          </label>
        </div>
        <p
          className="rounded-lg border px-3 py-2 text-[9px] leading-4"
          style={{ color: C.textMuted, borderColor: C.border }}
        >
          Po utworzeniu otworzysz szablon i dodasz szczegółowe ćwiczenia, serie
          albo etapy.
        </p>
        <div className="flex justify-end gap-1.5">
          <button
            onClick={onClose}
            className="sport-link-action"
            style={{ color: C.textMuted }}
          >
            Anuluj
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="sport-primary-button"
          >
            Utwórz szablon
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function NewExerciseDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (exercise: ExerciseLibraryItem) => void;
}) {
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [equipment, setEquipment] = useState("");
  const [instruction, setInstruction] = useState("");
  const [discipline, setDiscipline] = useState<Discipline>("strength");
  const list = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      aliases: list(aliases),
      discipline,
      primaryMuscles: list(primary),
      secondaryMuscles: list(secondary),
      equipment: list(equipment),
      instruction: instruction.trim() || "Własne ćwiczenie użytkownika.",
      custom: true,
    });
  };
  return (
    <Modal
      title="Dodaj własne ćwiczenie"
      eyebrow="Biblioteka ćwiczeń"
      onClose={onClose}
      width={560}
    >
      <div className="space-y-4 p-5">
        <label className="block">
          <span
            className="mb-1.5 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Nazwa
          </span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
            style={inputStyle}
          />
        </label>
        <label className="block">
          <span
            className="mb-1.5 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Nazwy potoczne i synonimy
          </span>
          <input
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            placeholder="oddziel przecinkami"
            className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
            style={inputStyle}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Dyscyplina
            </span>
            <select
              value={discipline}
              onChange={(event) =>
                setDiscipline(event.target.value as Discipline)
              }
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
              style={inputStyle}
            >
              {disciplines.map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Sprzęt
            </span>
            <input
              value={equipment}
              onChange={(event) => setEquipment(event.target.value)}
              placeholder="np. hantle, ławka"
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
              style={inputStyle}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Główne partie
            </span>
            <input
              value={primary}
              onChange={(event) => setPrimary(event.target.value)}
              placeholder="np. klatka piersiowa"
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
              style={inputStyle}
            />
          </label>
          <label>
            <span
              className="mb-1.5 block text-[10px]"
              style={{ color: C.textMuted }}
            >
              Pomocnicze partie
            </span>
            <input
              value={secondary}
              onChange={(event) => setSecondary(event.target.value)}
              placeholder="np. triceps, barki"
              className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
              style={inputStyle}
            />
          </label>
        </div>
        <label className="block">
          <span
            className="mb-1.5 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Instrukcja
          </span>
          <textarea
            rows={3}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            className="w-full resize-none rounded-lg border px-3 py-2.5 text-[10px] outline-none"
            style={inputStyle}
          />
        </label>
        <div className="flex justify-end gap-1.5">
          <button
            onClick={onClose}
            className="sport-link-action"
            style={{ color: C.textMuted }}
          >
            Anuluj
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="sport-primary-button"
          >
            Dodaj ćwiczenie
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function TemplateEditorDialog({
  template,
  library,
  onClose,
  onSubmit,
}: {
  template: WorkoutTemplate;
  library: ExerciseLibraryItem[];
  onClose: () => void;
  onSubmit: (template: WorkoutTemplate) => void;
}) {
  const [draft, setDraft] = useState<WorkoutTemplate>(() => ({
    ...template,
    exercises: template.exercises.map((item) => ({
      ...item,
      sets: item.sets.map((set) => ({ ...set })),
    })),
    stages: template.stages?.map((stage) => ({ ...stage })),
  }));
  const [exerciseId, setExerciseId] = useState("");
  const move = (index: number, amount: number) => {
    const target = index + amount;
    if (target < 0 || target >= draft.exercises.length) return;
    const exercises = [...draft.exercises];
    [exercises[index], exercises[target]] = [
      exercises[target],
      exercises[index],
    ];
    setDraft({ ...draft, exercises });
  };
  const addExercise = () => {
    const item = library.find((exercise) => exercise.id === exerciseId);
    if (!item) return;
    const prefix = `${draft.id}-${Date.now()}`;
    setDraft({
      ...draft,
      exercises: [
        ...draft.exercises,
        {
          id: prefix,
          exerciseId: item.id,
          name: item.name,
          restSeconds: 90,
          sets: Array.from({ length: 3 }, (_, index) => ({
            id: `${prefix}-s${index}`,
            plannedReps: 8,
            actualReps: 8,
            plannedWeight: 0,
            actualWeight: 0,
            rir: 2,
            done: false,
          })),
        },
      ],
    });
    setExerciseId("");
  };
  const updateExercise = (
    id: string,
    patch: Partial<WorkoutTemplate["exercises"][number]>,
  ) =>
    setDraft({
      ...draft,
      exercises: draft.exercises.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  const updateSet = (exerciseId: string, setId: string, patch: Partial<WorkoutSet>) =>
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id === exerciseId ? {
        ...exercise,
        sets: exercise.sets.map((set) => set.id === setId ? {
          ...set,
          ...patch,
          actualReps: patch.plannedReps ?? set.actualReps,
          actualSeconds: patch.plannedSeconds ?? set.actualSeconds,
          actualWeight: patch.plannedWeight ?? set.actualWeight,
          done: false,
        } : set),
      } : exercise),
    }));

  const addSet = (exerciseId: string) =>
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const source = exercise.sets.at(-1);
        const id = `${exercise.id}-s${Date.now()}-${exercise.sets.length + 1}`;
        const next: WorkoutSet = source
          ? { ...source, id, done: false }
          : { id, plannedReps: 8, actualReps: 8, plannedWeight: 0, actualWeight: 0, rir: 2, done: false };
        return { ...exercise, sets: [...exercise.sets, next] };
      }),
    }));

  const removeSet = (exerciseId: string, setId: string) =>
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id === exerciseId && exercise.sets.length > 1
        ? { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) }
        : exercise),
    }));

  const duplicateSet = (exerciseId: string, setId: string) =>
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id === exerciseId ? {
        ...exercise,
        sets: exercise.sets.flatMap((set, index) => set.id === setId
          ? [set, { ...set, id: `${exercise.id}-s${Date.now()}-${index + 2}`, done: false }]
          : [set]),
      } : exercise),
    }));
  return (
    <Modal
      title={`Edytuj: ${template.name}`}
      eyebrow="Szablon treningu"
      onClose={onClose}
      width={720}
    >
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <label>
            <span
              className="mb-1.5 block text-[9px]"
              style={{ color: C.textMuted }}
            >
              Nazwa
            </span>
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              className="w-full rounded-lg border px-3 py-2 text-[10px] outline-none"
              style={inputStyle}
            />
          </label>
          <label>
            <span
              className="mb-1.5 block text-[9px]"
              style={{ color: C.textMuted }}
            >
              Czas
            </span>
            <input
              type="number"
              value={draft.durationMinutes}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  durationMinutes: Number(event.target.value),
                })
              }
              className="w-full rounded-lg border px-3 py-2 text-[10px] outline-none"
              style={inputStyle}
            />
          </label>
        </div>
        {draft.stages ? (
          <div>
            <p
              className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: C.textMuted }}
            >
              Etapy biegu
            </p>
            <div className="space-y-2">
              {draft.stages.map((stage) => (
                <div
                  key={stage.id}
                  className="grid grid-cols-[150px_1fr_28px] gap-2"
                >
                  <input
                    value={stage.label}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        stages: draft.stages!.map((item) =>
                          item.id === stage.id
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      })
                    }
                    className="rounded-lg border px-3 py-2 text-[10px] outline-none"
                    style={inputStyle}
                  />
                  <input
                    value={stage.target}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        stages: draft.stages!.map((item) =>
                          item.id === stage.id
                            ? { ...item, target: event.target.value }
                            : item,
                        ),
                      })
                    }
                    className="rounded-lg border px-3 py-2 text-[10px] outline-none"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        stages: draft.stages!.filter(
                          (item) => item.id !== stage.id,
                        ),
                      })
                    }
                    style={{ color: C.danger }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  stages: [
                    ...draft.stages!,
                    {
                      id: `${draft.id}-${Date.now()}`,
                      label: "Nowy etap",
                      kind: "steady",
                      target: "Ustaw cel",
                    },
                  ],
                })
              }
              className="mt-3 flex items-center gap-1 text-[9px]"
              style={{ color: C.blue }}
            >
              <Plus size={10} /> Dodaj etap
            </button>
          </div>
        ) : (
          <>
            <div>
              <p
                className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: C.textMuted }}
              >
                Ćwiczenia
              </p>
              <div className="space-y-2">
                {draft.exercises.map((item, index) => (
                  <div
                    key={item.id}
                    className="rounded-lg border p-3"
                    style={{ background: C.input, borderColor: C.border }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 text-[9px]"
                        style={{ color: C.textDisabled }}
                      >
                        {index + 1}
                      </span>
                      <input
                        value={item.name}
                        onChange={(event) =>
                          updateExercise(item.id, { name: event.target.value })
                        }
                        className="min-w-0 flex-1 bg-transparent text-[10px] outline-none"
                        style={{ color: C.textSecond }}
                      />
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        style={{ color: C.textDisabled }}
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        style={{ color: C.textDisabled }}
                      >
                        <ArrowDown size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            exercises: draft.exercises.filter(
                              (exercise) => exercise.id !== item.id,
                            ),
                          })
                        }
                        style={{ color: C.danger }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <p className="text-[9px] font-medium" style={{ color: C.textMuted }}>
                        Serie · każda może mieć inny cel
                      </p>
                      <label className="flex items-center gap-2 text-[9px]" style={{ color: C.textMuted }}>
                        Przerwa
                        <input
                          aria-label={`Przerwa po ćwiczeniu ${item.name} w sekundach`}
                          type="number"
                          min={0}
                          step={5}
                          value={item.restSeconds}
                          onChange={(event) => updateExercise(item.id, { restSeconds: Number(event.target.value) })}
                          className="h-7 w-16 rounded-md border px-2 text-right text-[9px] outline-none"
                          style={inputStyle}
                        />
                        s
                      </label>
                    </div>
                    <div className="mt-2 overflow-hidden rounded-md border" style={{ borderColor: C.border }}>
                      <div className="grid grid-cols-[28px_minmax(74px,1fr)_minmax(82px,1fr)_58px_56px] items-center gap-1.5 border-b px-2 py-1.5 text-[9px]" style={{ color: C.textMuted, borderColor: C.border }}>
                        <span>#</span>
                        <span>{item.sets.some((set) => set.plannedSeconds !== undefined) ? "Czas s" : "Powt."}</span>
                        <span>Ciężar kg</span>
                        <span>RIR</span>
                        <span />
                      </div>
                      {item.sets.map((set, setIndex) => {
                        const usesSeconds = item.sets.some((entry) => entry.plannedSeconds !== undefined);
                        return (
                          <div key={set.id} className="grid grid-cols-[28px_minmax(74px,1fr)_minmax(82px,1fr)_58px_56px] items-center gap-1.5 border-b px-2 py-1.5 last:border-b-0" style={{ borderColor: C.border }}>
                            <span className="text-[9px] tabular-nums" style={{ color: C.textDisabled }}>{setIndex + 1}</span>
                            <input
                              aria-label={`${usesSeconds ? "Czas" : "Powtórzenia"}, seria ${setIndex + 1}`}
                              type="number"
                              min={0}
                              value={usesSeconds ? (set.plannedSeconds ?? 0) : (set.plannedReps ?? 0)}
                              onChange={(event) => updateSet(item.id, set.id, usesSeconds ? { plannedSeconds: Number(event.target.value) } : { plannedReps: Number(event.target.value) })}
                              className="h-7 min-w-0 rounded-md border px-2 text-[10px] outline-none"
                              style={inputStyle}
                            />
                            <input
                              aria-label={`Ciężar, seria ${setIndex + 1}`}
                              type="number"
                              min={0}
                              step={0.5}
                              value={set.plannedWeight ?? 0}
                              onChange={(event) => updateSet(item.id, set.id, { plannedWeight: Number(event.target.value) })}
                              className="h-7 min-w-0 rounded-md border px-2 text-[10px] outline-none"
                              style={inputStyle}
                            />
                            <input
                              aria-label={`RIR, seria ${setIndex + 1}`}
                              type="number"
                              min={0}
                              max={10}
                              value={set.rir ?? 0}
                              onChange={(event) => updateSet(item.id, set.id, { rir: Number(event.target.value) })}
                              className="h-7 min-w-0 rounded-md border px-2 text-[10px] outline-none"
                              style={inputStyle}
                            />
                            <span className="flex items-center">
                              <button
                                type="button"
                                aria-label={`Duplikuj serię ${setIndex + 1}`}
                                onClick={() => duplicateSet(item.id, set.id)}
                                className="flex h-7 w-7 items-center justify-center rounded-md"
                                style={{ color: C.textMuted }}
                              >
                                <CopyPlus size={11} />
                              </button>
                              <button
                                type="button"
                                disabled={item.sets.length === 1}
                                aria-label={`Usuń serię ${setIndex + 1}`}
                                onClick={() => removeSet(item.id, set.id)}
                                className="flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-30"
                                style={{ color: C.danger }}
                              >
                                <Trash2 size={11} />
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => addSet(item.id)} className="sport-link-action mt-2" style={{ color: C.blue }}>
                      <Plus size={10} /> Dodaj serię
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Select
                compact
                value={exerciseId}
                onChange={(event) => setExerciseId(event.target.value)}
                aria-label="Ćwiczenie z biblioteki"
                fieldClassName="min-w-0 flex-1"
                options={[
                  { value: "", label: "Wybierz ćwiczenie z biblioteki" },
                  ...library
                  .filter(
                    (item) =>
                      item.discipline === draft.discipline ||
                      draft.discipline === "custom",
                  )
                  .map((item) => ({ value: item.id, label: item.name })),
                ]}
              />
              <button
                type="button"
                disabled={!exerciseId}
                onClick={addExercise}
                className="sport-primary-button"
              >
                Dodaj
              </button>
            </div>
          </>
        )}
        <div
          className="flex justify-end gap-1.5 border-t pt-4"
          style={{ borderColor: C.border }}
        >
          <button
            onClick={onClose}
            className="sport-link-action"
            style={{ color: C.textMuted }}
          >
            Anuluj
          </button>
          <button
            onClick={() => onSubmit(draft)}
            className="sport-primary-button"
          >
            Zapisz szablon
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ScheduleCycleDialog({
  plans,
  templates,
  onClose,
  onSubmit,
}: {
  plans: TrainingPlan[];
  templates: WorkoutTemplate[];
  onClose: () => void;
  onSubmit: (sessions: WorkoutSession[]) => void;
}) {
  const [planId, setPlanId] = useState(
    plans.find((plan) => plan.active)?.id ?? plans[0]?.id ?? "",
  );
  const plan = plans.find((item) => item.id === planId);
  const availableTemplates = templates.filter(
    (template) => !plan || plan.templateIds.includes(template.id),
  );
  const [templateId, setTemplateId] = useState(
    availableTemplates[0]?.id ?? templates[0]?.id ?? "",
  );
  const [start, setStart] = useState(startOfWeekKey());
  const [weeks, setWeeks] = useState(plan?.weeks ?? 4);
  const [time, setTime] = useState("18:00");
  const [days, setDays] = useState<number[]>([0]);
  const dayLabels = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
  const choosePlan = (id: string) => {
    setPlanId(id);
    const next = plans.find((item) => item.id === id);
    setWeeks(next?.weeks ?? 4);
    const firstTemplate = templates.find((template) =>
      next?.templateIds.includes(template.id),
    );
    if (firstTemplate) setTemplateId(firstTemplate.id);
  };
  const submit = () => {
    const template = templates.find((item) => item.id === templateId);
    if (!template || !days.length) return;
    const monday = startOfWeekKey(fromDateKey(start));
    const result: WorkoutSession[] = [];
    for (let week = 0; week < weeks; week += 1)
      for (const day of days) {
        const id = `cycle-${Date.now()}-${week}-${day}`;
        result.push({
          id,
          title: template.name,
          discipline: template.discipline,
          date: addDays(monday, week * 7 + day),
          time,
          durationMinutes: template.durationMinutes,
          status: "scheduled",
          planId,
          templateId,
          exercises: cloneExercises(template.exercises, id),
          stages: template.stages?.map((stage, index) => ({
            ...stage,
            id: `${id}-stage-${index}`,
          })),
        });
      }
    onSubmit(result);
  };
  return (
    <Modal
      title="Zaplanuj cykl"
      eyebrow="Automatyczny harmonogram"
      onClose={onClose}
      width={560}
    >
      <div className="space-y-4 p-5">
        <label className="block">
          <span
            className="mb-1.5 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Plan
          </span>
          <select
            value={planId}
            onChange={(event) => choosePlan(event.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
            style={inputStyle}
          >
            {plans.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span
            className="mb-1.5 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Szablon
          </span>
          <select
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
            style={inputStyle}
          >
            {availableTemplates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span
            className="mb-2 block text-[10px]"
            style={{ color: C.textMuted }}
          >
            Dni tygodnia
          </span>
          <div className="grid grid-cols-7 gap-1.5">
            {dayLabels.map((label, index) => {
              const active = days.includes(index);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    setDays((current) =>
                      active
                        ? current.filter((day) => day !== index)
                        : [...current, index],
                    )
                  }
                  className="h-7 rounded-md border text-[9px]"
                  style={{
                    color: active ? C.blue : C.textMuted,
                    borderColor: active ? "color-mix(in srgb, var(--color-precision-blue) 45%, transparent)" : C.border,
                    background: active ? C.blueBg : C.input,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label>
            <span
              className="mb-1.5 block text-[9px]"
              style={{ color: C.textMuted }}
            >
              Start
            </span>
            <input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="w-full rounded-lg border px-2 py-2 text-[9px] outline-none"
              style={inputStyle}
            />
          </label>
          <label>
            <span
              className="mb-1.5 block text-[9px]"
              style={{ color: C.textMuted }}
            >
              Tygodnie
            </span>
            <input
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(event) => setWeeks(Number(event.target.value))}
              className="w-full rounded-lg border px-2 py-2 text-[9px] outline-none"
              style={inputStyle}
            />
          </label>
          <label>
            <span
              className="mb-1.5 block text-[9px]"
              style={{ color: C.textMuted }}
            >
              Godzina
            </span>
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="w-full rounded-lg border px-2 py-2 text-[9px] outline-none"
              style={inputStyle}
            />
          </label>
        </div>
        <p
          className="rounded-lg border px-3 py-2.5 text-[9px] leading-4"
          style={{ color: C.textMuted, borderColor: C.border }}
        >
          {days.length * weeks} sesji zostanie utworzonych. Każdą z nich można
          później niezależnie edytować lub przenieść.
        </p>
        <div className="flex justify-end gap-1.5">
          <button
            onClick={onClose}
            className="sport-link-action"
            style={{ color: C.textMuted }}
          >
            Anuluj
          </button>
          <button
            disabled={!templateId || !days.length}
            onClick={submit}
            className="sport-primary-button"
          >
            Utwórz harmonogram
          </button>
        </div>
      </div>
    </Modal>
  );
}
