/**
 * THESIS: Sport łączy prosty planer cyklu z pełnym, skupionym trybem wykonywania treningu.
 * OWN-WORLD: Grafitowy pulpit z kontekstowym sidebarem, tygodniowym kalendarzem i precyzyjnym rejestrem serii.
 * STORY: Użytkownik sprawdza Dzisiaj, rozpoczyna jednostkę, zapisuje serie i przerwy, a wynik trafia do historii.
 * FIRST VIEWPORT: Dzisiejsze treningi zajmują główną przestrzeń, zaś drugi sidebar porządkuje planowanie i dane.
 * FORM: Operacyjny pulpit dnia przechodzący w pełnoekranową konsolę aktywnej sesji.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Check, Play, Undo2 } from "lucide-react";
import { calendarDaysBetween } from "../data/localDate";
import {
  listLocalPersistenceIssues,
  subscribeToLocalPersistenceIssues,
  subscribeToLocalWorkspace,
} from "../data/localRepository";
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
  MoveWorkoutDialog,
  TemplateDialog,
  TemplateLibrary,
  WorkoutDialog,
} from "../sport/SportPlanner";
import {
  createSessionFromCycleWorkout,
  createPlannerId,
  cycleDateRange,
  cycleDayIndex,
  cycleWeekCount,
  DAY_LABELS,
  historyEntryFromSession,
  isIndefiniteCycle,
  loadSportPlannerState,
  saveSportPlannerState,
  SPORT_PLANNER_STORAGE_KEY,
  todayCycleWeek,
  cycleWorkoutDate,
  withActiveCycle,
  type CycleWorkout,
  type PlannerView,
  type SportPlannerState,
  type TrainingCycle,
  type WorkoutHistoryEntry,
} from "../sport/plannerModel";
import {
  EXERCISE_LIBRARY,
  addDays,
  cloneExercises,
  toDateKey,
  type WorkoutExercise,
  type WorkoutSession,
  type WorkoutTemplate,
} from "../sport/model";
import { SportSidebar } from "../sport/SportSidebar";
import {
  createSportPersistenceQueue,
  type SportPersistenceQueue,
} from "../sport/sportPersistence";
import { SPORT_VIEW_LABELS } from "../sport/sportViewMeta";
import { recordActivity } from "../experience/activityLog";
import { writeModuleMemoryValue } from "../experience/moduleMemory";
import {
  Badge,
  Button,
  ContentHeader,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  Select,
} from "../ui";
import "../../styles/sport.css";

type PlannerDialog = "cycle" | "new-cycle" | "new-template" | null;

interface WorkoutDialogState {
  workoutId?: string;
  week: number;
  day: number;
  templateId?: string;
  initialTitle?: string;
  editScope?: "single" | "series";
}

interface MoveUndo {
  workoutId: string;
  title: string;
  previousWeek: number;
  previousDay: number;
  message: string;
  persisted: boolean;
}

interface WorkoutDeleteState {
  workout: CycleWorkout;
}

interface WorkoutDeleteUndo {
  workout: CycleWorkout;
  index: number;
  persisted: boolean;
}

const SPORT_CYCLE_DRAFT_KEY = "rootine.sport-cycle-draft.v1";

function loadStoredCycleDraft(fallback: TrainingCycle | null): TrainingCycle | null {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(SPORT_CYCLE_DRAFT_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<TrainingCycle>;
    if (
      typeof value.id !== "string"
      || typeof value.name !== "string"
      || typeof value.startDate !== "string"
      || typeof value.weeks !== "number"
      || !Array.isArray(value.workouts)
    ) {
      window.sessionStorage.removeItem(SPORT_CYCLE_DRAFT_KEY);
      return fallback;
    }
    return value as TrainingCycle;
  } catch {
    window.sessionStorage.removeItem(SPORT_CYCLE_DRAFT_KEY);
    return fallback;
  }
}

function outcomeForDate(
  cycle: TrainingCycle | null | undefined,
  outcome: SportPlannerState["workoutOutcomes"][string] | undefined,
  dateKey: string,
) {
  if (!outcome || (cycle && isIndefiniteCycle(cycle) && outcome.updatedAt.slice(0, 10) !== dateKey)) {
    return undefined;
  }
  return outcome;
}

function getInitialSportUrlState() {
  if (typeof window === "undefined") return { view: "today" as PlannerView, week: 0 };
  const params = new URLSearchParams(window.location.search);
  let storedView: string | null = null;
  try {
    storedView = window.localStorage.getItem("rootine.sport.view");
  } catch {
    // Fall back to the URL/default when preference storage is unavailable.
  }
  const requestedView = params.get("widok") ?? storedView;
  const view: PlannerView = requestedView === "cycle"
    || requestedView === "templates"
    || requestedView === "history"
    || requestedView === "analysis"
    ? requestedView
    : "today";
  const week = Number(params.get("tydzien"));
  return { view, week: Number.isInteger(week) && week > 0 ? week : 0 };
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
  const [commandParams, setCommandParams] = useSearchParams();
  const quickAddAction = commandParams.get("akcja");
  const quickAddRequested = quickAddAction === "dodaj-trening" || quickAddAction === "dodaj-aktywnosc";
  const quickAddTitle = commandParams.get("tytul")?.trim() ?? "";
  const quickAddDate = commandParams.get("data");
  const [initialUrlState] = useState(getInitialSportUrlState);
  const [plannerState, setPlannerState] = useState(loadSportPlannerState);
  const [cycleDraft, setCycleDraft] = useState<TrainingCycle | null>(() => loadStoredCycleDraft(plannerState.activeCycle));
  const [view, setView] = useState<PlannerView>(initialUrlState.view);
  const [activeWeek, setActiveWeek] = useState(() => initialUrlState.week
    || (plannerState.activeCycle ? todayCycleWeek(plannerState.activeCycle) : 1));
  const [dialog, setDialog] = useState<PlannerDialog>(quickAddRequested && !cycleDraft ? "cycle" : null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [workoutDialog, setWorkoutDialog] = useState<WorkoutDialogState | null>(() => (
    quickAddRequested && cycleDraft
      ? {
        week: todayCycleWeek(cycleDraft),
        day: (new Date().getDay() + 6) % 7,
        initialTitle: quickAddTitle || undefined,
      }
      : null
  ));
  const [moveDialogWorkout, setMoveDialogWorkout] = useState<CycleWorkout | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState(false);
  const [requestedWorkoutId, setRequestedWorkoutId] = useState<string | null>(null);
  const [moveUndo, setMoveUndo] = useState<MoveUndo | null>(null);
  const [moveNotice, setMoveNotice] = useState("");
  const [autosaveNotice, setAutosaveNotice] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const [workoutDeleteState, setWorkoutDeleteState] = useState<WorkoutDeleteState | null>(null);
  const [workoutDeleteUndo, setWorkoutDeleteUndo] = useState<WorkoutDeleteUndo | null>(null);
  const activeSessionEditRef = useRef(false);
  const persistenceQueueRef = useRef<SportPersistenceQueue<SportPlannerState> | null>(null);

  useEffect(() => {
    if (!quickAddRequested) return;
    if (cycleDraft) {
      const requestedDate = quickAddDate && /^\d{4}-\d{2}-\d{2}$/.test(quickAddDate) ? quickAddDate : null;
      const difference = requestedDate ? calendarDaysBetween(cycleDraft.startDate, requestedDate) : null;
      const week = difference === null || isIndefiniteCycle(cycleDraft)
        ? todayCycleWeek(cycleDraft)
        : Math.max(1, Math.min(cycleWeekCount(cycleDraft), Math.floor(difference / 7) + 1));
      setWorkoutDialog({
        week,
        day: requestedDate ? cycleDayIndex(cycleDraft, requestedDate) : (new Date().getDay() + 6) % 7,
        initialTitle: quickAddTitle || undefined,
      });
    } else {
      setDialog("cycle");
    }
    const nextParams = new URLSearchParams(window.location.search);
    ["akcja", "tytul", "data", "godzina", "priorytet"].forEach((key) => nextParams.delete(key));
    setCommandParams(nextParams, { replace: true });
  }, [cycleDraft, quickAddDate, quickAddRequested, quickAddTitle, setCommandParams]);
  if (!persistenceQueueRef.current) {
    persistenceQueueRef.current = createSportPersistenceQueue((state) => {
      const saved = saveSportPlannerState(state);
      setStorageFailed(!saved);
      return saved;
    });
  }

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
  const selectedOutcome = selectedWorkout
    ? outcomeForDate(cycleDraft, plannerState.workoutOutcomes[selectedWorkout.id], toDateKey(new Date()))
    : undefined;
  const selectedSession = selectedOutcome?.sessionId
    ? plannerState.sessions.find((session) => session.id === selectedOutcome.sessionId)
    : undefined;
  const selectedSeriesCount = selectedWorkout?.seriesId
    ? cycleDraft?.workouts.filter((workout) => workout.seriesId === selectedWorkout.seriesId).length ?? 1
    : 1;
  const activeSession = plannerState.sessions.find((session) => session.status === "in_progress");
  const activeSessionItems = activeSession?.stages?.length
    ? activeSession.stages
    : activeSession?.exercises.flatMap((exercise) => exercise.sets) ?? [];
  const activeSessionDone = activeSessionItems.filter((item) => item.done).length;
  const activeSessionProgress = activeSessionItems.length
    ? activeSessionDone / activeSessionItems.length
    : 0;
  const requestedWorkout = requestedWorkoutId
    ? cycleDraft?.workouts.find((workout) => workout.id === requestedWorkoutId)
    : undefined;
  const viewMeta = SPORT_VIEW_LABELS[view];
  useEffect(() => {
    const mode = activeSessionEditRef.current ? "debounced" : "immediate";
    activeSessionEditRef.current = false;
    persistenceQueueRef.current?.schedule(plannerState, mode);
  }, [plannerState]);

  useEffect(() => {
    const flush = () => {
      const saved = persistenceQueueRef.current?.flush() ?? true;
      setStorageFailed(!saved);
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      flush();
    };
  }, []);

  useEffect(() => subscribeToLocalPersistenceIssues(() => {
    setStorageFailed(listLocalPersistenceIssues().some((issue) => (
      issue.key === SPORT_PLANNER_STORAGE_KEY
    )));
  }), []);

  useEffect(() => subscribeToLocalWorkspace(SPORT_PLANNER_STORAGE_KEY, () => {
    if (cycleDirty || persistenceQueueRef.current?.hasPending()) {
      setAutosaveNotice("Dane sportowe zmieniły się w innej karcie. Zapisz albo odrzuć szkic i odśwież widok.");
      return;
    }
    const nextState = loadSportPlannerState();
    setPlannerState(nextState);
    setCycleDraft(nextState.activeCycle);
  }), [cycleDirty]);

  useEffect(() => {
    try {
      if (cycleDirty && cycleDraft) {
        window.sessionStorage.setItem(SPORT_CYCLE_DRAFT_KEY, JSON.stringify(cycleDraft));
      } else {
        window.sessionStorage.removeItem(SPORT_CYCLE_DRAFT_KEY);
      }
    } catch {
      // The explicit beforeunload guard still protects the draft when session storage is unavailable.
    }
  }, [cycleDirty, cycleDraft]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!cycleDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [cycleDirty]);

  useEffect(() => {
    const syncFromUrl = () => {
      const next = getInitialSportUrlState();
      setView(next.view);
      if (next.week) setActiveWeek(next.week);
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === "today") url.searchParams.delete("widok");
    else url.searchParams.set("widok", view);
    if (view === "cycle") url.searchParams.set("tydzien", String(activeWeek));
    else url.searchParams.delete("tydzien");
    if (url.href !== window.location.href) window.history.replaceState({}, "", url);
    writeModuleMemoryValue("sport", "location", `${url.pathname}${url.search}`);
  }, [activeWeek, view]);

  useEffect(() => {
    try {
      window.localStorage.setItem("rootine.sport.view", view);
    } catch {
      // The view preference is optional.
    }
  }, [view]);

  useEffect(() => {
    if (!moveUndo) return;
    const timer = window.setTimeout(() => setMoveUndo(null), 8000);
    return () => window.clearTimeout(timer);
  }, [moveUndo]);

  useEffect(() => {
    if (!autosaveNotice) return;
    const timer = window.setTimeout(() => setAutosaveNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [autosaveNotice]);

  const closeDialogs = useCallback(() => {
    setDialog(null);
    setEditingTemplateId(null);
    setWorkoutDialog(null);
    setMoveDialogWorkout(null);
  }, []);

  const changeView = (next: PlannerView) => {
    setView(next);
    if (next !== "today" && next !== "cycle") setSelectedWorkoutId(null);
    const url = new URL(window.location.href);
    if (next === "today") url.searchParams.delete("widok");
    else url.searchParams.set("widok", next);
    if (next === "cycle") url.searchParams.set("tydzien", String(activeWeek));
    else url.searchParams.delete("tydzien");
    if (url.href !== window.location.href) window.history.pushState({}, "", url);
  };

  const changeWeek = (week: number) => {
    if (!cycleDraft) return;
    setActiveWeek(Math.max(1, Math.min(cycleWeekCount(cycleDraft), week)));
  };

  const saveCycle = () => {
    if (!cycleDraft) return;
    const savedCycle = { ...cycleDraft, updatedAt: new Date().toISOString() };
    setCycleDraft(savedCycle);
    setPlannerState((current) => withActiveCycle(current, savedCycle));
  };

  const selectCycle = (nextCycle: TrainingCycle) => {
    if (cycleDirty) {
      setAutosaveNotice("Zapisz albo odrzuć zmiany przed zmianą aktywnego planu.");
      return;
    }
    if (activeSession?.planId && activeSession.planId !== nextCycle.id) {
      setAutosaveNotice("Najpierw zakończ aktywny trening.");
      return;
    }
    setPlannerState((current) => withActiveCycle(current, nextCycle));
    setCycleDraft(nextCycle);
    setActiveWeek(todayCycleWeek(nextCycle));
    setSelectedWorkoutId(null);
    setMoveUndo(null);
  };

  const createNewCycle = (nextCycle: TrainingCycle) => {
    const savedCycle = { ...nextCycle, updatedAt: new Date().toISOString() };
    setPlannerState((current) => withActiveCycle(current, savedCycle));
    setCycleDraft(savedCycle);
    setActiveWeek(todayCycleWeek(savedCycle));
    setSelectedWorkoutId(null);
    setMoveUndo(null);
    closeDialogs();
    setAutosaveNotice("Utworzono nowy plan.");
  };

  const openNewCycle = () => {
    if (cycleDirty) {
      setAutosaveNotice("Zapisz albo odrzuć zmiany przed utworzeniem nowego planu.");
      return;
    }
    setDialog("new-cycle");
  };

  const discardCycleChanges = () => {
    const savedCycle = plannerState.activeCycle;
    setCycleDraft(savedCycle);
    setActiveWeek((current) => savedCycle ? Math.min(current, cycleWeekCount(savedCycle)) : 1);
    setMoveUndo(null);
    setMoveNotice("");
    setMoveDialogWorkout(null);
    setAutosaveNotice("Odrzucono niezapisane zmiany planu.");
  };

  const applyCycleChange = (nextCycle: TrainingCycle, notice: string) => {
    if (view === "today") {
      const savedCycle = { ...nextCycle, updatedAt: new Date().toISOString() };
      setCycleDraft(savedCycle);
      setPlannerState((current) => withActiveCycle(current, savedCycle));
      setAutosaveNotice(notice);
      return;
    }
    setCycleDraft(nextCycle);
  };

  const submitCycleSettings = (cycle: TrainingCycle) => {
    setCycleDraft(cycle);
    setActiveWeek((current) => Math.min(current, cycleWeekCount(cycle)));
    closeDialogs();
  };

  const moveWorkout = (id: string, week: number, day?: number) => {
    const previous = cycleDraft?.workouts.find((workout) => workout.id === id);
    if (!previous || (previous.week === week && (day === undefined || previous.day === day))) return;
    const nextDay = day ?? previous.day;
    setMoveUndo({
      workoutId: previous.id,
      title: previous.title,
      previousWeek: previous.week,
      previousDay: previous.day,
      message: previous.week === week
        ? `„${previous.title}” przeniesiono: ${DAY_LABELS[previous.day].short} → ${DAY_LABELS[nextDay].short}.`
        : `„${previous.title}” przeniesiono do tygodnia ${week}.`,
      persisted: false,
    });
    setCycleDraft((current) => current ? {
      ...current,
      workouts: current.workouts.map((workout) => workout.id === id
        ? { ...workout, week, day: nextDay }
        : workout),
    } : current);
  };

  const moveWorkoutTomorrow = (workout: CycleWorkout) => {
    if (!cycleDraft) return;
    const tomorrow = addDays(cycleWorkoutDate(cycleDraft, workout), 1);
    if (isIndefiniteCycle(cycleDraft)) {
      const nextDay = cycleDayIndex(cycleDraft, tomorrow);
      const updatedCycle = {
        ...cycleDraft,
        workouts: cycleDraft.workouts.map((item) => item.id === workout.id
          ? { ...item, week: 1, day: nextDay }
          : item),
        updatedAt: new Date().toISOString(),
      };
      setMoveUndo({
        workoutId: workout.id,
        title: workout.title,
        previousWeek: workout.week,
        previousDay: workout.day,
        message: `„${workout.title}” przeniesiono na jutro w tygodniu bazowym.`,
        persisted: true,
      });
      setMoveNotice("");
      setCycleDraft(updatedCycle);
      setPlannerState((current) => withActiveCycle(current, updatedCycle));
      setSelectedWorkoutId(null);
      return;
    }
    const difference = calendarDaysBetween(cycleDraft.startDate, tomorrow) ?? 0;
    const nextWeek = Math.floor(difference / 7) + 1;
    const nextDay = ((difference % 7) + 7) % 7;
    if (nextWeek < 1 || nextWeek > cycleWeekCount(cycleDraft)) {
      setMoveNotice("Jutro wypada poza zakresem planu. Otwórz ustawienia i wybierz termin w aktywnym planie.");
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
      message: `„${workout.title}” przeniesiono na jutro.`,
      persisted: true,
    });
    setMoveNotice("");
    setCycleDraft(updatedCycle);
    setPlannerState((current) => withActiveCycle(current, updatedCycle));
    setSelectedWorkoutId(null);
  };

  const moveWorkoutFromOverview = (workout: CycleWorkout, day: number) => {
    if (
      !cycleDraft
      || workout.day === day
      || day < 0
      || day > 6
      || activeSession?.cycleWorkoutId === workout.id
      || outcomeForDate(cycleDraft, plannerState.workoutOutcomes[workout.id], toDateKey(new Date()))
    ) return;
    const updatedCycle = {
      ...cycleDraft,
      workouts: cycleDraft.workouts.map((item) => item.id === workout.id
        ? { ...item, day }
        : item),
      updatedAt: new Date().toISOString(),
    };
    setMoveUndo({
      workoutId: workout.id,
      title: workout.title,
      previousWeek: workout.week,
      previousDay: workout.day,
      message: `„${workout.title}” przeniesiono: ${DAY_LABELS[workout.day].short} → ${DAY_LABELS[day].short}.`,
      persisted: true,
    });
    setMoveNotice("");
    setCycleDraft(updatedCycle);
    setPlannerState((current) => withActiveCycle(current, updatedCycle));
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
    if (moveUndo.persisted) {
      setPlannerState((current) => withActiveCycle(current, updatedCycle));
    }
    setMoveUndo(null);
  };

  const submitWorkouts = (
    workouts: CycleWorkout[],
    editingId?: string,
    editScope: "single" | "series" = "single",
  ) => {
    const submitted = workouts[0];
    if (!cycleDraft || !submitted) return;
    const edited = editingId
      ? cycleDraft.workouts.find((workout) => workout.id === editingId)
      : undefined;
    const nextCycle = edited && editScope === "series" && edited.seriesId
      ? {
          ...cycleDraft,
          workouts: cycleDraft.workouts.map((workout) => workout.seriesId === edited.seriesId
            ? {
                ...workout,
                day: submitted.day,
                title: submitted.title,
                discipline: submitted.discipline,
                durationMinutes: submitted.durationMinutes,
                templateId: submitted.templateId,
                time: submitted.time,
                note: submitted.note,
              }
            : workout),
        }
      : {
          ...cycleDraft,
          workouts: editingId
            ? cycleDraft.workouts.map((workout) => workout.id === editingId ? submitted : workout)
            : [...cycleDraft.workouts, ...workouts],
        };
    applyCycleChange(
      nextCycle,
      editingId
        ? "Zmiany treningu zapisano automatycznie."
        : "Trening dodano i zapisano automatycznie.",
    );
    recordActivity({
      moduleId: "sport",
      kind: editingId ? "save" : "create",
      title: submitted.title,
      detail: `Tydzień ${submitted.week} · ${DAY_LABELS[submitted.day].full}`,
    });
    setActiveWeek(submitted.week);
    closeDialogs();
  };

  const requestWorkoutDelete = () => {
    const workout = editingWorkout ?? selectedWorkout;
    if (!workout) return;
    setWorkoutDeleteState({ workout });
  };

  const confirmWorkoutDelete = () => {
    if (!workoutDeleteState || !cycleDraft) return;
    const workout = cycleDraft.workouts.find((item) => item.id === workoutDeleteState.workout.id);
    if (!workout) {
      setWorkoutDeleteState(null);
      return;
    }
    const index = cycleDraft.workouts.findIndex((item) => item.id === workout.id);
    const persisted = view === "today";
    const nextCycle = {
      ...cycleDraft,
      workouts: cycleDraft.workouts.filter((item) => item.id !== workout.id),
      ...(persisted ? { updatedAt: new Date().toISOString() } : {}),
    };
    setCycleDraft(nextCycle);
    if (persisted) setPlannerState((current) => withActiveCycle(current, nextCycle));
    setWorkoutDeleteUndo({ workout, index, persisted });
    setWorkoutDeleteState(null);
    setSelectedWorkoutId(null);
    closeDialogs();
  };

  const undoWorkoutDelete = () => {
    if (!workoutDeleteUndo || !cycleDraft) return;
    if (cycleDraft.workouts.some((workout) => workout.id === workoutDeleteUndo.workout.id)) {
      setWorkoutDeleteUndo(null);
      return;
    }
    const workouts = [...cycleDraft.workouts];
    workouts.splice(Math.max(0, Math.min(workoutDeleteUndo.index, workouts.length)), 0, workoutDeleteUndo.workout);
    const nextCycle = {
      ...cycleDraft,
      workouts,
      ...(workoutDeleteUndo.persisted ? { updatedAt: new Date().toISOString() } : {}),
    };
    setCycleDraft(nextCycle);
    if (workoutDeleteUndo.persisted) {
      setPlannerState((current) => withActiveCycle(current, nextCycle));
    }
    setWorkoutDeleteUndo(null);
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
    changeView("cycle");
  };

  const openTodayWorkoutDialog = () => {
    if (!cycleDraft) return;
    setWorkoutDialog({
      week: todayCycleWeek(cycleDraft),
      day: (new Date().getDay() + 6) % 7,
    });
  };

  const saveTemplate = (template: WorkoutTemplate) => {
    const templateExists = plannerState.templates.some((item) => item.id === template.id);
    const nextTemplates = templateExists
      ? plannerState.templates.map((item) => item.id === template.id ? template : item)
      : [...plannerState.templates, template];
    const linkedCycle = cycleDraft && templateExists
      ? {
          ...cycleDraft,
          workouts: cycleDraft.workouts.map((workout) => workout.templateId === template.id
            ? {
                ...workout,
                title: template.name,
                discipline: template.discipline,
                durationMinutes: template.durationMinutes,
              }
            : workout),
          updatedAt: new Date().toISOString(),
        }
      : undefined;
    setPlannerState((current) => {
      const nextState = { ...current, templates: nextTemplates };
      return view === "today" && linkedCycle ? withActiveCycle(nextState, linkedCycle) : nextState;
    });
    if (linkedCycle) setCycleDraft(linkedCycle);
    setAutosaveNotice(templateExists
      ? view === "today"
        ? "Szablon zapisano i zaktualizowano powiązane treningi."
        : "Szablon zapisano. Zapisz plan, aby zatwierdzić powiązane treningi."
      : "Utworzono szablon treningu.");
    closeDialogs();
  };

  const duplicateTemplate = (template: WorkoutTemplate) => {
    const id = createPlannerId("template");
    const duplicate: WorkoutTemplate = {
      ...template,
      id,
      name: `${template.name} — kopia`,
      exercises: cloneExercises(template.exercises, id),
      stages: template.stages?.map((stage, index) => ({
        ...stage,
        id: `${id}-stage-${index + 1}`,
      })),
    };
    setPlannerState((current) => ({ ...current, templates: [...current.templates, duplicate] }));
    setAutosaveNotice("Utworzono kopię szablonu.");
  };

  const openTemplateWorkoutDialog = (template: WorkoutTemplate, today = false) => {
    if (!cycleDraft) {
      setMoveNotice("Najpierw utwórz aktywny plan treningowy.");
      return;
    }
    let week = activeWeek;
    let day = 0;
    if (today) {
      const todayKey = toDateKey(new Date());
      const range = cycleDateRange(cycleDraft);
      if (todayKey < range.start || (range.end && todayKey > range.end)) {
        setMoveNotice("Dzisiejsza data wypada poza aktywnym planem. Dodaj trening do wybranego tygodnia.");
        return;
      }
      week = todayCycleWeek(cycleDraft);
      day = (new Date().getDay() + 6) % 7;
    }
    setWorkoutDialog({ week, day, templateId: template.id });
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
    recordActivity({
      moduleId: "sport",
      kind: status === "completed" ? "complete" : "status",
      title: finished.title,
      detail: status === "completed" ? "Trening ukończony" : "Trening zakończony jako niepełny",
    });
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
    const sessionBase = createSessionFromCycleWorkout(cycleDraft, workout, template, "in_progress");
    const session = isIndefiniteCycle(cycleDraft)
      ? { ...sessionBase, date: toDateKey(new Date()) }
      : sessionBase;
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

  const markWorkout = (
    workout: CycleWorkout,
    status: "completed" | "incomplete" | "missed",
  ) => {
    if (!cycleDraft) return;
    const template = workout.templateId
      ? plannerState.templates.find((item) => item.id === workout.templateId)
      : undefined;
    let session = createSessionFromCycleWorkout(cycleDraft, workout, template, status);
    if (isIndefiniteCycle(cycleDraft)) session = { ...session, date: toDateKey(new Date()) };
    if (status === "completed") session = markAllDone(session);
    const historyEntry = historyEntryFromSession(session);
    setPlannerState((current) => {
      const previousSessionId = current.workoutOutcomes[workout.id]?.sessionId;
      const sessions = current.sessions.filter((item) => item.id !== previousSessionId);
      const history = previousSessionId
        ? current.history.filter((entry) => entry.id !== previousSessionId)
        : current.history;
      return {
        ...current,
        sessions: [...sessions, session],
        history: historyEntry ? upsertHistory(history, historyEntry) : history,
        workoutOutcomes: {
          ...current.workoutOutcomes,
          [workout.id]: {
            status,
            sessionId: session.id,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
    recordActivity({
      moduleId: "sport",
      kind: status === "completed" ? "complete" : "status",
      title: workout.title,
      detail: status === "completed" ? "Trening ukończony" : status === "incomplete" ? "Trening niepełny" : "Trening pominięty",
    });
    setAutosaveNotice(
      status === "completed"
        ? "Status zmieniono na Wykonany."
        : status === "incomplete"
          ? "Status zmieniono na Niedokończony."
          : "Status zmieniono na Pominięty.",
    );
  };

  const clearWorkoutOutcome = (workout: CycleWorkout) => {
    const outcome = outcomeForDate(cycleDraft, plannerState.workoutOutcomes[workout.id], toDateKey(new Date()));
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
    setAutosaveNotice("Przywrócono status Zaplanowany.");
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
    const nextSessionBase = createSessionFromCycleWorkout(cycleDraft, requestedWorkout, template, "in_progress");
    const nextSession = isIndefiniteCycle(cycleDraft)
      ? { ...nextSessionBase, date: toDateKey(new Date()) }
      : nextSessionBase;
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
    activeSessionEditRef.current = true;
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

  const headerAction = view === "today" && activeSession
    ? (
      <Button
        className="ui-button--icon-mobile"
        variant="primary"
        leadingIcon={<Play size={14} />}
        onClick={() => setActiveMode(true)}
      >
        <span className="header-action-label">Wznów trening</span>
      </Button>
    )
    : undefined;

  return (
    <ModuleShell
      className="sport-module sport-planner-module"
      pageWidth="wide"
      ambient={{
        scene: "sport",
        progress: activeSessionProgress,
        active: Boolean(activeSession),
        signal: activeSession ? `${activeSession.id}:${activeSessionDone}` : view,
      }}
      header={(
        <PageHeader
          title="Sport"
          description="Treningi, plan i historia aktywności"
          meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
        />
      )}
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
      <ModuleMain transitionKey={`${view}:${activeWeek}`}>
        <ContentHeader
          className={`sport-planner-toolbar ${view === "cycle" ? "has-status" : ""}`.trim()}
          title={viewMeta.title}
          description={viewMeta.description}
          mobileNavigation={<Select
            compact
            fieldClassName="context-mobile-select"
            aria-label="Widok Sportu"
            value={view}
            options={[
              { value: "today", label: "Dzisiaj" },
              { value: "cycle", label: "Plan treningowy" },
              { value: "templates", label: "Szablony" },
              { value: "history", label: "Historia" },
              { value: "analysis", label: "Analiza" },
            ]}
            onChange={(event) => changeView(event.target.value as PlannerView)}
          />}
          actions={<div className="sport-planner-toolbar__right">
            {headerAction}
            {view === "cycle" && cycleDraft && (
              <span className={`sport-planner-toolbar__status ${cycleDirty ? "is-dirty" : ""}`.trim()}>
                {!cycleDirty && <Check size={12} aria-hidden="true" />}
                {cycleDirty ? "Zmiany czekają na zapis" : "Zapisano"}
              </span>
            )}
          </div>}
        />

        {moveNotice && (
          <div className="sport-inline-notice" role="status">
            <span>{moveNotice}</span>
            <Button variant="ghost" size="sm" onClick={() => setMoveNotice("")}>Zamknij</Button>
          </div>
        )}

        <div className="sport-planner-scroll">
          <div className={`sport-planner-content sport-planner-content--${view}`}>
            {view === "today" && (
              <SportOverview
                cycle={cycleDraft}
                activeSession={activeSession}
                outcomes={plannerState.workoutOutcomes}
                selectedWorkoutId={selectedWorkoutId}
                onCreateCycle={() => setDialog("cycle")}
                onAddWorkout={openTodayWorkoutDialog}
                onResumeActive={() => setActiveMode(true)}
                onSelectWorkout={toggleWorkoutDetails}
                onStartWorkout={startWorkout}
                onCompleteWorkout={(workout) => markWorkout(workout, "completed")}
                onResetWorkout={clearWorkoutOutcome}
                onMoveWorkout={moveWorkoutFromOverview}
                onOpenCycle={openCycleView}
              />
            )}
            {view === "cycle" && (
              <CyclePlanner
                cycle={cycleDraft!}
                cycles={plannerState.cycles}
                activeWeek={activeWeek}
                selectedWorkoutId={selectedWorkoutId}
                isDirty={cycleDirty}
                onSaveCycle={saveCycle}
                onDiscardChanges={discardCycleChanges}
                onSelectCycle={selectCycle}
                onCreateNewCycle={openNewCycle}
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
                onDuplicate={duplicateTemplate}
                onAddToCycle={(template) => openTemplateWorkoutDialog(template)}
                onUseToday={(template) => openTemplateWorkoutDialog(template, true)}
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
          session={selectedSession}
          seriesCount={selectedSeriesCount}
          outcome={selectedOutcome}
          active={activeSession?.cycleWorkoutId === selectedWorkout.id}
          onClose={() => setSelectedWorkoutId(null)}
          onStart={() => startWorkout(selectedWorkout)}
          onComplete={() => markWorkout(selectedWorkout, "completed")}
          onIncomplete={() => markWorkout(selectedWorkout, "incomplete")}
          onMiss={() => markWorkout(selectedWorkout, "missed")}
          onMoveToPlan={() => setMoveDialogWorkout(selectedWorkout)}
          onMoveTomorrow={() => moveWorkoutTomorrow(selectedWorkout)}
          onClearOutcome={() => clearWorkoutOutcome(selectedWorkout)}
          onEditSingle={() => openWorkoutEditor(selectedWorkout, "single")}
          onEditSeries={() => openWorkoutEditor(selectedWorkout, "series")}
          onEditTemplate={selectedTemplate ? () => setEditingTemplateId(selectedTemplate.id) : undefined}
          onDelete={requestWorkoutDelete}
        />
      )}

      {moveUndo && (
        <div className="sport-undo-toast" role="status">
          <span>{moveUndo.message}</span>
          <Button variant="ghost" size="sm" leadingIcon={<Undo2 size={12} />} onClick={undoMove}>Cofnij</Button>
        </div>
      )}

      {workoutDeleteUndo && (
        <div className="sport-undo-toast" role="status">
          <span>Usunięto „{workoutDeleteUndo.workout.title}”.</span>
          <Button variant="ghost" size="sm" leadingIcon={<Undo2 size={12} />} onClick={undoWorkoutDelete}>Cofnij</Button>
        </div>
      )}

      {autosaveNotice && !moveUndo && !workoutDeleteUndo && (
        <div className="sport-undo-toast sport-autosave-toast" role="status">
          <Check size={13} aria-hidden="true" />
          <span>{autosaveNotice}</span>
        </div>
      )}

      {moveDialogWorkout && cycleDraft && (
        <MoveWorkoutDialog
          cycle={cycleDraft}
          workout={moveDialogWorkout}
          onClose={() => setMoveDialogWorkout(null)}
          onSubmit={(week, day) => {
            moveWorkout(moveDialogWorkout.id, week, day);
            setActiveWeek(week);
            setMoveDialogWorkout(null);
          }}
        />
      )}

      {dialog === "cycle" && (
        <CycleDialog cycle={cycleDraft} onClose={closeDialogs} onSubmit={submitCycleSettings} />
      )}

      {dialog === "new-cycle" && (
        <CycleDialog cycle={null} onClose={closeDialogs} onSubmit={createNewCycle} />
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
          key={`${workoutDialog.workoutId ?? "new"}:${workoutDialog.week}:${workoutDialog.day}:${workoutDialog.initialTitle ?? ""}`}
          cycle={cycleDraft}
          templates={plannerState.templates}
          workout={editingWorkout}
          initialWeek={workoutDialog.week}
          initialDay={workoutDialog.day}
          initialTemplateId={workoutDialog.templateId}
          initialTitle={workoutDialog.initialTitle}
          editScope={workoutDialog.editScope}
          seriesCount={editingWorkout?.seriesId
            ? cycleDraft.workouts.filter((workout) => workout.seriesId === editingWorkout.seriesId).length
            : 1}
          onClose={closeDialogs}
          onSubmit={submitWorkouts}
          onDelete={editingWorkout ? requestWorkoutDelete : undefined}
        />
      )}

      {workoutDeleteState && (
        <Modal
          eyebrow="Plan treningowy"
          title={`Usunąć „${workoutDeleteState.workout.title}”?`}
          description="Trening zniknie z aktywnego planu. Po zatwierdzeniu możesz od razu cofnąć tę zmianę."
          onClose={() => setWorkoutDeleteState(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setWorkoutDeleteState(null)}>Anuluj</Button>
              <Button variant="danger" onClick={confirmWorkoutDelete}>Usuń trening</Button>
            </>
          )}
        >
          <p className="sport-delete-note">
            Pozostałe treningi i zapisane wyniki planu nie zostaną zmienione.
          </p>
        </Modal>
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
