import { describe, expect, it } from "vitest";
import {
  calendarDaysBetween,
  formatLocalDate,
  isLocalDateKey,
  parseLocalDateKey,
  shiftLocalDateKey,
  toLocalDateKey,
} from "./localDate";

describe("localDate", () => {
  it("round-trips a local calendar date without UTC conversion", () => {
    const date = new Date(2026, 6, 28, 23, 30);
    expect(toLocalDateKey(date)).toBe("2026-07-28");
    expect(parseLocalDateKey("2026-07-28")?.getDate()).toBe(28);
  });

  it("rejects impossible dates", () => {
    expect(isLocalDateKey("2026-02-29")).toBe(false);
    expect(parseLocalDateKey("2026-13-01")).toBeNull();
  });

  it("shifts over leap days using calendar arithmetic", () => {
    expect(shiftLocalDateKey("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftLocalDateKey("2024-02-29", 1)).toBe("2024-03-01");
  });

  it("counts calendar days independently of daylight-saving offsets", () => {
    expect(calendarDaysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(calendarDaysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("formats a date-only value for the selected locale", () => {
    expect(formatLocalDate("2026-07-28", { year: "numeric", month: "2-digit", day: "2-digit" }, "pl-PL"))
      .toBe("28.07.2026");
  });
});
