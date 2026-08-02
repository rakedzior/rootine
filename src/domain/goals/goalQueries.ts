import { getGoalCurrentValue, getGoalProgress } from "../../app/goals/goalsModel";
import { loadGoalsWorkspace } from "./goalsRepository";

export function getGoalsSummary() {
  const workspace = loadGoalsWorkspace();
  const active = workspace.goals.filter((goal) => goal.status === "active");
  return {
    active: active.map((goal) => ({
      id: goal.id, title: goal.title, priority: goal.priority, health: goal.health,
      dueDate: goal.dueDate, progress: getGoalProgress(goal), currentValue: getGoalCurrentValue(goal),
      targetValue: goal.targetValue, unit: goal.unit,
    })),
    atRisk: active.filter((goal) => goal.health === "risk").map((goal) => ({
      id: goal.id, title: goal.title, dueDate: goal.dueDate, progress: getGoalProgress(goal),
    })),
  };
}

export function getGoalDetails(goalId: string) {
  const workspace = loadGoalsWorkspace();
  const goal = workspace.goals.find((candidate) => candidate.id === goalId);
  if (!goal) return null;
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    status: goal.status,
    health: goal.health,
    priority: goal.priority,
    dueDate: goal.dueDate,
    progress: getGoalProgress(goal),
    currentValue: getGoalCurrentValue(goal),
    targetValue: goal.targetValue,
    unit: goal.unit,
    milestones: goal.milestones,
  };
}

export function getUpcomingMilestones(today: string, limit = 8) {
  return loadGoalsWorkspace().goals
    .filter((goal) => goal.status === "active")
    .flatMap((goal) => goal.milestones
      .filter((milestone) => !milestone.done && milestone.dueDate >= today)
      .map((milestone) => ({ ...milestone, goalId: goal.id, goalTitle: goal.title })))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .slice(0, Math.max(0, Math.min(20, limit)));
}
