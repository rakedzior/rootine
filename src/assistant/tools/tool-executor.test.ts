import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { createDefaultAssistantSettings } from "../config/assistant-settings";
import type { AssistantExecutionContext } from "../core/types";
import { AssistantToolExecutor } from "./tool-executor";
import { AssistantToolRegistry } from "./tool-registry";

const context: AssistantExecutionContext = {
  sessionId: "session-1",
  turnId: "turn-1",
  now: new Date("2026-08-02T12:00:00.000Z"),
  app: { module: "tasks", timezone: "Europe/Warsaw", locale: "pl-PL", privacyMode: false },
};

describe("assistant tool executor", () => {
  it("validates JSON and arguments before domain execution", async () => {
    const execute = vi.fn(async () => ({ success: true as const, data: { total: 1 } }));
    const registry = new AssistantToolRegistry().register({
      name: "search_tasks",
      description: "Search tasks",
      inputSchema: z.object({ query: z.string().min(2) }).strict(),
      outputSchema: z.object({ total: z.number() }),
      risk: "read",
      scopes: ["tasks"],
      execute,
    });
    const executor = new AssistantToolExecutor(registry, createDefaultAssistantSettings);
    const result = await executor.execute({ callId: "c1", name: "search_tasks", arguments: "{\"query\":\"\"}" }, context);
    expect(result.result).toMatchObject({ success: false, code: "VALIDATION" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("queues confirmed writes and executes only after exact confirmation", async () => {
    const execute = vi.fn(async () => ({ success: true as const, data: { paid: true } }));
    const registry = new AssistantToolRegistry().register({
      name: "mark_payment_paid",
      description: "Mark payment paid",
      inputSchema: z.object({ paymentId: z.string() }).strict(),
      outputSchema: z.object({ paid: z.boolean() }),
      risk: "confirmed_write",
      scopes: ["finance"],
      execute,
      describeConfirmation: ({ paymentId }) => ({ operation: "Oznacz jako opłaconą", record: paymentId }),
    });
    const settings = createDefaultAssistantSettings();
    settings.assistantFinanceEnabled = true;
    settings.permissions.finance = { read: true, write: true };
    const executor = new AssistantToolExecutor(registry, () => settings);
    const selectedContext = { ...context, app: { ...context.app, selectedEntityId: "p1" } };
    const queued = await executor.execute({ callId: "c1", name: "mark_payment_paid", arguments: "{\"paymentId\":\"p1\"}" }, selectedContext);
    expect(queued.result).toMatchObject({ success: false, code: "CONFIRMATION_REQUIRED" });
    expect(execute).not.toHaveBeenCalled();
    if (queued.result.success || !queued.result.confirmationId) throw new Error("Missing confirmation id");
    const confirmed = await executor.confirm(queued.result.confirmationId, selectedContext);
    expect(confirmed.status).toBe("executed");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("keeps validated sensitive metadata internally for local Undo and refresh", async () => {
    const registry = new AssistantToolRegistry().register({
      name: "get_finance_summary",
      description: "Finance summary",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ balance: z.number(), eventId: z.string(), undoToken: z.string() }),
      risk: "read",
      scopes: ["finance"],
      execute: async () => ({ success: true, data: { balance: 1200, eventId: "event-1", undoToken: "undo-1" } }),
    });
    const settings = createDefaultAssistantSettings();
    settings.assistantFinanceEnabled = true;
    settings.permissions.finance.read = true;
    const executor = new AssistantToolExecutor(registry, () => settings);
    const result = await executor.execute(
      { callId: "c1", name: "get_finance_summary", arguments: "{}" },
      { ...context, app: { ...context.app, privacyMode: true } },
    );
    expect(result.result).toMatchObject({
      success: true,
      data: { balance: 1200, eventId: "event-1", undoToken: "undo-1" },
    });
  });

  it("rechecks permissions against current settings at confirmation time", async () => {
    const execute = vi.fn(async () => ({ success: true as const, data: { paid: true } }));
    const registry = new AssistantToolRegistry().register({
      name: "mark_payment_paid",
      description: "Mark payment paid",
      inputSchema: z.object({ paymentId: z.string() }).strict(),
      outputSchema: z.object({ paid: z.boolean() }),
      risk: "confirmed_write",
      scopes: ["finance"],
      execute,
    });
    const settings = createDefaultAssistantSettings();
    settings.assistantFinanceEnabled = true;
    settings.permissions.finance = { read: true, write: true };
    const executor = new AssistantToolExecutor(registry, () => settings);
    const selectedContext = { ...context, app: { ...context.app, selectedEntityId: "p1" } };
    const queued = await executor.execute({
      callId: "c1",
      name: "mark_payment_paid",
      arguments: JSON.stringify({ paymentId: "p1" }),
    }, selectedContext);
    if (queued.result.success || !queued.result.confirmationId) throw new Error("Missing confirmation id");
    settings.permissions.finance.write = false;
    const confirmed = await executor.confirm(queued.result.confirmationId, selectedContext);
    expect(confirmed).toMatchObject({ status: "executed", result: { success: false, code: "PERMISSION" } });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects fabricated mutation IDs until an exact ID was returned by a tool", async () => {
    const mutate = vi.fn(async () => ({ success: true as const, data: { completed: true } }));
    const registry = new AssistantToolRegistry()
      .register({
        name: "search_tasks",
        description: "Search tasks",
        inputSchema: z.object({}).strict(),
        outputSchema: z.object({ items: z.array(z.object({ id: z.string() })) }),
        risk: "read",
        scopes: ["tasks"],
        execute: async () => ({ success: true, data: { items: [{ id: "task-1" }] } }),
      })
      .register({
        name: "complete_task",
        description: "Complete task",
        inputSchema: z.object({ taskId: z.string() }).strict(),
        outputSchema: z.object({ completed: z.boolean() }),
        risk: "reversible_write",
        scopes: ["tasks"],
        execute: mutate,
      });
    const executor = new AssistantToolExecutor(registry, createDefaultAssistantSettings);
    const fabricated = await executor.execute({
      callId: "w1",
      name: "complete_task",
      arguments: JSON.stringify({ taskId: "task-1" }),
    }, context);
    expect(fabricated.result).toMatchObject({ success: false, code: "VALIDATION" });
    await executor.execute({ callId: "r1", name: "search_tasks", arguments: "{}" }, context);
    const accepted = await executor.execute({
      callId: "w2",
      name: "complete_task",
      arguments: JSON.stringify({ taskId: "task-1" }),
    }, context);
    expect(accepted.result).toMatchObject({ success: true, data: { completed: true } });
    expect(mutate).toHaveBeenCalledOnce();
  });

  it("does not add a second confirmation to an explicit recovery action", async () => {
    const execute = vi.fn(async () => ({ success: true as const, data: { restored: true } }));
    const registry = new AssistantToolRegistry().register({
      name: "undo_action",
      description: "Undo",
      inputSchema: z.object({ undoToken: z.string() }).strict(),
      outputSchema: z.object({ restored: z.boolean() }),
      risk: "reversible_write",
      scopes: ["presentation"],
      confirmationMode: "never",
      execute,
    });
    const settings = createDefaultAssistantSettings();
    settings.autoRunReversibleWrites = false;
    const result = await new AssistantToolExecutor(registry, () => settings).execute({
      callId: "undo-1",
      name: "undo_action",
      arguments: JSON.stringify({ undoToken: "valid-token" }),
    }, context);
    expect(result.result).toMatchObject({ success: true, data: { restored: true } });
    expect(execute).toHaveBeenCalledOnce();
  });
});
