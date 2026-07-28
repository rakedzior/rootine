/**
 * THESIS: Widok Dzisiaj prowadzi od jednego bilansu dnia do szczegółowych sygnałów modułów.
 * OWN-WORLD: Grafitowe powierzchnie, precyzyjny błękit dla postępu i morskie szkło dla domkniętych obszarów.
 * STORY: Użytkownik najpierw widzi liczbę pozostałych rzeczy, potem skanuje zwarte wiersze źródłowych modułów.
 * FIRST VIEWPORT: Kompaktowa pogoda w nagłówku, jeden dominujący bilans dnia i pionowy rejestr modułów.
 * FORM: Operacyjny dzienny bilans — seed 55ea3e9c.
 */
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router";
import {
  CheckCircle2,
  ChevronRight,
  CircleMinus,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Flame,
  LoaderCircle,
  MapPin,
  Plus,
  Snowflake,
  Sun,
  type LucideIcon,
} from "lucide-react";
import {
  AFFAIRS_STORAGE_KEY,
  getMonthKey,
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
  NUTRITION_STORAGE_KEY,
  loadNutritionWorkspace,
  type NutritionEntry,
} from "../data/nutritionWorkspace";
import {
  isHabitDoneOnDate,
  loadTaskWorkspace,
  TASK_STORAGE_KEY,
  toCalendarDateKey,
  type WorkspaceHabit,
  type WorkspaceTask,
} from "../data/taskWorkspace";
import {
  getTodayWeatherLabel,
  loadTodayWeather,
  TODAY_WEATHER_LOCATION,
  type TodayWeather,
} from "../data/todayWeather";
import { TRAVEL_STORAGE_KEY } from "../data/travelWorkspace";
import { loadWorkWorkspace, WORK_STORAGE_KEY } from "../data/workWorkspace";
import { useGoalsStore, type Goal } from "../goals/goalsStore";
import { APP_MODULE_BY_ID, type AppModuleId } from "../moduleRegistry";
import {
  cycleWorkoutDate,
  loadSportPlannerState,
  SPORT_PLANNER_STORAGE_KEY,
} from "../sport/plannerModel";
import { toDateKey } from "../sport/model";
import {
  Badge,
  Button,
  ModuleMain,
  ModuleShell,
  PageHeader,
} from "../ui";
import "../../styles/today.css";

type TodayAffair = {
  id: string;
  title: string;
  date: string;
  kind: string;
  amount?: number;
};

type DashboardSourceSummary = {
  hasDemoData: boolean;
  hasCorruptData: boolean;
};

type SummaryTone = "neutral" | "warning" | "danger";
type ModuleState = "active" | "complete" | "empty";

type ModuleSummaryProps = {
  moduleId: AppModuleId;
  to: string;
  icon: ReactNode;
  title: string;
  count: string;
  status: string;
  accent?: SummaryTone;
  state: ModuleState;
  progress?: number;
  progressLabel?: string;
};

type WeatherState =
  | { status: "loading" }
  | { status: "ready"; data: TodayWeather }
  | { status: "error" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function inspectDashboardSources(): DashboardSourceSummary {
  if (typeof window === "undefined") return { hasDemoData: true, hasCorruptData: false };
  const sources = [
    {
      keys: ["rootine.task-workspace.v1"],
      valid: (value: unknown) => isRecord(value)
        && (value.version === 1 || value.version === 2)
        && Array.isArray(value.tasks)
        && Array.isArray(value.habits),
    },
    {
      keys: ["rootine.work-workspace.v1"],
      valid: (value: unknown) => isRecord(value)
        && value.version === 1
        && Array.isArray(value.companies)
        && Array.isArray(value.projects)
        && Array.isArray(value.tasks),
    },
    {
      keys: ["routine.affairs.workspace.v1"],
      valid: (value: unknown) => isRecord(value)
        && (value.version === 1 || value.version === 2)
        && Array.isArray(value.matters)
        && Array.isArray(value.payments)
        && Array.isArray(value.budgets),
    },
    {
      keys: ["routine-sport-planner-v1", "routine-sport-v3"],
      valid: (value: unknown) => isRecord(value)
        && Array.isArray(value.templates)
        && (
          [1, 2, 3].includes(Number(value.version))
          || (Array.isArray(value.sessions) && Array.isArray(value.plans))
        ),
    },
  ];

  let hasDemoData = false;
  let hasCorruptData = false;
  sources.forEach((source) => {
    try {
      const raw = source.keys
        .map((key) => window.localStorage.getItem(key))
        .find((value): value is string => value !== null);
      if (!raw) {
        hasDemoData = true;
        return;
      }
      if (!source.valid(JSON.parse(raw) as unknown)) hasCorruptData = true;
    } catch {
      hasCorruptData = true;
    }
  });
  return { hasDemoData, hasCorruptData };
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
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

function completedProgressLabel(
  value: number,
  total: number,
  one: string,
  few: string,
  many: string,
) {
  return `${value} z ${total} ${polishForm(value, one, few, many)}`;
}

function remainingLabel(value: number, one = "pozostało") {
  const absolute = Math.abs(value);
  const mod10 = absolute % 10;
  const mod100 = absolute % 100;
  const verb = value === 1
    ? one
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "pozostały"
      : "pozostało";
  return `${value} ${verb}`;
}

function remainingThingsLabel(value: number) {
  if (value === 1) return "1 rzecz pozostała na dziś";
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} rzeczy pozostały na dziś`;
  }
  return `${value} rzeczy pozostało na dziś`;
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

function weatherIcon(code: number): LucideIcon {
  if (code === 0) return Sun;
  if (code === 1 || code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 77) return Snowflake;
  if (code >= 80 && code <= 82) return CloudRain;
  if (code === 85 || code === 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return CloudSun;
}

function sumNutrition(entries: NutritionEntry[]) {
  return entries.reduce((totals, entry) => ({
    calories: totals.calories + entry.calories,
    protein: totals.protein + entry.protein,
  }), { calories: 0, protein: 0 });
}

function ModuleSummary({
  to,
  icon,
  title,
  count,
  status,
  accent = "neutral",
  state,
  progress,
  progressLabel,
}: ModuleSummaryProps) {
  return (
    <Link
      className={`today-module-row is-${state} tone-${accent}`}
      to={to}
    >
      <span className="today-module-row__identity">
        <span className="today-module-row__icon" aria-hidden="true">{icon}</span>
        <strong>{title}</strong>
      </span>
      <span className="today-module-row__count">{count}</span>
      <span className={`today-module-row__status tone-${accent}`}>{status}</span>
      <span className="today-module-row__visual">
        {state === "complete" ? (
          <span className="today-module-row__state is-complete">
            <CheckCircle2 size={17} aria-hidden="true" />
            <small>{progressLabel ?? "Wszystko wykonane"}</small>
          </span>
        ) : state === "empty" ? (
          <span className="today-module-row__state is-empty">
            <CircleMinus size={17} aria-hidden="true" />
            <small>{progressLabel ?? "Nic nie zaplanowano"}</small>
          </span>
        ) : progress !== undefined ? (
          <>
            <span
              className="today-module-row__track"
              role="progressbar"
              aria-label={`Postęp: ${title}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <i style={{ width: `${progress}%` }} />
            </span>
            {progressLabel && <small>{progressLabel}</small>}
          </>
        ) : (
          <small>{progressLabel ?? "Otwórz moduł"}</small>
        )}
      </span>
      <ChevronRight className="today-module-row__arrow" size={16} aria-hidden="true" />
    </Link>
  );
}

export default function Dzisiaj() {
  const navigate = useNavigate();
  const goalsStore = useGoalsStore();
  const [today, setToday] = useState(() => new Date());
  const todayKey = useMemo(() => toCalendarDateKey(today), [today]);
  const [taskWorkspace, setTaskWorkspace] = useState(loadTaskWorkspace);
  const [workWorkspace, setWorkWorkspace] = useState(loadWorkWorkspace);
  const [affairsWorkspace, setAffairsWorkspace] = useState(loadAffairsWorkspace);
  const [sportPlanner, setSportPlanner] = useState(loadSportPlannerState);
  const [nutritionLoad, setNutritionLoad] = useState(loadNutritionWorkspace);
  const [modulePreferences, setModulePreferences] = useState<ModulePreferences>(loadModulePreferences);
  const [sourceSummary, setSourceSummary] = useState(inspectDashboardSources);
  const [weather, setWeather] = useState<WeatherState>({ status: "loading" });

  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshSourceSummary = () => setSourceSummary(inspectDashboardSources());
    const unsubscribeTasks = subscribeToLocalWorkspace(TASK_STORAGE_KEY, () => {
      setTaskWorkspace(loadTaskWorkspace());
      refreshSourceSummary();
    });
    const unsubscribeWork = subscribeToLocalWorkspace(WORK_STORAGE_KEY, () => {
      setWorkWorkspace(loadWorkWorkspace());
      setTaskWorkspace(loadTaskWorkspace());
      refreshSourceSummary();
    });
    const unsubscribeTravel = subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, () => {
      setTaskWorkspace(loadTaskWorkspace());
      refreshSourceSummary();
    });
    const unsubscribeAffairs = subscribeToLocalWorkspace(AFFAIRS_STORAGE_KEY, () => {
      setAffairsWorkspace(loadAffairsWorkspace());
      refreshSourceSummary();
    });
    const unsubscribeSport = subscribeToLocalWorkspace(SPORT_PLANNER_STORAGE_KEY, () => {
      setSportPlanner(loadSportPlannerState());
      refreshSourceSummary();
    });
    const unsubscribeNutrition = subscribeToLocalWorkspace(NUTRITION_STORAGE_KEY, () => {
      setNutritionLoad(loadNutritionWorkspace());
      refreshSourceSummary();
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
      unsubscribePreferences();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setWeather({ status: "loading" });
    loadTodayWeather(todayKey, controller.signal)
      .then((data) => setWeather({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setWeather({ status: "error" });
      });
    return () => controller.abort();
  }, [todayKey]);

  const habitDoneToday = (habit: WorkspaceHabit) => isHabitDoneOnDate(habit, todayKey);
  const completedHabits = taskWorkspace.habits.filter(habitDoneToday).length;
  const remainingHabits = taskWorkspace.habits.length - completedHabits;
  const habitsProgress = percentage(completedHabits, taskWorkspace.habits.length);
  const habitsState = moduleState(taskWorkspace.habits.length, remainingHabits);

  const todayTasks = useMemo(
    () => taskWorkspace.tasks.filter((task) => taskIsForToday(task, todayKey)),
    [taskWorkspace.tasks, todayKey],
  );
  const completedTodayTasks = todayTasks.filter((task) => task.done).length;
  const overdueTasks = taskWorkspace.tasks.filter((task) => (
    !task.deleted && !task.done && Boolean(task.calendarDate) && task.calendarDate! < todayKey
  ));
  const taskModuleTotal = todayTasks.length + overdueTasks.length;
  const taskModuleRemaining = taskModuleTotal - completedTodayTasks;
  const tasksProgress = percentage(completedTodayTasks, taskModuleTotal);
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
  const overdueWorkTasks = todayWorkTasks.filter((task) => task.dueDate < todayKey);
  const workProgress = percentage(completedWorkTasks, workTasksForToday.length);
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
  const riskGoals = todayGoals.filter((goal) => (
    goal.health === "risk" && !regularGoalCompletedToday(goal, todayKey)
  ));
  const goalsProgress = percentage(completedTodayGoals, todayGoals.length);
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
  const todayPayments = todayAffairs.filter((item) => (
    item.kind === "Płatność" || item.kind === "Cykliczne" || item.kind === "Subskrypcja"
  ));
  const todayOtherAffairs = todayAffairs.length - todayPayments.length;
  const affairsComplete = todayAffairs.length === 0;
  const affairsState: ModuleState = affairsComplete ? "empty" : "active";

  const currentBudget = affairsWorkspace.budgets.find((budget) => budget.month === getMonthKey(today));
  const budgetActualIncome = currentBudget?.lines
    .filter((line) => line.kind === "income")
    .reduce((sum, line) => sum + line.actual, 0) ?? 0;
  const budgetActualOut = currentBudget?.lines
    .filter((line) => line.kind !== "income")
    .reduce((sum, line) => sum + line.actual, 0) ?? 0;
  const budgetBalance = budgetActualIncome - budgetActualOut;

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

  const visibleModuleIds = new Set(
    modulePreferences.order.filter((moduleId) => !modulePreferences.disabled.includes(moduleId)),
  );
  const totalDailyItems = (visibleModuleIds.has("tasks")
    ? taskModuleTotal + taskWorkspace.habits.length
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
    + (visibleModuleIds.has("work") ? overdueWorkTasks.length : 0);
  const attentionGoalCount = visibleModuleIds.has("goals") ? remainingTodayGoals : 0;
  const dailyProgress = percentage(completedDailyItems, totalDailyItems);
  const dayComplete = remainingDailyItems === 0;

  const hasStorageIssue = goalsStore.storageFailed
    || sourceSummary.hasCorruptData
    || nutritionLoad.status === "corrupt";
  const hasDemoData = sourceSummary.hasDemoData
    || nutritionDay?.source === "demo";

  const WeatherIcon = weather.status === "ready"
    ? weatherIcon(weather.data.weatherCode)
    : CloudSun;
  const weatherLabel = weather.status === "ready"
    ? getTodayWeatherLabel(weather.data.weatherCode)
    : "";
  const ringStyle = {
    background: `conic-gradient(var(--today-ring-color) ${dailyProgress}%, var(--color-border-subtle) ${dailyProgress}%)`,
  } as CSSProperties;
  const nutritionMetric = nutritionOverTarget
    ? `${formatNumber(nutritionTotals.calories - calorieGoal)} kcal ponad`
    : caloriesInTargetRange && waterRemaining > 0
      ? `${formatNumber(waterRemaining)} ml zostało`
      : `${formatNumber(calorieRemaining)} kcal zostało`;
  const TasksIcon = APP_MODULE_BY_ID.tasks.icon;
  const GoalsIcon = APP_MODULE_BY_ID.goals.icon;
  const WorkIcon = APP_MODULE_BY_ID.work.icon;
  const SportIcon = APP_MODULE_BY_ID.sport.icon;
  const AffairsIcon = APP_MODULE_BY_ID.affairs.icon;
  const NutritionIcon = APP_MODULE_BY_ID.nutrition.icon;
  const moduleRows: ModuleSummaryProps[] = [
    {
      moduleId: "tasks",
      to: `${APP_MODULE_BY_ID.tasks.to}?widok=dzis`,
      icon: <TasksIcon size={17} />,
      title: APP_MODULE_BY_ID.tasks.label,
      count: tasksState === "active" ? remainingLabel(taskModuleRemaining) : tasksState === "complete" ? "Gotowe" : "—",
      status: tasksState === "complete"
        ? "Wszystko zrobione"
        : tasksState === "empty"
          ? "Brak zadań na dziś"
          : overdueTasks.length
            ? `${overdueTasks.length} po terminie`
            : "Do wykonania",
      accent: overdueTasks.length ? "danger" : "neutral",
      state: tasksState,
      progress: tasksProgress,
      progressLabel: completedProgressLabel(
        completedTodayTasks,
        taskModuleTotal,
        "wykonane",
        "wykonane",
        "wykonanych",
      ),
    },
    {
      moduleId: "tasks",
      to: `${APP_MODULE_BY_ID.tasks.to}?widok=nawyki`,
      icon: <Flame size={17} />,
      title: "Nawyki",
      count: habitsState === "active" ? remainingLabel(remainingHabits, "pozostał") : habitsState === "complete" ? "Gotowe" : "—",
      status: habitsState === "complete"
        ? "Wszystko zrobione"
        : habitsState === "empty"
          ? "Brak nawyków na dziś"
          : "Do wykonania",
      state: habitsState,
      progress: habitsProgress,
      progressLabel: completedProgressLabel(
        completedHabits,
        taskWorkspace.habits.length,
        "wykonany",
        "wykonane",
        "wykonanych",
      ),
    },
    {
      moduleId: "goals",
      to: APP_MODULE_BY_ID.goals.to,
      icon: <GoalsIcon size={17} />,
      title: APP_MODULE_BY_ID.goals.label,
      count: goalsState === "active"
        ? remainingLabel(remainingTodayGoals, "pozostał")
        : goalsState === "complete"
          ? "Gotowe"
          : "—",
      status: goalsState === "complete"
        ? "Dzisiejsza regularność zapisana"
        : goalsState === "empty"
          ? "Brak celów wymagających uwagi"
        : riskGoals.length
          ? `${riskGoals.length} zagrożonych`
          : `${remainingTodayGoals} wymaga uwagi`,
      accent: goalsState === "active" ? "warning" : "neutral",
      state: goalsState,
      progress: goalsProgress,
      progressLabel: goalsState === "empty"
        ? "Nic nie wymaga reakcji"
        : completedProgressLabel(
          completedTodayGoals,
          todayGoals.length,
          "wykonany",
          "wykonane",
          "wykonanych",
        ),
    },
    {
      moduleId: "work",
      to: APP_MODULE_BY_ID.work.to,
      icon: <WorkIcon size={17} />,
      title: APP_MODULE_BY_ID.work.label,
      count: workState === "active" ? remainingLabel(todayWorkTasks.length) : workState === "complete" ? "Gotowe" : "—",
      status: workState === "complete"
        ? "Wszystko zrobione"
        : workState === "empty"
          ? "Brak zadań na dziś"
          : overdueWorkTasks.length
            ? `${overdueWorkTasks.length} po terminie`
            : "Do wykonania",
      accent: overdueWorkTasks.length ? "danger" : "neutral",
      state: workState,
      progress: workProgress,
      progressLabel: completedProgressLabel(
        completedWorkTasks,
        workTasksForToday.length,
        "wykonane",
        "wykonane",
        "wykonanych",
      ),
    },
    {
      moduleId: "sport",
      to: APP_MODULE_BY_ID.sport.to,
      icon: <SportIcon size={17} />,
      title: APP_MODULE_BY_ID.sport.label,
      count: sportState === "active" ? remainingLabel(remainingWorkouts, "pozostał") : sportState === "complete" ? "Gotowe" : "—",
      status: sportState === "complete"
        ? "Wszystko zrobione"
        : sportState === "empty"
          ? "Brak treningu na dziś"
          : "Trening na dziś",
      state: sportState,
      progress: sportProgress,
      progressLabel: sportState === "empty"
        ? "Nic nie zaplanowano"
        : completedProgressLabel(
          completedWorkouts,
          todayWorkouts.length,
          "wykonany",
          "wykonane",
          "wykonanych",
        ),
    },
    {
      moduleId: "affairs",
      to: APP_MODULE_BY_ID.affairs.to,
      icon: <AffairsIcon size={17} />,
      title: APP_MODULE_BY_ID.affairs.label,
      count: affairsState === "active" ? remainingLabel(todayAffairs.length, "pozostała") : "—",
      status: affairsState === "empty"
        ? "Brak spraw na dziś"
        : todayPayments.length
          ? counted(todayPayments.length, "płatność", "płatności", "płatności")
          : `${todayOtherAffairs} do załatwienia`,
      accent: budgetBalance < 0 && affairsState === "active" ? "danger" : "neutral",
      state: affairsState,
      progressLabel: affairsState === "empty" ? "Nic nie wymaga reakcji" : `Zostaje ${formatMoney(budgetBalance)}`,
    },
    {
      moduleId: "nutrition",
      to: APP_MODULE_BY_ID.nutrition.to,
      icon: <NutritionIcon size={17} />,
      title: APP_MODULE_BY_ID.nutrition.label,
      count: nutritionState === "active" ? nutritionMetric : nutritionState === "complete" ? "Gotowe" : "—",
      status: nutritionState === "complete"
        ? "Dzień zamknięty"
        : nutritionEntries.length === 0
          ? "Dodaj pierwszy posiłek"
          : nutritionOverTarget
            ? "Cel kalorii przekroczony"
            : caloriesInTargetRange && waterRemaining > 0
              ? "Uzupełnij nawodnienie"
              : "Do celu kalorii",
      accent: nutritionOverTarget ? "warning" : "neutral",
      state: nutritionState,
      progress: calorieProgress,
      progressLabel: `${formatNumber(nutritionTotals.calories)} / ${formatNumber(calorieGoal)} kcal`,
    },
  ];
  const sortedModuleRows = modulePreferences.order
    .filter((moduleId) => visibleModuleIds.has(moduleId))
    .flatMap((moduleId) => moduleRows.filter((module) => module.moduleId === moduleId));

  return (
    <ModuleShell className="today-module">
      <ModuleMain>
        <PageHeader
          title="Dzisiaj"
          description={formatFullDate(today)}
          meta={(
            <Badge tone={hasStorageIssue ? "danger" : hasDemoData ? "violet" : "neutral"}>
              {hasStorageIssue
                ? "Część danych wymaga sprawdzenia"
                : hasDemoData
                  ? "Część danych przykładowa"
                  : "Dane lokalne"}
            </Badge>
          )}
          actions={(
            <>
              <div className="today-header-weather" aria-live="polite">
                <span className="today-header-weather__icon" aria-hidden="true">
                  {weather.status === "loading"
                    ? <LoaderCircle size={16} className="today-weather-spinner" />
                    : <WeatherIcon size={17} />}
                </span>
                <span className="today-header-weather__copy">
                  <strong>
                    <MapPin size={10} aria-hidden="true" />
                    {TODAY_WEATHER_LOCATION.label}
                    {weather.status === "ready" && <> · {Math.round(weather.data.temperature)}°</>}
                  </strong>
                  <small>
                    {weather.status === "ready"
                      ? weatherLabel
                      : weather.status === "loading"
                        ? "Pobieranie pogody"
                        : "Pogoda niedostępna"}
                    {" · "}
                    <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>
                  </small>
                </span>
              </div>
              <Button
                variant="primary"
                leadingIcon={<Plus size={13} aria-hidden="true" />}
                aria-label="Utwórz nowe zadanie"
                onClick={() => navigate(
                  `${APP_MODULE_BY_ID.tasks.to}?widok=dzis&akcja=nowe-zadanie`,
                  {
                    state: {
                      intent: "create-task",
                      focus: "task-composer",
                      source: "dzisiaj",
                    },
                  },
                )}
              >
                <span className="header-action-label">Nowe zadanie</span>
              </Button>
            </>
          )}
        />

        <div className="today-scroll">
          <div className="today-content">
            <section
              className={`today-day-balance ${dayComplete ? "is-complete" : ""}`}
              aria-labelledby="today-day-balance-title"
            >
              <div className="today-day-ring" style={ringStyle}>
                <div>
                  <strong>{remainingDailyItems}</strong>
                  <span>pozostało</span>
                </div>
              </div>

              <div className="today-day-balance__body">
                <h2 id="today-day-balance-title">
                  {remainingThingsLabel(remainingDailyItems)}
                </h2>
                <div className="today-day-balance__signals" aria-label="Bilans dnia">
                  <span>{counted(totalDailyItems, "zaplanowana", "zaplanowane", "zaplanowanych")}</span>
                  <span>{counted(completedDailyItems, "wykonana", "wykonane", "wykonanych")}</span>
                  <span className={overdueItems ? "is-danger" : ""}>{overdueItems} po terminie</span>
                  <span className={attentionGoalCount ? "is-warning" : ""}>
                    {counted(attentionGoalCount, "wymaga uwagi", "wymagają uwagi", "wymaga uwagi")}
                  </span>
                </div>
                <div className="today-day-balance__progress">
                  <div
                    className="today-day-track"
                    role="progressbar"
                    aria-label="Łączny postęp dnia"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={dailyProgress}
                  >
                    <span style={{ width: `${dailyProgress}%` }} />
                  </div>
                  <strong>{dailyProgress}% wykonane</strong>
                </div>
                <p>
                  {dayComplete
                    ? "Plan na dziś wykonany."
                    : overdueItems
                      ? `Najpierw zajmij się ${counted(overdueItems, "pozycją", "pozycjami", "pozycjami")} po terminie.`
                      : attentionGoalCount
                        ? `Uwagi ${polishForm(attentionGoalCount, "wymaga", "wymagają", "wymaga")} ${counted(attentionGoalCount, "cel", "cele", "celów")}.`
                        : `Pozostało ${remainingDailyItems} z ${totalDailyItems} zaplanowanych pozycji.`}
                </p>
              </div>
            </section>

            <section className="today-module-register" aria-labelledby="today-module-register-title">
              <div className="today-module-register__header">
                <h2 id="today-module-register-title">Obszary dnia</h2>
                <span>{remainingDailyItems} pozostało</span>
              </div>

              <div className="today-module-list">
                {sortedModuleRows.map((module) => (
                  <ModuleSummary key={module.title} {...module} />
                ))}
              </div>
            </section>
          </div>
        </div>
      </ModuleMain>
    </ModuleShell>
  );
}
