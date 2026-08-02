import { describe, expect, it, vi } from "vitest";
import { createDefaultAssistantSettings } from "../config/assistant-settings";
import {
  ASSISTANT_DIAGNOSTICS_STORAGE_KEY,
  debugAssistantEvent,
  recordAssistantDiagnostic,
} from "./assistant-diagnostics";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    read: () => values.get(ASSISTANT_DIAGNOSTICS_STORAGE_KEY),
  };
}

describe("assistant diagnostics", () => {
  it("stores only bounded structural events when enabled", () => {
    const settings = createDefaultAssistantSettings();
    const storage = memoryStorage();
    for (let index = 0; index < 45; index += 1) {
      recordAssistantDiagnostic(settings, { event: "tool", outcome: "success", category: "search_tasks" }, storage);
    }
    const events = JSON.parse(storage.read() ?? "[]") as unknown[];
    expect(events).toHaveLength(40);
    expect(storage.read()).not.toContain("transcript");
  });

  it("does nothing when diagnostics and debug are disabled", () => {
    const settings = createDefaultAssistantSettings();
    settings.diagnosticsEnabled = false;
    settings.assistantDebugEnabled = false;
    const storage = memoryStorage();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    recordAssistantDiagnostic(settings, { event: "connect", outcome: "success" }, storage);
    debugAssistantEvent(settings, "transport.event", { type: "connected" });
    expect(storage.read()).toBeUndefined();
    expect(debug).not.toHaveBeenCalled();
    debug.mockRestore();
  });
});
