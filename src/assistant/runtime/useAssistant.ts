import { useContext } from "react";
import { AssistantRuntimeContext } from "./assistant-runtime-context";

export function useAssistant() {
  const context = useContext(AssistantRuntimeContext);
  if (!context) throw new Error("useAssistant must be used inside AssistantProvider.");
  return context;
}
