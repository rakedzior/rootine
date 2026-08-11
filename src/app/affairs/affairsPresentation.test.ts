import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AFFAIRS_VIEW_ARCHETYPE,
  NAV_GROUPS,
  dueCopy,
  getAffairsEditorDraftKey,
  getInitialView,
} from "./affairsPresentation";

const initialUrl = window.location.href;

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, "", initialUrl);
});

describe("affairs presentation architecture", () => {
  it("keeps the approved information architecture in one ordered source of truth", () => {
    expect(NAV_GROUPS.map((group) => ({
      label: group.label,
      views: group.items.map((item) => item.view),
    }))).toEqual([
      { label: "Centrum", views: ["overview"] },
      { label: "Sprawy", views: ["today", "week", "all"] },
      { label: "Finanse", views: ["finances", "finance-one-time", "finance-recurring"] },
      { label: "Rejestry", views: ["documents", "vehicles"] },
      { label: "Pozostałe", views: ["health", "jdg"] },
    ]);
  });

  it("maps every destination to one of the three shared view archetypes", () => {
    expect(AFFAIRS_VIEW_ARCHETYPE).toEqual({
      overview: "workspace",
      today: "agenda",
      week: "agenda",
      all: "agenda",
      finances: "register",
      "finance-one-time": "register",
      "finance-recurring": "register",
      documents: "register",
      vehicles: "register",
      health: "workspace",
      jdg: "workspace",
    });
  });

  it.each([
    ["dashboard", "overview"],
    ["matters", "all"],
  ] as const)("keeps the legacy %s view id compatible", (legacyView, expectedView) => {
    window.history.replaceState({}, "", `/sprawy?widok=${legacyView}`);
    expect(getInitialView()).toBe(expectedView);
  });

  it("isolates new vehicle-item drafts by their parent vehicle", () => {
    const firstVehicleKey = getAffairsEditorDraftKey({
      kind: "vehicleItem",
      mode: "add",
      vehicleId: "vehicle-family",
    });
    const secondVehicleKey = getAffairsEditorDraftKey({
      kind: "vehicleItem",
      mode: "add",
      vehicleId: "vehicle-work",
    });

    expect(firstVehicleKey).toBe("rootine.affairs-editor-draft.vehicleItem.add.new.vehicle-family");
    expect(secondVehicleKey).toBe("rootine.affairs-editor-draft.vehicleItem.add.new.vehicle-work");
    expect(secondVehicleKey).not.toBe(firstVehicleKey);
  });

  it.each([
    ["oneTime", "finance-one-time"],
    ["payments", "finance-recurring"],
    ["subscriptions", "finance-recurring"],
    ["budget", "finances"],
  ] as const)("redirects the legacy %s view into the unified finances register", (legacyView, expectedView) => {
    window.history.replaceState({}, "", `/sprawy?widok=${legacyView}`);
    expect(getInitialView()).toBe(expectedView);
  });

  it("uses semantic danger only for overdue dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00"));

    expect(dueCopy("2026-08-10")).toMatchObject({ tone: "danger" });
    expect(dueCopy("2026-08-11")).toMatchObject({ tone: "warning" });
    expect(dueCopy("2026-08-20")).toMatchObject({ tone: "neutral" });
    expect(dueCopy("")).toMatchObject({ tone: "neutral" });
  });
});
