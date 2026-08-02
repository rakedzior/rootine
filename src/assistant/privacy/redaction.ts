import type { AssistantScope, AssistantToolFailure } from "../core/types";
import type { AssistantPanelSpec } from "../panels/panel-schemas";

const REDACTED_VALUE = "••••";
const REDACTED_TEXT = "Treść ukryta przez Privacy Mode";
const REDACTED_NOTE_TITLE = "Prywatna notatka";
const REDACTED_WORK_TITLE = "Prywatny element pracy";

const SENSITIVE_KEYS = new Set([
  "amount",
  "value",
  "balance",
  "budget",
  "cost",
  "price",
  "weight",
  "waist",
  "chest",
  "hips",
  "bodyFat",
  "bodyFatPercent",
]);

function redactDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    SENSITIVE_KEYS.has(key) ? REDACTED_VALUE : redactDeep(nested),
  ]));
}

export function redactToolPayloadForPrivacy(
  value: unknown,
  scopes: readonly AssistantScope[],
  privacyMode: boolean,
) {
  if (!privacyMode) return value;
  if (scopes.includes("finance") || scopes.includes("body_data")) {
    return { privacyRestricted: true, message: "Dane ukryte przez Privacy Mode." };
  }
  if (scopes.includes("notes")) {
    if (!Array.isArray(value) && value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if ("eventId" in record || "updatedSnapshot" in record) {
        return { privacyRestricted: true, message: "Treść notatki ukryta przez Privacy Mode." };
      }
      const items = Array.isArray(record.items)
        ? record.items.map((item) => {
          if (!item || typeof item !== "object") return item;
          const candidate = item as Record<string, unknown>;
          return {
            ...candidate,
            title: REDACTED_NOTE_TITLE,
            label: REDACTED_NOTE_TITLE,
            context: REDACTED_TEXT,
            snippet: REDACTED_TEXT,
            excerpt: REDACTED_TEXT,
            content: REDACTED_TEXT,
          };
        })
        : record.items;
      return { ...record, items };
    }
    return { privacyRestricted: true, message: "Treść notatek ukryta przez Privacy Mode." };
  }
  if (scopes.includes("work")) {
    if (!Array.isArray(value) && value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if ("eventId" in record || "updatedSnapshot" in record) {
        return { privacyRestricted: true, message: "Szczegóły pracy ukryte przez Privacy Mode." };
      }
      const redactWorkItems = (candidateItems: unknown) => Array.isArray(candidateItems)
        ? candidateItems.map((item) => {
          if (!item || typeof item !== "object") return item;
          const candidate = item as Record<string, unknown>;
          return { ...candidate, title: REDACTED_WORK_TITLE, label: REDACTED_WORK_TITLE, context: undefined };
        })
        : candidateItems;
      return {
        ...record,
        items: redactWorkItems(record.items),
        open: redactWorkItems(record.open),
        overdue: redactWorkItems(record.overdue),
        priorityItems: redactWorkItems(record.priorityItems),
      };
    }
  }
  return redactDeep(value);
}

const INTERNAL_TOOL_KEYS = new Set(["eventId", "undoToken", "undoExpiresAt"]);

/** Remove local recovery/refresh capabilities before serializing output to the model. */
export function stripInternalToolMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternalToolMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !INTERNAL_TOOL_KEYS.has(key))
      .map(([key, nested]) => [key, stripInternalToolMetadata(nested)]),
  );
}

export function redactToolFailureForSensitiveOutput(
  failure: AssistantToolFailure,
  scopes: readonly AssistantScope[],
): AssistantToolFailure {
  if (scopes.includes("finance") || scopes.includes("body_data")) {
    return {
      ...failure,
      message: "Operacja nie powiodła się w chronionym zakresie danych.",
      candidates: undefined,
    };
  }
  if (!failure.candidates?.length) return failure;
  if (scopes.includes("notes")) {
    return {
      ...failure,
      candidates: failure.candidates.map((candidate) => ({
        ...candidate,
        label: REDACTED_NOTE_TITLE,
        context: REDACTED_TEXT,
      })),
    };
  }
  if (scopes.includes("work")) {
    return {
      ...failure,
      candidates: failure.candidates.map((candidate) => ({
        ...candidate,
        label: REDACTED_WORK_TITLE,
        context: undefined,
      })),
    };
  }
  return failure;
}

export function redactToolPayloadForVoice(
  value: unknown,
  scopes: readonly AssistantScope[],
  mode: "standard" | "hide_sensitive" | "silent_sensitive",
) {
  if (mode === "standard") return value;
  if (scopes.includes("finance") || scopes.includes("body_data")) {
    return {
      voiceRestricted: true,
      message: mode === "silent_sensitive"
        ? "Szczegóły są dostępne wyłącznie w panelu; nie wypowiadaj ich."
        : "Opisz wynik bez kwot i pomiarów; szczegóły są w panelu.",
    };
  }
  if (scopes.includes("notes") || scopes.includes("work")) {
    return redactToolPayloadForPrivacy(value, scopes, true);
  }
  return value;
}

export function redactPanelForPrivacy(
  panel: AssistantPanelSpec,
  privacyMode: boolean,
  scopes: readonly AssistantScope[] = [],
): AssistantPanelSpec {
  if (!privacyMode) return panel;
  if (panel.type === "clarification" && scopes.some((scope) => ["notes", "work", "finance", "body_data"].includes(scope))) {
    const label = scopes.includes("notes")
      ? REDACTED_NOTE_TITLE
      : scopes.includes("work")
        ? REDACTED_WORK_TITLE
        : "Prywatny rekord";
    return {
      ...panel,
      data: {
        ...panel.data,
        items: panel.data.items.map((item) => ({ ...item, label, meta: undefined, value: undefined })),
      },
    };
  }
  if (panel.type === "finance_summary" || panel.type === "body_summary") {
    return {
      ...panel,
      data: {
        ...panel.data,
        metrics: panel.data.metrics.map((metric) => ({ ...metric, value: REDACTED_VALUE })),
        items: panel.data.items.map((item) => ({ ...item, value: REDACTED_VALUE, meta: undefined })),
        summary: "Dane ukryte przez Privacy Mode.",
      },
    };
  }
  if (panel.type === "note_results") {
    return {
      ...panel,
      data: {
        ...panel.data,
        items: panel.data.items.map((item) => ({
          ...item,
          label: REDACTED_NOTE_TITLE,
          meta: REDACTED_TEXT,
          value: undefined,
        })),
      },
    };
  }
  if (panel.type === "work_summary") {
    return {
      ...panel,
      data: {
        ...panel.data,
        items: panel.data.items.map((item) => ({ ...item, label: "Prywatny element pracy", meta: undefined })),
      },
    };
  }
  return panel;
}
