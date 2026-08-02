import { describe, expect, it } from "vitest";
import {
  ASSISTANT_SETTINGS_STORAGE_KEY,
  createDefaultAssistantSettings,
  loadAssistantSettings,
  saveAssistantSettings,
} from "./assistant-settings";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
    value: () => value,
  };
}

describe("assistant settings storage", () => {
  it("falls back safely for corrupt and incomplete settings", () => {
    expect(loadAssistantSettings(memoryStorage("not-json"))).toEqual(createDefaultAssistantSettings());
    expect(loadAssistantSettings(memoryStorage("{}"))).toEqual(createDefaultAssistantSettings());
  });

  it("validates and persists versioned settings", () => {
    const storage = memoryStorage();
    const settings = createDefaultAssistantSettings();
    settings.voiceEnabled = false;
    expect(saveAssistantSettings(settings, storage)).toBe(true);
    expect(storage.value()).toContain('"voiceEnabled":false');
    expect(ASSISTANT_SETTINGS_STORAGE_KEY).toContain(".v1");
  });
});
