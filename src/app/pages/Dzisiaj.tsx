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
import { Link } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleMinus,
  Flame,
  LayoutGrid,
  Plus,
} from "lucide-react";
import {
  AFFAIRS_STORAGE_KEY,
  createDefaultAffairsWorkspace,
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
  createDefaultNotesWorkspace,
  loadNotesWorkspace,
  NOTES_STORAGE_KEY,
} from "../data/notesWorkspace";
import {
  isHabitDoneOnDate,
  isHabitScheduledOnDate,
  createDefaultTaskWorkspace,
  loadTaskWorkspace,
  TASK_STORAGE_KEY,
  toCalendarDateKey,
  type WorkspaceHabit,
  type WorkspaceTask,
} from "../data/taskWorkspace";
import { TRAVEL_STORAGE_KEY } from "../data/travelWorkspace";
import { createDefaultWorkWorkspace, loadWorkWorkspace, WORK_STORAGE_KEY } from "../data/workWorkspace";
import { useGoalsStore } from "../goals/goalsContext";
import type { Goal } from "../goals/goalsModel";
import { APP_MODULE_BY_ID, type AppModuleId } from "../moduleRegistry";
import { useActiveArea, type RootineAreaId } from "../experience/activeArea";
import {
  LivingDay,
  type LivingDayArea,
  type LivingDayAreaBreakdown,
} from "../experience/LivingDay";
import { AnimatedNumber, AnimatedPercentage } from "../experience/MotionValues";
import { TelemetryBar, type TelemetrySegment } from "../experience/TelemetryBar";
import {
  cycleWorkoutDate,
  createDefaultSportPlannerState,
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
  livingDayBreakdown?: LivingDayAreaBreakdown;
};

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

function overdueAgeLabel(dateKey: string, todayKey: string) {
  const days = Math.max(1, Math.round((
    Date.parse(`${todayKey}T12:00:00`) - Date.parse(`${dateKey}T12:00:00`)
  ) / 86_400_000));
  return days === 1 ? "1 dzień po terminie" : `${days} dni po terminie`;
}

function overdueSummary(
  count: number,
  nouns: [string, string, string],
  dates: string[],
  todayKey: string,
) {
  const oldestDate = dates.reduce((oldest, date) => date < oldest ? date : oldest, dates[0]);
  return `${counted(count, ...nouns)} · najstarsze ${overdueAgeLabel(oldestDate, todayKey)}`;
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

function goalHasAttentionSignal(goal: Goal, todayKey: string) {
  if (goal.status !== "active") return false;
  const hasDueMilestone = goal.milestones.some((item) => !item.done && item.dueDate <= todayKey);
  return goal.health === "risk" || hasDueMilestone;
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
  const { setActiveAreaId } = useActiveArea();
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
        {message && <span className={`today-module-row__message tone-${accent}`}>{message}</span>}
      </span>
      <span className="today-module-row__overdue-column">
        {overdueMessage && (
          <span className="today-module-row__overdue" aria-label={overdueMessage} title={overdueMessage}>
            {overdueMessage}
          </span>
        )}
      </span>
      <span className="today-module-row__visual">
        {telemetry?.length ? (
          <TelemetryBar
            segments={telemetry}
            label={`Telemetryka: ${title}`}
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
  const goalsStore = useGoalsStore();
  const { activeAreaId, setActiveAreaId } = useActiveArea();
  const [today, setToday] = useState(() => new Date());
  const todayKey = useMemo(() => toCalendarDateKey(today), [today]);
  const [taskWorkspace, setTaskWorkspace] = useState(createDefaultTaskWorkspace);
  const [workWorkspace, setWorkWorkspace] = useState(createDefaultWorkWorkspace);
  const [affairsWorkspace, setAffairsWorkspace] = useState(createDefaultAffairsWorkspace);
  const [sportPlanner, setSportPlanner] = useState(createDefaultSportPlannerState);
  const [nutritionLoad, setNutritionLoad] = useState<NutritionLoadResult>(() => ({
    status: "missing" as const,
    workspace: createEmptyNutritionWorkspace(),
  }));
  const [notesWorkspace, setNotesWorkspace] = useState(createDefaultNotesWorkspace);
  const [modulePreferences, setModulePreferences] = useState<ModulePreferences>(loadModulePreferences);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTaskWorkspace(loadTaskWorkspace());
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
  const overdueGoalIds = new Set(overdueGoals.map((goal) => goal.id));
  const atRiskGoals = todayGoals.filter((goal) => goal.health === "risk" && !overdueGoalIds.has(goal.id));
  const goalsAttentionCount = overdueGoals.length + atRiskGoals.length;
  const goalsAttentionMessage = goalsAttentionCount === 0
    ? undefined
    : overdueGoals.length > 0 && atRiskGoals.length > 0
      ? counted(goalsAttentionCount, "cel wymaga uwagi", "cele wymagają uwagi", "celów wymaga uwagi")
      : overdueGoals.length > 0
        ? overdueSummary(overdueGoals.length, ["cel po terminie", "cele po terminie", "celów po terminie"], overdueGoals.flatMap((goal) => goal.milestones.filter((milestone) => !milestone.done && milestone.dueDate < todayKey).map((milestone) => milestone.dueDate)), todayKey)
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
    + (visibleModuleIds.has("affairs") ? todayAffairs.length : 0)
    + (visibleModuleIds.has("nutrition") ? 1 : 0);
  const completedDailyItems = (visibleModuleIds.has("tasks")
    ? completedTodayTasks + completedHabits
    : 0)
    + (visibleModuleIds.has("work") ? completedWorkTasks : 0)
    + (visibleModuleIds.has("goals") ? completedTodayGoals : 0)
    + (visibleModuleIds.has("sport") ? completedWorkouts : 0)
    + (visibleModuleIds.has("nutrition") && nutritionClosed ? 1 : 0);
  const remainingDailyItems = Math.max(0, totalDailyItems - completedDailyItems);
  const overdueItems = (visibleModuleIds.has("tasks") ? overdueTasks.length : 0)
    + (visibleModuleIds.has("work") ? overdueWorkTasks.length : 0)
    + (visibleModuleIds.has("goals") ? overdueGoals.length : 0)
    + (visibleModuleIds.has("affairs") ? overdueAffairs.length : 0);
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
        ? overdueSummary(overdueTasks.length, ["zadanie po terminie", "zadania po terminie", "zadań po terminie"], overdueTasks.map((task) => task.calendarDate!), todayKey)
        : undefined,
      accent: overdueTasks.length ? "warning" : "neutral",
      state: tasksState,
      progress: tasksProgress,
      total: taskModuleTotal,
      completed: completedTodayTasks,
      remaining: taskModuleRemaining,
      attention: overdueTasks.length,
      livingDayBreakdown: {
        plannedToday: todayTasks.length,
        completedToday: completedTodayTasks,
        overdue: overdueTasks.length,
      },
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
            ? "Brak celów wymagających uwagi"
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
        ? overdueSummary(overdueWorkTasks.length, ["zadanie po terminie", "zadania po terminie", "zadań po terminie"], overdueWorkTasks.map((task) => task.dueDate!), todayKey)
        : undefined,
      accent: overdueWorkTasks.length ? "warning" : "neutral",
      state: workState,
      progress: workProgress,
      total: workTasksForToday.length,
      completed: completedWorkTasks,
      remaining: todayWorkTasks.length,
      attention: overdueWorkTasks.length,
      livingDayBreakdown: {
        plannedToday: workTasksDueToday.length,
        completedToday: completedWorkTasksDueToday,
        overdue: overdueWorkTasks.length,
      },
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
        ? overdueSummary(overdueAffairs.length, ["sprawa po terminie", "sprawy po terminie", "spraw po terminie"], overdueAffairs.map((item) => item.date), todayKey)
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
      to: APP_MODULE_BY_ID.nutrition.to,
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
  const activeAreaCount = new Set(
    orderedModuleRows
      .filter((module) => module.state === "active")
      .map((module) => module.areaId),
  ).size;
  const overdueAreaIds = new Set<RootineAreaId>();
  if (visibleModuleIds.has("tasks") && overdueTasks.length > 0) overdueAreaIds.add("tasks");
  if (visibleModuleIds.has("work") && overdueWorkTasks.length > 0) overdueAreaIds.add("work");
  if (visibleModuleIds.has("goals") && overdueGoals.length > 0) overdueAreaIds.add("goals");
  if (visibleModuleIds.has("affairs") && overdueAffairs.length > 0) overdueAreaIds.add("affairs");
  const firstOverdueAreaId = orderedModuleRows.find((module) => overdueAreaIds.has(module.areaId))?.areaId;

  const reviewOverdueAreas = () => {
    if (!firstOverdueAreaId) return;
    const target = document.querySelector<HTMLElement>(
      `.today-module-row[data-area-id="${firstOverdueAreaId}"]`,
    );
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  };

  const dailyProgress = percentage(completedDailyItems, totalDailyItems);
  const dayProgress = ((today.getHours() * 60) + today.getMinutes()) / (24 * 60);
  const livingDayAreas: LivingDayArea[] = orderedModuleRows.map((module) => ({
    id: module.areaId,
    label: module.title,
    to: module.to,
    total: module.total,
    completed: module.completed,
    remaining: module.remaining,
    progress: module.progress,
    breakdown: module.livingDayBreakdown,
    weight: Math.max(1, module.total),
    status: module.attention
      ? "attention"
      : module.state === "complete"
        ? "complete"
        : module.state === "active"
          ? "active"
          : "empty",
    valueLabel: module.livingDayBreakdown
      ? undefined
      : module.attention
      ? `${module.remaining} pozostało · ${module.attention} wymaga uwagi`
      : module.total > 0
        ? `${module.completed} z ${module.total} wykonane`
        : "brak aktywności dzisiaj",
  }));

  return (
    <ModuleShell
      className="today-module"
      pageWidth="standard"
      ambient={{
        scene: "today",
        dayProgress,
        progress: dailyProgress / 100,
        areas: livingDayAreas,
        activeAreaId,
        remaining: remainingDailyItems,
        signal: `${todayKey}:${completedDailyItems}`,
      }}
    >
      <ModuleMain>
        <ContentHeader
          headingLevel={false}
          title="Plan dnia"
          // The date used to live in the page header; it is the only place the user reads
          // which day the balance describes, so it moves into the description rather than out.
          description={`${formatFullDate(today)} · Dzisiejszy bilans wszystkich aktywnych obszarów`}
          meta={<span>{remainingDailyItems} pozostało · {activeAreaCount} wymaga uwagi</span>}
          actions={(
            <div className="today-add-menu">
              <Button
                variant="primary"
                leadingIcon={<Plus size={13} aria-hidden="true" />}
                aria-label="Dodaj do dzisiejszego planu"
                aria-haspopup="dialog"
                onClick={() => window.dispatchEvent(new Event("rootine:open-command-center"))}
              >
                <span className="header-action-label">Dodaj</span>
              </Button>
            </div>
          )}
        />
        <div className="today-scroll">
          <div className="today-content" data-active-area={activeAreaId ?? undefined}>
            <section
              className={`today-day-balance ${dayComplete ? "is-complete" : ""}`}
              aria-labelledby="today-day-balance-title"
            >
              <div className="today-day-balance__main">
                <div className="today-day-balance__headline">
                  <h2 id="today-day-balance-title">
                    <AnimatedNumber value={remainingDailyItems} /> <span>pozostało</span>
                  </h2>
                  {overdueItems > 0 && (
                    <p className="today-day-balance__overdue-summary">
                      w tym {overdueItems} zaległych
                    </p>
                  )}
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
                  <strong><AnimatedPercentage value={dailyProgress} /></strong>
                  <span className="today-day-balance__progress-copy">
                    {completedDailyItems} z {totalDailyItems} wykonane
                  </span>
                </div>
                <div className="today-day-balance__footer">
                  <LayoutGrid size={16} aria-hidden="true" />
                  <span>{counted(activeAreaCount, "obszar wymaga uwagi", "obszary wymagają uwagi", "obszarów wymaga uwagi")}</span>
                </div>
              </div>

              <div className="today-day-balance__living">
                <LivingDay
                  areas={livingDayAreas}
                  dayProgress={dayProgress * 100}
                  planProgress={dailyProgress}
                  remaining={remainingDailyItems}
                  activeAreaId={activeAreaId}
                  variant="foreground"
                  ariaLabel="Interaktywny bilans obszarów dnia"
                  onActiveAreaChange={(areaId) => setActiveAreaId(areaId)}
                />
              </div>

              <aside className={`today-day-balance__attention ${overdueItems ? "has-overdue" : "is-clear"}`}>
                <div className="today-day-balance__attention-eyebrow">
                  {overdueItems ? (
                    <AlertTriangle size={18} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={18} aria-hidden="true" />
                  )}
                  <span>Zaległości</span>
                </div>
                <div className="today-day-balance__attention-head">
                  <strong>
                    {overdueItems
                      ? counted(overdueItems, "zaległa", "zaległe", "zaległych")
                      : "Brak zaległości"}
                  </strong>
                </div>
                {firstOverdueAreaId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="today-day-balance__attention-action"
                    trailingIcon={<ChevronRight size={13} aria-hidden="true" />}
                    onClick={reviewOverdueAreas}
                  >
                    Przejrzyj zaległe
                  </Button>
                )}
                {overdueAreaIds.size > 0 && (
                  <div className="today-day-balance__attention-footer">
                    <LayoutGrid size={16} aria-hidden="true" />
                    <span>{counted(overdueAreaIds.size, "obszar z zaległościami", "obszary z zaległościami", "obszarów z zaległościami")}</span>
                  </div>
                )}
              </aside>
            </section>

            <section className="today-module-register" aria-labelledby="today-module-register-title">
              <div className="today-module-register__header">
                <h2 id="today-module-register-title">Obszary dnia</h2>
                <span>{orderedModuleRows.length} obszarów</span>
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
