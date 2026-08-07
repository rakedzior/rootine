import { afterEach, describe, expect, it } from "vitest";

import {
  AFFAIRS_VIEW_ARCHETYPE,
  NAV_GROUPS,
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
});
