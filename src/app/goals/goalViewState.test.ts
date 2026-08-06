import { describe, expect, it } from "vitest";
import { readGoalViewState, writeGoalViewState } from "./goalViewState";

describe("goal view URL state", () => {
  const categories = new Set(["sport", "work"]);
  const defaults = { layout: "list" as const, sort: "priority" as const };

  it("reads valid filter, layout, sort, and selection state", () => {
    const state = readGoalViewState(
      new URLSearchParams("widok=category%3Asport&uklad=grid&sort=due&cel=goal-7"),
      categories,
      defaults,
    );

    expect(state).toEqual({
      filter: "category:sport",
      layout: "grid",
      sort: "due",
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
      layout: "list",
      sort: "priority",
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
      selectedId: "goal-2",
    });

    expect(next.get("from")).toBe("today");
    expect(next.get("widok")).toBe("overview");
    expect(next.get("uklad")).toBe("grid");
    expect(next.get("sort")).toBe("updated");
    expect(next.get("cel")).toBe("goal-2");
  });

  it("uses next steps as the canonical fixed entry", () => {
    const state = readGoalViewState(new URLSearchParams(), categories, defaults);
    expect(state.filter).toBe("next");

    const next = writeGoalViewState(new URLSearchParams("widok=week"), state);
    expect(next.has("widok")).toBe(false);
  });
});
