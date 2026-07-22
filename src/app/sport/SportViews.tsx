import { useMemo, useState } from "react";
import { Check, ChevronRight, Plus, Search } from "lucide-react";
import {
  addDays,
  formatLongDate,
  formatShortDate,
  fromDateKey,
  normalizeSearch,
  startOfWeekKey,
  type Discipline,
  type ExerciseLibraryItem,
  type PendingImport,
  type TrainingPlan,
  type WorkoutSession,
  type WorkoutTemplate,
} from "./model";
import {
  DisciplineLabel,
  EmptyState,
  inputStyle,
  ProgressBar,
  SectionLabel,
  StatusLabel,
} from "./Shared";
import { DISCIPLINE_META, SPORT_COLORS as C } from "./theme";

export function PlansView({
  plans,
  templates,
  onCreatePlan,
  onCreateAIPlan,
  onTogglePlan,
  onCreateTemplate,
  onEditTemplate,
  onSchedule,
}: {
  plans: TrainingPlan[];
  templates: WorkoutTemplate[];
  onCreatePlan: () => void;
  onCreateAIPlan: () => void;
  onTogglePlan: (id: string) => void;
  onCreateTemplate: () => void;
  onEditTemplate: (id: string) => void;
  onSchedule: () => void;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState(plans[0]?.id ?? "");
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const selectedTemplates = selectedPlan
    ? templates.filter((template) =>
        selectedPlan.templateIds.includes(template.id),
      )
    : [];
  return (
    <div className="space-y-7">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>Aktywne plany</SectionLabel>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={onSchedule}
              className="sport-quiet-button"
            >
              Zaplanuj cykl
            </button>
            <button
              type="button"
              onClick={onCreateAIPlan}
              className="sport-quiet-button sport-quiet-button-accent"
            >
              Ułóż z AI
            </button>
            <button
              type="button"
              onClick={onCreatePlan}
              className="sport-quiet-button"
            >
              Nowy plan
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {plans.map((plan) => {
            const selected = plan.id === selectedPlanId;
            const progress = plan.totalSessions
              ? Math.round((plan.completedSessions / plan.totalSessions) * 100)
              : 0;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className="rounded-xl border p-4 text-left transition-colors"
                style={{
                  background: C.card,
                  borderColor: selected ? "rgba(71,114,250,.45)" : C.border,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className="text-[12px] font-medium"
                      style={{ color: C.text }}
                    >
                      {plan.name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {plan.disciplines.map((discipline) => (
                        <DisciplineLabel
                          key={discipline}
                          discipline={discipline}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                  <span
                    className="rounded px-1.5 py-1 text-[8px]"
                    style={{
                      color: plan.active ? C.green : C.textMuted,
                      background: plan.active ? C.greenBg : C.input,
                    }}
                  >
                    {plan.active ? "Aktywny" : "Wstrzymany"}
                  </span>
                </div>
                <div
                  className="mt-4 flex justify-between text-[9px]"
                  style={{ color: C.textMuted }}
                >
                  <span>
                    Tydzień {plan.currentWeek}/{plan.weeks}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={progress} color={C.green} />
                </div>
                <p
                  className="mt-3 text-[9px]"
                  style={{ color: C.textDisabled }}
                >
                  {plan.sessionsPerWeek} sesje tygodniowo ·{" "}
                  {plan.source === "ai" ? "utworzony z AI" : "plan własny"}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {selectedPlan && (
        <section
          className="rounded-xl border"
          style={{ background: C.card, borderColor: C.border }}
        >
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: C.border }}
          >
            <div>
              <p
                className="text-[11px] font-medium"
                style={{ color: C.textSecond }}
              >
                {selectedPlan.name}
              </p>
              <p className="mt-1 text-[9px]" style={{ color: C.textMuted }}>
                {selectedPlan.weeks} tygodni · powtarzalny układ z możliwością
                nadpisania każdej sesji
              </p>
            </div>
            <button
              type="button"
              onClick={() => onTogglePlan(selectedPlan.id)}
              className="sport-link-action"
              style={{ color: selectedPlan.active ? C.warning : C.green }}
            >
              {selectedPlan.active ? "Wstrzymaj" : "Aktywuj"}
            </button>
          </div>
          <div className="p-4">
            {selectedPlan.blocks?.length ? (
              <div className="mb-5">
                <SectionLabel>Bloki treningowe</SectionLabel>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {selectedPlan.blocks.map((block) => (
                    <div
                      key={block.id}
                      className="rounded-lg border px-3 py-2.5"
                      style={{
                        borderColor:
                          block.startWeek <= selectedPlan.currentWeek &&
                          block.endWeek >= selectedPlan.currentWeek
                            ? "rgba(71,114,250,.38)"
                            : C.border,
                        background: C.input,
                      }}
                    >
                      <div className="flex justify-between gap-3">
                        <p
                          className="text-[10px]"
                          style={{ color: C.textSecond }}
                        >
                          {block.name}
                        </p>
                        <span
                          className="text-[8px]"
                          style={{ color: C.textMuted }}
                        >
                          tyg. {block.startWeek}–{block.endWeek}
                        </span>
                      </div>
                      <p
                        className="mt-1 text-[9px]"
                        style={{ color: C.textMuted }}
                      >
                        {block.focus}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>Szablony w planie</SectionLabel>
              <button
                type="button"
                onClick={onCreateTemplate}
                className="flex items-center gap-1 text-[9px]"
                style={{ color: C.blue }}
              >
                <Plus size={10} /> Dodaj szablon
              </button>
            </div>
            {selectedTemplates.length ? (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {selectedTemplates.map((template) => (
                  <button
                    type="button"
                    onClick={() => onEditTemplate(template.id)}
                    key={template.id}
                    className="rounded-lg border px-3 py-3 text-left"
                    style={{ background: C.input, borderColor: C.border }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p
                          className="text-[10px] font-medium"
                          style={{ color: C.textSecond }}
                        >
                          {template.name}
                        </p>
                        <p
                          className="mt-1 text-[9px]"
                          style={{ color: C.textMuted }}
                        >
                          {template.description}
                        </p>
                      </div>
                      <ChevronRight
                        size={11}
                        style={{ color: C.textDisabled }}
                      />
                    </div>
                    <div
                      className="mt-3 flex gap-3 text-[9px]"
                      style={{ color: C.textMuted }}
                    >
                      <DisciplineLabel
                        discipline={template.discipline}
                        compact
                      />
                      <span>{template.durationMinutes} min</span>
                      <span>
                        {template.exercises.length ||
                          template.stages?.length ||
                          0}{" "}
                        elementów
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Plan nie ma jeszcze szablonów"
                description="Dodaj powtarzalne jednostki i przypisz je do dni tygodnia."
              />
            )}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Wszystkie szablony</SectionLabel>
          <button
            type="button"
            onClick={onCreateTemplate}
            className="flex items-center gap-1 text-[9px]"
            style={{ color: C.blue }}
          >
            <Plus size={10} /> Nowy szablon
          </button>
        </div>
        <div
          className="divide-y rounded-xl border"
          style={{ background: C.card, borderColor: C.border }}
        >
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-center gap-4 px-4 py-3"
              style={{ borderColor: C.border }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[10px]"
                  style={{ color: C.textSecond }}
                >
                  {template.name}
                </p>
                <p
                  className="mt-1 truncate text-[9px]"
                  style={{ color: C.textMuted }}
                >
                  {template.description}
                </p>
              </div>
              <DisciplineLabel discipline={template.discipline} compact />
              <span className="text-[9px]" style={{ color: C.textMuted }}>
                {template.durationMinutes} min
              </span>
              <button
                type="button"
                onClick={() => onEditTemplate(template.id)}
                className="text-[9px]"
                style={{ color: C.blue }}
              >
                Edytuj
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function HistoryView({
  sessions,
  onSelect,
}: {
  sessions: WorkoutSession[];
  onSelect: (id: string) => void;
}) {
  const [discipline, setDiscipline] = useState<Discipline | "all">("all");
  const [status, setStatus] = useState<
    "all" | "completed" | "incomplete" | "missed"
  >("all");
  const history = sessions
    .filter((session) =>
      ["completed", "incomplete", "missed"].includes(session.status),
    )
    .filter(
      (session) => discipline === "all" || session.discipline === discipline,
    )
    .filter((session) => status === "all" || session.status === status)
    .sort((a, b) => b.date.localeCompare(a.date));
  const groups = history.reduce<Record<string, WorkoutSession[]>>(
    (result, session) => {
      const key = fromDateKey(session.date).toLocaleDateString("pl-PL", {
        month: "long",
        year: "numeric",
      });
      (result[key] ??= []).push(session);
      return result;
    },
    {},
  );
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          value={discipline}
          onChange={(event) =>
            setDiscipline(event.target.value as typeof discipline)
          }
          className="h-8 rounded-lg border px-3 text-[10px] outline-none"
          style={inputStyle}
        >
          <option value="all">Wszystkie dyscypliny</option>
          {Object.entries(DISCIPLINE_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
          className="h-8 rounded-lg border px-3 text-[10px] outline-none"
          style={inputStyle}
        >
          <option value="all">Wszystkie statusy</option>
          <option value="completed">Wykonane</option>
          <option value="incomplete">Niedokończone</option>
          <option value="missed">Pominięte</option>
        </select>
        <span className="ml-auto text-[9px]" style={{ color: C.textMuted }}>
          {history.length} sesji
        </span>
      </div>
      {history.length ? (
        <div className="space-y-6">
          {Object.entries(groups).map(([label, items]) => (
            <section key={label}>
              <SectionLabel>{label}</SectionLabel>
              <div
                className="divide-y rounded-xl border"
                style={{ background: C.card, borderColor: C.border }}
              >
                {items.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onSelect(session.id)}
                    className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-white/[0.02]"
                    style={{ borderColor: C.border }}
                  >
                    <div className="w-[90px] flex-shrink-0">
                      <p
                        className="text-[10px]"
                        style={{ color: C.textSecond }}
                      >
                        {formatShortDate(session.date)}
                      </p>
                      <p
                        className="mt-1 text-[8px]"
                        style={{
                          color: C.textMuted,
                          fontFamily: "'DM Mono', monospace",
                        }}
                      >
                        {session.time ?? "—"}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[11px] font-medium"
                        style={{ color: C.textSecond }}
                      >
                        {session.title}
                      </p>
                      <div className="mt-1">
                        <DisciplineLabel
                          discipline={session.discipline}
                          compact
                        />
                      </div>
                    </div>
                    <span className="text-[9px]" style={{ color: C.textMuted }}>
                      {session.durationMinutes} min
                    </span>
                    <StatusLabel status={session.status} compact />
                    <ChevronRight size={11} style={{ color: C.textDisabled }} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Brak treningów"
          description="Nie znaleziono sesji spełniających wybrane filtry."
        />
      )}
    </div>
  );
}

export function ProgressView({
  sessions,
  plans,
}: {
  sessions: WorkoutSession[];
  plans: TrainingPlan[];
}) {
  const currentWeek = startOfWeekKey();
  const weekSessions = sessions.filter(
    (session) =>
      session.date >= currentWeek && session.date <= addDays(currentWeek, 6),
  );
  const planned = weekSessions.length;
  const completed = weekSessions.filter(
    (session) => session.status === "completed",
  ).length;
  const started = weekSessions.filter((session) =>
    ["completed", "incomplete"].includes(session.status),
  ).length;
  const byDiscipline = (Object.keys(DISCIPLINE_META) as Discipline[])
    .map((discipline) => ({
      discipline,
      count: weekSessions.filter(
        (session) =>
          session.discipline === discipline &&
          ["completed", "incomplete"].includes(session.status),
      ).length,
      planned: weekSessions.filter(
        (session) => session.discipline === discipline,
      ).length,
    }))
    .filter((item) => item.planned > 0);
  const weeks = Array.from({ length: 4 }, (_, index) =>
    addDays(currentWeek, -7 * (3 - index)),
  );
  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Realizacja planu</SectionLabel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: "Wykonane",
              value: `${completed}/${planned}`,
              sub: "sesji w tym tygodniu",
            },
            {
              label: "Realizacja",
              value: `${planned ? Math.round((completed / planned) * 100) : 0}%`,
              sub: "pełna realizacja",
            },
            {
              label: "Rozpoczęte",
              value: String(started),
              sub: "wliczając niedokończone",
            },
            {
              label: "Aktywne plany",
              value: String(plans.filter((plan) => plan.active).length),
              sub: "równolegle",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border p-4"
              style={{ background: C.card, borderColor: C.border }}
            >
              <p
                className="text-[20px] font-semibold"
                style={{ color: C.text, fontFamily: "'DM Mono', monospace" }}
              >
                {item.value}
              </p>
              <p className="mt-2 text-[10px]" style={{ color: C.textSecond }}>
                {item.label}
              </p>
              <p className="mt-0.5 text-[9px]" style={{ color: C.textMuted }}>
                {item.sub}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div
          className="rounded-xl border p-4"
          style={{ background: C.card, borderColor: C.border }}
        >
          <SectionLabel>Dyscypliny w tym tygodniu</SectionLabel>
          <div className="space-y-4">
            {byDiscipline.map((item) => {
              const meta = DISCIPLINE_META[item.discipline];
              return (
                <div key={item.discipline}>
                  <div className="mb-2 flex items-center justify-between">
                    <DisciplineLabel discipline={item.discipline} />
                    <span
                      className="text-[10px]"
                      style={{
                        color: C.textSecond,
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {item.count}/{item.planned}
                    </span>
                  </div>
                  <ProgressBar
                    value={(item.count / item.planned) * 100}
                    color={meta.color}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{ background: C.card, borderColor: C.border }}
        >
          <SectionLabel>Ostatnie 4 tygodnie</SectionLabel>
          <div className="flex h-36 items-end gap-3">
            {weeks.map((week) => {
              const count = sessions.filter(
                (session) =>
                  session.date >= week &&
                  session.date <= addDays(week, 6) &&
                  session.status === "completed",
              ).length;
              return (
                <div
                  key={week}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <span className="text-[9px]" style={{ color: C.textMuted }}>
                    {count}
                  </span>
                  <div
                    className="w-full max-w-12 rounded-t"
                    style={{
                      height: `${20 + count * 14}px`,
                      background: count ? C.blue : C.border,
                      opacity: 0.75,
                    }}
                  />
                  <span
                    className="text-[8px]"
                    style={{ color: C.textDisabled }}
                  >
                    {formatShortDate(week)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <section
        className="rounded-xl border p-4"
        style={{ background: C.blueBg, borderColor: "rgba(71,114,250,.24)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="text-[9px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: C.blue }}
            >
              Sugestia asystenta
            </p>
            <p
              className="mt-2 text-[11px] font-medium"
              style={{ color: C.text }}
            >
              Pozostaw 80 kg w następnym wyciskaniu
            </p>
            <p
              className="mt-1 max-w-2xl text-[10px] leading-5"
              style={{ color: C.textMuted }}
            >
              Ostatni wynik 8 / 6 / 6 mieści się w zakresie 6–8, ale nie osiąga
              jeszcze górnej granicy we wszystkich seriach. Sugestia nie zmienia
              planu automatycznie.
            </p>
          </div>
          <button type="button" className="sport-primary-button flex-shrink-0">
            Zobacz analizę
          </button>
        </div>
      </section>
    </div>
  );
}

export function ExercisesView({
  exercises,
  onAdd,
}: {
  exercises: ExerciseLibraryItem[];
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState<Discipline | "all">("all");
  const [selectedId, setSelectedId] = useState(exercises[0]?.id ?? "");
  const normalized = normalizeSearch(query);
  const filtered = exercises
    .filter((item) => discipline === "all" || item.discipline === discipline)
    .filter(
      (item) =>
        !normalized ||
        normalizeSearch(
          [
            item.name,
            ...item.aliases,
            ...item.primaryMuscles,
            ...item.equipment,
          ].join(" "),
        ).includes(normalized),
    );
  const selected = exercises.find((item) => item.id === selectedId);
  return (
    <div className="flex h-full min-h-0 gap-4">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div
            className="flex h-8 min-w-[260px] flex-1 items-center gap-2 rounded-lg border px-3"
            style={{ background: C.input, borderColor: C.border }}
          >
            <Search size={12} style={{ color: C.textMuted }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Szukaj po nazwie, synonimie, partii lub sprzęcie"
              className="min-w-0 flex-1 bg-transparent text-[10px] outline-none"
              style={{ color: C.textSecond }}
            />
          </div>
          <select
            value={discipline}
            onChange={(event) =>
              setDiscipline(event.target.value as typeof discipline)
            }
            className="h-8 rounded-lg border px-3 text-[10px] outline-none"
            style={inputStyle}
          >
            <option value="all">Wszystkie dyscypliny</option>
            {Object.entries(DISCIPLINE_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onAdd}
            className="sport-primary-button"
          >
            Własne ćwiczenie
          </button>
        </div>
        <p className="mb-2 text-[9px]" style={{ color: C.textMuted }}>
          {filtered.length} wyników
        </p>
        <div
          className="min-h-0 flex-1 overflow-y-auto rounded-xl border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ background: C.card, borderColor: C.border }}
        >
          {filtered.length ? (
            <div className="divide-y" style={{ borderColor: C.border }}>
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left"
                  style={{
                    background:
                      item.id === selectedId ? C.blueBg : "transparent",
                    borderColor: C.border,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[10px] font-medium"
                      style={{
                        color: item.id === selectedId ? C.blue : C.textSecond,
                      }}
                    >
                      {item.name}
                      {item.custom && (
                        <span
                          className="ml-2 text-[8px]"
                          style={{ color: C.warning }}
                        >
                          własne
                        </span>
                      )}
                    </p>
                    <p
                      className="mt-1 truncate text-[9px]"
                      style={{ color: C.textMuted }}
                    >
                      {item.primaryMuscles.join(", ")} ·{" "}
                      {item.equipment.join(", ") || "bez sprzętu"}
                    </p>
                  </div>
                  <DisciplineLabel discipline={item.discipline} compact />
                  <ChevronRight size={11} style={{ color: C.textDisabled }} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Brak dopasowań"
              description="Spróbuj nazwy potocznej, angielskiej, partii mięśniowej lub dodaj własne ćwiczenie."
            />
          )}
        </div>
      </section>
      {selected && (
        <aside
          className="hidden w-[310px] flex-shrink-0 overflow-y-auto rounded-xl border p-4 lg:block"
          style={{ background: C.card, borderColor: C.border }}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p
                className="text-[12px] font-medium leading-5"
                style={{ color: C.text }}
              >
                {selected.name}
              </p>
              <div className="mt-2">
                <DisciplineLabel discipline={selected.discipline} />
              </div>
            </div>
            {selected.custom && (
              <span
                className="rounded px-1.5 py-1 text-[8px]"
                style={{ color: C.warning, background: C.warningBg }}
              >
                Własne
              </span>
            )}
          </div>
          <Detail title="Nazwy alternatywne" values={selected.aliases} />
          <Detail title="Główne partie" values={selected.primaryMuscles} />
          <Detail
            title="Partie pomocnicze"
            values={selected.secondaryMuscles}
          />
          <Detail title="Sprzęt" values={selected.equipment} />
          <div className="mt-5">
            <p
              className="text-[9px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: C.textMuted }}
            >
              Wskazówki
            </p>
            <p
              className="mt-2 text-[10px] leading-5"
              style={{ color: C.textSecond }}
            >
              {selected.instruction}
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}

function Detail({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="mt-5">
      <p
        className="text-[9px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: C.textMuted }}
      >
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.length ? (
          values.map((value) => (
            <span
              key={value}
              className="rounded-md px-2 py-1 text-[9px]"
              style={{ color: C.textSecond, background: C.input }}
            >
              {value}
            </span>
          ))
        ) : (
          <span className="text-[9px]" style={{ color: C.textDisabled }}>
            Brak
          </span>
        )}
      </div>
    </div>
  );
}

export function IntegrationsView({
  imports,
  sessions,
  connections,
  onToggleConnection,
  onResolve,
}: {
  imports: PendingImport[];
  sessions: WorkoutSession[];
  connections: Record<string, boolean>;
  onToggleConnection: (name: string) => void;
  onResolve: (
    importId: string,
    mode: "separate" | "assign",
    sessionId?: string,
  ) => void;
}) {
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState("");
  const schedulable = sessions.filter((session) =>
    ["scheduled", "missed"].includes(session.status),
  );
  return (
    <div className="space-y-7">
      <section>
        <SectionLabel>Połączone źródła</SectionLabel>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {["Strava", "Garmin", "Apple Health"].map((name) => {
            const connected = connections[name];
            return (
              <div
                key={name}
                className="rounded-xl border p-4"
                style={{ background: C.card, borderColor: C.border }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p
                      className="text-[11px] font-medium"
                      style={{ color: C.textSecond }}
                    >
                      {name}
                    </p>
                    <p
                      className="mt-1 text-[9px]"
                      style={{ color: connected ? C.green : C.textMuted }}
                    >
                      {connected
                        ? "Połączono · synchronizacja aktywna"
                        : "Niepołączono"}
                    </p>
                  </div>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: connected ? C.green : C.textDisabled }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onToggleConnection(name)}
                  className={`mt-5 w-full ${connected ? "sport-danger-button" : "sport-primary-button"}`}
                >
                  {connected ? "Odłącz" : "Połącz"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Do przypisania · {imports.length}</SectionLabel>
          <p className="text-[9px]" style={{ color: C.textMuted }}>
            Niepewne dopasowania wymagają decyzji
          </p>
        </div>
        {imports.length ? (
          <div className="space-y-2">
            {imports.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border p-4"
                style={{ background: C.card, borderColor: C.border }}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p
                        className="text-[11px] font-medium"
                        style={{ color: C.textSecond }}
                      >
                        {item.title}
                      </p>
                      <span
                        className="rounded px-1.5 py-0.5 text-[8px]"
                        style={{ color: C.textMuted, background: C.input }}
                      >
                        {item.source}
                      </span>
                    </div>
                    <div
                      className="mt-2 flex flex-wrap gap-3 text-[9px]"
                      style={{ color: C.textMuted }}
                    >
                      <DisciplineLabel discipline={item.discipline} compact />
                      <span>{formatLongDate(item.date)}</span>
                      <span>{item.durationMinutes} min</span>
                      {item.distanceKm && <span>{item.distanceKm} km</span>}
                    </div>
                    <p className="mt-3 text-[9px]" style={{ color: C.warning }}>
                      Pewność dopasowania: {item.confidence}%
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onResolve(item.id, "separate")}
                      className="sport-quiet-button"
                    >
                      Poza planem
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAssigningId(item.id);
                        setSessionId(item.suggestedSessionId ?? "");
                      }}
                      className="sport-primary-button"
                    >
                      Przypisz do sesji
                    </button>
                  </div>
                </div>
                {assigningId === item.id && (
                  <div
                    className="mt-4 flex gap-2 border-t pt-4"
                    style={{ borderColor: C.border }}
                  >
                    <select
                      value={sessionId}
                      onChange={(event) => setSessionId(event.target.value)}
                      className="h-8 min-w-0 flex-1 rounded-lg border px-3 text-[9px] outline-none"
                      style={inputStyle}
                    >
                      <option value="">Wybierz jednostkę z planu</option>
                      {schedulable.map((session) => (
                        <option key={session.id} value={session.id}>
                          {formatShortDate(session.date)} · {session.title}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!sessionId}
                      type="button"
                      onClick={() => {
                        onResolve(item.id, "assign", sessionId);
                        setAssigningId(null);
                      }}
                      className="sport-primary-button"
                    >
                      Potwierdź
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Wszystkie aktywności przypisane"
            description="Nowe niejednoznaczne importy pojawią się w tym miejscu."
          />
        )}
      </section>
      <section
        className="rounded-xl border p-4"
        style={{ borderColor: C.border, background: C.input }}
      >
        <p className="text-[10px] font-medium" style={{ color: C.textSecond }}>
          Zasada dopasowania
        </p>
        <p className="mt-1 text-[9px] leading-5" style={{ color: C.textMuted }}>
          Rootine porównuje dyscyplinę, termin, czas, dystans i nazwę. Pewne
          dopasowania są wykonywane automatycznie i można je cofnąć; niepewne
          zawsze trafiają tutaj.
        </p>
      </section>
    </div>
  );
}
