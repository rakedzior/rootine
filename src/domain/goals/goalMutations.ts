import type {
  GoalMilestone,
  GoalProgressEntry,
  GoalsWorkspace,
} from "../../app/goals/goalsModel";

export function appendGoalProgress(
  workspace: GoalsWorkspace,
  goalId: string,
  entry: GoalProgressEntry,
): GoalsWorkspace {
  return {
    ...workspace,
    goals: workspace.goals.map((goal) => goal.id === goalId ? {
      ...goal,
      progressEntries: [...goal.progressEntries, entry],
      updatedAt: entry.createdAt,
    } : goal),
  };
}

export function patchGoalMilestone(
  workspace: GoalsWorkspace,
  goalId: string,
  milestoneId: string,
  patch: Partial<Omit<GoalMilestone, "id">>,
  updatedAt: string,
): GoalsWorkspace {
  return {
    ...workspace,
    goals: workspace.goals.map((goal) => goal.id === goalId ? {
      ...goal,
      milestones: goal.milestones.map((milestone) => milestone.id === milestoneId
        ? { ...milestone, ...patch, id: milestone.id }
        : milestone),
      updatedAt,
    } : goal),
  };
}
