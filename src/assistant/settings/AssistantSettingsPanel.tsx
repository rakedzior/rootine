import { useId } from "react";
import { KeyRound, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { clearAssistantCommandHistory, type AssistantSettings } from "../config/assistant-settings";
import { useAssistantSettings } from "../config/useAssistantSettings";
import type { AssistantScope } from "../core/types";
import type { AssistantAvailability } from "../runtime/assistant-availability";

const MODULE_SCOPES: ReadonlyArray<{ scope: AssistantScope; label: string; sensitive?: boolean }> = [
  { scope: "tasks", label: "Zadania" },
  { scope: "habits", label: "Nawyki" },
  { scope: "nutrition", label: "Odżywianie" },
  { scope: "body_data", label: "Dane ciała", sensitive: true },
  { scope: "sport", label: "Sport" },
  { scope: "work", label: "Praca", sensitive: true },
  { scope: "goals", label: "Cele" },
  { scope: "matters", label: "Sprawy" },
  { scope: "notes", label: "Notatki", sensitive: true },
  { scope: "finance", label: "Finanse", sensitive: true },
];

function updateSensitiveFeatureFlag(
  settings: AssistantSettings,
  scope: AssistantScope,
  enabled: boolean,
) {
  if (scope === "finance") return { ...settings, assistantFinanceEnabled: enabled };
  if (scope === "notes") return { ...settings, assistantNotesEnabled: enabled };
  return settings;
}

export function AssistantSettingsPanel({
  availability,
  compact = false,
}: {
  availability: AssistantAvailability;
  compact?: boolean;
}) {
  const id = useId();
  const { settings, updateSettings, resetSettings, accessToken, setAccessToken } = useAssistantSettings();
  const statusLabel = availability.status === "available" ? "Gotowy" : availability.status === "checking" ? "Sprawdzanie" : "Niedostępny";

  return (
    <section className={`assistant-settings${compact ? " is-compact" : ""}`} aria-labelledby={`${id}-title`}>
      <div className="assistant-settings__heading">
        <span>
          <strong id={`${id}-title`}>Asystent</strong>
          <small>{availability.message}</small>
        </span>
        <span className={`assistant-settings__status is-${availability.status}`}>{statusLabel}</span>
      </div>

      <div className="assistant-settings__controls">
        <label className="assistant-settings__toggle">
          <input
            type="checkbox"
            checked={settings.assistantEnabled}
            onChange={(event) => updateSettings((current) => ({ ...current, assistantEnabled: event.target.checked }))}
          />
          <span>Włącz asystenta</span>
        </label>
        <label className="assistant-settings__toggle">
          <input
            type="checkbox"
            checked={settings.voiceEnabled}
            onChange={(event) => updateSettings((current) => ({ ...current, voiceEnabled: event.target.checked }))}
          />
          <span>Odpowiedzi głosowe</span>
        </label>
        <label className="assistant-settings__toggle">
          <input
            type="checkbox"
            checked={settings.assistantWritesEnabled}
            onChange={(event) => updateSettings((current) => ({ ...current, assistantWritesEnabled: event.target.checked }))}
          />
          <span>Zezwalaj na zapisy</span>
        </label>
        <label className="assistant-settings__toggle">
          <input
            type="checkbox"
            checked={settings.assistantPanelsEnabled}
            onChange={(event) => updateSettings((current) => ({ ...current, assistantPanelsEnabled: event.target.checked }))}
          />
          <span>Panele odpowiedzi</span>
        </label>
      </div>

      <div className="assistant-settings__fields">
        <label>
          <span>Głos</span>
          <select
            value={settings.voice}
            disabled={!settings.voiceEnabled}
            onChange={(event) => updateSettings((current) => ({ ...current, voice: event.target.value as AssistantSettings["voice"] }))}
          >
            <option value="marin">Marin</option>
            <option value="cedar">Cedar</option>
          </select>
        </label>
        <label>
          <span>Mikrofon</span>
          <select
            value={settings.microphoneMode}
            onChange={(event) => updateSettings((current) => ({ ...current, microphoneMode: event.target.value as AssistantSettings["microphoneMode"] }))}
          >
            <option value="conversation">Rozmowa</option>
            <option value="push_to_talk">Push-to-talk</option>
          </select>
        </label>
        <label>
          <span>Limit sesji</span>
          <select
            value={settings.maxSessionMinutes}
            onChange={(event) => updateSettings((current) => ({ ...current, maxSessionMinutes: Number(event.target.value) }))}
          >
            <option value={5}>5 min</option>
            <option value={10}>10 min</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
          </select>
        </label>
        <label>
          <span>Prywatność głosu</span>
          <select
            value={settings.voicePrivacy}
            onChange={(event) => updateSettings((current) => ({ ...current, voicePrivacy: event.target.value as AssistantSettings["voicePrivacy"] }))}
          >
            <option value="hide_sensitive">Ukrywaj wrażliwe wartości</option>
            <option value="silent_sensitive">Nie czytaj wrażliwych paneli</option>
            <option value="standard">Zgodnie z uprawnieniami</option>
          </select>
        </label>
      </div>

      {"requiresAccessToken" in availability && availability.requiresAccessToken && (
        <label className="assistant-settings__access">
          <span><KeyRound size={13} aria-hidden="true" /> Prywatny kod dostępu</span>
          <input
            type="password"
            autoComplete="off"
            value={accessToken}
            placeholder="Tylko na czas tej karty"
            onChange={(event) => setAccessToken(event.target.value)}
          />
          <small>Kod jest przechowywany tylko w sesji tej karty. To nie jest klucz OpenAI.</small>
        </label>
      )}

      <details className="assistant-settings__permissions">
        <summary><ShieldCheck size={14} aria-hidden="true" /> Uprawnienia modułów</summary>
        <div className="assistant-settings__permission-head" aria-hidden="true">
          <span>Moduł</span><span>Odczyt</span><span>Zapis</span>
        </div>
        {MODULE_SCOPES.map(({ scope, label, sensitive }) => {
          const permission = settings.permissions[scope];
          return (
            <div className="assistant-settings__permission-row" key={scope}>
              <span>{label}{sensitive && <small> wrażliwe</small>}</span>
              <label>
                <input
                  type="checkbox"
                  aria-label={`Odczyt: ${label}`}
                  checked={permission.read}
                  onChange={(event) => updateSettings((current) => {
                    const next = {
                      ...current,
                      permissions: {
                        ...current.permissions,
                        [scope]: { ...current.permissions[scope], read: event.target.checked },
                      },
                    };
                    return updateSensitiveFeatureFlag(next, scope, event.target.checked || next.permissions[scope].write);
                  })}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  aria-label={`Zapis: ${label}`}
                  checked={permission.write}
                  onChange={(event) => updateSettings((current) => {
                    const next = {
                      ...current,
                      permissions: {
                        ...current.permissions,
                        [scope]: { ...current.permissions[scope], write: event.target.checked },
                      },
                    };
                    return updateSensitiveFeatureFlag(next, scope, event.target.checked || next.permissions[scope].read);
                  })}
                />
              </label>
            </div>
          );
        })}
      </details>

      <details className="assistant-settings__advanced">
        <summary>Zaawansowane</summary>
        <label className="assistant-settings__toggle">
          <input
            type="checkbox"
            checked={settings.autoRunReversibleWrites}
            onChange={(event) => updateSettings((current) => ({ ...current, autoRunReversibleWrites: event.target.checked }))}
          />
          <span>Automatycznie wykonuj odwracalne operacje</span>
        </label>
        <label className="assistant-settings__toggle">
          <input
            type="checkbox"
            checked={settings.rememberCommands}
            onChange={(event) => updateSettings((current) => ({ ...current, rememberCommands: event.target.checked }))}
          />
          <span>Pamiętaj do 10 ostatnich komend lokalnie</span>
        </label>
        <label className="assistant-settings__toggle">
          <input
            type="checkbox"
            checked={settings.diagnosticsEnabled}
            onChange={(event) => updateSettings((current) => ({ ...current, diagnosticsEnabled: event.target.checked }))}
          />
          <span>Anonimowa diagnostyka lokalna</span>
        </label>
        <label className="assistant-settings__toggle">
          <input
            type="checkbox"
            checked={settings.assistantDebugEnabled}
            onChange={(event) => updateSettings((current) => ({ ...current, assistantDebugEnabled: event.target.checked }))}
          />
          <span>Tryb debugowania bez treści rozmowy</span>
        </label>
        <div className="assistant-settings__actions">
          <button type="button" onClick={clearAssistantCommandHistory}><Trash2 size={13} aria-hidden="true" /> Wyczyść komendy</button>
          <button type="button" onClick={resetSettings}><RotateCcw size={13} aria-hidden="true" /> Przywróć ustawienia</button>
        </div>
      </details>

      <p className="assistant-settings__shortcut">Skrót: <kbd>Ctrl/Cmd + Space</kbd>. Mikrofon uruchamia się wyłącznie po jawnej akcji.</p>
    </section>
  );
}
