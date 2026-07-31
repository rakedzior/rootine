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
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleMinus,
  Flame,
  LayoutGrid,
  Plus,
} from "lucide-react";
import {
  AFFAIRS_STORAGE_KEY,
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
  isHabitScheduledOnDate,
  loadTaskWorkspace,
  TASK_STORAGE_KEY,
  toCalendarDateKey,
  type WorkspaceHabit,
  type WorkspaceTask,
  saveTaskWorkspace,
  taskViewForCalendarDate,
} from "../data/taskWorkspace";
import { TRAVEL_STORAGE_KEY } from "../data/travelWorkspace";
import { loadWorkWorkspace, saveWorkWorkspace, WORK_STORAGE_KEY } from "../data/workWorkspace";
import { useGoalsStore } from "../goals/goalsContext";
import type { Goal } from "../goals/goalsModel";
import { APP_MODULE_BY_ID, type AppModuleId } from "../moduleRegistry";
import {
  cycleWorkoutDate,
  loadSportPlannerState,
  SPORT_PLANNER_STORAGE_KEY,
} from "../sport/plannerModel";
import { toDateKey } from "../sport/model";
import {
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

type SummaryTone = "neutral" | "warning" | "danger";
type ModuleState = "active" | "complete" | "empty";

type ModuleSummaryProps = {
  moduleId: AppModuleId;
  to: string;
  icon: ReactNode;
  title: string;
  message?: string;
  overdueMessage?: string;
  accent?: SummaryTone;
  state: ModuleState;
  progress?: number;
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

function formatTaskDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
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
  message,
  overdueMessage,
  accent = "neutral",
  state,
  progress,
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
      <span className="today-module-row__summary">
        {message && <span className={`today-module-row__message tone-${accent}`}>{message}</span>}
      </span>
      <span className="today-module-row__overdue-column">
        {overdueMessage && (
          <span className="today-module-row__overdue" aria-label={overdueMessage}>
            {overdueMessage}
          </span>
        )}
      </span>
      <span className="today-module-row__visual">
        {progress !== undefined ? (
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
            <CheckCircle2 size={17} aria-hidden="true" />
          </span>
        ) : state === "empty" ? (
          <span className="today-module-row__state is-empty">
            <CircleMinus size={17} aria-hidden="true" />
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
  const [today, setToday] = useState(() => new Date());
  const todayKey = useMemo(() => toCalendarDateKey(today), [today]);
  const [taskWorkspace, setTaskWorkspace] = useState(loadTaskWorkspace);
  const [workWorkspace, setWorkWorkspace] = useState(loadWorkWorkspace);
  const [affairsWorkspace, setAffairsWorkspace] = useState(loadAffairsWorkspace);
  const [sportPlanner, setSportPlanner] = useState(loadSportPlannerState);
  const [nutritionLoad, setNutritionLoad] = useState(loadNutritionWorkspace);
  const [modulePreferences, setModulePreferences] = useState<ModulePreferences>(loadModulePreferences);
  const [reschedulingOverdue, setReschedulingOverdue] = useState(false);

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

  const habitsForToday = taskWorkspace.habits.filter((habit) => isHabitScheduledOnDate(habit, todayKey));
  const habitDoneToday = (habit: WorkspaceHabit) => isHabitDoneOnDate(habit, todayKey);
  const completedHabits = habitsForToday.filter(habitDoneToday).length;
  const remainingHabits = habitsForToday.length - completedHabits;
  const habitsProgress = percentage(completedHabits, habitsForToday.length);
  const habitsState = moduleState(habitsForToday.length, remainingHabits);

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
  const taskModuleRemaining = taskModuleTotal - completedTodayTasks;
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
        ? counted(overdueGoals.length, "cel po terminie", "cele po terminie", "celów po terminie")
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
  const moduleRows: ModuleSummaryProps[] = [
    {
      moduleId: "tasks",
      to: `${APP_MODULE_BY_ID.tasks.to}?widok=dzis`,
      icon: <TasksIcon size={17} />,
      title: APP_MODULE_BY_ID.tasks.label,
      message: tasksState === "complete"
          ? "Wszystko wykonane"
          : tasksState === "empty"
            ? "Brak zadań na dziś"
          : todayTasks.length > 0
            ? counted(todayTasks.length, "zadanie na dziś", "zadania na dziś", "zadań na dziś")
            : undefined,
      overdueMessage: overdueTasks.length
        ? counted(overdueTasks.length, "zadanie po terminie", "zadania po terminie", "zadań po terminie")
        : undefined,
      accent: "neutral",
      state: tasksState,
      progress: tasksProgress,
    },
    {
      moduleId: "tasks",
      to: `${APP_MODULE_BY_ID.tasks.to}?widok=nawyki`,
      icon: <Flame size={17} />,
      title: "Nawyki",
      message: habitsState === "complete"
        ? "Wszystko wykonane"
        : habitsState === "empty"
          ? "Brak nawyków na dziś"
          : counted(remainingHabits, "nawyk do wykonania", "nawyki do wykonania", "nawyków do wykonania"),
      state: habitsState,
      progress: habitsProgress,
    },
    {
      moduleId: "goals",
      to: APP_MODULE_BY_ID.goals.to,
      icon: <GoalsIcon size={17} />,
      title: APP_MODULE_BY_ID.goals.label,
      message: goalsState === "complete"
          ? "Wszystko wykonane"
          : goalsState === "empty"
            ? "Brak celów wymagających uwagi"
          : remainingGoalsDueToday > 0
            ? counted(remainingGoalsDueToday, "cel na dziś", "cele na dziś", "celów na dziś")
            : undefined,
      overdueMessage: goalsAttentionMessage,
      accent: "neutral",
      state: goalsState,
      progress: goalsProgress,
    },
    {
      moduleId: "work",
      to: APP_MODULE_BY_ID.work.to,
      icon: <WorkIcon size={17} />,
      title: APP_MODULE_BY_ID.work.label,
      message: workState === "complete"
          ? "Wszystko wykonane"
          : workState === "empty"
            ? "Brak zadań na dziś"
          : workTasksDueToday.length > 0
            ? counted(workTasksDueToday.length, "zadanie na dziś", "zadania na dziś", "zadań na dziś")
            : undefined,
      overdueMessage: overdueWorkTasks.length
        ? counted(overdueWorkTasks.length, "zadanie po terminie", "zadania po terminie", "zadań po terminie")
        : undefined,
      accent: "neutral",
      state: workState,
      progress: workProgress,
    },
    {
      moduleId: "sport",
      to: APP_MODULE_BY_ID.sport.to,
      icon: <SportIcon size={17} />,
      title: APP_MODULE_BY_ID.sport.label,
      message: sportState === "complete"
        ? "Wszystko wykonane"
        : sportState === "empty"
          ? "Brak treningu na dziś"
          : counted(remainingWorkouts, "trening do wykonania", "treningi do wykonania", "treningów do wykonania"),
      state: sportState,
      progress: sportProgress,
    },
    {
      moduleId: "affairs",
      to: APP_MODULE_BY_ID.affairs.to,
      icon: <AffairsIcon size={17} />,
      title: APP_MODULE_BY_ID.affairs.label,
      message: affairsState === "empty"
        ? "Brak spraw na dziś"
        : todayAffairsDueToday.length > 0
          ? counted(todayAffairsDueToday.length, "sprawa na dziś", "sprawy na dziś", "spraw na dziś")
          : undefined,
      overdueMessage: overdueAffairs.length
        ? counted(overdueAffairs.length, "sprawa po terminie", "sprawy po terminie", "spraw po terminie")
        : undefined,
      accent: "neutral",
      state: affairsState,
      progress: affairsState === "empty" ? 100 : undefined,
    },
    {
      moduleId: "nutrition",
      to: APP_MODULE_BY_ID.nutrition.to,
      icon: <NutritionIcon size={17} />,
      title: APP_MODULE_BY_ID.nutrition.label,
      message: nutritionState === "complete"
        ? "Dzień zamknięty"
        : nutritionEntries.length === 0
          ? "Dodaj pierwszy posiłek"
          : nutritionMetric,
      accent: nutritionOverTarget ? "warning" : "neutral",
      state: nutritionState,
      progress: calorieProgress,
    },
  ];
  const orderedModuleRows = modulePreferences.order
    .filter((moduleId) => visibleModuleIds.has(moduleId))
    .flatMap((moduleId) => moduleRows.filter((module) => module.moduleId === moduleId));
  const activeAreaCount = new Set(
    orderedModuleRows
      .filter((module) => module.state === "active")
      .map((module) => module.moduleId),
  ).size;
  const overdueTaskAreaCount = (visibleModuleIds.has("tasks") && overdueTasks.length ? 1 : 0)
    + (visibleModuleIds.has("work") && overdueWorkTasks.length ? 1 : 0);
  const overdueTaskItems = (visibleModuleIds.has("tasks") ? overdueTasks.length : 0)
    + (visibleModuleIds.has("work") ? overdueWorkTasks.length : 0);

  const rescheduleOverdueTasks = () => {
    if (reschedulingOverdue || overdueTaskItems === 0) return;
    setReschedulingOverdue(true);
    try {
      const overdueWorkIds = new Set(overdueWorkTasks.map((task) => task.id));
      if (overdueWorkIds.size > 0) {
        saveWorkWorkspace({
          ...workWorkspace,
          tasks: workWorkspace.tasks.map((task) => overdueWorkIds.has(task.id)
            ? { ...task, dueDate: todayKey }
            : task),
        });
      }

      const overdueTaskIds = new Set(overdueTasks.map((task) => task.id));
      const projectedWorkspace = loadTaskWorkspace();
      const nextTaskWorkspace = {
        ...projectedWorkspace,
        tasks: projectedWorkspace.tasks.map((task) => {
          if (!overdueTaskIds.has(task.id)) return task;
          return {
            ...task,
            calendarDate: todayKey,
            date: formatTaskDate(todayKey),
            view: taskViewForCalendarDate(todayKey),
            ...(task.schedule?.recurrence
              ? { schedule: { ...task.schedule, completedDates: undefined } }
              : {}),
          };
        }),
      };
      saveTaskWorkspace(nextTaskWorkspace);
      setWorkWorkspace(loadWorkWorkspace());
      setTaskWorkspace(loadTaskWorkspace());
    } finally {
      setReschedulingOverdue(false);
    }
  };
  const dailyProgress = percentage(completedDailyItems, totalDailyItems);
  const dayProgress = ((today.getHours() * 60) + today.getMinutes()) / (24 * 60);

  const pageHeader = (
    <PageHeader
      title="Dzisiaj"
      description={formatFullDate(today)}
      actions={(
        <Button
          variant="primary"
          leadingIcon={<Plus size={13} aria-hidden="true" />}
          aria-label="Dodaj zadanie"
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
          <span className="header-action-label">Dodaj zadanie</span>
        </Button>
      )}
    />
  );

  return (
    <ModuleShell
      className="today-module"
      pageWidth="standard"
      header={pageHeader}
      ambient={{
        scene: "today",
        dayProgress,
        progress: dailyProgress / 100,
        signal: `${todayKey}:${completedDailyItems}`,
      }}
    >
      <ModuleMain>
        <div className="today-scroll">
          <div className="today-content">
            <section
              className={`today-day-balance ${dayComplete ? "is-complete" : ""}`}
              aria-labelledby="today-day-balance-title"
            >
              <div className="today-day-balance__main">
                <div className="today-day-balance__eyebrow">
                  <CalendarDays size={18} aria-hidden="true" />
                  <span>Plan dnia</span>
                </div>
                <div className="today-day-balance__headline">
                  <h2 id="today-day-balance-title">{remainingDailyItems} pozostało</h2>
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
                  <strong>{dailyProgress}%</strong>
                  <span className="today-day-balance__progress-copy">
                    {completedDailyItems} z {totalDailyItems} wykonane
                  </span>
                </div>
                <div className="today-day-balance__footer">
                  <LayoutGrid size={17} aria-hidden="true" />
                  <span>{counted(activeAreaCount, "aktywny obszar", "aktywne obszary", "aktywnych obszarów")}</span>
                </div>
              </div>

              <aside className={`today-day-balance__attention ${overdueItems ? "has-overdue" : "is-clear"}`}>
                <div className="today-day-balance__attention-head">
                  {overdueItems ? (
                    <AlertTriangle size={24} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={24} aria-hidden="true" />
                  )}
                  <strong>
                    {overdueItems
                      ? counted(overdueItems, "zaległa", "zaległe", "zaległych")
                      : "Brak zaległości"}
                  </strong>
                </div>
                {overdueTaskItems > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="today-day-balance__attention-action"
                    trailingIcon={<ChevronRight size={14} aria-hidden="true" />}
                    onClick={rescheduleOverdueTasks}
                    disabled={reschedulingOverdue}
                  >
                    {reschedulingOverdue ? "Przenoszenie…" : "Przełóż zaległe zadania na dziś"}
                  </Button>
                )}
                {overdueTaskAreaCount > 0 && (
                  <div className="today-day-balance__attention-footer">
                    <LayoutGrid size={17} aria-hidden="true" />
                    <span>{counted(overdueTaskAreaCount, "aktywny obszar", "aktywne obszary", "aktywnych obszarów")}</span>
                  </div>
                )}
              </aside>
            </section>

            <section className="today-module-register" aria-labelledby="today-module-register-title">
              <div className="today-module-register__header">
                <h2 id="today-module-register-title">Obszary dnia</h2>
                <span>{orderedModuleRows.length} obszarów</span>
              </div>

              <div className="today-module-list">
                {orderedModuleRows.map((module) => (
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
