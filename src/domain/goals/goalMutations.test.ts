import { describe, expect, it } from "vitest";
import { createSeedGoalsWorkspace } from "../../app/goals/goalsModel";
import { appendGoalProgress, patchGoalMilestone } from "./goalMutations";

describe("shared goal mutations", () => {
  it("uses the same immutable progress append for UI and domain services", () => {
    const workspace = createSeedGoalsWorkspace();
    const goal = workspace.goals[0];
    const entry = {
      id: "progress-shared",
      date: "2026-08-02",
      value: 5,
      kind: "delta" as const,
      note: "Test",
      createdAt: "2026-08-02T10:00:00.000Z",
    };
    const next = appendGoalProgress(workspace, goal.id, entry);

    expect(next).not.toBe(workspace);
    expect(next.goals.find((candidate) => candidate.id === goal.id)?.progressEntries.at(-1)).toEqual(entry);
    expect(next.goals.find((candidate) => candidate.id === goal.id)?.updatedAt).toBe(entry.createdAt);
  });

  it("patches only the selected milestone", () => {
    const workspace = createSeedGoalsWorkspace();
    const goal = workspace.goals.find((candidate) => candidate.milestones.length > 0);
    if (!goal) throw new Error("Seed fixture requires a milestone");
    const milestone = goal.milestones[0];
    const next = patchGoalMilestone(workspace, goal.id, milestone.id, { done: !milestone.done }, "2026-08-02T10:00:00.000Z");

    expect(next.goals.find((candidate) => candidate.id === goal.id)?.milestones[0].done).toBe(!milestone.done);
    expect(next.goals.filter((candidate) => candidate.id !== goal.id)).toEqual(workspace.goals.filter((candidate) => candidate.id !== goal.id));
  });
});
