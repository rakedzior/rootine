import { z } from "zod";
import { ASSISTANT_SCOPES, type AssistantScope } from "../core/types";

export const ASSISTANT_SETTINGS_STORAGE_KEY = "rootine.assistant.settings.v1";
export const ASSISTANT_COMMAND_HISTORY_KEY = "rootine.assistant.command-history.v1";
export const ASSISTANT_ACCESS_TOKEN_SESSION_KEY = "rootine.assistant.access-token";
export const ASSISTANT_SETTINGS_EVENT = "rootine:assistant-settings-change";

export const assistantPermissionSchema = z.object({
  read: z.boolean(),
  write: z.boolean(),
});

const permissionShape = Object.fromEntries(
  ASSISTANT_SCOPES.map((scope) => [scope, assistantPermissionSchema]),
) as Record<AssistantScope, typeof assistantPermissionSchema>;

export const assistantSettingsSchema = z.object({
  version: z.literal(1),
  assistantEnabled: z.boolean(),
  voiceEnabled: z.boolean(),
  assistantWritesEnabled: z.boolean(),
  assistantPanelsEnabled: z.boolean(),
  assistantFinanceEnabled: z.boolean(),
  assistantNotesEnabled: z.boolean(),
  assistantDebugEnabled: z.boolean(),
  diagnosticsEnabled: z.boolean(),
  voice: z.enum(["marin", "cedar"]),
  microphoneMode: z.enum(["conversation", "push_to_talk"]),
  maxSessionMinutes: z.number().int().min(1).max(30),
  idleTimeoutSeconds: z.number().int().min(30).max(600),
  shortcut: z.literal("mod+space"),
  voicePrivacy: z.enum(["standard", "hide_sensitive", "silent_sensitive"]),
  autoRunReversibleWrites: z.boolean(),
  rememberCommands: z.boolean(),
  permissions: z.object(permissionShape),
});

export type AssistantPermission = z.infer<typeof assistantPermissionSchema>;
export type AssistantSettings = z.infer<typeof assistantSettingsSchema>;

function permission(read: boolean, write: boolean): AssistantPermission {
  return { read, write };
}

export function createDefaultAssistantSettings(): AssistantSettings {
  return {
    version: 1,
    assistantEnabled: true,
    voiceEnabled: true,
    assistantWritesEnabled: true,
    assistantPanelsEnabled: true,
    assistantFinanceEnabled: false,
    assistantNotesEnabled: false,
    assistantDebugEnabled: false,
    diagnosticsEnabled: true,
    voice: "marin",
    microphoneMode: "conversation",
    maxSessionMinutes: 10,
    idleTimeoutSeconds: 120,
    shortcut: "mod+space",
    voicePrivacy: "hide_sensitive",
    autoRunReversibleWrites: true,
    rememberCommands: false,
    permissions: {
      today: permission(true, false),
      tasks: permission(true, true),
      habits: permission(true, true),
      nutrition: permission(true, true),
      body_data: permission(false, false),
      sport: permission(true, true),
      work: permission(true, true),
      goals: permission(true, true),
      matters: permission(true, true),
      notes: permission(false, false),
      finance: permission(false, false),
      navigation: permission(true, false),
      // Presentation is a controlled UI scope. Its write bit authorizes
      // recovery controls such as Undo, never arbitrary domain writes.
      presentation: permission(true, true),
    },
  };
}

export function loadAssistantSettings(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage) {
  const fallback = createDefaultAssistantSettings();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(ASSISTANT_SETTINGS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = assistantSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function saveAssistantSettings(
  settings: AssistantSettings,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
) {
  const validated = assistantSettingsSchema.parse(settings);
  if (!storage) return false;
  try {
    storage.setItem(ASSISTANT_SETTINGS_STORAGE_KEY, JSON.stringify(validated));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ASSISTANT_SETTINGS_EVENT));
    }
    return true;
  } catch {
    return false;
  }
}

export function subscribeToAssistantSettings(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === ASSISTANT_SETTINGS_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(ASSISTANT_SETTINGS_EVENT, listener);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(ASSISTANT_SETTINGS_EVENT, listener);
  };
}

export function readAssistantAccessToken() {
  try {
    return globalThis.sessionStorage?.getItem(ASSISTANT_ACCESS_TOKEN_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveAssistantAccessToken(token: string) {
  try {
    const normalized = token.trim();
    if (normalized) globalThis.sessionStorage?.setItem(ASSISTANT_ACCESS_TOKEN_SESSION_KEY, normalized);
    else globalThis.sessionStorage?.removeItem(ASSISTANT_ACCESS_TOKEN_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearAssistantCommandHistory() {
  try {
    globalThis.localStorage?.removeItem(ASSISTANT_COMMAND_HISTORY_KEY);
    return true;
  } catch {
    return false;
  }
}

export function appendAssistantCommand(command: string, settings: AssistantSettings) {
  if (!settings.rememberCommands || !command.trim()) return;
  try {
    const raw = globalThis.localStorage?.getItem(ASSISTANT_COMMAND_HISTORY_KEY);
    const existing: unknown = raw ? JSON.parse(raw) : [];
    const history = Array.isArray(existing)
      ? existing.filter((item): item is string => typeof item === "string")
      : [];
    const next = [command.trim().slice(0, 500), ...history].slice(0, 10);
    globalThis.localStorage?.setItem(ASSISTANT_COMMAND_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Optional command history must never interrupt the assistant session.
  }
}
