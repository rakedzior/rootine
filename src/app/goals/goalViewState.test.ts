import { describe, expect, it } from "vitest";
import { readGoalViewState, writeGoalViewState } from "./goalViewState";

describe("goal view URL state", () => {
  const categories = new Set(["sport", "work"]);
  const defaults = { layout: "grid" as const, sort: "priority" as const };

  it("reads valid filter, layout, sort, scope, and detail selection state", () => {
    const state = readGoalViewState(
      new URLSearchParams("widok=category%3Asport&uklad=list&sort=due&zakres=goal-3&cel=goal-7"),
      categories,
      defaults,
    );

    expect(state).toEqual({
      filter: "category:sport",
      layout: "list",
      sort: "due",
      scopeId: "goal-3",
      selectedId: "goal-7",
    });
  });

  it("falls back safely when URL values are stale", () => {
    const state = readGoalViewState(
      new URLSearchParams("widok=category%3Aremoved&uklad=tiles&sort=random"),
      categories,
      defaults,
    );

    expect(state).toEqual({
      filter: "next",
      layout: "grid",
      sort: "priority",
      scopeId: null,
      selectedId: null,
    });
  });

  it("keeps the agenda perspectives addressable in the URL", () => {
    expect(readGoalViewState(new URLSearchParams("widok=next"), categories, defaults).filter).toBe("next");
    expect(readGoalViewState(new URLSearchParams("widok=week"), categories, defaults).filter).toBe("week");
  });

  it("writes canonical state while preserving unrelated parameters", () => {
    const next = writeGoalViewState(new URLSearchParams("from=today&widok=paused"), {
      filter: "overview",
      layout: "grid",
      sort: "updated",
      scopeId: "goal-3",
      selectedId: "goal-2",
    });

    expect(next.get("from")).toBe("today");
    expect(next.get("widok")).toBe("overview");
    expect(next.get("uklad")).toBe("grid");
    expect(next.get("sort")).toBe("updated");
    expect(next.get("zakres")).toBe("goal-3");
    expect(next.get("cel")).toBe("goal-2");
  });

  it("keeps workspace scope and quick details independently removable", () => {
    const current = new URLSearchParams("zakres=goal-3&cel=goal-7");
    const state = readGoalViewState(current, categories, defaults);
    const next = writeGoalViewState(current, { ...state, selectedId: null });

    expect(next.get("zakres")).toBe("goal-3");
    expect(next.has("cel")).toBe(false);
  });

  it("uses next steps as the canonical fixed entry", () => {
    const state = readGoalViewState(new URLSearchParams(), categories, defaults);
    expect(state.filter).toBe("next");

    const next = writeGoalViewState(new URLSearchParams("widok=week"), state);
    expect(next.has("widok")).toBe(false);
  });
});
