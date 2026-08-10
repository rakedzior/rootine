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
      { label: "Plan", views: ["today", "week", "all"] },
      { label: "Finanse", views: ["oneTime", "payments", "subscriptions", "budget"] },
      { label: "Rejestry", views: ["documents", "vehicles"] },
      { label: "Obszary", views: ["jdg", "travel"] },
    ]);
  });

  it("maps every destination to one of the three shared view archetypes", () => {
    expect(AFFAIRS_VIEW_ARCHETYPE).toEqual({
      today: "agenda",
      week: "agenda",
      all: "register",
      oneTime: "register",
      payments: "register",
      subscriptions: "register",
      documents: "register",
      vehicles: "register",
      budget: "workspace",
      jdg: "workspace",
      travel: "workspace",
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
    }, "2026-08");
    const secondVehicleKey = getAffairsEditorDraftKey({
      kind: "vehicleItem",
      mode: "add",
      vehicleId: "vehicle-work",
    }, "2026-08");

    expect(firstVehicleKey).toBe("rootine.affairs-editor-draft.vehicleItem.add.new.vehicle-family");
    expect(secondVehicleKey).toBe("rootine.affairs-editor-draft.vehicleItem.add.new.vehicle-work");
    expect(secondVehicleKey).not.toBe(firstVehicleKey);
  });

  it("isolates new budget-line drafts by their canonical month", () => {
    const augustKey = getAffairsEditorDraftKey({ kind: "budget", mode: "add" }, "2026-08");
    const septemberKey = getAffairsEditorDraftKey({ kind: "budget", mode: "add" }, "2026-09");

    expect(augustKey).toBe("rootine.affairs-editor-draft.budget.add.new.2026-08");
    expect(septemberKey).toBe("rootine.affairs-editor-draft.budget.add.new.2026-09");
    expect(septemberKey).not.toBe(augustKey);
  });
});
