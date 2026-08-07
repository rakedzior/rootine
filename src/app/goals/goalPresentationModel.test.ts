import { beforeEach, describe, expect, it } from "vitest";
import { readLayoutPreference } from "./goalPresentationModel";

describe("goal layout preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the grid when no layout preference has been saved", () => {
    expect(readLayoutPreference()).toBe("grid");
  });

  it("preserves an explicit list preference", () => {
    window.localStorage.setItem("rootine.goals.layout", "list");
    expect(readLayoutPreference()).toBe("list");
  });
});
