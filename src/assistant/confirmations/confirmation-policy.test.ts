import { describe, expect, it, vi } from "vitest";
import { createDefaultAssistantSettings } from "../config/assistant-settings";
import { AssistantConfirmationManager } from "./confirmation-manager";
import { requiresAssistantConfirmation } from "./confirmation-policy";

const context = (now: string, sessionId = "session-1") => ({
  sessionId,
  turnId: "turn-1",
  now: new Date(now),
  app: { module: "tasks", timezone: "Europe/Warsaw", locale: "pl-PL", privacyMode: false },
});

describe("assistant confirmation policy", () => {
  it("always confirms significant writes and can auto-run reversible writes", () => {
    const settings = createDefaultAssistantSettings();
    expect(requiresAssistantConfirmation("confirmed_write", settings)).toBe(true);
    expect(requiresAssistantConfirmation("reversible_write", settings)).toBe(false);
    settings.autoRunReversibleWrites = false;
    expect(requiresAssistantConfirmation("reversible_write", settings)).toBe(true);
  });

  it("executes an exact, unexpired confirmation only once", async () => {
    const execute = vi.fn(async () => ({ success: true as const, data: { id: "task-1" } }));
    const manager = new AssistantConfirmationManager(1_000);
    const pending = manager.enqueue({
      sessionId: "session-1",
      turnId: "turn-1",
      toolName: "complete_task",
      operation: "Ukończ zadanie",
      record: "Raport",
    }, execute, new Date("2026-08-02T10:00:00.000Z"));

    expect((await manager.confirm(pending.id, "session-1", context("2026-08-02T10:00:00.500Z"))).status).toBe("executed");
    expect((await manager.confirm(pending.id, "session-1", context("2026-08-02T10:00:00.500Z"))).status).toBe("missing");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not accept an expired or cross-session confirmation", async () => {
    const manager = new AssistantConfirmationManager(100);
    const pending = manager.enqueue({
      sessionId: "session-1",
      turnId: "turn-1",
      toolName: "mark_payment_paid",
      operation: "Oznacz płatność",
      record: "Faktura",
    }, async () => ({ success: true, data: {} }), new Date("2026-08-02T10:00:00.000Z"));
    expect((await manager.confirm(pending.id, "session-2", context("2026-08-02T10:00:00.050Z", "session-2"))).status).toBe("missing");
    expect((await manager.confirm(pending.id, "session-1", context("2026-08-02T10:00:00.200Z"))).status).toBe("expired");
  });
});
