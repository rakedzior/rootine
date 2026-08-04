import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  Pause,
  Play,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { AmbientScene, Button, Input, Modal, Select } from "../ui";
import type {
  ExerciseLibraryItem,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from "./model";
import { DisciplineLabel } from "./Shared";

function formatTimer(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function completedSets(session: WorkoutSession) {
  return session.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.done).length;
}

function totalSets(session: WorkoutSession) {
  return session.exercises.flatMap((exercise) => exercise.sets).length;
}

function sessionCompletion(session: WorkoutSession) {
  if (session.stages?.length) {
    return {
      done: session.stages.filter((stage) => stage.done).length,
      total: session.stages.length,
      label: "Wykonane etapy",
      unit: "etapów",
    };
  }
  return {
    done: completedSets(session),
    total: totalSets(session),
    label: "Wykonane serie",
    unit: "serii",
  };
}

function SessionNumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max,
  step = 1,
}: {
  label: string;
  value?: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="sport-session-number">
      <span>{label}</span>
      <span className="sport-session-number__control">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value ?? 0}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  );
}

function FinishSessionDialog({
  session,
  onClose,
  onFinish,
}: {
  session: WorkoutSession;
  onClose: () => void;
  onFinish: (status: "completed" | "incomplete") => void;
}) {
  const completion = sessionCompletion(session);
  return (
    <Modal
      title="Zakończyć trening?"
      eyebrow="Podsumowanie aktywnej sesji"
      description={completion.total
        ? `Zapisano ${completion.done} z ${completion.total} ${completion.unit}. Wynik automatycznie trafi do Historii i Analizy.`
        : "Wynik automatycznie trafi do Historii i Analizy."}
      width={480}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Wróć do treningu</Button>
          <Button variant="quiet" onClick={() => onFinish("incomplete")}>Zapisz jako niedokończony</Button>
          <Button variant="primary" onClick={() => onFinish("completed")}>Zapisz jako wykonany</Button>
        </>
      )}
    >
      <div className="sport-session-finish-summary">
        <div><span>{completion.label}</span><strong>{completion.done}/{completion.total || "—"}</strong></div>
        <div><span>Czas sesji</span><strong>{formatTimer((Date.now() - (session.startedAt ?? Date.now())) / 1000)}</strong></div>
      </div>
    </Modal>
  );
}

function RestTimer({
  seconds,
  running,
  onToggle,
  onAdd,
  onSkip,
}: {
  seconds: number;
  running: boolean;
  onToggle: () => void;
  onAdd: (seconds: number) => void;
  onSkip: () => void;
}) {
  return (
    <div className={`sport-rest-timer ${seconds === 0 ? "is-finished" : ""}`.trim()} role="timer" aria-live="polite">
      <div>
        <span>Przerwa</span>
        <strong>{formatTimer(seconds)}</strong>
      </div>
      <Button variant="ghost" size="sm" iconOnly aria-label={running ? "Wstrzymaj timer" : "Wznów timer"} onClick={onToggle}>
        {running ? <Pause size={13} /> : <Play size={13} />}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onAdd(30)}>+30 s</Button>
      <Button variant="ghost" size="sm" onClick={onSkip}>Pomiń</Button>
    </div>
  );
}

function RunningSession({
  session,
  onUpdate,
}: {
  session: WorkoutSession;
  onUpdate: (session: WorkoutSession) => void;
}) {
  const stages = session.stages ?? [];
  return (
    <main className="sport-active-session__scroll">
      <div className="sport-running-session">
        <section>
          <div className="sport-active-section-heading">
            <div>
              <span>Przebieg treningu</span>
              <h2>Etapy</h2>
            </div>
            <strong>{stages.filter((stage) => stage.done).length}/{stages.length}</strong>
          </div>
          {stages.length ? (
            <div className="sport-running-stages">
              {stages.map((stage, index) => (
                <button
                  key={stage.id}
                  type="button"
                  className={stage.done ? "is-done" : ""}
                  onClick={() => onUpdate({
                    ...session,
                    stages: stages.map((item) => item.id === stage.id ? { ...item, done: !item.done } : item),
                  })}
                >
                  <span>{stage.done ? <Check size={13} /> : index + 1}</span>
                  <div>
                    <strong>{stage.label}</strong>
                    <small>{stage.target}</small>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="sport-running-stages__empty">
              Trening ręczny bez etapów — zarejestruj rezultat po prawej.
            </div>
          )}
        </section>
        <section className="sport-running-metrics">
          <div className="sport-active-section-heading">
            <div>
              <span>Rezultat</span>
              <h2>Dane wykonane</h2>
            </div>
          </div>
          <div>
            <SessionNumberField
              label="Dystans"
              suffix="km"
              step={0.1}
              value={session.metrics?.distanceKm}
              onChange={(distanceKm) => onUpdate({ ...session, metrics: { ...session.metrics, distanceKm } })}
            />
            <SessionNumberField
              label="Czas"
              suffix="min"
              value={session.metrics?.timeMinutes}
              onChange={(timeMinutes) => onUpdate({ ...session, metrics: { ...session.metrics, timeMinutes } })}
            />
            <SessionNumberField
              label="RPE"
              suffix="/10"
              min={1}
              max={10}
              value={session.metrics?.rpe}
              onChange={(rpe) => onUpdate({ ...session, metrics: { ...session.metrics, rpe: Math.min(10, rpe) } })}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function ExercisePlanPanel({
  session,
  currentExerciseIndex,
  library,
  onSelect,
  onReorder,
  onAdd,
  onClose,
}: {
  session: WorkoutSession;
  currentExerciseIndex: number;
  library: ExerciseLibraryItem[];
  onSelect: (index: number) => void;
  onReorder: (index: number, direction: -1 | 1) => void;
  onAdd: (exercise: ExerciseLibraryItem) => void;
  onClose: () => void;
}) {
  const [exerciseId, setExerciseId] = useState(
    library.find((item) => item.discipline === session.discipline)?.id ?? library[0]?.id ?? "",
  );
  return (
    <aside className="sport-active-plan" aria-label="Plan aktywnego treningu">
      <header>
        <div>
          <span>Plan treningu</span>
          <h2>{session.title}</h2>
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij plan treningu" onClick={onClose}>
          <X size={14} />
        </Button>
      </header>
      <div className="sport-active-plan__list">
        {session.exercises.map((exercise, index) => {
          const done = exercise.sets.filter((set) => set.done).length;
          return (
            <div key={exercise.id} className={index === currentExerciseIndex ? "is-current" : ""}>
              <button type="button" onClick={() => onSelect(index)}>
                <strong>{index + 1}. {exercise.name}</strong>
                <span>{done}/{exercise.sets.length} serii</span>
              </button>
              <div>
                <Button variant="ghost" size="sm" iconOnly aria-label="Przesuń ćwiczenie wyżej" disabled={index === 0} onClick={() => onReorder(index, -1)}>
                  <ArrowUp size={11} />
                </Button>
                <Button variant="ghost" size="sm" iconOnly aria-label="Przesuń ćwiczenie niżej" disabled={index === session.exercises.length - 1} onClick={() => onReorder(index, 1)}>
                  <ArrowDown size={11} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="sport-active-plan__add">
        <Select
          label="Dodaj ćwiczenie"
          value={exerciseId}
          options={library.map((exercise) => ({ value: exercise.id, label: exercise.name }))}
          onChange={(event) => setExerciseId(event.target.value)}
        />
        <Button
          variant="quiet"
          leadingIcon={<Plus size={12} />}
          disabled={!exerciseId}
          onClick={() => {
            const exercise = library.find((item) => item.id === exerciseId);
            if (exercise) onAdd(exercise);
          }}
        >
          Dodaj do sesji
        </Button>
      </div>
    </aside>
  );
}

function StrengthSession({
  session,
  library,
  onUpdate,
  onUpdateTemplate,
}: {
  session: WorkoutSession;
  library: ExerciseLibraryItem[];
  onUpdate: (session: WorkoutSession) => void;
  onUpdateTemplate: (templateId: string, exercises: WorkoutExercise[]) => void;
}) {
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [setIndex, setSetIndex] = useState(0);
  const [planOpen, setPlanOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapExerciseId, setSwapExerciseId] = useState("");
  const availableExercises = library.filter((exercise) => (
    exercise.discipline === session.discipline
    || (session.discipline === "strength" && exercise.discipline === "rehab")
  ));
  const [emptyExerciseId, setEmptyExerciseId] = useState(
    availableExercises[0]?.id ?? library[0]?.id ?? "",
  );
  const [restSeconds, setRestSeconds] = useState<number | null>(() => {
    if (session.restTimerRemaining === undefined) return null;
    if (!session.restTimerRunning || !session.restTimerUpdatedAt) return session.restTimerRemaining;
    return Math.max(0, session.restTimerRemaining - Math.floor((Date.now() - session.restTimerUpdatedAt) / 1000));
  });
  const [restRunning, setRestRunning] = useState(Boolean(session.restTimerRunning));
  const currentExercise = session.exercises[exerciseIndex];
  const currentSet = currentExercise?.sets[setIndex];

  useEffect(() => {
    if (!restRunning) return;
    const timer = window.setInterval(() => {
      setRestSeconds((current) => current === null ? null : Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restRunning]);

  useEffect(() => {
    if (restSeconds !== 0 || !restRunning) return;
    setRestRunning(false);
    onUpdate({
      ...session,
      restTimerRemaining: 0,
      restTimerRunning: false,
      restTimerUpdatedAt: Date.now(),
    });
    // Persist only the transition to finished; display ticks stay local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restRunning, restSeconds]);

  const updateSet = (patch: Partial<WorkoutSet>, sessionPatch: Partial<WorkoutSession> = {}) => {
    if (!currentExercise || !currentSet) return;
    onUpdate({
      ...session,
      ...sessionPatch,
      exercises: session.exercises.map((exercise, exercisePosition) => exercisePosition === exerciseIndex
        ? {
            ...exercise,
            sets: exercise.sets.map((set, setPosition) => setPosition === setIndex ? { ...set, ...patch } : set),
          }
        : exercise),
    });
  };

  const goToNextSet = () => {
    if (!currentExercise) return;
    if (setIndex < currentExercise.sets.length - 1) setSetIndex((current) => current + 1);
    else if (exerciseIndex < session.exercises.length - 1) {
      setExerciseIndex((current) => current + 1);
      setSetIndex(0);
    }
  };

  const goToPreviousSet = () => {
    if (setIndex > 0) setSetIndex((current) => current - 1);
    else if (exerciseIndex > 0) {
      const previousExercise = session.exercises[exerciseIndex - 1];
      setExerciseIndex((current) => current - 1);
      setSetIndex(Math.max(0, previousExercise.sets.length - 1));
    }
  };

  const completeSet = () => {
    if (!currentExercise || !currentSet) return;
    const completing = !currentSet.done;
    if (completing) {
      const seconds = currentExercise.restSeconds;
      updateSet({ done: true }, {
        restTimerRemaining: seconds,
        restTimerRunning: true,
        restTimerUpdatedAt: Date.now(),
      });
      setRestSeconds(seconds);
      setRestRunning(true);
      goToNextSet();
    } else {
      updateSet({ done: false });
    }
  };

  const reorderExercise = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= session.exercises.length) return;
    const exercises = [...session.exercises];
    [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
    onUpdate({ ...session, exercises });
    if (exerciseIndex === index) setExerciseIndex(target);
  };

  const addExercise = (exercise: ExerciseLibraryItem) => {
    const suffix = `${Date.now()}-${session.exercises.length + 1}`;
    const next: WorkoutExercise = {
      id: `${session.id}-exercise-${suffix}`,
      exerciseId: exercise.id,
      name: exercise.name,
      restSeconds: 60,
      sets: [{
        id: `${session.id}-set-${suffix}`,
        plannedReps: 10,
        actualReps: 10,
        rir: 2,
        done: false,
      }],
    };
    onUpdate({ ...session, exercises: [...session.exercises, next] });
  };

  const swapExercise = (scope: "session" | "template") => {
    const replacement = library.find((exercise) => exercise.id === swapExerciseId);
    if (!replacement || !currentExercise) return;
    const exercises = session.exercises.map((exercise, index) => index === exerciseIndex
      ? { ...exercise, exerciseId: replacement.id, name: replacement.name }
      : exercise);
    onUpdate({ ...session, exercises });
    if (scope === "template" && session.templateId) onUpdateTemplate(session.templateId, exercises);
    setSwapOpen(false);
    setSwapExerciseId("");
  };

  if (!currentExercise || !currentSet) {
    return (
      <main className="sport-active-session__empty">
        <ListChecks size={26} aria-hidden="true" />
        <h2>Ta sesja nie ma jeszcze ćwiczeń</h2>
        <p>Wybierz pierwsze ćwiczenie i zacznij rejestrować serie.</p>
        <div className="sport-active-session__empty-actions">
          <Select
            aria-label="Pierwsze ćwiczenie"
            value={emptyExerciseId}
            options={(availableExercises.length ? availableExercises : library).map((exercise) => ({
              value: exercise.id,
              label: exercise.name,
            }))}
            onChange={(event) => setEmptyExerciseId(event.target.value)}
          />
          <Button
            variant="primary"
            leadingIcon={<Plus size={13} />}
            disabled={!emptyExerciseId}
            onClick={() => {
              const exercise = library.find((item) => item.id === emptyExerciseId);
              if (exercise) addExercise(exercise);
            }}
          >
            Dodaj pierwsze ćwiczenie
          </Button>
        </div>
      </main>
    );
  }

  const plannedValue = currentSet.plannedSeconds
    ? `${currentSet.plannedSeconds} s`
    : `${currentSet.plannedReps ?? "—"} powt.`;
  const selectedOptions = library
    .filter((exercise) => exercise.discipline === session.discipline || exercise.discipline === "strength")
    .map((exercise) => ({ value: exercise.id, label: exercise.name }));

  return (
    <>
      <main className="sport-active-session__scroll">
        <div className="sport-strength-session">
          <div className="sport-strength-session__heading">
            <div>
              <span>Ćwiczenie {exerciseIndex + 1} z {session.exercises.length}</span>
              <h2>{currentExercise.name}</h2>
              <p>Seria {setIndex + 1} z {currentExercise.sets.length}</p>
            </div>
            <Button variant="quiet" size="sm" leadingIcon={<RefreshCw size={12} />} onClick={() => setSwapOpen(true)}>
              Zamień ćwiczenie
            </Button>
          </div>

          <section className="sport-current-set">
            <div className="sport-current-set__plan">
              <div><span>Plan</span><strong>{plannedValue}</strong></div>
              <div><span>Ciężar</span><strong>{currentSet.plannedWeight !== undefined ? `${currentSet.plannedWeight} kg` : "—"}</strong></div>
              <div>
                <span>{session.discipline === "rehab" ? "Ból" : "RIR"}</span>
                <strong>{session.discipline === "rehab" ? `${currentSet.pain ?? 0}/10` : currentSet.rir ?? 2}</strong>
              </div>
            </div>
            <div className="sport-current-set__inputs">
              {currentSet.plannedSeconds ? (
                <SessionNumberField label="Czas" suffix="s" value={currentSet.actualSeconds} onChange={(actualSeconds) => updateSet({ actualSeconds })} />
              ) : (
                <SessionNumberField label="Powtórzenia" value={currentSet.actualReps} onChange={(actualReps) => updateSet({ actualReps })} />
              )}
              <SessionNumberField label="Ciężar" suffix="kg" step={0.5} value={currentSet.actualWeight} onChange={(actualWeight) => updateSet({ actualWeight })} />
              {session.discipline === "rehab" ? (
                <SessionNumberField label="Ból" suffix="/10" max={10} value={currentSet.pain} onChange={(pain) => updateSet({ pain: Math.min(10, pain) })} />
              ) : (
                <SessionNumberField label="RIR" value={currentSet.rir} onChange={(rir) => updateSet({ rir })} />
              )}
            </div>
            <Input
              label="Notatka do serii"
              placeholder="Opcjonalnie"
              value={currentSet.note ?? ""}
              onChange={(event) => updateSet({ note: event.target.value })}
            />
            <Button
              variant={currentSet.done ? "quiet" : "primary"}
              fullWidth
              leadingIcon={currentSet.done ? <Check size={14} /> : undefined}
              onClick={completeSet}
            >
              {currentSet.done ? "Seria wykonana — cofnij" : "Zakończ serię"}
            </Button>
          </section>

          <div className="sport-set-navigation">
            <Button variant="ghost" size="sm" leadingIcon={<ChevronLeft size={12} />} disabled={exerciseIndex === 0 && setIndex === 0} onClick={goToPreviousSet}>
              Poprzednia seria
            </Button>
            <Button
              variant="ghost"
              size="sm"
              trailingIcon={<ChevronRight size={12} />}
              disabled={exerciseIndex === session.exercises.length - 1 && setIndex === currentExercise.sets.length - 1}
              onClick={goToNextSet}
            >
              Następna seria
            </Button>
          </div>
        </div>
      </main>

      <Button className="sport-plan-toggle" variant="quiet" size="sm" leadingIcon={<ListChecks size={13} />} onClick={() => setPlanOpen((current) => !current)}>
        Plan treningu
      </Button>

      {restSeconds !== null && (
        <RestTimer
          seconds={restSeconds}
          running={restRunning}
          onToggle={() => {
            const nextRunning = !restRunning;
            setRestRunning(nextRunning);
            onUpdate({
              ...session,
              restTimerRemaining: restSeconds,
              restTimerRunning: nextRunning,
              restTimerUpdatedAt: Date.now(),
            });
          }}
          onAdd={(seconds) => {
            const nextSeconds = (restSeconds ?? 0) + seconds;
            setRestSeconds(nextSeconds);
            setRestRunning(true);
            onUpdate({
              ...session,
              restTimerRemaining: nextSeconds,
              restTimerRunning: true,
              restTimerUpdatedAt: Date.now(),
            });
          }}
          onSkip={() => {
            setRestSeconds(null);
            setRestRunning(false);
            onUpdate({
              ...session,
              restTimerRemaining: undefined,
              restTimerRunning: false,
              restTimerUpdatedAt: undefined,
            });
          }}
        />
      )}

      {planOpen && (
        <ExercisePlanPanel
          session={session}
          currentExerciseIndex={exerciseIndex}
          library={library}
          onSelect={(index) => {
            setExerciseIndex(index);
            const nextSet = session.exercises[index].sets.findIndex((set) => !set.done);
            setSetIndex(Math.max(0, nextSet));
          }}
          onReorder={reorderExercise}
          onAdd={addExercise}
          onClose={() => setPlanOpen(false)}
        />
      )}

      {swapOpen && (
        <Modal
          title="Zamień ćwiczenie"
          eyebrow="Aktywna sesja"
          description="Zmiana może dotyczyć tylko tego treningu albo także jego szablonu."
          width={500}
          onClose={() => setSwapOpen(false)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setSwapOpen(false)}>Anuluj</Button>
              <Button variant="quiet" disabled={!swapExerciseId} onClick={() => swapExercise("session")}>Tylko ta sesja</Button>
              <Button variant="primary" disabled={!swapExerciseId || !session.templateId} onClick={() => swapExercise("template")}>Sesja i szablon</Button>
            </>
          )}
        >
          <Select
            label="Nowe ćwiczenie"
            value={swapExerciseId}
            options={[{ value: "", label: "Wybierz ćwiczenie" }, ...selectedOptions]}
            onChange={(event) => setSwapExerciseId(event.target.value)}
          />
        </Modal>
      )}
    </>
  );
}

export function SportActiveSession({
  session,
  library,
  onExit,
  onUpdate,
  onFinish,
  onUpdateTemplate,
}: {
  session: WorkoutSession;
  library: ExerciseLibraryItem[];
  onExit: () => void;
  onUpdate: (session: WorkoutSession) => void;
  onFinish: (status: "completed" | "incomplete") => void;
  onUpdateTemplate: (templateId: string, exercises: WorkoutExercise[]) => void;
}) {
  const [finishOpen, setFinishOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - (session.startedAt ?? Date.now())) / 1000)));
  const progress = useMemo(() => {
    const completion = sessionCompletion(session);
    return completion.total ? Math.round((completion.done / completion.total) * 100) : 0;
  }, [session]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - (session.startedAt ?? Date.now())) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session.startedAt]);

  return (
    <div className="sport-active-session">
      <AmbientScene
        config={{
          scene: "sport",
          progress: progress / 100,
          active: true,
          signal: `${session.id}:${progress}`,
        }}
      />
      <header className="sport-active-session__header">
        <Button variant="ghost" size="sm" leadingIcon={<ArrowLeft size={13} />} onClick={onExit}>
          Wróć do Sportu
        </Button>
        <div className="sport-active-session__identity">
          <strong>{session.title}</strong>
          <span><Clock3 size={11} /> {formatTimer(elapsedSeconds)} · <DisciplineLabel discipline={session.discipline} compact /></span>
        </div>
        <Button variant="primary" size="sm" onClick={() => setFinishOpen(true)}>Zakończ</Button>
      </header>
      <div className="sport-active-session__progress" aria-label={`Postęp treningu: ${progress}%`}>
        <i style={{ transform: `scaleX(${progress / 100})` }} />
      </div>

      {session.stages?.length
        || session.discipline === "running"
        || session.discipline === "cycling"
        || session.discipline === "custom" ? (
        <RunningSession session={session} onUpdate={onUpdate} />
      ) : (
        <StrengthSession
          session={session}
          library={library}
          onUpdate={onUpdate}
          onUpdateTemplate={onUpdateTemplate}
        />
      )}

      {finishOpen && (
        <FinishSessionDialog
          session={session}
          onClose={() => setFinishOpen(false)}
          onFinish={onFinish}
        />
      )}
    </div>
  );
}

export function ActiveSessionConflictDialog({
  active,
  requestedTitle,
  onResume,
  onFinishAndStart,
  onCancel,
}: {
  active: WorkoutSession;
  requestedTitle: string;
  onResume: () => void;
  onFinishAndStart: () => void;
  onCancel: () => void;
}) {
  const completion = sessionCompletion(active);
  return (
    <Modal
      title="Inny trening jest już aktywny"
      eyebrow="Jedna aktywna sesja"
      description={`Trwa „${active.title}”. Zanim rozpoczniesz „${requestedTitle}”, zdecyduj co zrobić z bieżącą sesją.`}
      width={500}
      onClose={onCancel}
      footer={(
        <>
          <Button variant="ghost" onClick={onCancel}>Anuluj</Button>
          <Button variant="quiet" onClick={onFinishAndStart}>Zapisz jako niedokończony</Button>
          <Button variant="primary" onClick={onResume}>Wznów aktywny trening</Button>
        </>
      )}
    >
      <div className="sport-session-conflict">
        <span>Aktywna sesja</span>
        <strong>{active.title}</strong>
        <small>{completion.done}/{completion.total || "—"} {completion.unit} wykonanych</small>
      </div>
    </Modal>
  );
}
