import { describe, expect, it } from "vitest";
import {
  formatCalories,
  formatCurrency,
  formatDate,
  formatLongDate,
  formatPercent,
  formatShortDate,
  formatTime,
  formatWeight,
  pluralize,
} from "./formatters";

describe("Polish formatters", () => {
  it("formats date-only values without shifting the calendar day", () => {
    expect(formatDate("2026-07-29")).toBe("29 lip 2026");
    expect(formatShortDate("2026-01-01")).toBe("1 sty");
    expect(formatLongDate("2026-12-31")).toBe("31 grudnia 2026");
  });

  it("handles month and year boundaries in Europe/Warsaw", () => {
    expect(formatDate("2026-01-31T23:30:00Z")).toBe("1 lut 2026");
    expect(formatLongDate("2026-12-31T23:30:00Z")).toBe("1 stycznia 2027");
  });

  it("formats Warsaw time across daylight-saving transitions", () => {
    expect(formatTime("2026-03-29T00:30:00Z")).toBe("01:30");
    expect(formatTime("2026-03-29T01:30:00Z")).toBe("03:30");
    expect(formatTime("2026-10-25T00:30:00Z")).toBe("02:30");
    expect(formatTime("2026-10-25T01:30:00Z")).toBe("02:30");
  });

  it("returns a stable empty marker for invalid inputs", () => {
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatTime(Number.NaN)).toBe("—");
    expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("preserves grosze, omits redundant zeros, and groups large amounts", () => {
    expect(formatCurrency(1_431.99)).toBe("1\u00a0431,99\u00a0zł");
    expect(formatCurrency(23_120)).toBe("23\u00a0120\u00a0zł");
    expect(formatCurrency(0.1)).toBe("0,10\u00a0zł");
    expect(formatCurrency(999_999_999.01)).toBe("999\u00a0999\u00a0999,01\u00a0zł");
  });

  it("uses one consistent Polish format for percentages and measurements", () => {
    expect(formatPercent(12.5)).toBe("12,5%");
    expect(formatWeight(72.5)).toBe("72,5\u00a0kg");
    expect(formatCalories(2450.4)).toBe("2\u00a0450\u00a0kcal");
  });

  it("uses Polish one/few/many plural forms", () => {
    const taskForms = ["zadanie", "zadania", "zadań"] as const;
    expect(pluralize(1, taskForms)).toBe("1 zadanie");
    expect(pluralize(2, taskForms)).toBe("2 zadania");
    expect(pluralize(5, taskForms)).toBe("5 zadań");
    expect(pluralize(12, taskForms)).toBe("12 zadań");
    expect(pluralize(22, taskForms)).toBe("22 zadania");
    expect(pluralize(25, taskForms)).toBe("25 zadań");

    expect(pluralize(1, "pozycja", "pozycje", "pozycji")).toBe("1 pozycja");
    expect(pluralize(2, "pozycja", "pozycje", "pozycji")).toBe("2 pozycje");
    expect(pluralize(5, "pozycja", "pozycje", "pozycji")).toBe("5 pozycji");
  });
});
