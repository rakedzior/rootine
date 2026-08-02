import { useContext } from "react";
import { AssistantSettingsContext } from "./assistant-settings-context";

export function useAssistantSettings() {
  const context = useContext(AssistantSettingsContext);
  if (!context) throw new Error("useAssistantSettings must be used inside AssistantSettingsProvider.");
  return context;
}
