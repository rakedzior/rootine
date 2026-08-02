import { getMattersSummary } from "../affairs";
import { getGoalsSummary } from "../goals";
import { getNutritionSummary } from "../nutrition";
import { getSportSummary } from "../sport";
import { getHabitsForDate, getOverdueTasks, getTasksForDate } from "../tasks";
import { getTravelSummary } from "../travel";
import { getWorkSummary } from "../work";
import { todayOverviewSchema } from "./todaySchemas";

type TodayPriorityItem = {
  id: string;
  title: string;
  module: "tasks" | "work" | "affairs" | "sport";
  date: string | null;
  priority: string;
  overdue: boolean;
};

export function getTodayOverview(input: unknown) {
  const parsed = todayOverviewSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const date = parsed.data.date;
  const tasks = getTasksForDate(date).filter((task) => !task.source);
  const overdueTasks = getOverdueTasks(date).filter((task) => !task.source);
  const habits = getHabitsForDate(date);
  const work = getWorkSummary(date);
  const matters = getMattersSummary(date);
  const sport = getSportSummary(date);
  const nutrition = getNutritionSummary(date);
  const goals = getGoalsSummary();
  const travel = getTravelSummary(date);

  const candidates: TodayPriorityItem[] = [
    ...overdueTasks.map((task) => ({
      id: task.id, title: task.title, module: "tasks" as const, date: task.dueDate,
      priority: task.priority ?? "low", overdue: true,
    })),
    ...tasks.filter((task) => !task.completed).map((task) => ({
      id: task.id, title: task.title, module: "tasks" as const, date: task.dueDate,
      priority: task.priority ?? "low", overdue: task.overdue,
    })),
    ...work.overdue.map((task) => ({
      id: task.id, title: task.title, module: "work" as const, date: task.dueDate,
      priority: task.priority, overdue: true,
    })),
    ...matters.overdue.map((matter) => ({
      id: matter.id, title: matter.title, module: "affairs" as const, date: matter.dueDate,
      priority: matter.priority, overdue: true,
    })),
    ...sport.today.map((workout) => ({
      id: workout.id, title: workout.title, module: "sport" as const, date: workout.date,
      priority: "medium", overdue: false,
    })),
  ];
  const priorityRank: Record<string, number> = { high: 0, medium: 1, normal: 2, low: 3, none: 4 };
  const priorityItems = candidates
    .filter((item, index, all) => all.findIndex((candidate) => candidate.module === item.module && candidate.id === item.id) === index)
    .sort((left, right) => Number(right.overdue) - Number(left.overdue)
      || (priorityRank[left.priority] ?? 5) - (priorityRank[right.priority] ?? 5)
      || (left.date ?? "9999-99-99").localeCompare(right.date ?? "9999-99-99"))
    .slice(0, 3);

  return {
    date,
    counts: {
      tasks: tasks.filter((task) => !task.completed).length,
      habits: habits.filter((habit) => habit.state === "scheduled").length,
      work: work.open.length,
      matters: matters.open.length,
      workouts: sport.today.length,
      overdue: overdueTasks.length + work.overdue.length + matters.overdue.length,
    },
    priorityItems,
    tasks,
    habits,
    work: { open: work.open.slice(0, 5), overdue: work.overdue.slice(0, 5) },
    matters: { open: matters.open.slice(0, 5), overdue: matters.overdue.slice(0, 5) },
    sport: { today: sport.today, upcoming: sport.upcoming.slice(0, 5) },
    nutrition,
    goals: { atRisk: goals.atRisk.slice(0, 5) },
    travel: travel.filter((trip) => trip.active || trip.startDate >= date).slice(0, 3).map((trip) => ({
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status,
      active: trip.active,
      openTasks: trip.openTasks,
    })),
  };
}
