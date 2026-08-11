import { describe, expect, it } from "vitest";
import { createDefaultAffairsWorkspace } from "../data/affairsWorkspace";
import { createDefaultJdgWorkspace } from "../data/jdgWorkspace";
import type { TravelWorkspace } from "../data/travelWorkspace";
import { buildAffairAttentionItems, resolveAffairAttentionItem, type AffairAttentionItem } from "./affairsAttention";

const EMPTY_TRAVEL: TravelWorkspace = {
  version: 2,
  updatedAt: "2026-08-06T08:00:00.000Z",
  trips: [],
};

describe("affairs attention", () => {
  it("keeps an overdue register alert visible until it is explicitly resolved", () => {
    const affairs = createDefaultAffairsWorkspace();
    affairs.matters = [];
    affairs.oneTimePayments = [];
    affairs.payments = [];
    affairs.subscriptions = [];
    affairs.vehicles = [];
    affairs.vehicleItems = [];
    affairs.documents = [{
      id: "passport",
      name: "Paszport",
      category: "identity",
      holder: "Ja",
      expiresAt: "2026-08-01",
      reminderDays: 30,
      note: "",
    }];

    const now = new Date("2026-08-06T12:00:00");
    const jdg = createDefaultJdgWorkspace(now);
    jdg.months = [];
    const first = buildAffairAttentionItems(affairs, jdg, EMPTY_TRAVEL, now);
    expect(first.map((item) => item.key)).toContain("document:passport:2026-08-01");

    affairs.attentionStates = [{
      key: "document:passport:2026-08-01",
      status: "resolved",
      snoozedUntil: "",
      updatedAt: "2026-08-06T12:05:00.000Z",
    }];
    expect(buildAffairAttentionItems(affairs, jdg, EMPTY_TRAVEL, now)).toHaveLength(0);
  });

  it("uses a changed source date as a fresh alert occurrence", () => {
    const affairs = createDefaultAffairsWorkspace();
    affairs.matters = [];
    affairs.oneTimePayments = [];
    affairs.payments = [];
    affairs.subscriptions = [];
    affairs.vehicles = [];
    affairs.vehicleItems = [];
    affairs.documents = [{
      id: "passport",
      name: "Paszport",
      category: "identity",
      holder: "Ja",
      expiresAt: "2026-08-20",
      reminderDays: 30,
      note: "",
    }];
    affairs.attentionStates = [{
      key: "document:passport:2026-08-01",
      status: "resolved",
      snoozedUntil: "",
      updatedAt: "2026-08-06T12:05:00.000Z",
    }];
    const now = new Date("2026-08-06T12:00:00");
    const jdg = createDefaultJdgWorkspace(now);
    jdg.months = [];

    expect(buildAffairAttentionItems(affairs, jdg, EMPTY_TRAVEL, now).map((item) => item.key))
      .toContain("document:passport:2026-08-20");
  });

  it("marks the originating specialist record complete", () => {
    const affairs = createDefaultAffairsWorkspace();
    const payment = affairs.oneTimePayments[0];
    const jdg = createDefaultJdgWorkspace(new Date("2026-08-06T12:00:00"));
    const item: AffairAttentionItem = {
      key: `oneTime:${payment.id}:${payment.dueDate}`,
      sourceId: payment.id,
      kind: "oneTime",
      view: "finances",
      title: payment.title,
      meta: "Płatność jednorazowa",
      dueDate: payment.dueDate,
      time: "",
      amount: payment.amount,
      canSchedule: true,
    };

    const resolved = resolveAffairAttentionItem(
      affairs,
      jdg,
      EMPTY_TRAVEL,
      item,
      new Date("2026-08-06T12:00:00.000Z"),
    );

    expect(resolved.affairs.oneTimePayments.find((candidate) => candidate.id === payment.id)).toMatchObject({
      paid: true,
      paidAt: "2026-08-06T12:00:00.000Z",
    });
  });

  it("completes a travel task in its source trip", () => {
    const affairs = createDefaultAffairsWorkspace();
    const jdg = createDefaultJdgWorkspace(new Date("2026-08-06T12:00:00"));
    const travel: TravelWorkspace = {
      version: 2,
      updatedAt: "2026-08-06T08:00:00.000Z",
      trips: [{
        id: "trip-1",
        name: "Wyjazd",
        destination: "Gdańsk",
        startDate: "2026-08-20",
        endDate: "2026-08-22",
        status: "planning",
        travelers: ["Ja"],
        baseCurrency: "PLN",
        note: "",
        archivedAt: null,
        stays: [],
        transports: [],
        itinerary: [],
        documents: [],
        budget: [],
        tasks: [{ id: "task-1", title: "Kupić bilet", category: "booking", dueDate: "2026-08-10", completed: false }],
      }],
    };
    const item: AffairAttentionItem = {
      key: "travel:trip-1:task-1:2026-08-10",
      sourceId: "task-1",
      containerId: "trip-1",
      kind: "travel",
      view: "travel",
      title: "Kupić bilet",
      meta: "Podróż · Wyjazd",
      dueDate: "2026-08-10",
      time: "",
      amount: null,
      canSchedule: true,
    };

    const resolved = resolveAffairAttentionItem(affairs, jdg, travel, item);
    expect(resolved.travel.trips[0].tasks[0].completed).toBe(true);
  });
});
