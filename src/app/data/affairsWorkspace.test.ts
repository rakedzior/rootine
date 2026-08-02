import { describe, expect, it } from "vitest";
import {
  advancePaymentDate,
  advancePaymentDateToFuture,
  setMatterCompletionState,
  setOneTimePaymentPaidState,
  type AffairsWorkspace,
} from "./affairsWorkspace";

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

describe("affairs shared completion mutations", () => {
  const workspace: AffairsWorkspace = {
    version: 2,
    matters: [{
      id: "matter-1", title: "Urząd", category: "urzedy", priority: "normal",
      status: "waiting", dueDate: "2026-08-10", note: "", createdAt: "2026-08-01T08:00:00.000Z",
    }],
    oneTimePayments: [{
      id: "payment-1", title: "Rachunek", category: "dom", amount: 120,
      dueDate: "2026-08-05", paid: false, paidAt: "", note: "",
    }],
    payments: [], subscriptions: [], documents: [], vehicles: [], vehicleItems: [], budgets: [],
  };

  it("uses one matter completion transition for UI and assistant services", () => {
    const next = setMatterCompletionState(workspace, "matter-1", true);
    expect(next.matters[0].status).toBe("done");
    expect(workspace.matters[0].status).toBe("waiting");
  });

  it("uses the supplied payment timestamp and clears it when reopened", () => {
    const paid = setOneTimePaymentPaidState(workspace, "payment-1", true, "2026-08-02T10:00:00.000Z");
    expect(paid.oneTimePayments[0]).toMatchObject({ paid: true, paidAt: "2026-08-02T10:00:00.000Z" });
    expect(setOneTimePaymentPaidState(paid, "payment-1", false).oneTimePayments[0])
      .toMatchObject({ paid: false, paidAt: "" });
  });
});
