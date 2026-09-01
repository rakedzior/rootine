/**
 * THESIS: Widok Dzisiaj prowadzi od jednego bilansu dnia do szczegółowych sygnałów modułów.
 * OWN-WORLD: Grafitowe powierzchnie, precyzyjny błękit dla postępu i morskie szkło dla domkniętych obszarów.
 * STORY: Użytkownik najpierw widzi liczbę pozostałych rzeczy, potem skanuje zwarte wiersze źródłowych modułów.
 * FIRST VIEWPORT: Jeden dominujący bilans dnia i pionowy rejestr modułów wymagających reakcji.
 * FORM: Operacyjny dzienny bilans — seed 55ea3e9c.
 */
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router";
import {
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleMinus,
  Clock3,
  Flame,
  Plus,
} from "lucide-react";
import {
  AFFAIRS_STORAGE_KEY,
  createEmptyAffairsWorkspace,
  loadAffairsWorkspace,
  type AffairsWorkspace,
} from "../data/affairsWorkspace";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import {
  loadModulePreferences,
  subscribeToModulePreferences,
  type ModulePreferences,
} from "../data/modulePreferences";
import {
  createEmptyNutritionWorkspace,
  NUTRITION_STORAGE_KEY,
  loadNutritionWorkspace,
  type NutritionLoadResult,
  type NutritionEntry,
} from "../data/nutritionWorkspace";
import {
  createEmptyNotesWorkspace,
  loadNotesWorkspace,
  NOTES_STORAGE_KEY,
} from "../data/notesWorkspace";
import {
  isHabitDoneOnDate,
  isHabitScheduledOnDate,
  createEmptyTaskWorkspace,
  loadTaskWorkspace,
  TASK_STORAGE_KEY,
  toCalendarDateKey,
  type WorkspaceHabit,
  type WorkspaceTask,
} from "../data/taskWorkspace";
import { TRAVEL_STORAGE_KEY } from "../data/travelWorkspace";
import { createEmptyWorkWorkspace, loadWorkWorkspace, WORK_STORAGE_KEY } from "../data/workWorkspace";
import { useGoalsStore } from "../goals/goalsContext";
import type { Goal } from "../goals/goalsModel";
import { APP_MODULE_BY_ID, type AppModuleId } from "../moduleRegistry";
import { setActiveAreaId, useActiveAreaId, type RootineAreaId } from "../experience/activeArea";
import { TelemetryBar, type TelemetrySegment } from "../experience/TelemetryBar";
import {
  cycleWorkoutDate,
  createEmptySportPlannerState,
  loadSportPlannerState,
  SPORT_PLANNER_STORAGE_KEY,
} from "../sport/plannerModel";
import { toDateKey } from "../sport/model";
import {
  Button,
  ContentHeader,
  ModuleMain,
  ModuleShell,
} from "../ui";
import "../../styles/today.css";

type TodayAffair = {
  id: string;
  title: string;
  date: string;
  kind: string;
  amount?: number;
};

type SummaryTone = "neutral" | "warning" | "danger";
type ModuleState = "active" | "complete" | "empty";

type ModuleSummaryProps = {
  moduleId: AppModuleId;
  areaId: RootineAreaId;
  to: string;
  icon: ReactNode;
  title: string;
  message?: string;
  overdueMessage?: string;
  accent?: SummaryTone;
  state: ModuleState;
  progress?: number;
  total: number;
  completed: number;
  remaining: number;
  attention?: number;
  telemetry?: TelemetrySegment[];
};

type TodayQueueItem = {
  id: string;
  time: string;
  title: string;
  to: string;
  recency: number;
  isRecentTodayTask?: boolean;
};

const shortLandscapeQuery = "(max-width: 900px) and (max-height: 480px) and (orientation: landscape)";

function useShortLandscape() {
  const [isShortLandscape, setIsShortLandscape] = useState(() => (
    typeof window !== "undefined" && window.matchMedia(shortLandscapeQuery).matches
  ));

  useEffect(() => {
    const media = window.matchMedia(shortLandscapeQuery);
    const update = () => setIsShortLandscape(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isShortLandscape;
}

function readRecentTodayTask(): WorkspaceTask | null {
  try {
    const raw = window.localStorage.getItem("rootine.today-recent-task.v1");
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<WorkspaceTask>;
    return typeof value.id === "number" && typeof value.text === "string" ? value as WorkspaceTask : null;
  } catch {
    return null;
  }
}

function TodayOverdueDonut({ value }: { value: number }) {
  return (
    <div
      className={`today-day-balance__donut ${value > 0 ? "has-overdue" : "is-clear"}`}
      role="img"
      aria-label={`${value}% zaległości`}
    >
      <svg viewBox="0 0 144 144" aria-hidden="true" focusable="false">
        <circle className="today-day-balance__donut-track" cx="72" cy="72" r="55" pathLength="100" />
        <circle
          className="today-day-balance__donut-progress"
          cx="72"
          cy="72"
          r="55"
          pathLength="100"
          strokeDasharray={100}
          strokeDashoffset={100 - value}
        />
        <text className="today-day-balance__donut-value" x="72" y="70" textAnchor="middle">{value}%</text>
        <text className="today-day-balance__donut-label" x="72" y="91" textAnchor="middle">zaległości</text>
      </svg>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatFullDate(date: Date) {
  return capitalize(new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date));
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits }).format(value);
}

function polishForm(value: number, one: string, few: string, many: string) {
  const absolute = Math.abs(value);
  const mod10 = absolute % 10;
  const mod100 = absolute % 100;
  return value === 1
    ? one
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? few
      : many;
}

function counted(value: number, one: string, few: string, many: string) {
  return `${value} ${polishForm(value, one, few, many)}`;
}

function overdueSummary(
  count: number,
  nouns: [string, string, string],
) {
  return counted(count, ...nouns);
}

function moduleState(total: number, remaining: number): ModuleState {
  if (total === 0) return "empty";
  return remaining === 0 ? "complete" : "active";
}

function percentage(done: number, total: number, emptyValue = 100) {
  return total > 0 ? Math.min(100, Math.round(done / total * 100)) : emptyValue;
}

function taskIsForToday(task: WorkspaceTask, todayKey: string) {
  if (task.deleted) return false;
  if (task.calendarDate) return task.calendarDate === todayKey;
  return task.view === "dzis";
}

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toCalendarDateKey(date);
}

function goalHasDueMilestone(goal: Goal, todayKey: string) {
  return goal.milestones.some((item) => !item.done && item.dueDate <= todayKey);
}

function goalHasAttentionSignal(goal: Goal, todayKey: string) {
  if (goal.status !== "active") return false;
  return goal.health === "risk" || goalHasDueMilestone(goal, todayKey);
}

function isDailyRegularGoal(goal: Goal, todayKey: string) {
  return goal.status === "active"
    && goal.progressMode === "regularity"
    && goal.frequencyPeriod === "day"
    && goal.startDate <= todayKey
    && goal.dueDate >= todayKey;
}

function regularGoalCompletedToday(goal: Goal, todayKey: string) {
  return goal.progressEntries.some((entry) => entry.date === todayKey && entry.value > 0);
}

function collectAffairs(workspace: AffairsWorkspace): TodayAffair[] {
  return [
    ...workspace.matters
      .filter((item) => item.status !== "done")
      .map((item) => ({ id: item.id, title: item.title, date: item.dueDate, kind: "Sprawa" })),
    ...workspace.oneTimePayments
      .filter((item) => !item.paid)
      .map((item) => ({ id: item.id, title: item.title, date: item.dueDate, kind: "Płatność", amount: item.amount })),
    ...workspace.payments
      .filter((item) => item.active)
      .map((item) => ({ id: item.id, title: item.name, date: item.nextDueDate, kind: "Cykliczne", amount: item.amount })),
    ...workspace.subscriptions
      .filter((item) => item.active)
      .map((item) => ({ id: item.id, title: item.name, date: item.nextBillingDate, kind: "Subskrypcja", amount: item.amount })),
    ...workspace.documents
      .filter((item) => Boolean(item.expiresAt))
      .map((item) => ({ id: item.id, title: item.name, date: item.expiresAt, kind: "Dokument" })),
    ...workspace.vehicleItems
      .filter((item) => !item.done && Boolean(item.dueDate))
      .map((item) => ({ id: item.id, title: item.title, date: item.dueDate, kind: "Pojazd" })),
  ].sort((left, right) => left.date.localeCompare(right.date));
}

function sumNutrition(entries: NutritionEntry[]) {
  return entries.reduce((totals, entry) => ({
    calories: totals.calories + entry.calories,
    protein: totals.protein + entry.protein,
  }), { calories: 0, protein: 0 });
}

function ModuleSummary({
  areaId,
  to,
  icon,
  title,
  message,
  overdueMessage,
  accent = "neutral",
  state,
  progress,
  telemetry,
}: ModuleSummaryProps) {
  return (
    <Link
      className={`today-module-row is-${state} tone-${accent}`}
      to={to}
      viewTransition
      data-area-id={areaId}
      onPointerEnter={() => setActiveAreaId(areaId)}
      onPointerLeave={() => setActiveAreaId(null)}
      onFocus={() => setActiveAreaId(areaId)}
      onBlur={() => setActiveAreaId(null)}
    >
      <span className="today-module-row__identity">
        <span className="today-module-row__icon" aria-hidden="true">{icon}</span>
        <strong>{title}</strong>
      </span>
      <span className="today-module-row__summary">
        {message && <span className="today-module-row__message">{message}</span>}
      </span>
      <span className="today-module-row__overdue-column">
        {overdueMessage && (
          <span className="today-module-row__overdue" aria-label={overdueMessage} title={overdueMessage}>
            {overdueMessage.replace(/\s+(?:zadanie|zadania|zadań|sprawa|sprawy|spraw|cel|cele|celów)\s+po terminie$/, " po terminie")}
          </span>
        )}
      </span>
      <span className="today-module-row__visual">
        {telemetry?.length ? (
          <TelemetryBar
            segments={telemetry}
            label={`Stan i postęp: ${title}`}
            activeSegmentId={undefined}
            onActiveSegmentChange={(segmentId) => setActiveAreaId(segmentId ? areaId : null)}
          />
        ) : progress !== undefined ? (
          <span
            className="today-module-row__track"
            role="progressbar"
            aria-label={`Postęp: ${title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <i style={{ transform: `scaleX(${progress / 100})` }} />
          </span>
        ) : state === "complete" ? (
          <span className="today-module-row__state is-complete">
            <CheckCircle2 size={16} aria-hidden="true" />
          </span>
        ) : state === "empty" ? (
          <span className="today-module-row__state is-empty">
            <CircleMinus size={16} aria-hidden="true" />
          </span>
        ) : null}
      </span>
      <ChevronRight className="today-module-row__arrow" size={16} aria-hidden="true" />
    </Link>
  );
}

export default function Dzisiaj() {
  const navigate = useNavigate();
  const goalsStore = useGoalsStore();
  const activeAreaId = useActiveAreaId();
  const isShortLandscape = useShortLandscape();
  const [today, setToday] = useState(() => new Date());
  const todayKey = useMemo(() => toCalendarDateKey(today), [today]);
  const [taskWorkspace, setTaskWorkspace] = useState(createEmptyTaskWorkspace);
  const [recentTodayTask, setRecentTodayTask] = useState<WorkspaceTask | null>(readRecentTodayTask);
  const [workWorkspace, setWorkWorkspace] = useState(createEmptyWorkWorkspace);
  const [affairsWorkspace, setAffairsWorkspace] = useState(createEmptyAffairsWorkspace);
  const [sportPlanner, setSportPlanner] = useState(createEmptySportPlannerState);
  const [nutritionLoad, setNutritionLoad] = useState<NutritionLoadResult>(() => ({
    status: "missing" as const,
    workspace: createEmptyNutritionWorkspace(),
  }));
  const [notesWorkspace, setNotesWorkspace] = useState(createEmptyNotesWorkspace);
  const [modulePreferences, setModulePreferences] = useState<ModulePreferences>(loadModulePreferences);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTaskWorkspace(loadTaskWorkspace());
      setRecentTodayTask(readRecentTodayTask());
      setWorkWorkspace(loadWorkWorkspace());
      setAffairsWorkspace(loadAffairsWorkspace());
      setSportPlanner(loadSportPlannerState());
      setNutritionLoad(loadNutritionWorkspace());
      setNotesWorkspace(loadNotesWorkspace());
      setModulePreferences(loadModulePreferences());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribeTasks = subscribeToLocalWorkspace(TASK_STORAGE_KEY, () => {
      setTaskWorkspace(loadTaskWorkspace());
      setRecentTodayTask(readRecentTodayTask());
    });
    const unsubscribeWork = subscribeToLocalWorkspace(WORK_STORAGE_KEY, () => {
      setWorkWorkspace(loadWorkWorkspace());
      setTaskWorkspace(loadTaskWorkspace());
    });
    const unsubscribeTravel = subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, () => {
      setTaskWorkspace(loadTaskWorkspace());
    });
    const unsubscribeAffairs = subscribeToLocalWorkspace(AFFAIRS_STORAGE_KEY, () => {
      setAffairsWorkspace(loadAffairsWorkspace());
    });
    const unsubscribeSport = subscribeToLocalWorkspace(SPORT_PLANNER_STORAGE_KEY, () => {
      setSportPlanner(loadSportPlannerState());
    });
    const unsubscribeNutrition = subscribeToLocalWorkspace(NUTRITION_STORAGE_KEY, () => {
      setNutritionLoad(loadNutritionWorkspace());
    });
    const unsubscribeNotes = subscribeToLocalWorkspace(NOTES_STORAGE_KEY, () => {
      setNotesWorkspace(loadNotesWorkspace());
    });
    const unsubscribePreferences = subscribeToModulePreferences(() => {
      setModulePreferences(loadModulePreferences());
    });

    return () => {
      unsubscribeTasks();
      unsubscribeWork();
      unsubscribeTravel();
      unsubscribeAffairs();
      unsubscribeSport();
      unsubscribeNutrition();
      unsubscribeNotes();
      unsubscribePreferences();
    };
  }, []);

  const habitsForToday = taskWorkspace.habits.filter((habit) => isHabitScheduledOnDate(habit, todayKey));
  const habitDoneToday = (habit: WorkspaceHabit) => isHabitDoneOnDate(habit, todayKey);
  const completedHabits = habitsForToday.filter(habitDoneToday).length;
  const remainingHabits = habitsForToday.length - completedHabits;
  const habitsProgress = percentage(completedHabits, habitsForToday.length);
  const habitsState = moduleState(habitsForToday.length, remainingHabits);
  const habitTelemetry = Array.from({ length: 7 }, (_, index): TelemetrySegment => {
    const dateKey = shiftDateKey(todayKey, index - 6);
    const scheduled = taskWorkspace.habits.filter((habit) => isHabitScheduledOnDate(habit, dateKey));
    const done = scheduled.filter((habit) => isHabitDoneOnDate(habit, dateKey)).length;
    const label = new Intl.DateTimeFormat("pl-PL", { weekday: "short" }).format(new Date(`${dateKey}T12:00:00`));
    return {
      id: dateKey,
      label,
      value: done,
      max: Math.max(1, scheduled.length),
      weight: 1,
      tone: scheduled.length > 0 && done === scheduled.length ? "success" : "primary",
      accessibleValue: scheduled.length > 0 ? `${done} z ${scheduled.length}` : "Brak nawyków",
      description: `${label}: ${scheduled.length > 0 ? `${done} z ${scheduled.length} wykonane` : "brak planu"}`,
    };
  });

  const todayTasks = useMemo(
    () => taskWorkspace.tasks.filter((task) => (
      task.source?.kind !== "work" && taskIsForToday(task, todayKey)
    )),
    [taskWorkspace.tasks, todayKey],
  );
  const completedTodayTasks = todayTasks.filter((task) => task.done).length;
  const overdueTasks = taskWorkspace.tasks.filter((task) => (
    task.source?.kind !== "work"
    && !task.deleted
    && !task.done
    && Boolean(task.calendarDate)
    && task.calendarDate! < todayKey
  ));
  const taskModuleTotal = todayTasks.length + overdueTasks.length;
  const remainingTodayTasks = Math.max(0, todayTasks.length - completedTodayTasks);
  const taskModuleRemaining = remainingTodayTasks + overdueTasks.length;
  const tasksProgress = percentage(completedTodayTasks, todayTasks.length);
  const tasksState = moduleState(taskModuleTotal, taskModuleRemaining);

  const workTasksForToday = useMemo(
    () => workWorkspace.tasks.filter((task) => (
      Boolean(task.dueDate)
      && (task.dueDate === todayKey || (!task.completed && task.dueDate < todayKey))
    )),
    [todayKey, workWorkspace.tasks],
  );
  const completedWorkTasks = workTasksForToday.filter((task) => task.completed).length;
  const todayWorkTasks = workTasksForToday.filter((task) => !task.completed);
  const workTasksDueToday = workTasksForToday.filter((task) => task.dueDate === todayKey);
  const completedWorkTasksDueToday = workTasksDueToday.filter((task) => task.completed).length;
  const remainingWorkTasksDueToday = workTasksDueToday.length - completedWorkTasksDueToday;
  const overdueWorkTasks = todayWorkTasks.filter((task) => task.dueDate < todayKey);
  const workProgress = percentage(completedWorkTasksDueToday, workTasksDueToday.length);
  const workState = moduleState(workTasksForToday.length, todayWorkTasks.length);

  const nextScheduledItems = useMemo<TodayQueueItem[]>(() => {
    const personalItems = [...taskWorkspace.tasks, ...(recentTodayTask && !taskWorkspace.tasks.some((task) => task.id === recentTodayTask.id) ? [recentTodayTask] : [])]
      .filter((task) => !task.done && task.source?.kind !== "work")
      .map((task) => ({
        id: `task-${task.id}`,
        time: task.time ?? "Cały dzień",
        title: task.text,
        to: `/zadania?widok=dzis&zadanie=${task.id}`,
        recency: Number(task.id) || 0,
        isRecentTodayTask: task.id === recentTodayTask?.id,
      }));
    const workItems: TodayQueueItem[] = workTasksForToday
      .filter((task) => (
        !task.completed
        && task.dueDate === todayKey
        && Boolean(task.linkedTask?.time)
      ))
      .map((task) => ({
        id: `work-${task.id}`,
        time: task.linkedTask!.time!,
        title: task.title,
        to: "/praca",
        recency: 0,
      }));

    return [...personalItems, ...workItems]
      .sort((left, right) => {
        // The record just made from the one primary Today CTA must remain a
        // concrete, touch-sized opener on the return journey, even when the
        // pre-existing timed queue already fills all visible slots.
        if (left.isRecentTodayTask !== right.isRecentTodayTask) return left.isRecentTodayTask ? -1 : 1;
        const leftTimed = /^\d{2}:\d{2}$/.test(left.time);
        const rightTimed = /^\d{2}:\d{2}$/.test(right.time);
        if (leftTimed && rightTimed) return left.time.localeCompare(right.time);
        if (leftTimed !== rightTimed) return leftTimed ? -1 : 1;
        return right.recency - left.recency;
      })
      .slice(0, 6);
  }, [recentTodayTask, taskWorkspace.tasks, todayKey, workTasksForToday]);

  const dailyRegularGoals = useMemo(
    () => goalsStore.goals.filter((goal) => isDailyRegularGoal(goal, todayKey)),
    [goalsStore.goals, todayKey],
  );
  const attentionGoals = useMemo(
    () => goalsStore.goals.filter((goal) => goalHasAttentionSignal(goal, todayKey)),
    [goalsStore.goals, todayKey],
  );
  const todayGoals = useMemo(() => {
    const goals = new Map<string, Goal>();
    dailyRegularGoals.forEach((goal) => goals.set(goal.id, goal));
    attentionGoals.forEach((goal) => goals.set(goal.id, goal));
    return [...goals.values()];
  }, [attentionGoals, dailyRegularGoals]);
  const completedTodayGoals = todayGoals.filter((goal) => (
    isDailyRegularGoal(goal, todayKey)
    && regularGoalCompletedToday(goal, todayKey)
    && !goalHasAttentionSignal(goal, todayKey)
  )).length;
  const remainingTodayGoals = todayGoals.length - completedTodayGoals;
  const overdueGoals = todayGoals.filter((goal) => (
    goal.milestones.some((milestone) => !milestone.done && milestone.dueDate < todayKey)
  ));
  const goalsWithDueMilestones = todayGoals.filter((goal) => goalHasDueMilestone(goal, todayKey));
  const overdueGoalIds = new Set(overdueGoals.map((goal) => goal.id));
  const atRiskGoals = todayGoals.filter((goal) => goal.health === "risk" && !overdueGoalIds.has(goal.id));
  const goalsAttentionCount = overdueGoals.length + atRiskGoals.length;
  const goalsAttentionMessage = goalsAttentionCount === 0
    ? undefined
    : overdueGoals.length > 0 && atRiskGoals.length > 0
      ? counted(goalsAttentionCount, "cel wymaga uwagi", "cele wymagają uwagi", "celów wymaga uwagi")
      : overdueGoals.length > 0
        ? overdueSummary(overdueGoals.length, ["cel po terminie", "cele po terminie", "celów po terminie"])
        : counted(atRiskGoals.length, "cel zagrożony", "cele zagrożone", "celów zagrożonych");
  const goalsDueToday = todayGoals.filter((goal) => !overdueGoalIds.has(goal.id));
  const remainingGoalsDueToday = Math.max(
    0,
    goalsDueToday.length - completedTodayGoals,
  );
  const goalsProgress = percentage(completedTodayGoals, goalsDueToday.length);
  const goalsState = moduleState(todayGoals.length, remainingTodayGoals);

  const todayWorkouts = useMemo(() => {
    if (!sportPlanner.activeCycle) return [];
    return sportPlanner.activeCycle.workouts
      .filter((workout) => cycleWorkoutDate(sportPlanner.activeCycle!, workout) === toDateKey(today));
  }, [sportPlanner.activeCycle, today]);
  const completedWorkouts = todayWorkouts.filter(
    (workout) => sportPlanner.workoutOutcomes[workout.id]?.status === "completed",
  ).length;
  const remainingWorkouts = todayWorkouts.length - completedWorkouts;
  const sportProgress = percentage(completedWorkouts, todayWorkouts.length);
  const sportState = moduleState(todayWorkouts.length, remainingWorkouts);

  const allAffairs = useMemo(() => collectAffairs(affairsWorkspace), [affairsWorkspace]);
  const todayAffairs = allAffairs.filter((item) => item.date <= todayKey);
  const todayAffairsDueToday = todayAffairs.filter((item) => item.date === todayKey);
  const overdueAffairs = allAffairs.filter((item) => item.date < todayKey);
  const affairsComplete = todayAffairs.length === 0;
  const affairsState: ModuleState = affairsComplete ? "empty" : "active";

  const nutritionDay = nutritionLoad.workspace.days[todayKey];
  const nutritionEntries = nutritionDay ? Object.values(nutritionDay.entries).flat() : [];
  const nutritionTotals = sumNutrition(nutritionEntries);
  const calorieGoal = nutritionLoad.workspace.goals.calories;
  const waterGoal = nutritionLoad.workspace.goals.waterMl;
  const calorieProgress = percentage(nutritionTotals.calories, calorieGoal, 0);
  const nutritionOverTarget = nutritionTotals.calories > calorieGoal * 1.1;
  const nutritionClosed = Boolean(nutritionDay?.closedAt);
  const nutritionState: ModuleState = nutritionClosed ? "complete" : "active";
  const calorieRemaining = Math.max(0, calorieGoal - nutritionTotals.calories);
  const waterRemaining = Math.max(0, waterGoal - (nutritionDay?.waterMl ?? 0));
  const caloriesInTargetRange = nutritionTotals.calories >= calorieGoal * 0.9
    && nutritionTotals.calories <= calorieGoal * 1.1;
  const activeNotes = notesWorkspace.notes.filter((note) => !note.archived);
  const notesUpdatedToday = activeNotes.filter((note) => note.updatedAt.slice(0, 10) === todayKey);
  const latestNote = [...activeNotes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

  const visibleModuleIds = new Set(
    modulePreferences.order.filter((moduleId) => !modulePreferences.disabled.includes(moduleId)),
  );
  const totalDailyItems = (visibleModuleIds.has("tasks")
    ? taskModuleTotal + habitsForToday.length
    : 0)
    + (visibleModuleIds.has("work") ? workTasksForToday.length : 0)
    + (visibleModuleIds.has("goals") ? todayGoals.length : 0)
    + (visibleModuleIds.has("sport") ? todayWorkouts.length : 0)
    + (visibleModuleIds.has("affairs") ? todayAffairs.length : 0);
  const completedDailyItems = (visibleModuleIds.has("tasks")
    ? completedTodayTasks + completedHabits
    : 0)
    + (visibleModuleIds.has("work") ? completedWorkTasks : 0)
    + (visibleModuleIds.has("goals") ? completedTodayGoals : 0)
    + (visibleModuleIds.has("sport") ? completedWorkouts : 0);
  const remainingDailyItems = Math.max(0, totalDailyItems - completedDailyItems);
  const overdueItems = (visibleModuleIds.has("tasks") ? overdueTasks.length : 0)
    + (visibleModuleIds.has("work") ? overdueWorkTasks.length : 0)
    + (visibleModuleIds.has("goals") ? overdueGoals.length : 0)
    + (visibleModuleIds.has("affairs") ? overdueAffairs.length : 0);
  const overdueEligibleItems = (visibleModuleIds.has("tasks") ? taskModuleTotal : 0)
    + (visibleModuleIds.has("work") ? workTasksForToday.length : 0)
    + (visibleModuleIds.has("goals") ? goalsWithDueMilestones.length : 0)
    + (visibleModuleIds.has("affairs") ? todayAffairs.length : 0);
  const priorityItems = (visibleModuleIds.has("tasks")
    ? todayTasks.filter((task) => Boolean(task.priority)).length
      + habitsForToday.filter((habit) => Boolean(habit.priority)).length
    : 0)
    + (visibleModuleIds.has("work") ? workTasksDueToday.filter((task) => task.priority !== "none").length : 0);
  const completedPriorityItems = (visibleModuleIds.has("tasks")
    ? todayTasks.filter((task) => Boolean(task.priority) && task.done).length
      + habitsForToday.filter((habit) => Boolean(habit.priority) && habitDoneToday(habit)).length
    : 0)
    + (visibleModuleIds.has("work") ? workTasksDueToday.filter((task) => task.priority !== "none" && task.completed).length : 0);
  const overdueRate = overdueEligibleItems > 0
    ? Math.min(100, Math.round((overdueItems / overdueEligibleItems) * 100))
    : 0;
  const dayComplete = remainingDailyItems === 0;

  const nutritionMetric = nutritionOverTarget
    ? `${formatNumber(nutritionTotals.calories - calorieGoal)} kcal ponad cel`
    : caloriesInTargetRange && waterRemaining > 0
      ? `${formatNumber(waterRemaining)} ml do celu nawodnienia`
      : `${formatNumber(calorieRemaining)} kcal do celu`;
  const TasksIcon = APP_MODULE_BY_ID.tasks.icon;
  const GoalsIcon = APP_MODULE_BY_ID.goals.icon;
  const WorkIcon = APP_MODULE_BY_ID.work.icon;
  const SportIcon = APP_MODULE_BY_ID.sport.icon;
  const AffairsIcon = APP_MODULE_BY_ID.affairs.icon;
  const NutritionIcon = APP_MODULE_BY_ID.nutrition.icon;
  const NotesIcon = APP_MODULE_BY_ID.notes.icon;
  const moduleRows: ModuleSummaryProps[] = [
    {
      moduleId: "tasks",
      areaId: "tasks",
      to: `${APP_MODULE_BY_ID.tasks.to}?widok=dzis`,
      icon: <TasksIcon size={16} />,
      title: APP_MODULE_BY_ID.tasks.label,
      message: todayTasks.length === 0
        ? "Brak zadań na dziś"
        : remainingTodayTasks === 0
          ? "Plan na dziś wykonany"
          : counted(remainingTodayTasks, "zadanie na dziś", "zadania na dziś", "zadań na dziś"),
      overdueMessage: overdueTasks.length
        ? overdueSummary(overdueTasks.length, ["zadanie po terminie", "zadania po terminie", "zadań po terminie"])
        : undefined,
      accent: overdueTasks.length ? "warning" : "neutral",
      state: tasksState,
      progress: tasksProgress,
      total: taskModuleTotal,
      completed: completedTodayTasks,
      remaining: taskModuleRemaining,
      attention: overdueTasks.length,
      telemetry: [
        { id: "done", label: "Wykonane", value: completedTodayTasks, max: Math.max(1, taskModuleTotal), weight: Math.max(1, completedTodayTasks), tone: "success" },
        { id: "remaining", label: "Pozostałe na dziś", value: remainingTodayTasks, max: Math.max(1, taskModuleTotal), weight: Math.max(1, remainingTodayTasks), tone: "primary" },
        { id: "overdue", label: "Zaległe", value: overdueTasks.length, max: Math.max(1, taskModuleTotal), weight: Math.max(1, overdueTasks.length), tone: "warning" },
      ],
    },
    {
      moduleId: "tasks",
      areaId: "habits",
      to: `${APP_MODULE_BY_ID.tasks.to}?widok=nawyki`,
      icon: <Flame size={16} />,
      title: "Nawyki",
      message: habitsState === "complete"
        ? "Wszystko wykonane"
        : habitsState === "empty"
          ? "Brak nawyków na dziś"
          : counted(remainingHabits, "nawyk do wykonania", "nawyki do wykonania", "nawyków do wykonania"),
      state: habitsState,
      progress: habitsProgress,
      total: habitsForToday.length,
      completed: completedHabits,
      remaining: remainingHabits,
      telemetry: habitTelemetry,
    },
    {
      moduleId: "goals",
      areaId: "goals",
      to: APP_MODULE_BY_ID.goals.to,
      icon: <GoalsIcon size={16} />,
      title: APP_MODULE_BY_ID.goals.label,
      message: goalsState === "complete"
          ? "Wszystko wykonane"
          : goalsState === "empty"
            ? "Brak celów na dziś"
          : remainingGoalsDueToday > 0
            ? counted(remainingGoalsDueToday, "cel na dziś", "cele na dziś", "celów na dziś")
            : undefined,
      overdueMessage: goalsAttentionMessage,
      accent: goalsAttentionCount ? "warning" : "neutral",
      state: goalsState,
      progress: goalsProgress,
      total: todayGoals.length,
      completed: completedTodayGoals,
      remaining: remainingTodayGoals,
      attention: goalsAttentionCount,
      telemetry: [
        { id: "done", label: "Domknięte dzisiaj", value: completedTodayGoals, max: Math.max(1, todayGoals.length), weight: Math.max(1, completedTodayGoals), tone: "success" },
        { id: "remaining", label: "Pozostałe", value: remainingTodayGoals, max: Math.max(1, todayGoals.length), weight: Math.max(1, remainingTodayGoals), tone: "primary" },
        { id: "attention", label: "Wymaga uwagi", value: goalsAttentionCount, max: Math.max(1, todayGoals.length), weight: Math.max(1, goalsAttentionCount), tone: "warning" },
      ],
    },
    {
      moduleId: "work",
      areaId: "work",
      to: APP_MODULE_BY_ID.work.to,
      icon: <WorkIcon size={16} />,
      title: APP_MODULE_BY_ID.work.label,
      message: workTasksDueToday.length === 0
        ? "Brak zadań na dziś"
        : remainingWorkTasksDueToday === 0
          ? "Plan na dziś wykonany"
          : counted(remainingWorkTasksDueToday, "zadanie na dziś", "zadania na dziś", "zadań na dziś"),
      overdueMessage: overdueWorkTasks.length
        ? overdueSummary(overdueWorkTasks.length, ["zadanie po terminie", "zadania po terminie", "zadań po terminie"])
        : undefined,
      accent: overdueWorkTasks.length ? "warning" : "neutral",
      state: workState,
      progress: workProgress,
      total: workTasksForToday.length,
      completed: completedWorkTasks,
      remaining: todayWorkTasks.length,
      attention: overdueWorkTasks.length,
      telemetry: [
        { id: "done", label: "Wykonane", value: completedWorkTasksDueToday, max: Math.max(1, workTasksForToday.length), weight: Math.max(1, completedWorkTasksDueToday), tone: "success" },
        { id: "remaining", label: "Pozostałe na dziś", value: remainingWorkTasksDueToday, max: Math.max(1, workTasksForToday.length), weight: Math.max(1, remainingWorkTasksDueToday), tone: "primary" },
        { id: "overdue", label: "Zaległe", value: overdueWorkTasks.length, max: Math.max(1, workTasksForToday.length), weight: Math.max(1, overdueWorkTasks.length), tone: "warning" },
      ],
    },
    {
      moduleId: "sport",
      areaId: "sport",
      to: APP_MODULE_BY_ID.sport.to,
      icon: <SportIcon size={16} />,
      title: APP_MODULE_BY_ID.sport.label,
      message: sportState === "complete"
        ? "Wszystko wykonane"
        : sportState === "empty"
          ? "Brak treningu na dziś"
          : counted(remainingWorkouts, "trening do wykonania", "treningi do wykonania", "treningów do wykonania"),
      state: sportState,
      progress: sportState === "empty" ? undefined : sportProgress,
      total: todayWorkouts.length,
      completed: completedWorkouts,
      remaining: remainingWorkouts,
      telemetry: [
        { id: "done", label: "Wykonane", value: completedWorkouts, max: Math.max(1, todayWorkouts.length), weight: Math.max(1, completedWorkouts), tone: "success" },
        { id: "planned", label: "Zaplanowane", value: remainingWorkouts, max: Math.max(1, todayWorkouts.length), weight: Math.max(1, remainingWorkouts), tone: "primary" },
      ],
    },
    {
      moduleId: "affairs",
      areaId: "affairs",
      to: APP_MODULE_BY_ID.affairs.to,
      icon: <AffairsIcon size={16} />,
      title: APP_MODULE_BY_ID.affairs.label,
      message: affairsState === "empty"
        ? "Brak spraw na dziś"
        : todayAffairsDueToday.length > 0
          ? counted(todayAffairsDueToday.length, "sprawa na dziś", "sprawy na dziś", "spraw na dziś")
          : undefined,
      overdueMessage: overdueAffairs.length
        ? overdueSummary(overdueAffairs.length, ["sprawa po terminie", "sprawy po terminie", "spraw po terminie"])
        : undefined,
      accent: overdueAffairs.length ? "warning" : "neutral",
      state: affairsState,
      progress: undefined,
      total: todayAffairs.length,
      completed: 0,
      remaining: todayAffairs.length,
      attention: overdueAffairs.length,
      telemetry: [
        { id: "today", label: "Na dziś", value: todayAffairsDueToday.length, max: Math.max(1, todayAffairs.length), weight: Math.max(1, todayAffairsDueToday.length), tone: "primary" },
        { id: "overdue", label: "Po terminie", value: overdueAffairs.length, max: Math.max(1, todayAffairs.length), weight: Math.max(1, overdueAffairs.length), tone: "warning" },
      ],
    },
    {
      moduleId: "nutrition",
      areaId: "nutrition",
      to: `${APP_MODULE_BY_ID.nutrition.to}?data=${encodeURIComponent(todayKey)}`,
      icon: <NutritionIcon size={16} />,
      title: APP_MODULE_BY_ID.nutrition.label,
      message: nutritionState === "complete"
        ? "Dzień zamknięty"
        : nutritionEntries.length === 0
          ? "Dodaj pierwszy posiłek"
          : nutritionMetric,
      accent: nutritionOverTarget ? "warning" : "neutral",
      state: nutritionState,
      progress: calorieProgress,
      total: 1,
      completed: nutritionClosed ? 1 : 0,
      remaining: nutritionClosed ? 0 : 1,
      attention: nutritionOverTarget ? 1 : 0,
      telemetry: [
        { id: "calories", label: "Cel kalorii", value: nutritionTotals.calories, max: Math.max(1, calorieGoal), weight: 2, tone: nutritionOverTarget ? "warning" : "primary", accessibleValue: `${formatNumber(nutritionTotals.calories)} z ${formatNumber(calorieGoal)} kcal` },
        { id: "water", label: "Nawodnienie", value: nutritionDay?.waterMl ?? 0, max: Math.max(1, waterGoal), weight: 1, tone: "primary", accessibleValue: `${formatNumber(nutritionDay?.waterMl ?? 0)} z ${formatNumber(waterGoal)} ml` },
      ],
    },
    {
      moduleId: "notes",
      areaId: "notes",
      to: APP_MODULE_BY_ID.notes.to,
      icon: <NotesIcon size={16} />,
      title: APP_MODULE_BY_ID.notes.label,
      message: notesUpdatedToday.length > 0
        ? counted(notesUpdatedToday.length, "notatka zmieniona dziś", "notatki zmienione dziś", "notatek zmienionych dziś")
        : latestNote
          ? "Brak zmian dzisiaj"
          : "Brak notatek",
      state: notesUpdatedToday.length > 0 ? "active" : "empty",
      progress: undefined,
      total: notesUpdatedToday.length,
      completed: 0,
      remaining: notesUpdatedToday.length,
    },
  ];
  const orderedModuleRows = modulePreferences.order
    .filter((moduleId) => visibleModuleIds.has(moduleId))
    .flatMap((moduleId) => moduleRows.filter((module) => module.moduleId === moduleId));
  const overdueAreaIds = new Set<RootineAreaId>();
  if (visibleModuleIds.has("tasks") && overdueTasks.length > 0) overdueAreaIds.add("tasks");
  if (visibleModuleIds.has("work") && overdueWorkTasks.length > 0) overdueAreaIds.add("work");
  if (visibleModuleIds.has("goals") && overdueGoals.length > 0) overdueAreaIds.add("goals");
  if (visibleModuleIds.has("affairs") && overdueAffairs.length > 0) overdueAreaIds.add("affairs");

  const dailyProgress = percentage(completedDailyItems, totalDailyItems);

  return (
      <ModuleShell
        className={`today-module${isShortLandscape ? " is-short-landscape" : ""}`}
        pageWidth="standard"
      >
      <ModuleMain>
        <ContentHeader
          headingLevel={1}
          title="Plan dnia"
          // The date used to live in the page header; it is the only place the user reads
          // which day the balance describes, so it moves into the description rather than out.
          description={formatFullDate(today)}
          actions={(
            <div className="today-add-menu">
              <Button
                className="today-primary-action"
                variant="primary"
                leadingIcon={<Plus size={13} aria-hidden="true" />}
                aria-label="Dodaj zadanie do dzisiejszego planu"
                onClick={() => navigate("/zadania?widok=dzis&akcja=nowe-zadanie")}
              >
                <span className="header-action-label">Dodaj zadanie</span>
              </Button>
            </div>
          )}
        />
        <div className="today-scroll">
          <div className="today-content" data-active-area={activeAreaId ?? undefined}>
            <section
              className={`today-day-balance ${dayComplete ? "is-complete" : ""}`}
              aria-label="Bilans dnia"
            >
              <div className="today-day-balance__progress-panel">
                <div className="today-day-balance__panel-header">
                  <span className="today-day-balance__panel-icon" aria-hidden="true"><ChartNoAxesCombined size={21} /></span>
                  <h2 id="today-now-title">Teraz</h2>
                </div>
                <div className="today-day-balance__completed-value">
                  <strong>{completedDailyItems}</strong>
                  <span>z {totalDailyItems} wykonano</span>
                </div>
                <div className="today-day-balance__progress-row">
                  <span
                    className="today-day-balance__progress"
                    role="progressbar"
                    aria-label="Postęp planu dnia"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={dailyProgress}
                  >
                    <i style={{ transform: `scaleX(${dailyProgress / 100})` }} />
                  </span>
                </div>
                <div className="today-day-balance__priority">
                  <span className="today-day-balance__priority-icon" aria-hidden="true"><CheckCircle2 size={18} /></span>
                  <span>{completedPriorityItems} z {priorityItems} priorytetów ukończone</span>
                </div>
                <div className="today-day-balance__remaining-summary">
                  <Circle size={21} aria-hidden="true" />
                  <span>{counted(remainingDailyItems, "element", "elementy", "elementów")} pozostało</span>
                </div>
              </div>

              <div className="today-day-balance__queue">
                <div className="today-day-balance__panel-header">
                  <span className="today-day-balance__panel-icon" aria-hidden="true"><CalendarDays size={21} /></span>
                  <h2 id="today-day-balance-queue-title">Następne w kolejce</h2>
                </div>
                {nextScheduledItems.length > 0 ? (
                  <ol className="today-day-balance__queue-list">
                    {nextScheduledItems.map((item) => (
                      <li key={item.id}>
                        <Link to={item.to} aria-label={`Otwórz zadanie: ${item.title}`}>
                          <time dateTime={/^\d{2}:\d{2}$/.test(item.time) ? `T${item.time}` : undefined}>{item.time}</time>
                          <span>{item.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="today-day-balance__queue-empty">Brak zadań z wyznaczoną godziną na dziś.</p>
                )}
                <Link className="today-day-balance__queue-link" to={`${APP_MODULE_BY_ID.tasks.to}?widok=dzis`}>
                  Zobacz wszystkie <ChevronRight size={13} aria-hidden="true" />
                </Link>
              </div>

              <aside
                className={`today-day-balance__attention ${overdueItems ? "has-overdue" : "is-clear"}`}
                aria-labelledby="today-day-balance-attention-title"
              >
                <div className="today-day-balance__panel-header">
                  <span className="today-day-balance__panel-icon" aria-hidden="true"><Clock3 size={21} /></span>
                  <h2 id="today-day-balance-attention-title">Zaległości</h2>
                </div>
                <div className="today-day-balance__attention-content">
                  <TodayOverdueDonut value={overdueRate} />
                  <div className="today-day-balance__attention-summary">
                    <div className="today-day-balance__attention-head">
                      <strong>
                        {overdueItems ? "Zaległe elementy" : "Brak zaległości"}
                      </strong>
                    </div>
                    <span className="today-day-balance__attention-count">
                      {counted(overdueItems, "element", "elementy", "elementów")}
                    </span>
                    <p className="today-day-balance__attention-footer">
                      {overdueItems
                        ? `w ${overdueAreaIds.size} ${overdueAreaIds.size === 1 ? "obszarze" : "obszarach"}`
                        : "Świetna robota! Wszystkie elementy są na bieżąco."}
                    </p>
                  </div>
                </div>
              </aside>

              <div className="today-day-balance__balance" aria-label="Bilans dnia">
                <strong>Bilans</strong>
                <span>{completedDailyItems} z {totalDailyItems} elementów ukończonych · {counted(remainingDailyItems, "element", "elementy", "elementów")} pozostało</span>
              </div>
            </section>

            <section className="today-module-register" aria-labelledby="today-module-register-title">
              <div className="today-module-register__header">
                <h2 id="today-module-register-title">Obszary dnia</h2>
                <div className="today-module-register__meta">
                  <span className="today-module-register__visual-label">Stan / postęp</span>
                  <span>{orderedModuleRows.length} obszarów</span>
                </div>
              </div>

              <div className="today-module-list" data-active-area={activeAreaId ?? undefined}>
                {orderedModuleRows.map((module) => (
                  <ModuleSummary key={module.areaId} {...module} />
                ))}
              </div>
            </section>
          </div>
        </div>
      </ModuleMain>
    </ModuleShell>
  );
}
