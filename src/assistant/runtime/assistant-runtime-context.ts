import { createContext } from "react";
import type { PendingAssistantConfirmation } from "../confirmations/confirmation-manager";
import type { AssistantApplicationContext } from "../core/types";
import type { AssistantView } from "../panels/panel-schemas";
import type { AssistantPanelInteraction } from "../ui/AssistantPanelRenderer";
import type { AssistantUndoNotice } from "../ui/AssistantUndoToast";
import type { AssistantAvailability } from "./assistant-availability";
import type { AssistantMachineState } from "./assistant-machine";

export type AssistantRuntimeContextValue = {
  state: AssistantMachineState;
  isOpen: boolean;
  availability: AssistantAvailability;
  view: AssistantView | null;
  pendingConfirmation: PendingAssistantConfirmation | null;
  undoNotice: AssistantUndoNotice | null;
  analyser: AnalyserNode | null;
  canOpen: boolean;
  openAssistant: () => void;
  closeAssistant: () => Promise<void>;
  startVoice: () => Promise<void>;
  sendText: (text: string) => Promise<void>;
  cancelResponse: () => void;
  toggleAudio: () => void;
  startPushToTalk: () => Promise<void>;
  stopPushToTalk: () => void;
  cancelPushToTalk: () => void;
  retry: () => Promise<void>;
  resolveConfirmation: (confirmationId: string, approved: boolean) => Promise<void>;
  undo: (token: string) => Promise<void>;
  dismissUndo: () => void;
  handlePanelInteraction: (interaction: AssistantPanelInteraction) => void;
  updateAppContext: (context: AssistantApplicationContext) => void;
  refreshAvailability: () => Promise<void>;
};

export const AssistantRuntimeContext = createContext<AssistantRuntimeContextValue | null>(null);
