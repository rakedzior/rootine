import type { AssistantScope, AssistantToolRisk } from "../core/types";
import type { AssistantSettings } from "../config/assistant-settings";

export type AssistantPermissionDecision =
  | { allowed: true }
  | { allowed: false; code: "PERMISSION"; message: string };

export function canUseAssistantTool(
  settings: AssistantSettings,
  scopes: readonly AssistantScope[],
  risk: AssistantToolRisk,
): AssistantPermissionDecision {
  if (!settings.assistantEnabled) {
    return { allowed: false, code: "PERMISSION", message: "Asystent jest wyłączony w ustawieniach." };
  }
  if (risk === "destructive") {
    return { allowed: false, code: "PERMISSION", message: "Operacje destrukcyjne nie są dostępne w tej wersji." };
  }
  const isWrite = risk !== "read";
  if (isWrite && !settings.assistantWritesEnabled) {
    return { allowed: false, code: "PERMISSION", message: "Zapisy asystenta są wyłączone." };
  }
  if (scopes.includes("finance") && !settings.assistantFinanceEnabled) {
    return { allowed: false, code: "PERMISSION", message: "Włącz dostęp do finansów w ustawieniach asystenta." };
  }
  if (scopes.includes("notes") && !settings.assistantNotesEnabled) {
    return { allowed: false, code: "PERMISSION", message: "Włącz dostęp do notatek w ustawieniach asystenta." };
  }
  if (scopes.includes("presentation") && risk === "read" && !settings.assistantPanelsEnabled) {
    return { allowed: false, code: "PERMISSION", message: "Panele asystenta są wyłączone w ustawieniach." };
  }
  const denied = scopes.find((scope) => {
    const permission = settings.permissions[scope];
    // A write is never allowed to bypass the corresponding read boundary:
    // the assistant must first resolve the exact record it is about to change.
    return isWrite ? !permission.read || !permission.write : !permission.read;
  });
  if (denied) {
    return {
      allowed: false,
      code: "PERMISSION",
      message: `Brak uprawnienia ${isWrite ? "odczytu i zapisu" : "odczytu"} dla zakresu „${denied}”.`,
    };
  }
  return { allowed: true };
}
