import { describe, expect, it } from "vitest";
import { advancePaymentDate, advancePaymentDateToFuture } from "./affairsWorkspace";

describe("affairs recurrence", () => {
  it("clamps month-end recurrences instead of skipping February", () => {
    expect(advancePaymentDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advancePaymentDate("2024-01-31", "monthly")).toBe("2024-02-29");
    expect(advancePaymentDate("2026-11-30", "quarterly")).toBe("2027-02-28");
  });

  it("advances overdue automatic payments until the next future occurrence", () => {
    expect(advancePaymentDateToFuture("2026-01-31", "monthly", new Date(2026, 3, 15))).toBe("2026-04-28");
    expect(advancePaymentDateToFuture("2025-07-01", "yearly", new Date(2026, 6, 1))).toBe("2027-07-01");
  });
});
