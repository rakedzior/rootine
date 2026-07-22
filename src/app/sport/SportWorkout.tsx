import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  Ellipsis,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import type {
  ExerciseLibraryItem,
  TrainingPlan,
  WorkoutSession,
  WorkoutTemplate,
} from "./model";
import { formatLongDate } from "./model";
import { Menu, MenuItem } from "../ui";
import {
  DisciplineLabel,
  inputStyle,
  Modal,
  ProgressBar,
  StatusLabel,
} from "./Shared";
import { DISCIPLINE_META, SPORT_COLORS as C, STATUS_META } from "./theme";

function cloneSession(
  session: WorkoutSession,
  patch: Partial<WorkoutSession>,
): WorkoutSession {
  return { ...session, ...patch };
}

export function WorkoutDetailPanel({
  session,
  plan,
  template,
  onClose,
  onStart,
  onUpdate,
  onDuplicate,
  onDelete,
}: {
  session: WorkoutSession;
  plan?: TrainingPlan;
  template?: WorkoutTemplate;
  onClose: () => void;
  onStart: () => void;
  onUpdate: (patch: Partial<WorkoutSession>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const completedSets = session.exercises
    .flatMap((item) => item.sets)
    .filter((set) => set.done).length;
  const totalSets = session.exercises.flatMap((item) => item.sets).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className="flex min-h-[68px] items-center justify-between border-b px-5"
        style={{ borderColor: C.border }}
      >
        <div className="min-w-0">
          <p
            className="text-[9px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: C.textMuted }}
          >
            Szczegóły treningu
          </p>
          <h2
            className="mt-1 truncate text-[16px] font-semibold"
            style={{ color: C.text }}
          >
            {session.title}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{ color: C.textMuted }}
            >
              <Ellipsis size={15} />
            </button>
            {menuOpen && (
              <Menu className="absolute right-0 top-8 z-10 w-40">
                <MenuItem
                  onClick={() => {
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                >
                  Edytuj sesję
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    onDuplicate();
                    setMenuOpen(false);
                  }}
                >
                  Duplikuj sesję
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    onUpdate({ status: "missed" });
                    setMenuOpen(false);
                  }}
                >
                  Oznacz jako pominięty
                </MenuItem>
                <MenuItem
                  tone="success"
                  onClick={() => {
                    onUpdate({ status: "completed" });
                    setMenuOpen(false);
                  }}
                >
                  Oznacz jako wykonany
                </MenuItem>
                <MenuItem
                  onClick={onDelete}
                  tone="danger"
                  leadingIcon={<Trash2 />}
                >
                  Usuń sesję
                </MenuItem>
              </Menu>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ color: C.textMuted }}
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {editing ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setEditing(false);
            }}
          >
            <label className="block">
              <span
                className="mb-1.5 block text-[10px]"
                style={{ color: C.textMuted }}
              >
                Nazwa
              </span>
              <input
                value={session.title}
                onChange={(event) => onUpdate({ title: event.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-[11px] outline-none"
                style={inputStyle}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span
                  className="mb-1.5 block text-[10px]"
                  style={{ color: C.textMuted }}
                >
                  Data
                </span>
                <input
                  type="date"
                  value={session.date}
                  onChange={(event) =>
                    onUpdate({
                      date: event.target.value,
                      status:
                        session.status === "missed"
                          ? "scheduled"
                          : session.status,
                    })
                  }
                  className="w-full rounded-lg border px-2.5 py-2 text-[10px] outline-none"
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
                  value={session.time ?? ""}
                  onChange={(event) => onUpdate({ time: event.target.value })}
                  className="w-full rounded-lg border px-2.5 py-2 text-[10px] outline-none"
                  style={inputStyle}
                />
              </label>
            </div>
            <label className="block">
              <span
                className="mb-1.5 block text-[10px]"
                style={{ color: C.textMuted }}
              >
                Status
              </span>
              <select
                value={session.status}
                onChange={(event) =>
                  onUpdate({
                    status: event.target.value as WorkoutSession["status"],
                  })
                }
                className="w-full rounded-lg border px-3 py-2 text-[10px] outline-none"
                style={inputStyle}
              >
                {Object.entries(STATUS_META).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span
                className="mb-1.5 block text-[10px]"
                style={{ color: C.textMuted }}
              >
                Notatka
              </span>
              <textarea
                value={session.note ?? ""}
                onChange={(event) => onUpdate({ note: event.target.value })}
                rows={4}
                className="w-full resize-none rounded-lg border px-3 py-2 text-[10px] outline-none"
                style={inputStyle}
              />
            </label>
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="sport-link-action"
                style={{ color: C.textMuted }}
              >
                Anuluj
              </button>
              <button type="submit" className="sport-primary-button">
                Zapisz
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <DisciplineLabel discipline={session.discipline} />
              <StatusLabel status={session.status} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Termin", value: formatLongDate(session.date) },
                { label: "Godzina", value: session.time ?? "Bez godziny" },
                { label: "Czas", value: `${session.durationMinutes} min` },
                {
                  label: "Lokalizacja",
                  value: session.location ?? "Nie ustawiono",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border p-3"
                  style={{ background: C.input, borderColor: C.border }}
                >
                  <p className="text-[9px]" style={{ color: C.textMuted }}>
                    {item.label}
                  </p>
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: C.textSecond }}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {(plan || template) && (
              <div
                className="mt-4 rounded-lg border px-3 py-2.5"
                style={{ borderColor: C.border, background: C.input }}
              >
                <p className="text-[9px]" style={{ color: C.textMuted }}>
                  Źródło
                </p>
                <p className="mt-1 text-[10px]" style={{ color: C.textSecond }}>
                  {plan?.name}
                  {plan && template ? " · " : ""}
                  {template?.name}
                </p>
              </div>
            )}

            {totalSets > 0 && (
              <div className="mt-5">
                <div
                  className="mb-2 flex justify-between text-[9px]"
                  style={{ color: C.textMuted }}
                >
                  <span>Realizacja serii</span>
                  <span>
                    {completedSets}/{totalSets}
                  </span>
                </div>
                <ProgressBar
                  value={(completedSets / totalSets) * 100}
                  color={C.green}
                />
              </div>
            )}

            <section className="mt-6">
              <p
                className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: C.textMuted }}
              >
                {session.stages?.length ? "Etapy" : "Plan treningu"}
              </p>
              <div className="divide-y" style={{ borderColor: C.border }}>
                {session.exercises.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 py-3"
                    style={{ borderColor: C.border }}
                  >
                    <span
                      className="w-4 text-[9px]"
                      style={{
                        color: C.textDisabled,
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[10px]"
                        style={{ color: C.textSecond }}
                      >
                        {item.name}
                      </p>
                      <p
                        className="mt-1 text-[9px]"
                        style={{ color: C.textMuted }}
                      >
                        {item.sets.length} serie ·{" "}
                        {item.sets[0]?.plannedSeconds
                          ? `${item.sets[0].plannedSeconds} s`
                          : `${item.sets[0]?.plannedReps ?? "—"} powt.`}
                        {item.sets[0]?.plannedWeight !== undefined
                          ? ` · ${item.sets[0].plannedWeight} kg`
                          : ""}
                      </p>
                    </div>
                    <ChevronRight size={11} style={{ color: C.textDisabled }} />
                  </div>
                ))}
                {session.stages?.map((stage, index) => (
                  <div
                    key={stage.id}
                    className="flex items-start gap-3 py-3"
                    style={{ borderColor: C.border }}
                  >
                    <span
                      className="w-4 text-[9px]"
                      style={{ color: C.textDisabled }}
                    >
                      {index + 1}
                    </span>
                    <div>
                      <p
                        className="text-[10px]"
                        style={{ color: C.textSecond }}
                      >
                        {stage.label}
                      </p>
                      <p
                        className="mt-1 text-[9px]"
                        style={{ color: C.textMuted }}
                      >
                        {stage.target}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {session.note && (
              <div className="mt-4">
                <p className="mb-1.5 text-[9px]" style={{ color: C.textMuted }}>
                  Notatka
                </p>
                <p
                  className="text-[10px] leading-5"
                  style={{ color: C.textSecond }}
                >
                  {session.note}
                </p>
              </div>
            )}
          </>
        )}
      </div>
      {!editing && (
        <footer className="border-t p-4" style={{ borderColor: C.border }}>
          {(session.status === "scheduled" ||
            session.status === "in_progress") && (
            <button
              type="button"
              onClick={onStart}
              className="sport-primary-button w-full"
            >
              {session.status === "in_progress"
                ? "Wznów trening"
                : "Rozpocznij trening"}
            </button>
          )}
          {session.status === "missed" && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="sport-quiet-button sport-quiet-button-accent w-full"
            >
              Przenieś trening
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  suffix,
  min = 0,
  step = 1,
}: {
  value?: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  step?: number;
}) {
  return (
    <label className="relative block">
      <input
        type="number"
        min={min}
        step={step}
        value={value ?? 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full rounded-lg border bg-transparent px-3 pr-9 text-center text-[13px] outline-none"
        style={{
          color: C.text,
          borderColor: C.borderStrong,
          fontFamily: "'DM Mono', monospace",
        }}
      />
      {suffix && (
        <span
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px]"
          style={{ color: C.textMuted }}
        >
          {suffix}
        </span>
      )}
    </label>
  );
}

export function ActiveWorkout({
  session,
  library,
  onBack,
  onUpdate,
  onFinish,
  onIncomplete,
  onUpdateTemplate,
}: {
  session: WorkoutSession;
  library: ExerciseLibraryItem[];
  onBack: () => void;
  onUpdate: (next: WorkoutSession) => void;
  onFinish: () => void;
  onIncomplete: () => void;
  onUpdateTemplate: (
    templateId: string,
    exercises: WorkoutSession["exercises"],
  ) => void;
}) {
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [setIndex, setSetIndex] = useState(0);
  const [planOpen, setPlanOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapExerciseId, setSwapExerciseId] = useState("");
  const [timerSeconds, setTimerSeconds] = useState<number | null>(() => {
    if (session.restTimerRemaining === undefined) return null;
    if (!session.restTimerRunning || !session.restTimerUpdatedAt)
      return session.restTimerRemaining;
    return Math.max(
      0,
      session.restTimerRemaining -
        Math.floor((Date.now() - session.restTimerUpdatedAt) / 1000),
    );
  });
  const [timerRunning, setTimerRunning] = useState(() =>
    Boolean(session.restTimerRunning && (session.restTimerRemaining ?? 0) > 0),
  );
  const currentExercise = session.exercises[exerciseIndex];
  const currentSet = currentExercise?.sets[setIndex];
  const allSets = session.exercises.flatMap((item) => item.sets);
  const doneSets = allSets.filter((set) => set.done).length;

  useEffect(() => {
    if (!timerRunning || timerSeconds === null || timerSeconds <= 0) return;
    const timer = window.setInterval(
      () =>
        setTimerSeconds((seconds) =>
          seconds === null ? null : Math.max(0, seconds - 1),
        ),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [timerRunning, timerSeconds]);

  useEffect(() => {
    if (timerSeconds === 0) setTimerRunning(false);
  }, [timerSeconds]);

  useEffect(() => {
    if (timerSeconds === null) return;
    onUpdate({
      ...session,
      restTimerRemaining: timerSeconds,
      restTimerRunning: timerRunning,
      restTimerUpdatedAt: Date.now(),
    });
    // The countdown is intentionally persisted so returning to an active session does not lose it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerSeconds, timerRunning]);

  const updateSet = (patch: Partial<NonNullable<typeof currentSet>>) => {
    if (!currentExercise || !currentSet) return;
    const exercises = session.exercises.map((item, itemPosition) =>
      itemPosition === exerciseIndex
        ? {
            ...item,
            sets: item.sets.map((set, setPosition) =>
              setPosition === setIndex ? { ...set, ...patch } : set,
            ),
          }
        : item,
    );
    onUpdate(cloneSession(session, { exercises }));
  };

  const completeCurrentSet = () => {
    if (!currentExercise || !currentSet) return;
    updateSet({ done: !currentSet.done });
    if (!currentSet.done) {
      setTimerSeconds(currentExercise.restSeconds);
      setTimerRunning(true);
      if (setIndex < currentExercise.sets.length - 1) setSetIndex(setIndex + 1);
      else if (exerciseIndex < session.exercises.length - 1) {
        setExerciseIndex(exerciseIndex + 1);
        setSetIndex(0);
      }
    }
  };

  const reorder = (index: number, amount: number) => {
    const target = index + amount;
    if (target < 0 || target >= session.exercises.length) return;
    const exercises = [...session.exercises];
    [exercises[index], exercises[target]] = [
      exercises[target],
      exercises[index],
    ];
    onUpdate(cloneSession(session, { exercises }));
    setExerciseIndex(target);
  };

  const swapCurrent = (scope: "session" | "template") => {
    const replacement = library.find((item) => item.id === swapExerciseId);
    if (!replacement || !currentExercise) return;
    const exercises = session.exercises.map((item, index) =>
      index === exerciseIndex
        ? { ...item, exerciseId: replacement.id, name: replacement.name }
        : item,
    );
    onUpdate(cloneSession(session, { exercises }));
    if (scope === "template" && session.templateId)
      onUpdateTemplate(session.templateId, exercises);
    setSwapOpen(false);
    setSwapExerciseId("");
  };

  if (session.stages?.length) {
    const completed = session.stages.filter((stage) => stage.done).length;
    return (
      <div
        className="sport-module flex h-full min-w-0 flex-1 flex-col"
        style={{ background: C.bg }}
      >
        <header
          className="flex min-h-[68px] items-center justify-between border-b px-5"
          style={{ borderColor: C.border }}
        >
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-[10px]"
            style={{ color: C.textMuted }}
          >
            <ArrowLeft size={13} /> Wróć do Sportu
          </button>
          <div className="text-center">
            <p className="text-[13px] font-semibold" style={{ color: C.text }}>
              {session.title}
            </p>
            <p className="mt-1 text-[9px]" style={{ color: C.textMuted }}>
              {completed}/{session.stages.length} etapów
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFinishOpen(true)}
            className="sport-primary-button"
          >
            Zakończ
          </button>
        </header>
        <main className="mx-auto w-full max-w-[760px] flex-1 overflow-y-auto px-7 py-7">
          <p
            className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: C.textMuted }}
          >
            Etapy treningu
          </p>
          <div className="space-y-2">
            {session.stages.map((stage, index) => (
              <button
                key={stage.id}
                type="button"
                onClick={() =>
                  onUpdate({
                    ...session,
                    stages: session.stages!.map((item) =>
                      item.id === stage.id
                        ? { ...item, done: !item.done }
                        : item,
                    ),
                  })
                }
                className="flex w-full items-center gap-4 rounded-xl border p-4 text-left"
                style={{
                  borderColor: stage.done ? "color-mix(in srgb, var(--color-success-seaglass) 28%, transparent)" : C.border,
                  background: C.card,
                }}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full border"
                  style={{
                    borderColor: stage.done ? C.green : C.borderStrong,
                    color: C.green,
                  }}
                >
                  {stage.done && <Check size={11} />}
                </span>
                <span
                  className="w-5 text-[10px]"
                  style={{ color: C.textDisabled }}
                >
                  {index + 1}
                </span>
                <div>
                  <p
                    className="text-[12px]"
                    style={{ color: stage.done ? C.textMuted : C.text }}
                  >
                    {stage.label}
                  </p>
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: C.textMuted }}
                  >
                    {stage.target}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <section
            className="mt-6 rounded-xl border p-4"
            style={{ borderColor: C.border, background: C.card }}
          >
            <p
              className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: C.textMuted }}
            >
              Dane wykonane
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumberInput
                suffix="km"
                value={session.metrics?.distanceKm}
                step={0.1}
                onChange={(distanceKm) =>
                  onUpdate({
                    ...session,
                    metrics: { ...session.metrics, distanceKm },
                  })
                }
              />
              <NumberInput
                suffix="min"
                value={session.metrics?.timeMinutes}
                onChange={(timeMinutes) =>
                  onUpdate({
                    ...session,
                    metrics: { ...session.metrics, timeMinutes },
                  })
                }
              />
              <NumberInput
                suffix="RPE"
                min={1}
                value={session.metrics?.rpe}
                onChange={(rpe) =>
                  onUpdate({ ...session, metrics: { ...session.metrics, rpe } })
                }
              />
            </div>
          </section>
        </main>
        {finishOpen && (
          <FinishDialog
            onClose={() => setFinishOpen(false)}
            onFinish={onFinish}
            onIncomplete={onIncomplete}
          />
        )}
      </div>
    );
  }

  if (!currentExercise || !currentSet) {
    const first =
      library.find((item) => item.discipline === session.discipline) ??
      library[0];
    return (
      <div
        className="sport-module flex h-full min-w-0 flex-1 flex-col"
        style={{ background: C.bg }}
      >
        <header
          className="flex min-h-[68px] items-center justify-between border-b px-5"
          style={{ borderColor: C.border }}
        >
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-[10px]"
            style={{ color: C.textMuted }}
          >
            <ArrowLeft size={13} /> Wróć do Sportu
          </button>
          <p className="text-[13px] font-semibold" style={{ color: C.text }}>
            {session.title}
          </p>
          <button
            type="button"
            onClick={() => setFinishOpen(true)}
            className="sport-primary-button"
          >
            Zakończ
          </button>
        </header>
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <p
              className="text-[13px] font-medium"
              style={{ color: C.textSecond }}
            >
              Szybki trening jest pusty
            </p>
            <p
              className="mt-2 text-[10px] leading-5"
              style={{ color: C.textMuted }}
            >
              Dodaj pierwsze ćwiczenie. W dowolnym momencie możesz rozbudować
              plan i zapisać sesję w historii.
            </p>
            <button
              disabled={!first}
              type="button"
              onClick={() => {
                if (!first) return;
                onUpdate({
                  ...session,
                  exercises: [
                    {
                      id: `${session.id}-exercise-1`,
                      exerciseId: first.id,
                      name: first.name,
                      restSeconds: 60,
                      sets: [
                        {
                          id: `${session.id}-set-1`,
                          plannedReps: 10,
                          actualReps: 10,
                          rir: 2,
                          done: false,
                        },
                      ],
                    },
                  ],
                });
              }}
              className="sport-primary-button mt-4"
              style={{
                marginInline: "auto",
              }}
            >
              Dodaj pierwsze ćwiczenie
            </button>
          </div>
        </main>
        {finishOpen && (
          <FinishDialog
            onClose={() => setFinishOpen(false)}
            onFinish={onFinish}
            onIncomplete={onIncomplete}
          />
        )}
      </div>
    );
  }
  const discipline = DISCIPLINE_META[session.discipline];
  return (
    <div
      className="sport-module relative flex h-full min-w-0 flex-1 flex-col"
      style={{ background: C.bg }}
    >
      <header
        className="flex min-h-[68px] items-center justify-between border-b px-5"
        style={{ borderColor: C.border }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-[10px]"
          style={{ color: C.textMuted }}
        >
          <ArrowLeft size={13} /> Wróć do Sportu
        </button>
        <div className="min-w-0 text-center">
          <p
            className="truncate text-[13px] font-semibold"
            style={{ color: C.text }}
          >
            {session.title}
          </p>
          <p className="mt-1 text-[9px]" style={{ color: C.textMuted }}>
            {doneSets}/{allSets.length} serii · {discipline.label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlanOpen((open) => !open)}
            className="sport-quiet-button"
          >
            Plan treningu
          </button>
          <button
            type="button"
            onClick={() => setFinishOpen(true)}
            className="sport-primary-button"
          >
            Zakończ
          </button>
        </div>
      </header>
      <div className="h-1" style={{ background: C.border }}>
        <div
          className="h-full transition-all"
          style={{
            width: `${allSets.length ? (doneSets / allSets.length) * 100 : 0}%`,
            background: C.green,
          }}
        />
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto max-w-[690px]">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p
                className="text-[9px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: C.textMuted }}
              >
                Ćwiczenie {exerciseIndex + 1} z {session.exercises.length}
              </p>
              <h1
                className="mt-2 text-[22px] font-semibold tracking-tight"
                style={{ color: C.text }}
              >
                {currentExercise.name}
              </h1>
              <p className="mt-1 text-[10px]" style={{ color: C.textMuted }}>
                Seria {setIndex + 1} z {currentExercise.sets.length}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSwapOpen(true)}
              className="sport-quiet-button"
            >
              Zamień ćwiczenie
            </button>
          </div>

          <section
            className="rounded-2xl border p-5"
            style={{ background: C.card, borderColor: C.border }}
          >
            <div className="mb-5 grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
              <div>
                <p className="text-[9px]" style={{ color: C.textMuted }}>
                  Plan
                </p>
                <p className="mt-1 text-[11px]" style={{ color: C.textSecond }}>
                  {currentSet.plannedSeconds
                    ? `${currentSet.plannedSeconds} s`
                    : `${currentSet.plannedReps ?? "—"} powt.`}
                </p>
              </div>
              <div>
                <p className="text-[9px]" style={{ color: C.textMuted }}>
                  Ciężar
                </p>
                <p className="mt-1 text-[11px]" style={{ color: C.textSecond }}>
                  {currentSet.plannedWeight !== undefined
                    ? `${currentSet.plannedWeight} kg`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-[9px]" style={{ color: C.textMuted }}>
                  {session.discipline === "rehab" ? "Ból" : "RIR"}
                </p>
                <p className="mt-1 text-[11px]" style={{ color: C.textSecond }}>
                  {session.discipline === "rehab"
                    ? `${currentSet.pain ?? 0}/10`
                    : (currentSet.rir ?? 2)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {currentSet.plannedSeconds ? (
                <div>
                  <p
                    className="mb-1.5 text-center text-[9px]"
                    style={{ color: C.textMuted }}
                  >
                    Czas
                  </p>
                  <NumberInput
                    suffix="s"
                    value={currentSet.actualSeconds}
                    onChange={(actualSeconds) => updateSet({ actualSeconds })}
                  />
                </div>
              ) : (
                <div>
                  <p
                    className="mb-1.5 text-center text-[9px]"
                    style={{ color: C.textMuted }}
                  >
                    Powtórzenia
                  </p>
                  <NumberInput
                    value={currentSet.actualReps}
                    onChange={(actualReps) => updateSet({ actualReps })}
                  />
                </div>
              )}
              <div>
                <p
                  className="mb-1.5 text-center text-[9px]"
                  style={{ color: C.textMuted }}
                >
                  Ciężar
                </p>
                <NumberInput
                  suffix="kg"
                  step={0.5}
                  value={currentSet.actualWeight}
                  onChange={(actualWeight) => updateSet({ actualWeight })}
                />
              </div>
              {session.discipline === "rehab" ? (
                <div>
                  <p
                    className="mb-1.5 text-center text-[9px]"
                    style={{ color: C.textMuted }}
                  >
                    Ból
                  </p>
                  <NumberInput
                    suffix="/10"
                    min={0}
                    value={currentSet.pain}
                    onChange={(pain) => updateSet({ pain: Math.min(10, pain) })}
                  />
                </div>
              ) : (
                <div>
                  <p
                    className="mb-1.5 text-center text-[9px]"
                    style={{ color: C.textMuted }}
                  >
                    RIR
                  </p>
                  <NumberInput
                    min={0}
                    value={currentSet.rir}
                    onChange={(rir) => updateSet({ rir })}
                  />
                </div>
              )}
            </div>
            <label className="mt-4 block">
              <span
                className="mb-1.5 block text-[9px]"
                style={{ color: C.textMuted }}
              >
                Notatka do serii
              </span>
              <input
                value={currentSet.note ?? ""}
                onChange={(event) => updateSet({ note: event.target.value })}
                placeholder="Opcjonalnie"
                className="w-full rounded-lg border px-3 py-2 text-[10px] outline-none"
                style={inputStyle}
              />
            </label>
            <button
              type="button"
              onClick={completeCurrentSet}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[11px] font-medium"
              style={{
                background: currentSet.done ? C.greenBg : C.blue,
                color: currentSet.done ? C.green : "white",
              }}
            >
              {currentSet.done && <Check size={13} />}
              {currentSet.done ? "Seria wykonana" : "Zakończ serię"}
            </button>
          </section>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={exerciseIndex === 0 && setIndex === 0}
              onClick={() => {
                if (setIndex > 0) setSetIndex(setIndex - 1);
                else if (exerciseIndex > 0) {
                  setExerciseIndex(exerciseIndex - 1);
                  setSetIndex(
                    session.exercises[exerciseIndex - 1].sets.length - 1,
                  );
                }
              }}
              className="text-[10px] disabled:opacity-30"
              style={{ color: C.textMuted }}
            >
              Poprzednia seria
            </button>
            <button
              type="button"
              disabled={
                exerciseIndex === session.exercises.length - 1 &&
                setIndex === currentExercise.sets.length - 1
              }
              onClick={() => {
                if (setIndex < currentExercise.sets.length - 1)
                  setSetIndex(setIndex + 1);
                else if (exerciseIndex < session.exercises.length - 1) {
                  setExerciseIndex(exerciseIndex + 1);
                  setSetIndex(0);
                }
              }}
              className="flex items-center gap-1 text-[10px] disabled:opacity-30"
              style={{ color: C.blue }}
            >
              Następna seria <ChevronRight size={11} />
            </button>
          </div>
        </div>
      </main>

      {timerSeconds !== null && (
        <div
          className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2.5 shadow-2xl"
          style={{ background: C.cardStrong, borderColor: C.borderStrong }}
        >
          <span className="text-[9px]" style={{ color: C.textMuted }}>
            Przerwa
          </span>
          <span
            className="min-w-[48px] text-center text-[16px]"
            style={{
              color: timerSeconds === 0 ? C.green : C.text,
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {Math.floor(timerSeconds / 60)}:
            {String(timerSeconds % 60).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={() => setTimerRunning((running) => !running)}
            aria-label={timerRunning ? "Pauza" : "Wznów"}
            style={{ color: C.textSecond }}
          >
            {timerRunning ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setTimerSeconds((seconds) => (seconds ?? 0) + 30);
              setTimerRunning(true);
            }}
            className="text-[9px]"
            style={{ color: C.blue }}
          >
            +30 s
          </button>
          <button
            type="button"
            onClick={() => {
              setTimerSeconds(null);
              setTimerRunning(false);
              onUpdate({
                ...session,
                restTimerRemaining: undefined,
                restTimerRunning: false,
                restTimerUpdatedAt: undefined,
              });
            }}
            className="text-[9px]"
            style={{ color: C.textMuted }}
          >
            Pomiń
          </button>
        </div>
      )}

      {planOpen && (
        <aside
          className="absolute inset-y-[69px] right-0 z-30 w-[350px] max-w-full overflow-y-auto border-l p-4 shadow-2xl"
          style={{ background: C.subSidebar, borderColor: C.border }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p
                className="text-[9px] uppercase tracking-[0.16em]"
                style={{ color: C.textMuted }}
              >
                Plan treningu
              </p>
              <p className="mt-1 text-[12px]" style={{ color: C.text }}>
                {session.title}
              </p>
            </div>
            <button
              onClick={() => setPlanOpen(false)}
              style={{ color: C.textMuted }}
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-2">
            {session.exercises.map((item, index) => {
              const done = item.sets.filter((set) => set.done).length;
              return (
                <div
                  key={item.id}
                  className="rounded-lg border p-3"
                  style={{
                    borderColor:
                      index === exerciseIndex
                        ? "color-mix(in srgb, var(--color-precision-blue) 45%, transparent)"
                        : C.border,
                    background: C.card,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setExerciseIndex(index);
                      setSetIndex(
                        Math.max(
                          0,
                          item.sets.findIndex((set) => !set.done),
                        ),
                      );
                    }}
                    className="w-full text-left"
                  >
                    <p className="text-[10px]" style={{ color: C.textSecond }}>
                      {index + 1}. {item.name}
                    </p>
                    <p
                      className="mt-1 text-[9px]"
                      style={{ color: C.textMuted }}
                    >
                      {done}/{item.sets.length} serii
                    </p>
                  </button>
                  <div className="mt-2 flex justify-end gap-1">
                    <button
                      type="button"
                      aria-label="Przesuń wyżej"
                      onClick={() => reorder(index, -1)}
                      className="flex h-6 w-6 items-center justify-center"
                      style={{ color: C.textDisabled }}
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      aria-label="Przesuń niżej"
                      onClick={() => reorder(index, 1)}
                      className="flex h-6 w-6 items-center justify-center"
                      style={{ color: C.textDisabled }}
                    >
                      <ArrowDown size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              const first =
                library.find(
                  (item) => item.discipline === session.discipline,
                ) ?? library[0];
              if (!first) return;
              const exercises = [
                ...session.exercises,
                {
                  id: `${session.id}-added-${Date.now()}`,
                  exerciseId: first.id,
                  name: first.name,
                  restSeconds: 60,
                  sets: [
                    {
                      id: `${Date.now()}-set`,
                      plannedReps: 10,
                      actualReps: 10,
                      rir: 2,
                      done: false,
                    },
                  ],
                },
              ];
              onUpdate({ ...session, exercises });
            }}
            className="sport-quiet-button mt-3 w-full"
          >
            Dodaj ćwiczenie
          </button>
        </aside>
      )}

      {finishOpen && (
        <FinishDialog
          onClose={() => setFinishOpen(false)}
          onFinish={onFinish}
          onIncomplete={onIncomplete}
        />
      )}
      {swapOpen && (
        <Modal
          title="Zamień ćwiczenie"
          eyebrow="Aktywny trening"
          onClose={() => setSwapOpen(false)}
          width={440}
        >
          <div className="p-5">
            <label className="block">
              <span
                className="mb-1.5 block text-[10px]"
                style={{ color: C.textMuted }}
              >
                Nowe ćwiczenie
              </span>
              <select
                value={swapExerciseId}
                onChange={(event) => setSwapExerciseId(event.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-[10px] outline-none"
                style={inputStyle}
              >
                <option value="">Wybierz ćwiczenie</option>
                {library
                  .filter(
                    (item) =>
                      item.discipline === session.discipline ||
                      item.discipline === "strength",
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <p
              className="mt-4 text-[10px] leading-5"
              style={{ color: C.textMuted }}
            >
              Wybierz, czy zmiana dotyczy tylko obecnej sesji, czy także
              wszystkich przyszłych sesji z tego szablonu.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                disabled={!swapExerciseId}
                type="button"
                onClick={() => swapCurrent("session")}
                className="sport-quiet-button"
              >
                Tylko ta sesja
              </button>
              <button
                disabled={!swapExerciseId || !session.templateId}
                type="button"
                onClick={() => swapCurrent("template")}
                className="sport-primary-button"
              >
                Sesja i szablon
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FinishDialog({
  onClose,
  onFinish,
  onIncomplete,
}: {
  onClose: () => void;
  onFinish: () => void;
  onIncomplete: () => void;
}) {
  return (
    <Modal
      title="Zakończyć trening?"
      eyebrow="Podsumowanie sesji"
      onClose={onClose}
      width={420}
    >
      <div className="p-5">
        <p className="text-[10px] leading-5" style={{ color: C.textSecond }}>
          Wykonany trening trafi do historii. Jeśli kończysz wcześniej, zapisz
          go jako niedokończony — wysiłek pozostanie widoczny, ale nie będzie
          liczony jako pełna realizacja planu.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onFinish}
            className="sport-primary-button w-full"
          >
            Zapisz jako wykonany
          </button>
          <button
            type="button"
            onClick={onIncomplete}
            className="sport-quiet-button w-full"
            style={{ color: C.warning }}
          >
            Zapisz jako niedokończony
          </button>
          <button
            type="button"
            onClick={onClose}
            className="sport-link-action w-full"
            style={{ color: C.textMuted }}
          >
            Wróć do treningu
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ActiveConflictDialog({
  active,
  requested,
  onResume,
  onSaveIncomplete,
  onDiscard,
  onClose,
}: {
  active: WorkoutSession;
  requested: WorkoutSession;
  onResume: () => void;
  onSaveIncomplete: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Inny trening jest już aktywny"
      eyebrow="Jedna aktywna sesja"
      onClose={onClose}
      width={440}
    >
      <div className="p-5">
        <p className="text-[10px] leading-5" style={{ color: C.textSecond }}>
          Trwa „{active.title}”. Zanim rozpoczniesz „{requested.title}”,
          zdecyduj, co zrobić z obecną sesją.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="sport-primary-button w-full"
          >
            Wróć do aktywnego treningu
          </button>
          <button
            type="button"
            onClick={onSaveIncomplete}
            className="sport-quiet-button w-full"
            style={{ color: C.warning }}
          >
            Zapisz jako niedokończony i rozpocznij nowy
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="sport-danger-button w-full"
          >
            Porzuć aktywny i rozpocznij nowy
          </button>
        </div>
      </div>
    </Modal>
  );
}
