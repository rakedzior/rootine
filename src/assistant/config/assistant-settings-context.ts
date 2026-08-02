import { createContext } from "react";
import type { AssistantSettings } from "./assistant-settings";

export type AssistantSettingsContextValue = {
  settings: AssistantSettings;
  updateSettings: (update: (current: AssistantSettings) => AssistantSettings) => boolean;
  resetSettings: () => boolean;
  accessToken: string;
  setAccessToken: (token: string) => boolean;
};

export const AssistantSettingsContext = createContext<AssistantSettingsContextValue | null>(null);
