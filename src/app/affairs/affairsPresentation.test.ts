import { afterEach, describe, expect, it } from "vitest";

import {
  AFFAIRS_VIEW_ARCHETYPE,
  NAV_GROUPS,
  getAffairsEditorDraftKey,
  getInitialView,
} from "./affairsPresentation";

const initialUrl = window.location.href;

afterEach(() => {
  window.history.replaceState({}, "", initialUrl);
});

describe("affairs presentation architecture", () => {
  it("keeps the approved information architecture in one ordered source of truth", () => {
    expect(NAV_GROUPS.map((group) => ({
      label: group.label,
      views: group.items.map((item) => item.view),
    }))).toEqual([
      { label: "Sprawy", views: ["today", "week", "all"] },
      { label: "Finanse", views: ["finances"] },
      { label: "Rejestry", views: ["documents", "vehicles"] },
      { label: "Obszary", views: ["jdg"] },
    ]);
  });

  it("maps every destination to one of the three shared view archetypes", () => {
    expect(AFFAIRS_VIEW_ARCHETYPE).toEqual({
      today: "agenda",
      week: "agenda",
      all: "agenda",
      finances: "register",
      documents: "register",
      vehicles: "register",
      jdg: "workspace",
    });
  });

  it.each([
    ["overview", "today"],
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
    ["oneTime", "finances"],
    ["payments", "finances"],
    ["subscriptions", "finances"],
    ["budget", "finances"],
  ] as const)("redirects the legacy %s view into the unified finances register", (legacyView, expectedView) => {
    window.history.replaceState({}, "", `/sprawy?widok=${legacyView}`);
    expect(getInitialView()).toBe(expectedView);
  });
});
