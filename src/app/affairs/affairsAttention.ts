import {
  advancePaymentDate,
  setAffairAttentionState,
  setMatterCompletionState,
  setOneTimePaymentPaidState,
  type AffairsWorkspace,
} from "../data/affairsWorkspace";
import type { JdgWorkspace } from "../data/jdgWorkspace";
import { setTravelTaskCompletionState, type TravelWorkspace } from "../data/travelWorkspace";
import type { AffairsView } from "./affairsPresentation";

export type AffairAttentionKind =
  | "matter"
  | "oneTime"
  | "payment"
  | "subscription"
  | "document"
  | "vehicle"
  | "jdg"
  | "travel";

export type AffairAttentionItem = {
  key: string;
  sourceId: string;
  containerId?: string;
  kind: AffairAttentionKind;
  view: AffairsView;
  title: string;
  meta: string;
  dueDate: string;
  time: string;
  amount: number | null;
  canSchedule: boolean;
};

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function dateForMonthDay(month: string, day: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return "";
  const lastDay = new Date(year, monthNumber, 0, 12).getDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function isVisibleByDate(dueDate: string, today: string, leadDays: number): boolean {
  const days = daysBetween(today, dueDate);
  return Number.isFinite(days) && days <= leadDays;
}

export function buildAffairAttentionItems(
  affairs: AffairsWorkspace,
  jdg: JdgWorkspace,
  travel: TravelWorkspace,
  now = new Date(),
): AffairAttentionItem[] {
  const today = localDateKey(now);
  const states = new Map((affairs.attentionStates ?? []).map((state) => [state.key, state]));
  const items: AffairAttentionItem[] = [];

  const add = (item: AffairAttentionItem) => {
    if (!item.dueDate) return;
    const state = states.get(item.key);
    if (state?.status === "resolved") return;
    if (state?.status === "snoozed" && state.snoozedUntil > today) return;
    items.push(item);
  };

  affairs.matters
    .filter((matter) => matter.status !== "done" && isVisibleByDate(matter.dueDate, today, 30))
    .forEach((matter) => add({
      key: `matter:${matter.id}:${matter.dueDate}:${matter.time ?? ""}`,
      sourceId: matter.id,
      kind: "matter",
      view: "matters",
      title: matter.title,
      meta: matter.kind === "appointment"
        ? [matter.time, matter.location].filter(Boolean).join(" · ") || "Wizyta"
        : "Sprawa do załatwienia",
      dueDate: matter.dueDate,
      time: matter.time ?? "",
      amount: null,
      canSchedule: false,
    }));

  affairs.oneTimePayments
    .filter((payment) => !payment.paid && isVisibleByDate(payment.dueDate, today, 30))
    .forEach((payment) => add({
      key: `oneTime:${payment.id}:${payment.dueDate}`,
      sourceId: payment.id,
      kind: "oneTime",
      view: "oneTime",
      title: payment.title,
      meta: `Płatność jednorazowa · ${payment.category}`,
      dueDate: payment.dueDate,
      time: "",
      amount: payment.amount,
      canSchedule: true,
    }));

  affairs.payments
    .filter((payment) => payment.active && !payment.automatic && isVisibleByDate(payment.nextDueDate, today, 30))
    .forEach((payment) => add({
      key: `payment:${payment.id}:${payment.nextDueDate}`,
      sourceId: payment.id,
      kind: "payment",
      view: "payments",
      title: payment.name,
      meta: `Płatność cykliczna · ${payment.category}`,
      dueDate: payment.nextDueDate,
      time: "",
      amount: payment.amount,
      canSchedule: true,
    }));

  affairs.subscriptions
    .filter((subscription) => subscription.active && subscription.renewal === "manual" && isVisibleByDate(subscription.nextBillingDate, today, 30))
    .forEach((subscription) => add({
      key: `subscription:${subscription.id}:${subscription.nextBillingDate}`,
      sourceId: subscription.id,
      kind: "subscription",
      view: "subscriptions",
      title: subscription.name,
      meta: `Odnowienie ręczne · ${subscription.category}`,
      dueDate: subscription.nextBillingDate,
      time: "",
      amount: subscription.amount,
      canSchedule: true,
    }));

  affairs.documents
    .filter((document) => document.expiresAt && isVisibleByDate(document.expiresAt, today, document.reminderDays))
    .forEach((document) => add({
      key: `document:${document.id}:${document.expiresAt}`,
      sourceId: document.id,
      kind: "document",
      view: "documents",
      title: document.name,
      meta: `Ważność dokumentu · ${document.holder}`,
      dueDate: document.expiresAt,
      time: "",
      amount: null,
      canSchedule: true,
    }));

  affairs.vehicleItems
    .filter((item) => {
      if (item.done) return false;
      const vehicle = affairs.vehicles.find((candidate) => candidate.id === item.vehicleId);
      const dateNear = item.dueDate && isVisibleByDate(item.dueDate, today, 30);
      const mileageNear = item.dueMileage !== null && vehicle && item.dueMileage <= vehicle.mileage + 1_000;
      return Boolean(dateNear || mileageNear);
    })
    .forEach((item) => {
      const vehicle = affairs.vehicles.find((candidate) => candidate.id === item.vehicleId);
      add({
        key: `vehicle:${item.id}:${item.dueDate || (item.dueMileage ?? "mileage")}`,
        sourceId: item.id,
        kind: "vehicle",
        view: "vehicles",
        title: item.title,
        meta: vehicle?.name ?? "Pojazd",
        dueDate: item.dueDate || today,
        time: "",
        amount: null,
        canSchedule: true,
      });
    });

  jdg.months.forEach((month) => {
    month.items
      .filter((item) => !item.done && item.dueDay !== null)
      .forEach((item) => {
        const dueDate = dateForMonthDay(month.month, item.dueDay!);
        if (!isVisibleByDate(dueDate, today, 7)) return;
        add({
          key: `jdg:${month.month}:${item.id}:${dueDate}`,
          sourceId: item.id,
          containerId: month.month,
          kind: "jdg",
          view: "jdg",
          title: item.label,
          meta: `JDG · ${month.month}`,
          dueDate,
          time: "",
          amount: null,
          canSchedule: true,
        });
      });
  });

  travel.trips
    .filter((trip) => trip.status !== "completed" && !trip.archivedAt)
    .forEach((trip) => trip.tasks
      .filter((task) => !task.completed && task.dueDate && isVisibleByDate(task.dueDate, today, 30))
      .forEach((task) => add({
        key: `travel:${trip.id}:${task.id}:${task.dueDate}`,
        sourceId: task.id,
        containerId: trip.id,
        kind: "travel",
        view: "travel",
        title: task.title,
        meta: `Podróż · ${trip.name}`,
        dueDate: task.dueDate,
        time: "",
        amount: null,
        canSchedule: true,
      })));

  return items.sort((a, b) => (
    a.dueDate.localeCompare(b.dueDate)
    || a.time.localeCompare(b.time)
    || a.title.localeCompare(b.title, "pl")
  ));
}

export function resolveAffairAttentionItem(
  affairs: AffairsWorkspace,
  jdg: JdgWorkspace,
  travel: TravelWorkspace,
  item: AffairAttentionItem,
  completedAt = new Date(),
): { affairs: AffairsWorkspace; jdg: JdgWorkspace; travel: TravelWorkspace } {
  if (item.kind === "matter") {
    return { affairs: setMatterCompletionState(affairs, item.sourceId, true), jdg, travel };
  }
  if (item.kind === "oneTime") {
    return { affairs: setOneTimePaymentPaidState(affairs, item.sourceId, true, completedAt.toISOString()), jdg, travel };
  }
  if (item.kind === "payment") {
    return {
      affairs: {
        ...affairs,
        payments: affairs.payments.map((payment) => payment.id === item.sourceId
          ? { ...payment, nextDueDate: advancePaymentDate(payment.nextDueDate, payment.cadence) }
          : payment),
      },
      jdg,
      travel,
    };
  }
  if (item.kind === "subscription") {
    return {
      affairs: {
        ...affairs,
        subscriptions: affairs.subscriptions.map((subscription) => subscription.id === item.sourceId
          ? { ...subscription, nextBillingDate: advancePaymentDate(subscription.nextBillingDate, subscription.cadence) }
          : subscription),
      },
      jdg,
      travel,
    };
  }
  if (item.kind === "vehicle") {
    return {
      affairs: {
        ...affairs,
        vehicleItems: affairs.vehicleItems.map((vehicleItem) => vehicleItem.id === item.sourceId
          ? { ...vehicleItem, done: true }
          : vehicleItem),
      },
      jdg,
      travel,
    };
  }
  if (item.kind === "jdg" && item.containerId) {
    return {
      affairs,
      jdg: {
        ...jdg,
        months: jdg.months.map((month) => month.month === item.containerId
          ? {
              ...month,
              items: month.items.map((checklistItem) => checklistItem.id === item.sourceId
                ? { ...checklistItem, done: true, doneAt: completedAt.toISOString() }
                : checklistItem),
            }
          : month),
      },
      travel,
    };
  }
  if (item.kind === "travel" && item.containerId) {
    return {
      affairs,
      jdg,
      travel: setTravelTaskCompletionState(travel, item.containerId, item.sourceId, true),
    };
  }

  return {
    affairs: setAffairAttentionState(affairs, {
      key: item.key,
      status: "resolved",
      snoozedUntil: "",
      updatedAt: completedAt.toISOString(),
    }),
    jdg,
    travel,
  };
}
