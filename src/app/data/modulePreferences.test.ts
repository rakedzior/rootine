import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_MODULES } from "../moduleRegistry";

describe("module preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("migrates the legacy shell preference and appends newly registered modules", async () => {
    const preferences = await import("./modulePreferences");
    window.localStorage.setItem(preferences.MODULE_PREFERENCES_STORAGE_KEY, JSON.stringify({
      order: ["work", "tasks"],
      disabled: ["tasks"],
    }));

    const loaded = preferences.loadModulePreferences();

    expect(loaded.order.slice(0, 2)).toEqual(["work", "tasks"]);
    expect(loaded.order).toHaveLength(APP_MODULES.length);
    expect(loaded.disabled).toEqual(["tasks"]);
  });

  it("never allows a corrupt preference to hide every module", async () => {
    const preferences = await import("./modulePreferences");
    window.localStorage.setItem(preferences.MODULE_PREFERENCES_STORAGE_KEY, JSON.stringify({
      order: APP_MODULES.map((module) => module.id),
      disabled: APP_MODULES.map((module) => module.id),
    }));

    expect(preferences.loadModulePreferences().disabled).toEqual([]);
  });

  it("shares the same ordered and visible module selector with every surface", async () => {
    const preferences = await import("./modulePreferences");
    const current = preferences.createDefaultModulePreferences();
    const next: typeof current = {
      ...current,
      order: ["work", ...current.order.filter((moduleId) => moduleId !== "work")],
      disabled: ["nutrition"],
    };

    expect(preferences.saveModulePreferences(next)).toBe(true);
    const loaded = preferences.loadModulePreferences();

    expect(preferences.getOrderedModules(loaded)[0]?.id).toBe("work");
    expect(preferences.getVisibleModules(loaded).some((module) => module.id === "nutrition")).toBe(false);
  });

  it("notifies another mounted surface after a same-tab preference change", async () => {
    const preferences = await import("./modulePreferences");
    const listener = vi.fn();
    const unsubscribe = preferences.subscribeToModulePreferences(listener);

    expect(preferences.saveModulePreferences(preferences.createDefaultModulePreferences())).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
