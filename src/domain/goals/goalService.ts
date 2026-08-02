import {
  getGoalCurrentValue,
  type Goal,
  type GoalsWorkspace,
} from "../../app/goals/goalsModel";
import { createDomainId, domainFailure } from "../shared";
import { commitDomainMutation } from "../shared/mutation";
import type { DomainMutationResult } from "../shared/result";
import { createWorkspaceUndo } from "../shared/workspaceUndo";
import { completeMilestoneSchema, updateGoalProgressSchema } from "./goalSchemas";
import { appendGoalProgress, patchGoalMilestone } from "./goalMutations";
import { GOALS_STORAGE_KEY, loadGoalsWorkspace, saveGoalsWorkspace } from "./goalsRepository";

function replaceGoal(workspace: GoalsWorkspace, value: Goal | null, id: string): GoalsWorkspace {
  return {
    ...workspace,
    goals: value === null
      ? workspace.goals.filter((goal) => goal.id !== id)
      : workspace.goals.map((goal) => goal.id === id ? value : goal),
  };
}

function goalUndo(before: Goal, after: Goal, message: string) {
  return createWorkspaceUndo({
    storageKey: GOALS_STORAGE_KEY, read: loadGoalsWorkspace, save: saveGoalsWorkspace,
    select: (workspace) => workspace.goals.find((goal) => goal.id === after.id) ?? null,
    apply: (workspace, value) => replaceGoal(workspace, value, after.id),
    expected: after, restore: before, message,
  });
}

export async function updateGoalProgress(input: unknown): Promise<DomainMutationResult<Goal>> {
  const parsed = updateGoalProgressSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy postęp.");
  const workspace = loadGoalsWorkspace();
  const before = workspace.goals.find((goal) => goal.id === parsed.data.goalId);
  if (!before || before.status === "archived") return domainFailure("NOT_FOUND", "Aktywny cel nie istnieje.");
  const previousValue = getGoalCurrentValue(before);
  const entry = {
    id: createDomainId("goal-progress"), date: parsed.data.date, value: parsed.data.value,
    kind: parsed.data.kind, note: parsed.data.note, createdAt: new Date().toISOString(),
  } as const;
  const next = appendGoalProgress(workspace, before.id, entry);
  const after = next.goals.find((goal) => goal.id === before.id) ?? before;
  return commitDomainMutation({
    entityId: before.id, storageKey: GOALS_STORAGE_KEY,
    event: { type: "goal.progress_updated", domain: "goals", entityId: before.id, payload: { previousValue, nextValue: getGoalCurrentValue(after) } },
    save: () => saveGoalsWorkspace(next), read: loadGoalsWorkspace,
    verify: (current) => current.goals.some((goal) => goal.id === before.id && goal.progressEntries.some((candidate) => candidate.id === entry.id)),
    selectSnapshot: (current) => current.goals.find((goal) => goal.id === before.id) ?? after,
    message: "Zaktualizowano postęp celu.", compensation: goalUndo(before, after, "Cofnięto aktualizację postępu celu."),
  });
}

export async function completeMilestone(input: unknown): Promise<DomainMutationResult<Goal>> {
  const parsed = completeMilestoneSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy milestone.");
  const workspace = loadGoalsWorkspace();
  const before = workspace.goals.find((goal) => goal.id === parsed.data.goalId);
  if (!before) return domainFailure("NOT_FOUND", "Cel nie istnieje.");
  const milestone = before.milestones.find((candidate) => candidate.id === parsed.data.milestoneId);
  if (!milestone) return domainFailure("NOT_FOUND", "Milestone nie istnieje.");
  if (milestone.done === parsed.data.completed) return domainFailure("CONFLICT", "Milestone ma już wybrany status.");
  const next = patchGoalMilestone(
    workspace,
    before.id,
    milestone.id,
    { done: parsed.data.completed },
    new Date().toISOString(),
  );
  const after = next.goals.find((goal) => goal.id === before.id) ?? before;
  return commitDomainMutation({
    entityId: milestone.id, storageKey: GOALS_STORAGE_KEY,
    event: { type: "goal.milestone_completed", domain: "goals", entityId: milestone.id, payload: { milestoneId: milestone.id, completed: parsed.data.completed } },
    save: () => saveGoalsWorkspace(next), read: loadGoalsWorkspace,
    verify: (current) => current.goals.find((goal) => goal.id === before.id)?.milestones.find((candidate) => candidate.id === milestone.id)?.done === parsed.data.completed,
    selectSnapshot: (current) => current.goals.find((goal) => goal.id === before.id) ?? after,
    message: parsed.data.completed ? "Oznaczono milestone jako wykonany." : "Cofnięto wykonanie milestone.",
    compensation: goalUndo(before, after, parsed.data.completed ? "Cofnięto wykonanie milestone." : "Przywrócono wykonanie milestone."),
  });
}
