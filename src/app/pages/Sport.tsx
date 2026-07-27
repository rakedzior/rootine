/**
 * THESIS: Sport łączy prosty planer cyklu z pełnym, skupionym trybem wykonywania treningu.
 * OWN-WORLD: Grafitowy pulpit z kontekstowym sidebarem, tygodniowym kalendarzem i precyzyjnym rejestrem serii.
 * STORY: Użytkownik sprawdza Dzisiaj, rozpoczyna jednostkę, zapisuje serie i przerwy, a wynik trafia do historii.
 * FIRST VIEWPORT: Dzisiejsze treningi zajmują główną przestrzeń, zaś drugi sidebar porządkuje planowanie i dane.
 * FORM: Operacyjny pulpit dnia przechodzący w pełnoekranową konsolę aktywnej sesji.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dumbbell, Plus, Save, Undo2 } from "lucide-react";
import {
  ActiveSessionConflictDialog,
  SportActiveSession,
} from "../sport/SportActiveSession";
import {
  SportAnalysis,
  SportHistory,
  SportOverview,
  WorkoutDetailPanel,
} from "../sport/SportInsights";
import {
  CycleDialog,
  CyclePlanner,
  TemplateDialog,
  TemplateLibrary,
  WorkoutDialog,
} from "../sport/SportPlanner";
import {
  createSessionFromCycleWorkout,
  historyEntryFromSession,
  loadSportPlannerState,
  saveSportPlannerState,
  todayCycleWeek,
  cycleWorkoutDate,
  type CycleWorkout,
  type PlannerView,
  type TrainingCycle,
  type WorkoutHistoryEntry,
} from "../sport/plannerModel";
import {
  EXERCISE_LIBRARY,
  addDays,
  fromDateKey,
  type WorkoutExercise,
  type WorkoutSession,
  type WorkoutTemplate,
} from "../sport/model";
import { SportSidebar, SPORT_VIEW_LABELS } from "../sport/SportSidebar";
import {
  Badge,
  Button,
  ModuleMain,
  ModuleShell,
  PageHeader,
  Select,
  WorkspaceToolbar,
} from "../ui";

type PlannerDialog = "cycle" | "new-template" | null;

interface WorkoutDialogState {
  workoutId?: string;
  week: number;
  day: number;
  editScope?: "single" | "series";
}

interface MoveUndo {
  workoutId: string;
  title: string;
  previousWeek: number;
  previousDay: number;
}

function upsertHistory(history: WorkoutHistoryEntry[], entry: WorkoutHistoryEntry) {
  return [entry, ...history.filter((item) => item.id !== entry.id)]
    .sort((left, right) => right.date.localeCompare(left.date));
}

function markAllDone(session: WorkoutSession) {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set, done: true })),
    })),
    stages: session.stages?.map((stage) => ({ ...stage, done: true })),
  };
}

function finalizeSession(
  session: WorkoutSession,
  status: "completed" | "incomplete" | "missed",
): WorkoutSession {
  const completedAt = status === "completed" || status === "incomplete" ? Date.now() : session.completedAt;
  const actualDurationMinutes = session.startedAt && completedAt
    ? Math.max(1, Math.round((completedAt - session.startedAt) / 60_000))
    : session.durationMinutes;
  return {
    ...session,
    status,
    durationMinutes: actualDurationMinutes,
    completedAt,
    restTimerRunning: false,
    metrics: session.startedAt
      ? { ...session.metrics, timeMinutes: session.metrics?.timeMinutes ?? actualDurationMinutes }
      : session.metrics,
  };
}

export default function Sport() {
  const [plannerState, setPlannerState] = useState(loadSportPlannerState);
  const [cycleDraft, setCycleDraft] = useState<TrainingCycle | null>(plannerState.activeCycle);
  const [view, setView] = useState<PlannerView>("today");
  const [activeWeek, setActiveWeek] = useState(() => plannerState.activeCycle ? todayCycleWeek(plannerState.activeCycle) : 1);
  const [dialog, setDialog] = useState<PlannerDialog>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [workoutDialog, setWorkoutDialog] = useState<WorkoutDialogState | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState(false);
  const [requestedWorkoutId, setRequestedWorkoutId] = useState<string | null>(null);
  const [moveUndo, setMoveUndo] = useState<MoveUndo | null>(null);
  const [moveNotice, setMoveNotice] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);

  const savedCycleSignature = useMemo(
    () => JSON.stringify(plannerState.activeCycle),
    [plannerState.activeCycle],
  );
  const draftCycleSignature = useMemo(() => JSON.stringify(cycleDraft), [cycleDraft]);
  const cycleDirty = savedCycleSignature !== draftCycleSignature;
  const editingTemplate = plannerState.templates.find((template) => template.id === editingTemplateId);
  const editingWorkout = workoutDialog?.workoutId
    ? cycleDraft?.workouts.find((workout) => workout.id === workoutDialog.workoutId)
    : undefined;
  const selectedWorkout = selectedWorkoutId
    ? cycleDraft?.workouts.find((workout) => workout.id === selectedWorkoutId)
    : undefined;
  const selectedTemplate = selectedWorkout?.templateId
    ? plannerState.templates.find((template) => template.id === selectedWorkout.templateId)
    : undefined;
  const selectedSeriesCount = selectedWorkout?.seriesId
    ? cycleDraft?.workouts.filter((workout) => workout.seriesId === selectedWorkout.seriesId).length ?? 1
    : 1;
  const activeSession = plannerState.sessions.find((session) => session.status === "in_progress");
  const requestedWorkout = requestedWorkoutId
    ? cycleDraft?.workouts.find((workout) => workout.id === requestedWorkoutId)
    : undefined;
  const viewMeta = SPORT_VIEW_LABELS[view];

  useEffect(() => {
    setStorageFailed(!saveSportPlannerState(plannerState));
  }, [plannerState]);

  useEffect(() => {
    if (!moveUndo) return;
    const timer = window.setTimeout(() => setMoveUndo(null), 8000);
    return () => window.clearTimeout(timer);
  }, [moveUndo]);

  const closeDialogs = useCallback(() => {
    setDialog(null);
    setEditingTemplateId(null);
    setWorkoutDialog(null);
  }, []);

  const changeView = (next: PlannerView) => {
    setView(next);
    if (next !== "today" && next !== "cycle") setSelectedWorkoutId(null);
  };

  const changeWeek = (week: number) => {
    if (!cycleDraft) return;
    setActiveWeek(Math.max(1, Math.min(cycleDraft.weeks, week)));
  };

  const saveCycle = () => {
    if (!cycleDraft) return;
    const savedCycle = { ...cycleDraft, updatedAt: new Date().toISOString() };
    setCycleDraft(savedCycle);
    setPlannerState((current) => ({ ...current, activeCycle: savedCycle }));
  };

  const submitCycleSettings = (cycle: TrainingCycle) => {
    setCycleDraft(cycle);
    setActiveWeek((current) => Math.min(current, cycle.weeks));
    closeDialogs();
  };

  const moveWorkout = (id: string, week: number, day?: number) => {
    setCycleDraft((current) => current ? {
      ...current,
      workouts: current.workouts.map((workout) => workout.id === id
        ? { ...workout, week, day: day ?? workout.day }
        : workout),
    } : current);
  };

  const moveWorkoutTomorrow = (workout: CycleWorkout) => {
    if (!cycleDraft) return;
    const tomorrow = addDays(cycleWorkoutDate(cycleDraft, workout), 1);
    const difference = Math.round(
      (fromDateKey(tomorrow).getTime() - fromDateKey(cycleDraft.startDate).getTime()) / 86_400_000,
    );
    const nextWeek = Math.floor(difference / 7) + 1;
    const nextDay = ((difference % 7) + 7) % 7;
    if (nextWeek < 1 || nextWeek > cycleDraft.weeks) {
      setMoveNotice("Jutro wypada poza zakresem cyklu. Otwórz edycję i wybierz termin w aktywnym cyklu.");
      return;
    }
    const updatedCycle = {
      ...cycleDraft,
      workouts: cycleDraft.workouts.map((item) => item.id === workout.id
        ? { ...item, week: nextWeek, day: nextDay }
        : item),
      updatedAt: new Date().toISOString(),
    };
    setMoveUndo({
      workoutId: workout.id,
      title: workout.title,
      previousWeek: workout.week,
      previousDay: workout.day,
    });
    setMoveNotice("");
    setCycleDraft(updatedCycle);
    setPlannerState((current) => ({ ...current, activeCycle: updatedCycle }));
    setSelectedWorkoutId(null);
  };

  const undoMove = () => {
    if (!moveUndo || !cycleDraft) return;
    const updatedCycle = {
      ...cycleDraft,
      workouts: cycleDraft.workouts.map((workout) => workout.id === moveUndo.workoutId
        ? { ...workout, week: moveUndo.previousWeek, day: moveUndo.previousDay }
        : workout),
      updatedAt: new Date().toISOString(),
    };
    setCycleDraft(updatedCycle);
    setPlannerState((current) => ({ ...current, activeCycle: updatedCycle }));
    setMoveUndo(null);
  };

  const submitWorkouts = (
    workouts: CycleWorkout[],
    editingId?: string,
    editScope: "single" | "series" = "single",
  ) => {
    setCycleDraft((current) => {
      if (!current) return current;
      const edited = editingId ? current.workouts.find((workout) => workout.id === editingId) : undefined;
      if (edited && editScope === "series" && edited.seriesId && workouts[0]) {
        const patch = workouts[0];
        return {
          ...current,
          workouts: current.workouts.map((workout) => workout.seriesId === edited.seriesId
            ? {
                ...workout,
                day: patch.day,
                title: patch.title,
                discipline: patch.discipline,
                durationMinutes: patch.durationMinutes,
                templateId: patch.templateId,
                time: patch.time,
                note: patch.note,
              }
            : workout),
        };
      }
      return {
        ...current,
        workouts: editingId
          ? current.workouts.map((workout) => workout.id === editingId ? workouts[0] : workout)
          : [...current.workouts, ...workouts],
      };
    });
    if (workouts[0]) setActiveWeek(workouts[0].week);
    closeDialogs();
  };

  const deleteWorkout = () => {
    const workout = editingWorkout ?? selectedWorkout;
    if (!workout) return;
    setCycleDraft((current) => current ? {
      ...current,
      workouts: current.workouts.filter((item) => item.id !== workout.id),
    } : current);
    setSelectedWorkoutId(null);
    closeDialogs();
  };

  const toggleWorkoutDetails = (workout: CycleWorkout) => {
    setSelectedWorkoutId((current) => current === workout.id ? null : workout.id);
  };

  const openWorkoutEditor = (workout: CycleWorkout, editScope: "single" | "series") => {
    setWorkoutDialog({
      workoutId: workout.id,
      week: workout.week,
      day: workout.day,
      editScope,
    });
  };

  const openCycleView = (week: number) => {
    setActiveWeek(week);
    setView("cycle");
  };

  const saveTemplate = (template: WorkoutTemplate) => {
    setPlannerState((current) => ({
      ...current,
      templates: current.templates.some((item) => item.id === template.id)
        ? current.templates.map((item) => item.id === template.id ? template : item)
        : [...current.templates, template],
    }));
    closeDialogs();
  };

  const deleteTemplate = () => {
    if (!editingTemplate) return;
    setPlannerState((current) => ({
      ...current,
      templates: current.templates.filter((template) => template.id !== editingTemplate.id),
    }));
    closeDialogs();
  };

  const recordSessionOutcome = (
    session: WorkoutSession,
    status: "completed" | "incomplete" | "missed",
  ) => {
    const finished = finalizeSession(session, status);
    const historyEntry = historyEntryFromSession(finished);
    setPlannerState((current) => ({
      ...current,
      sessions: current.sessions.some((item) => item.id === finished.id)
        ? current.sessions.map((item) => item.id === finished.id ? finished : item)
        : [...current.sessions, finished],
      history: historyEntry ? upsertHistory(current.history, historyEntry) : current.history,
      workoutOutcomes: finished.cycleWorkoutId ? {
        ...current.workoutOutcomes,
        [finished.cycleWorkoutId]: {
          status,
          sessionId: finished.id,
          updatedAt: new Date().toISOString(),
        },
      } : current.workoutOutcomes,
    }));
  };

  const startWorkout = (workout: CycleWorkout) => {
    if (!cycleDraft) return;
    const currentActive = plannerState.sessions.find((session) => session.status === "in_progress");
    if (currentActive && currentActive.cycleWorkoutId !== workout.id) {
      setRequestedWorkoutId(workout.id);
      return;
    }
    if (currentActive?.cycleWorkoutId === workout.id) {
      setSelectedWorkoutId(null);
      setActiveMode(true);
      return;
    }
    const template = workout.templateId
      ? plannerState.templates.find((item) => item.id === workout.templateId)
      : undefined;
    const session = createSessionFromCycleWorkout(cycleDraft, workout, template, "in_progress");
    setPlannerState((current) => ({
      ...current,
      sessions: [...current.sessions, session],
      workoutOutcomes: Object.fromEntries(
        Object.entries(current.workoutOutcomes).filter(([id]) => id !== workout.id),
      ),
    }));
    setSelectedWorkoutId(null);
    setActiveMode(true);
  };

  const markWorkout = (workout: CycleWorkout, status: "completed" | "missed") => {
    if (!cycleDraft) return;
    const template = workout.templateId
      ? plannerState.templates.find((item) => item.id === workout.templateId)
      : undefined;
    let session = createSessionFromCycleWorkout(cycleDraft, workout, template, status);
    if (status === "completed") session = markAllDone(session);
    recordSessionOutcome(session, status);
  };

  const clearWorkoutOutcome = (workout: CycleWorkout) => {
    const outcome = plannerState.workoutOutcomes[workout.id];
    setPlannerState((current) => {
      const outcomes = { ...current.workoutOutcomes };
      delete outcomes[workout.id];
      return {
        ...current,
        workoutOutcomes: outcomes,
        history: outcome?.sessionId
          ? current.history.filter((entry) => entry.id !== outcome.sessionId)
          : current.history,
        sessions: outcome?.sessionId
          ? current.sessions.filter((session) => session.id !== outcome.sessionId)
          : current.sessions,
      };
    });
  };

  const finishActiveSession = (status: "completed" | "incomplete") => {
    if (!activeSession) return;
    recordSessionOutcome(activeSession, status);
    setActiveMode(false);
    setRequestedWorkoutId(null);
    setView("today");
    setSelectedWorkoutId(activeSession.cycleWorkoutId ?? null);
  };

  const finishActiveAndStartRequested = () => {
    if (!activeSession || !requestedWorkout || !cycleDraft) return;
    const template = requestedWorkout.templateId
      ? plannerState.templates.find((item) => item.id === requestedWorkout.templateId)
      : undefined;
    const finished = finalizeSession(activeSession, "incomplete");
    const nextSession = createSessionFromCycleWorkout(cycleDraft, requestedWorkout, template, "in_progress");
    const historyEntry = historyEntryFromSession(finished);
    setPlannerState((current) => ({
      ...current,
      sessions: [
        ...current.sessions.map((session) => session.id === finished.id ? finished : session),
        nextSession,
      ],
      history: historyEntry ? upsertHistory(current.history, historyEntry) : current.history,
      workoutOutcomes: {
        ...current.workoutOutcomes,
        ...(finished.cycleWorkoutId ? {
          [finished.cycleWorkoutId]: {
            status: "incomplete" as const,
            sessionId: finished.id,
            updatedAt: new Date().toISOString(),
          },
        } : {}),
      },
    }));
    setRequestedWorkoutId(null);
    setSelectedWorkoutId(null);
    setActiveMode(true);
  };

  const updateActiveSession = (session: WorkoutSession) => {
    setPlannerState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => item.id === session.id ? session : item),
    }));
  };

  const updateTemplateExercises = (templateId: string, exercises: WorkoutExercise[]) => {
    setPlannerState((current) => ({
      ...current,
      templates: current.templates.map((template) => template.id === templateId
        ? {
            ...template,
            exercises: exercises.map((exercise) => ({
              ...exercise,
              sets: exercise.sets.map((set) => ({ ...set, done: false })),
            })),
          }
        : template),
    }));
  };

  if (activeSession && activeMode) {
    return (
      <SportActiveSession
        session={activeSession}
        library={EXERCISE_LIBRARY}
        onExit={() => setActiveMode(false)}
        onUpdate={updateActiveSession}
        onFinish={finishActiveSession}
        onUpdateTemplate={updateTemplateExercises}
      />
    );
  }

  const headerAction = view === "templates"
    ? <Button variant="primary" leadingIcon={<Plus size={14} />} onClick={() => setDialog("new-template")}>Nowy szablon</Button>
    : view === "cycle" && cycleDraft
      ? <Button variant="primary" leadingIcon={<Save size={14} />} disabled={!cycleDirty} onClick={saveCycle}>{cycleDirty ? "Zapisz plan" : "Plan zapisany"}</Button>
      : view === "cycle"
        ? <Button variant="primary" leadingIcon={<Plus size={14} />} onClick={() => setDialog("cycle")}>Utwórz cykl</Button>
        : view === "today" && cycleDraft
          ? (
              <Button
                variant="primary"
                leadingIcon={<Plus size={14} />}
                onClick={() => setWorkoutDialog({ week: todayCycleWeek(cycleDraft), day: (new Date().getDay() + 6) % 7 })}
              >
                Dodaj trening
              </Button>
            )
          : undefined;

  return (
    <ModuleShell
      className="sport-module sport-planner-module"
      contextSidebar={(
        <SportSidebar
          view={view}
          templateCount={plannerState.templates.length}
          historyCount={plannerState.history.length}
          activeSession={activeSession}
          onChange={changeView}
          onResume={() => setActiveMode(true)}
        />
      )}
    >
      <ModuleMain>
        <PageHeader
          title="Sport"
          description={`${viewMeta.title} · ${viewMeta.description}`}
          leading={<Dumbbell size={18} strokeWidth={1.5} />}
          meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
          actions={headerAction}
        />

        <WorkspaceToolbar className="sport-planner-toolbar">
          <Select
            compact
            fieldClassName="context-mobile-select"
            aria-label="Widok Sportu"
            value={view}
            options={Object.entries(SPORT_VIEW_LABELS).map(([id, meta]) => ({ value: id, label: meta.title }))}
            onChange={(event) => changeView(event.target.value as PlannerView)}
          />
          <span className="workspace-context-label">{viewMeta.title}</span>
          <div className="sport-planner-toolbar__right">
            {activeSession && (
              <Button variant="quiet" size="sm" onClick={() => setActiveMode(true)}>
                Trening w toku · wznów
              </Button>
            )}
            {view === "cycle" && cycleDraft && (
              <span className="sport-planner-toolbar__status">
                {cycleDirty ? "Zmiany czekają na zapis" : "Wszystkie zmiany zapisane"}
              </span>
            )}
          </div>
        </WorkspaceToolbar>

        {moveNotice && (
          <div className="sport-inline-notice" role="status">
            <span>{moveNotice}</span>
            <Button variant="ghost" size="sm" onClick={() => setMoveNotice("")}>Zamknij</Button>
          </div>
        )}

        <div className="sport-planner-scroll">
          <div className="sport-planner-content">
            {view === "today" && (
              <SportOverview
                cycle={cycleDraft}
                outcomes={plannerState.workoutOutcomes}
                selectedWorkoutId={selectedWorkoutId}
                onSelectWorkout={toggleWorkoutDetails}
                onStartWorkout={startWorkout}
                onCompleteWorkout={(workout) => markWorkout(workout, "completed")}
                onMoveTomorrow={moveWorkoutTomorrow}
                onOpenCycle={openCycleView}
              />
            )}
            {view === "cycle" && (
              <CyclePlanner
                cycle={cycleDraft}
                activeWeek={activeWeek}
                selectedWorkoutId={selectedWorkoutId}
                isDirty={cycleDirty}
                onWeekChange={changeWeek}
                onCreateCycle={() => setDialog("cycle")}
                onEditCycle={() => setDialog("cycle")}
                onAddWorkout={(week, day) => setWorkoutDialog({ week, day })}
                onSelectWorkout={toggleWorkoutDetails}
                onMoveWorkout={moveWorkout}
              />
            )}
            {view === "templates" && (
              <TemplateLibrary
                templates={plannerState.templates}
                onCreate={() => setDialog("new-template")}
                onEdit={(template) => setEditingTemplateId(template.id)}
              />
            )}
            {view === "history" && <SportHistory history={plannerState.history} />}
            {view === "analysis" && <SportAnalysis history={plannerState.history} />}
          </div>
        </div>
      </ModuleMain>

      {selectedWorkout && cycleDraft && (
        <WorkoutDetailPanel
          workout={selectedWorkout}
          cycle={cycleDraft}
          template={selectedTemplate}
          seriesCount={selectedSeriesCount}
          outcome={plannerState.workoutOutcomes[selectedWorkout.id]}
          onClose={() => setSelectedWorkoutId(null)}
          onStart={() => startWorkout(selectedWorkout)}
          onComplete={() => markWorkout(selectedWorkout, "completed")}
          onMiss={() => markWorkout(selectedWorkout, "missed")}
          onMoveTomorrow={() => moveWorkoutTomorrow(selectedWorkout)}
          onClearOutcome={() => clearWorkoutOutcome(selectedWorkout)}
          onEditSingle={() => openWorkoutEditor(selectedWorkout, "single")}
          onEditSeries={() => openWorkoutEditor(selectedWorkout, "series")}
          onDelete={deleteWorkout}
        />
      )}

      {moveUndo && (
        <div className="sport-undo-toast" role="status">
          <span>„{moveUndo.title}” przeniesiono na jutro.</span>
          <Button variant="ghost" size="sm" leadingIcon={<Undo2 size={12} />} onClick={undoMove}>Cofnij</Button>
        </div>
      )}

      {dialog === "cycle" && (
        <CycleDialog cycle={cycleDraft} onClose={closeDialogs} onSubmit={submitCycleSettings} />
      )}

      {dialog === "new-template" && (
        <TemplateDialog onClose={closeDialogs} onSubmit={saveTemplate} />
      )}

      {editingTemplate && (
        <TemplateDialog
          template={editingTemplate}
          onClose={closeDialogs}
          onSubmit={saveTemplate}
          onDelete={deleteTemplate}
        />
      )}

      {workoutDialog && cycleDraft && (
        <WorkoutDialog
          cycle={cycleDraft}
          templates={plannerState.templates}
          workout={editingWorkout}
          initialWeek={workoutDialog.week}
          initialDay={workoutDialog.day}
          editScope={workoutDialog.editScope}
          seriesCount={editingWorkout?.seriesId
            ? cycleDraft.workouts.filter((workout) => workout.seriesId === editingWorkout.seriesId).length
            : 1}
          onClose={closeDialogs}
          onSubmit={submitWorkouts}
          onDelete={editingWorkout ? deleteWorkout : undefined}
        />
      )}

      {activeSession && requestedWorkout && (
        <ActiveSessionConflictDialog
          active={activeSession}
          requestedTitle={requestedWorkout.title}
          onResume={() => {
            setRequestedWorkoutId(null);
            setActiveMode(true);
          }}
          onFinishAndStart={finishActiveAndStartRequested}
          onCancel={() => setRequestedWorkoutId(null)}
        />
      )}
    </ModuleShell>
  );
}
