import { describe, expect, it } from "vitest";
import { panelFromConfirmation, panelFromToolExecution } from "./panel-factory";

describe("assistant panel factory", () => {
  it("maps a successful mutation to an Undo-capable action result", () => {
    const panel = panelFromToolExecution({
      callId: "c1",
      name: "complete_task",
      requiresConfirmation: false,
      result: {
        success: true,
        data: { entityId: "1", eventId: "event-1", undoToken: "undo-1", updatedSnapshot: { id: "1" }, message: "Gotowe" },
      },
    });
    expect(panel).toMatchObject({ type: "action_result", data: { undoToken: "undo-1", success: true } });
  });

  it("maps ambiguity to a closed clarification panel", () => {
    const panel = panelFromToolExecution({
      callId: "c1",
      name: "search_tasks",
      requiresConfirmation: false,
      result: { success: false, code: "AMBIGUOUS", message: "Wybierz", candidates: [{ id: "1", label: "Raport" }] },
    });
    expect(panel.type).toBe("clarification");
  });

  it("creates a keyboard-usable confirmation panel with an expiry", () => {
    const panel = panelFromConfirmation({
      id: "confirm-1",
      sessionId: "s1",
      turnId: "t1",
      toolName: "mark_payment_paid",
      operation: "Oznacz jako opłaconą",
      record: "Faktura",
      createdAt: "2026-08-02T10:00:00.000Z",
      expiresAt: "2026-08-02T10:01:00.000Z",
    });
    expect(panel).toMatchObject({ type: "confirmation", data: { confirmationId: "confirm-1" } });
  });
});
