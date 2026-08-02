import { beforeEach, describe, expect, it } from "vitest";
import { resetDomainTestStorage } from "../../domain/testSupport";
import { TASK_STORAGE_KEY, type TaskWorkspace } from "../../app/data/taskWorkspace";
import { createDefaultAssistantSettings } from "../config/assistant-settings";
import type { AssistantExecutionContext } from "../core/types";
import { registerRootineDomainTools } from "./domain-tools";
import { AssistantToolExecutor } from "./tool-executor";
import { AssistantToolRegistry } from "./tool-registry";

const context: AssistantExecutionContext = {
  sessionId: "s1",
  turnId: "t1",
  now: new Date("2026-08-02T10:00:00.000Z"),
  app: { module: "tasks", timezone: "Europe/Warsaw", locale: "pl-PL", privacyMode: false },
};

describe("Rootine assistant domain tools", () => {
  beforeEach(() => resetDomainTestStorage());

  it("registers a broad closed catalog without destructive operations", () => {
    const settings = createDefaultAssistantSettings();
    const registry = registerRootineDomainTools(new AssistantToolRegistry(), () => settings);
    expect(registry.list().length).toBeGreaterThanOrEqual(40);
    expect(registry.list().every((tool) => tool.risk !== "destructive")).toBe(true);
    expect(registry.toRealtimeTools().every((tool) => tool.parameters.type === "object")).toBe(true);
  });

  it("writes only after validated arguments and returns a verified undo token", async () => {
    const settings = createDefaultAssistantSettings();
    const registry = registerRootineDomainTools(new AssistantToolRegistry(), () => settings);
    const executor = new AssistantToolExecutor(registry, () => settings);
    const created = await executor.execute({
      callId: "c1",
      name: "create_task",
      arguments: JSON.stringify({ title: "Odebrać garnitur", date: "2026-08-03", time: "15:00" }),
    }, context);
    expect(created.result).toMatchObject({ success: true, data: { undoToken: expect.any(String) } });
  });

  it("does not expose finance when its sensitive scope is disabled", async () => {
    const settings = createDefaultAssistantSettings();
    const registry = registerRootineDomainTools(new AssistantToolRegistry(), () => settings);
    const executor = new AssistantToolExecutor(registry, () => settings);
    const result = await executor.execute({
      callId: "c1",
      name: "get_finance_summary",
      arguments: JSON.stringify({ today: "2026-08-02", includeAmounts: true }),
    }, context);
    expect(result.result).toMatchObject({ success: false, code: "PERMISSION" });
  });

  it("returns a bounded seven-day calendar window with recurring occurrences", async () => {
    const workspace: TaskWorkspace = {
      version: 2,
      updatedAt: "2026-08-02T09:00:00.000Z",
      tasks: [
        {
          id: 11,
          text: "Codzienny przegląd",
          done: false,
          view: "7dni",
          calendarDate: "2026-08-03",
          schedule: {
            allDay: false,
            startTime: "09:00",
            endTime: "10:00",
            recurrence: "daily",
            timezone: "Europe/Warsaw",
          },
        },
        { id: 12, text: "Rozmowa", done: false, view: "7dni", calendarDate: "2026-08-03", time: "09:30", endTime: "10:30" },
        { id: 13, text: "Dzień administracyjny", done: false, view: "7dni", calendarDate: "2026-08-03" },
      ],
      habits: [],
      lists: [],
      tags: [],
    };
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(workspace));
    const settings = createDefaultAssistantSettings();
    const registry = registerRootineDomainTools(new AssistantToolRegistry(), () => settings);
    const executor = new AssistantToolExecutor(registry, () => settings);

    const result = await executor.execute({
      callId: "calendar-week",
      name: "get_calendar_week",
      arguments: JSON.stringify({ startDate: "2026-08-03", includeCompleted: true }),
    }, context);

    expect(result.result).toMatchObject({
      success: true,
      data: {
        startDate: "2026-08-03",
        endDate: "2026-08-09",
        total: 9,
        truncated: false,
      },
    });
    if (!result.result.success) throw new Error("Expected calendar query to succeed");
    const data = result.result.data as { items: Array<{ entityId: string; date: string; recurring: boolean }> };
    expect(data.items).toContainEqual(expect.objectContaining({ entityId: "11", date: "2026-08-09", recurring: true }));
  });

  it("reports explicit timed conflicts and ignores all-day calendar items", async () => {
    const workspace: TaskWorkspace = {
      version: 2,
      updatedAt: "2026-08-02T09:00:00.000Z",
      tasks: [
        { id: 21, text: "Skupienie", done: false, view: "7dni", calendarDate: "2026-08-04", time: "09:00", endTime: "10:00" },
        { id: 22, text: "Telefon", done: false, view: "7dni", calendarDate: "2026-08-04", time: "09:30", endTime: "10:30" },
        { id: 23, text: "Cały dzień", done: false, view: "7dni", calendarDate: "2026-08-04" },
      ],
      habits: [],
      lists: [],
      tags: [],
    };
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(workspace));
    const settings = createDefaultAssistantSettings();
    const registry = registerRootineDomainTools(new AssistantToolRegistry(), () => settings);
    const executor = new AssistantToolExecutor(registry, () => settings);

    const result = await executor.execute({
      callId: "calendar-conflicts",
      name: "get_calendar_conflicts",
      arguments: JSON.stringify({ startDate: "2026-08-03" }),
    }, context);

    expect(result.result).toMatchObject({
      success: true,
      data: {
        total: 1,
        items: [{
          date: "2026-08-04",
          time: "09:00",
          endTime: "10:30",
          kind: "overlap",
          entryCount: 2,
          truncatedEntries: false,
          entries: [
            expect.objectContaining({ entityId: "21" }),
            expect.objectContaining({ entityId: "22" }),
          ],
        }],
      },
    });
  });
});
