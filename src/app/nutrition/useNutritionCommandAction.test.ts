import { describe, expect, it } from "vitest";
import { parseNutritionDateParam } from "./useNutritionCommandAction";

describe("parseNutritionDateParam", () => {
  it.each([
    "2026-08-10",
    "2024-02-29",
  ])("accepts a real canonical date: %s", (value) => {
    expect(parseNutritionDateParam(value)).toBe(value);
  });

  it.each([
    null,
    "",
    "10-08-2026",
    "2026-8-10",
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
  ])("rejects a missing, malformed or impossible date: %s", (value) => {
    expect(parseNutritionDateParam(value)).toBeUndefined();
  });
});
