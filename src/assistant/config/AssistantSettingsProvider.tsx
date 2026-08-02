import { useCallback, useState, type ReactNode } from "react";
import {
  createDefaultAssistantSettings,
  loadAssistantSettings,
  readAssistantAccessToken,
  saveAssistantAccessToken,
  saveAssistantSettings,
} from "./assistant-settings";
import { AssistantSettingsContext } from "./assistant-settings-context";

export function AssistantSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(loadAssistantSettings);
  const [accessToken, setAccessTokenState] = useState(readAssistantAccessToken);

  const updateSettings = useCallback((update: (current: typeof settings) => typeof settings) => {
    const next = update(settings);
    const saved = saveAssistantSettings(next);
    if (saved) setSettings(next);
    return saved;
  }, [settings]);

  const resetSettings = useCallback(() => {
    const next = createDefaultAssistantSettings();
    const saved = saveAssistantSettings(next);
    if (saved) setSettings(next);
    return saved;
  }, []);

  const setAccessToken = useCallback((token: string) => {
    const saved = saveAssistantAccessToken(token);
    if (saved) setAccessTokenState(token.trim());
    return saved;
  }, []);

  return (
    <AssistantSettingsContext.Provider value={{
      settings,
      updateSettings,
      resetSettings,
      accessToken,
      setAccessToken,
    }}>
      {children}
    </AssistantSettingsContext.Provider>
  );
}
