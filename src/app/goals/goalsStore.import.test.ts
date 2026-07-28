import { describe, expect, it } from "vitest";
import { inspectGoalsImport } from "./goalsModel";

const validWorkspace = {
  version: 1,
  categories: [
    { id: "personal", label: "Sprawy osobiste", color: "#A0A0A0", iconKey: "circle" },
  ],
  goals: [
    {
      id: "goal-1",
      title: "Bezpieczny import",
      description: "",
      categoryId: "personal",
      iconKey: "target",
      color: "#809AF4",
      status: "active",
      health: "ontrack",
      priority: "medium",
      startDate: "2026-07-01",
      dueDate: "2026-08-01",
      progressMode: "manual",
      initialValue: 0,
      targetValue: 100,
      unit: "%",
      manualProgress: 20,
      milestones: [],
      progressEntries: [],
      note: "",
      createdAt: "2026-07-01T09:00:00.000Z",
      updatedAt: "2026-07-01T09:00:00.000Z",
    },
  ],
};

function mutableWorkspace() {
  return structuredClone(validWorkspace) as unknown as {
    version: number;
    categories: Array<Record<string, unknown>>;
    goals: Array<Record<string, unknown>>;
  };
}

describe("inspectGoalsImport", () => {
  it("returns a preview only after validating the full workspace", () => {
    expect(inspectGoalsImport(JSON.stringify(validWorkspace))).toEqual({
      ok: true,
      preview: {
        goalCount: 1,
        categoryCount: 1,
        milestoneCount: 0,
        progressCount: 0,
        activeCount: 1,
      },
    });
  });

  it("rejects invalid nested progress data", () => {
    const invalid = mutableWorkspace();
    invalid.goals[0].progressEntries = [{
      id: "entry-1",
      date: "2026-02-30",
      value: Number.POSITIVE_INFINITY,
      kind: "absolute",
      note: "",
      createdAt: "not-a-date",
    }];
    const result = inspectGoalsImport(JSON.stringify(invalid));
    expect(result.ok).toBe(false);
  });

  it("rejects goals that reference a missing category", () => {
    const invalid = mutableWorkspace();
    invalid.goals[0].categoryId = "missing";
    const result = inspectGoalsImport(JSON.stringify(invalid));
    expect(result.ok).toBe(false);
  });

  it("rejects executable content in a custom icon field", () => {
    const invalid = mutableWorkspace();
    Object.assign(invalid.goals[0], { customIcon: "data:image/svg+xml,<svg onload=alert(1) />" });
    const result = inspectGoalsImport(JSON.stringify(invalid));
    expect(result.ok).toBe(false);
  });
});
