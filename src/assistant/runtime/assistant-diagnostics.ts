import type { AssistantSettings } from "../config/assistant-settings";

export const ASSISTANT_DIAGNOSTICS_STORAGE_KEY = "rootine.assistant.diagnostics.v1";

export type AssistantDiagnosticEvent = {
  event: "availability" | "connect" | "disconnect" | "reconnect" | "tool" | "error";
  at: string;
  durationMs?: number;
  outcome?: "success" | "failure" | "cancelled";
  category?: string;
};

const MAX_DIAGNOSTIC_EVENTS = 40;

export function recordAssistantDiagnostic(
  settings: Pick<AssistantSettings, "diagnosticsEnabled">,
  event: Omit<AssistantDiagnosticEvent, "at">,
  storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage,
) {
  if (!settings.diagnosticsEnabled || !storage) return;
  try {
    const raw = storage.getItem(ASSISTANT_DIAGNOSTICS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const previous = Array.isArray(parsed) ? parsed : [];
    const next: AssistantDiagnosticEvent[] = [
      ...previous.slice(-(MAX_DIAGNOSTIC_EVENTS - 1)),
      { ...event, at: new Date().toISOString() },
    ];
    storage.setItem(ASSISTANT_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Diagnostics are optional and may never affect the assistant runtime.
  }
}

export function debugAssistantEvent(
  settings: Pick<AssistantSettings, "assistantDebugEnabled">,
  event: string,
  metadata: Readonly<Record<string, string | number | boolean | undefined>> = {},
) {
  if (!settings.assistantDebugEnabled) return;
  // Metadata is deliberately structural: never transcripts, arguments, or tool results.
  console.debug("[Rootine Assistant]", event, metadata);
}
