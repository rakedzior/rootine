import type { AssistantToolRisk } from "../core/types";
import type { AssistantSettings } from "../config/assistant-settings";

export function requiresAssistantConfirmation(
  risk: AssistantToolRisk,
  settings: AssistantSettings,
) {
  if (risk === "confirmed_write") return true;
  if (risk === "reversible_write") return !settings.autoRunReversibleWrites;
  return false;
}
