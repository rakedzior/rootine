import type { PendingAssistantConfirmation } from "../confirmations/confirmation-manager";
import type { AssistantExecutedToolCall } from "../tools/tool-executor";
import { panelTypeForTool } from "./panel-catalog";
import {
  assistantPanelSpecSchema,
  type AssistantPanelItem,
  type AssistantPanelMetric,
  type AssistantPanelSpec,
} from "./panel-schemas";

function createPanelId(toolName: string) {
  return `assistant-${toolName}-${Date.now().toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function titleFor(value: Record<string, unknown>) {
  return readString(value.title) ?? readString(value.name) ?? readString(value.label) ?? String(value.id ?? "Element");
}

function itemFor(value: unknown): AssistantPanelItem | null {
  if (!isRecord(value)) return null;
  const id = String(value.id ?? value.entityId ?? "");
  if (!id) return null;
  const completed = readBoolean(value.completed);
  const overdue = readBoolean(value.overdue);
  const rawStatus = readString(value.status);
  const status = completed
    ? "done" as const
    : overdue
      ? "overdue" as const
      : rawStatus === "done" || rawStatus === "completed"
        ? "done" as const
        : rawStatus === "overdue"
          ? "overdue" as const
          : rawStatus === "scheduled"
            ? "scheduled" as const
            : "open" as const;
  const date = readString(value.date) ?? readString(value.dueDate);
  const time = readString(value.time);
  const context = readString(value.context) ?? readString(value.snippet);
  const meta = [date, time, context].filter(Boolean).join(" · ") || undefined;
  const rawValue = value.value;
  return {
    id,
    label: titleFor(value),
    meta,
    status,
    value: typeof rawValue === "string" || typeof rawValue === "number" ? String(rawValue) : undefined,
  };
}

function itemsFrom(value: unknown, keys = ["items"]): AssistantPanelItem[] {
  if (!isRecord(value)) return [];
  return keys.flatMap((key) => {
    const collection = value[key];
    return Array.isArray(collection) ? collection.map(itemFor).filter((item): item is AssistantPanelItem => item !== null) : [];
  }).slice(0, 12);
}

function metric(
  id: string,
  label: string,
  value: unknown,
  unit?: string,
  tone?: AssistantPanelMetric["tone"],
  sensitive?: boolean,
): AssistantPanelMetric | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  return { id, label, value, unit, tone, sensitive };
}

function compactMetrics(metrics: Array<AssistantPanelMetric | null>) {
  return metrics.filter((value): value is AssistantPanelMetric => value !== null).slice(0, 8);
}

function queryPanel(toolName: string, value: unknown): AssistantPanelSpec {
  const record = isRecord(value) ? value : {};
  const id = createPanelId(toolName);

  if (toolName === "get_today_overview") {
    const counts = isRecord(record.counts) ? record.counts : {};
    const priorityItems = Array.isArray(record.priorityItems)
      ? record.priorityItems.map(itemFor).filter((item): item is AssistantPanelItem => item !== null)
      : [];
    return assistantPanelSpecSchema.parse({
      id,
      type: "today_overview",
      title: "Twój dzień",
      emphasis: "primary",
      entityIds: priorityItems.map((item) => item.id),
      data: {
        metrics: compactMetrics([
          metric("tasks", "Zadania", counts.tasks),
          metric("habits", "Nawyki", counts.habits),
          metric("work", "Praca", counts.work),
          metric("workouts", "Treningi", counts.workouts),
          metric("overdue", "Zaległe", counts.overdue, undefined, Number(counts.overdue) > 0 ? "warning" : "neutral"),
        ]),
        items: priorityItems,
        summary: priorityItems.length ? "Trzy elementy o najwyższym priorytecie." : "Brak pilnych elementów w dostępnych zakresach.",
      },
    });
  }

  if (toolName === "get_nutrition_summary") {
    const totals = isRecord(record.totals) ? record.totals : {};
    const goals = isRecord(record.goals) ? record.goals : {};
    return assistantPanelSpecSchema.parse({
      id,
      type: "nutrition_summary",
      title: `Odżywianie · ${readString(record.date) ?? "wybrany dzień"}`,
      data: {
        metrics: compactMetrics([
          metric("calories", "Kalorie", totals.calories, "kcal", "primary"),
          metric("remaining", "Pozostało", record.remainingCalories, "kcal"),
          metric("protein", "Białko", totals.protein, "g"),
          metric("carbs", "Węglowodany", totals.carbs, "g"),
          metric("fat", "Tłuszcz", totals.fat, "g"),
          metric("water", "Woda", record.waterMl, "ml"),
          metric("water-goal", "Cel wody", goals.waterMl, "ml"),
        ]),
        items: [],
        summary: readBoolean(record.sampleDataIgnored) ? "Dane przykładowe zostały pominięte." : undefined,
      },
    });
  }

  if (toolName === "get_water_summary") {
    return assistantPanelSpecSchema.parse({
      id,
      type: "water_summary",
      title: "Nawodnienie",
      data: {
        metrics: compactMetrics([
          metric("water", "Wypito", record.waterMl, "ml", "primary"),
          metric("remaining", "Pozostało", record.remainingMl, "ml"),
          metric("goal", "Cel", record.goalMl, "ml"),
        ]),
        items: [],
      },
    });
  }

  if (toolName === "search_food_products") {
    const candidates = itemsFrom(record).map((item) => ({ ...item, status: "open" as const }));
    return assistantPanelSpecSchema.parse({
      id,
      type: "clarification",
      title: "Wybierz produkt",
      entityIds: candidates.map((item) => item.id),
      data: {
        metrics: [],
        items: candidates,
        total: readNumber(record.total) ?? candidates.length,
        prompt: "Wybierz dokładne dopasowanie z katalogu. Dopiero ono może być użyte w szkicu posiłku.",
      },
    });
  }

  if (toolName === "get_body_summary") {
    const weight = isRecord(record.latestWeight) ? record.latestWeight : null;
    const measurements = Array.isArray(record.latestMeasurements) ? record.latestMeasurements : [];
    return assistantPanelSpecSchema.parse({
      id,
      type: "body_summary",
      title: "Ostatnie pomiary",
      data: {
        metrics: compactMetrics([
          weight ? metric("weight", "Waga", weight.value, readString(weight.unit) ?? "kg", "primary", true) : null,
          ...measurements.map((measurement, index) => {
            const item = isRecord(measurement) ? measurement : {};
            return metric(`measurement-${index}`, readString(item.type) ?? "Pomiar", item.value, readString(item.unit) ?? "cm", undefined, true);
          }),
        ]),
        items: [],
        emptyMessage: weight || measurements.length ? undefined : "Brak zapisanych pomiarów.",
      },
    });
  }

  if (toolName === "get_sport_summary") {
    const items = itemsFrom(record, ["today", "upcoming"]);
    return assistantPanelSpecSchema.parse({
      id,
      type: "sport_summary",
      title: "Plan treningowy",
      entityIds: items.map((item) => item.id),
      data: { metrics: [], items, total: items.length, emptyMessage: "Brak treningu w wybranym zakresie." },
    });
  }

  if (toolName === "get_work_summary") {
    const open = itemsFrom(record, ["open"]);
    const overdue = itemsFrom(record, ["overdue"]);
    return assistantPanelSpecSchema.parse({
      id,
      type: "work_summary",
      title: "Praca",
      entityIds: open.map((item) => item.id),
      data: {
        metrics: compactMetrics([
          metric("open", "Otwarte", open.length),
          metric("overdue", "Zaległe", overdue.length, undefined, overdue.length ? "warning" : "neutral"),
          metric("projects", "Aktywne projekty", record.activeProjects),
        ]),
        items: open,
      },
    });
  }

  if (toolName === "get_goals_summary" || toolName === "get_goal_details") {
    const items = toolName === "get_goal_details"
      ? [itemFor(record.goal)].filter((item): item is AssistantPanelItem => item !== null)
      : itemsFrom(record, ["active", "atRisk"]);
    return assistantPanelSpecSchema.parse({
      id,
      type: "goal_summary",
      title: toolName === "get_goal_details" ? "Szczegóły celu" : "Cele",
      entityIds: items.map((item) => item.id),
      data: { metrics: [], items, total: items.length, emptyMessage: "Brak aktywnych celów w tym widoku." },
    });
  }

  if (toolName === "get_matters_summary") {
    const open = itemsFrom(record, ["open"]);
    const overdue = itemsFrom(record, ["overdue"]);
    return assistantPanelSpecSchema.parse({
      id,
      type: "matter_summary",
      title: "Sprawy",
      entityIds: open.map((item) => item.id),
      data: {
        metrics: compactMetrics([
          metric("open", "Otwarte", open.length),
          metric("overdue", "Zaległe", overdue.length, undefined, overdue.length ? "warning" : "neutral"),
        ]),
        items: open,
      },
    });
  }

  if (toolName === "get_finance_summary" || toolName === "get_unpaid_items") {
    const items = itemsFrom(record);
    return assistantPanelSpecSchema.parse({
      id,
      type: "finance_summary",
      title: "Płatności",
      entityIds: items.map((item) => item.id),
      data: {
        metrics: compactMetrics([
          metric("unpaid", "Nieopłacone", record.total),
          metric("overdue", "Po terminie", record.overdue, undefined, Number(record.overdue) ? "warning" : "neutral"),
          metric("amount", "Łączna kwota", record.totalAmount, "zł", undefined, true),
        ]),
        items,
        summary: readBoolean(record.amountsRedacted) ? "Kwoty ukryto zgodnie z ustawieniem zapytania." : undefined,
      },
    });
  }

  const type = panelTypeForTool(toolName) ?? (toolName.includes("travel") || toolName.includes("matter") ? "matter_summary" : "task_candidates");
  const items = itemsFrom(record);
  return assistantPanelSpecSchema.parse({
    id,
    type,
    title: toolName.startsWith("search_") ? "Wyniki wyszukiwania" : undefined,
    entityIds: items.map((item) => item.id),
    data: {
      metrics: [],
      items,
      total: readNumber(record.total) ?? items.length,
      emptyMessage: "Brak wyników w dostępnym zakresie.",
    },
  });
}

function mealDraftPanel(toolName: string, value: Record<string, unknown>): AssistantPanelSpec | null {
  const draft = isRecord(value.draft) ? value.draft : null;
  if (!draft || !Array.isArray(draft.ingredients)) return null;
  const totals = isRecord(draft.totals) ? draft.totals : {};
  const ingredients = draft.ingredients.flatMap((ingredient) => {
    if (!isRecord(ingredient)) return [];
    const nutrition = isRecord(ingredient.nutrition) ? ingredient.nutrition : {};
    return [{
      id: readString(ingredient.catalogId) ?? "unknown",
      name: readString(ingredient.name) ?? "Produkt",
      grams: readString(ingredient.unit) === "g" ? readNumber(ingredient.amount) : undefined,
      matched: true,
      kcal: readNumber(nutrition.calories),
      protein: readNumber(nutrition.protein),
      carbs: readNumber(nutrition.carbs),
      fat: readNumber(nutrition.fat),
    }];
  });
  return assistantPanelSpecSchema.parse({
    id: createPanelId(toolName),
    type: "meal_draft",
    title: "Szkic posiłku",
    emphasis: "primary",
    data: {
      metrics: [],
      items: [],
      draftId: readString(draft.id),
      meal: readString(draft.meal),
      ingredients,
      totals: {
        kcal: readNumber(totals.calories) ?? 0,
        protein: readNumber(totals.protein) ?? 0,
        carbs: readNumber(totals.carbs) ?? 0,
        fat: readNumber(totals.fat) ?? 0,
      },
      requiresConfirmation: true,
    },
  });
}

export function panelFromToolExecution(execution: AssistantExecutedToolCall): AssistantPanelSpec {
  const result = execution.result;
  if (!result.success) {
    if (result.code === "AMBIGUOUS" && result.candidates?.length) {
      return assistantPanelSpecSchema.parse({
        id: createPanelId(execution.name),
        type: "clarification",
        title: "Wybierz właściwy rekord",
        entityIds: result.candidates.map((candidate) => candidate.id),
        data: {
          metrics: [],
          items: result.candidates.slice(0, 8).map((candidate) => ({ id: candidate.id, label: candidate.label, meta: candidate.context, status: "open" })),
          prompt: result.message,
        },
      });
    }
    return assistantPanelSpecSchema.parse({
      id: createPanelId(execution.name),
      type: "error",
      title: result.code === "PERMISSION" ? "Brak uprawnienia" : "Nie wykonano operacji",
      emphasis: "warning",
      data: {
        metrics: [],
        items: [],
        code: result.code,
        message: result.message,
        recovery: result.code === "PERMISSION" ? "Zmień zakres w Ustawieniach → Asystent." : undefined,
        retryable: result.code === "STORAGE" || result.code === "UNAVAILABLE",
      },
    });
  }

  const value = isRecord(result.data) ? result.data : {};
  if (value.draft) {
    const panel = mealDraftPanel(execution.name, value);
    if (panel) return panel;
  }
  if (readString(value.eventId) && readString(value.undoToken)) {
    return assistantPanelSpecSchema.parse({
      id: createPanelId(execution.name),
      type: "action_result",
      title: "Zmiana zapisana",
      emphasis: "success",
      entityIds: readString(value.entityId) ? [readString(value.entityId)!] : undefined,
      data: {
        metrics: [],
        items: [],
        success: true,
        message: readString(value.message) ?? result.message ?? "Operacja zakończona.",
        undoToken: readString(value.undoToken),
        undoExpiresAt: new Date(Date.now() + 10_000).toISOString(),
      },
    });
  }
  return queryPanel(execution.name, result.data);
}

export function panelFromConfirmation(pending: PendingAssistantConfirmation): AssistantPanelSpec {
  return assistantPanelSpecSchema.parse({
    id: `confirmation-${pending.id}`,
    type: "confirmation",
    title: "Potwierdź operację",
    emphasis: "warning",
    data: {
      metrics: [],
      items: [],
      confirmationId: pending.id,
      operation: pending.operation,
      record: pending.record,
      previousValue: pending.previousValue,
      nextValue: pending.nextValue,
      expiresAt: pending.expiresAt,
    },
  });
}
