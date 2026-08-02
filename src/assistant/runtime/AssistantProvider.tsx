import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAssistantSettings } from "../config/useAssistantSettings";
import { appendAssistantCommand, type AssistantSettings } from "../config/assistant-settings";
import type { PendingAssistantConfirmation } from "../confirmations/confirmation-manager";
import type { AssistantApplicationContext, AssistantScope, AssistantToolResult } from "../core/types";
import { panelFromConfirmation, panelFromToolExecution } from "../panels/panel-factory";
import type { AssistantView } from "../panels/panel-schemas";
import { AssistantPresentationController } from "../presentation/presentation-controller";
import { registerPresentationTools } from "../presentation/presentation-tools";
import {
  redactPanelForPrivacy,
  redactToolFailureForSensitiveOutput,
  redactToolPayloadForPrivacy,
  redactToolPayloadForVoice,
  stripInternalToolMetadata,
} from "../privacy/redaction";
import { WebRtcRealtimeTransport, type RealtimeServerEvent, type RealtimeTransport, type RealtimeTransportEvent } from "../realtime";
import { registerRootineDomainTools } from "../tools/domain-tools";
import { AssistantToolExecutor, type AssistantExecutedToolCall, type AssistantToolCall } from "../tools/tool-executor";
import { AssistantToolRegistry } from "../tools/tool-registry";
import type { AssistantPanelInteraction } from "../ui/AssistantPanelRenderer";
import type { AssistantUndoNotice } from "../ui/AssistantUndoToast";
import { checkAssistantAvailability, type AssistantAvailability } from "./assistant-availability";
import { debugAssistantEvent, recordAssistantDiagnostic } from "./assistant-diagnostics";
import { AssistantRuntimeContext } from "./assistant-runtime-context";
import {
  assistantMachineReducer,
  createInitialAssistantState,
  type AssistantMachineState,
} from "./assistant-machine";
import { buildRootineAssistantInstructions } from "./system-instructions";

const DEFAULT_APP_CONTEXT: AssistantApplicationContext = {
  module: "today",
  timezone: "Europe/Warsaw",
  locale: "pl-PL",
  privacyMode: false,
};

const CHECKING_AVAILABILITY: AssistantAvailability = {
  status: "checking",
  message: "Sprawdzam bezpieczny backend asystenta…",
};

type ConfirmationCallMetadata = { callId: string; name: string; sessionId: string; turnId: string };
type QueuedToolBatch = {
  sessionId: string;
  turnId: string;
  calls: Map<string, AssistantToolCall>;
  timer: number;
};

const VOICE_SENSITIVE_SCOPES = new Set<AssistantScope>(["finance", "body_data", "notes", "work"]);

function createRuntimeId(prefix: string) {
  return globalThis.crypto?.randomUUID?.()
    ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function activeScopes(settings: ReturnType<typeof useAssistantSettings>["settings"]) {
  return (Object.entries(settings.permissions) as Array<[AssistantScope, { read: boolean; write: boolean }]>)
    .filter(([, permission]) => permission.read || permission.write)
    .map(([scope]) => scope);
}

function flattenToolResult(result: AssistantToolResult<unknown>) {
  if (!result.success) return result;
  return isRecord(result.data)
    ? { success: true, ...result.data, message: result.message ?? readString(result.data.message) }
    : { success: true, data: result.data, message: result.message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function isVoiceSensitive(scopes: readonly AssistantScope[]) {
  return scopes.some((scope) => VOICE_SENSITIVE_SCOPES.has(scope));
}

function confirmationDecision(text: string): boolean | null {
  const normalized = text.trim().toLocaleLowerCase("pl-PL").replace(/[.!?]+$/u, "");
  if (["tak", "potwierdź", "potwierdzam", "wykonaj", "zgadzam się"].includes(normalized)) return true;
  if (["nie", "anuluj", "odrzuć", "rezygnuję"].includes(normalized)) return false;
  return null;
}

function clarificationSelection(text: string, view: AssistantView | null) {
  const panel = view?.panels.find((candidate) => candidate.type === "clarification");
  const items = panel?.data.items ?? [];
  if (items.length === 0) return null;
  const normalized = text.trim().toLocaleLowerCase("pl-PL").replace(/[.!?]+$/u, "");
  const ordinal = [
    /^(?:wybieram\s+)?(?:pierwszy|pierwsza|pierwsze|1)$/u,
    /^(?:wybieram\s+)?(?:drugi|druga|drugie|2)$/u,
    /^(?:wybieram\s+)?(?:trzeci|trzecia|trzecie|3)$/u,
    /^(?:wybieram\s+)?(?:czwarty|czwarta|czwarte|4)$/u,
    /^(?:wybieram\s+)?(?:piąty|piąta|piąte|5)$/u,
  ].findIndex((pattern) => pattern.test(normalized));
  if (ordinal >= 0) return items[ordinal] ?? null;
  const exactMatches = items.filter((item) => item.label.trim().toLocaleLowerCase("pl-PL") === normalized);
  return exactMatches.length === 1 ? exactMatches[0] : null;
}

function safeRuntimeError(error: unknown, sessionId?: string) {
  const message = error instanceof Error ? error.message : "Nie udało się uruchomić asystenta.";
  const safeMessage = message.startsWith("Wpisz prywatny kod") || message.startsWith("Brak aktywnej sesji")
    ? message
    : "Nie udało się połączyć z asystentem. Spróbuj ponownie albo użyj trybu tekstowego.";
  return {
    code: "assistant_action_failed",
    message: safeMessage,
    recoverable: true,
    ...(sessionId ? { sessionId } : {}),
  };
}

function notifyAssistantDomainChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("rootine:workspace-change", {
    detail: {
      key: "*",
      origin: "rootine-assistant-domain",
      updatedAt: new Date().toISOString(),
    },
  }));
}

function callsFromResponseDone(event: RealtimeServerEvent): AssistantToolCall[] {
  if (event.type !== "response.done" || !Array.isArray(event.response?.output)) return [];
  return event.response.output.flatMap((item) => {
    if (!isRecord(item) || item.type !== "function_call") return [];
    const callId = readString(item.call_id);
    const name = readString(item.name);
    const args = readString(item.arguments);
    return callId && name ? [{ callId, name, arguments: args ?? "{}" }] : [];
  });
}

function userFacingError(state: AssistantMachineState) {
  if (!state.error) return undefined;
  const code = state.error.code?.toLowerCase() ?? "";
  if (code.includes("notallowed") || code.includes("permission")) {
    return "Przeglądarka nie udostępniła mikrofonu. Możesz nadal używać pola tekstowego.";
  }
  if (code.includes("notfound") || code.includes("device")) {
    return "Nie znaleziono mikrofonu. Sprawdź urządzenie albo użyj trybu tekstowego.";
  }
  if (code.includes("rate") || state.error.message.includes("429")) {
    return "Limit usługi został chwilowo wyczerpany. Zakończ sesję i spróbuj później.";
  }
  if (state.error.source === "runtime" && code === "assistant_action_failed") {
    return state.error.message;
  }
  return "Połączenie asystenta zostało przerwane. Dane aplikacji nie zostały zmienione bez potwierdzenia narzędzia.";
}

export function AssistantProvider({
  children,
  navigate,
  transportFactory,
}: {
  children: ReactNode;
  navigate: (path: string) => void;
  transportFactory?: () => RealtimeTransport;
}) {
  const { settings, accessToken } = useAssistantSettings();
  const settingsRef = useRef(settings);
  const accessTokenRef = useRef(accessToken);
  const appContextRef = useRef<AssistantApplicationContext>(DEFAULT_APP_CONTEXT);
  const navigateRef = useRef(navigate);
  const stateRef = useRef<AssistantMachineState>(createInitialAssistantState());
  const openRef = useRef(false);
  const closingRef = useRef(false);
  const handledCallIds = useRef(new Set<string>());
  const confirmationCalls = useRef(new Map<string, ConfirmationCallMetadata>());
  const queuedToolBatches = useRef(new Map<string, QueuedToolBatch>());
  const sessionAbortRef = useRef<AbortController | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pendingConfirmationRef = useRef<PendingAssistantConfirmation | null>(null);
  const resolveConfirmationRef = useRef<(confirmationId: string, approved: boolean) => Promise<void>>(async () => undefined);
  const connectStartedAtRef = useRef<number | null>(null);
  const voiceSuppressedForTurnRef = useRef(false);
  const connectedVoiceRef = useRef<AssistantSettings["voice"]>(settings.voice);

  settingsRef.current = settings;
  accessTokenRef.current = accessToken;
  navigateRef.current = navigate;

  const presentation = useMemo(() => new AssistantPresentationController(), []);
  const presentationSnapshot = useSyncExternalStore(
    presentation.subscribe,
    presentation.getSnapshot,
    presentation.getSnapshot,
  );
  const registry = useMemo(() => {
    const next = new AssistantToolRegistry();
    registerRootineDomainTools(next, () => settingsRef.current);
    registerPresentationTools(next, presentation, (path) => navigateRef.current(path));
    return next;
  }, [presentation]);
  const executor = useMemo(() => new AssistantToolExecutor(registry, () => settingsRef.current), [registry]);
  const transport = useMemo(() => transportFactory?.() ?? new WebRtcRealtimeTransport({
    getAccessToken: () => accessTokenRef.current,
  }), [transportFactory]);

  const [state, dispatch] = useReducer(assistantMachineReducer, undefined, () => createInitialAssistantState({
    enabled: false,
    audioEnabled: settings.voiceEnabled,
  }));
  const [isOpen, setIsOpen] = useState(false);
  const [availability, setAvailability] = useState<AssistantAvailability>(CHECKING_AVAILABILITY);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingAssistantConfirmation | null>(null);
  const [undoNotice, setUndoNotice] = useState<AssistantUndoNotice | null>(null);

  stateRef.current = state;
  openRef.current = isOpen;
  pendingConfirmationRef.current = pendingConfirmation;

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    if (maxTimerRef.current !== null) window.clearTimeout(maxTimerRef.current);
    idleTimerRef.current = null;
    maxTimerRef.current = null;
  }, []);

  const clearToolBatches = useCallback(() => {
    queuedToolBatches.current.forEach((batch) => window.clearTimeout(batch.timer));
    queuedToolBatches.current.clear();
  }, []);

  const closeAssistant = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    clearTimers();
    clearToolBatches();
    const sessionId = transport.sessionId;
    if (sessionId) {
      dispatch({ type: "request_close", sessionId });
      executor.clearSession(sessionId);
    }
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    try {
      await transport.disconnect();
    } finally {
      recordAssistantDiagnostic(settingsRef.current, { event: "disconnect", outcome: "success" });
      debugAssistantEvent(settingsRef.current, "session.closed");
      handledCallIds.current.clear();
      confirmationCalls.current.clear();
      setPendingConfirmation(null);
      setUndoNotice(null);
      voiceSuppressedForTurnRef.current = false;
      presentation.clear();
      setIsOpen(false);
      dispatch({ type: "reset" });
      closingRef.current = false;
    }
  }, [clearTimers, clearToolBatches, executor, presentation, transport]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    if (!transport.sessionId) return;
    const serverLimit = availability.status === "available" ? availability.idleTimeoutSeconds : undefined;
    const seconds = Math.min(settingsRef.current.idleTimeoutSeconds, serverLimit ?? Number.POSITIVE_INFINITY);
    idleTimerRef.current = window.setTimeout(() => { void closeAssistant(); }, seconds * 1_000);
  }, [availability, closeAssistant, transport]);

  const armSessionTimers = useCallback(() => {
    clearTimers();
    resetIdleTimer();
    const serverLimit = availability.status === "available" ? availability.maxSessionMinutes : undefined;
    const minutes = Math.min(settingsRef.current.maxSessionMinutes, serverLimit ?? Number.POSITIVE_INFINITY);
    maxTimerRef.current = window.setTimeout(() => { void closeAssistant(); }, minutes * 60_000);
  }, [availability, clearTimers, closeAssistant, resetIdleTimer]);

  const sessionConfiguration = useCallback(() => {
    const currentSettings = settingsRef.current;
    const voice = currentSettings.voiceEnabled
      && stateRef.current.audioEnabled
      && !voiceSuppressedForTurnRef.current;
    return {
      type: "realtime" as const,
      instructions: buildRootineAssistantInstructions(
        appContextRef.current,
        activeScopes(currentSettings),
        currentSettings.voicePrivacy,
      ),
      output_modalities: [voice ? "audio" as const : "text" as const],
      tools: registry.toRealtimeTools(),
      tool_choice: "auto" as const,
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe", language: appContextRef.current.locale.split("-")[0] },
          turn_detection: currentSettings.microphoneMode === "conversation"
            ? { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true }
            : null,
        },
        output: {
          voice: transport.connectionState === "connected"
            ? connectedVoiceRef.current
            : currentSettings.voice,
        },
      },
    };
  }, [registry, transport]);

  const ensureConnected = useCallback(async (voice: boolean) => {
    if (availability.status !== "available") throw new Error(availability.message);
    if (availability.requiresAccessToken && !accessTokenRef.current.trim()) {
      throw new Error("Wpisz prywatny kod dostępu w Ustawieniach → Asystent.");
    }
    if (transport.connectionState === "connected" && (!voice || stateRef.current.microphoneEnabled)) return;
    sessionAbortRef.current?.abort();
    const controller = new AbortController();
    sessionAbortRef.current = controller;
    connectedVoiceRef.current = settingsRef.current.voice;
    connectStartedAtRef.current = performance.now();
    try {
      await transport.connect({ voice, session: sessionConfiguration(), signal: controller.signal });
      const durationMs = Math.max(0, Math.round(performance.now() - (connectStartedAtRef.current ?? performance.now())));
      recordAssistantDiagnostic(settingsRef.current, { event: "connect", outcome: "success", durationMs });
      debugAssistantEvent(settingsRef.current, "session.connected", { voice, durationMs });
      reconnectAttemptsRef.current = 0;
      armSessionTimers();
    } catch (error) {
      recordAssistantDiagnostic(settingsRef.current, {
        event: "connect",
        outcome: error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "failure",
      });
      throw error;
    } finally {
      connectStartedAtRef.current = null;
    }
  }, [armSessionTimers, availability, sessionConfiguration, transport]);

  const resultForModel = useCallback((execution: AssistantExecutedToolCall) => {
    const definition = registry.get(execution.name);
    const currentSettings = settingsRef.current;
    const outputUsesVoice = currentSettings.voiceEnabled && stateRef.current.audioEnabled;
    if (!execution.result.success) {
      const shouldHideSensitive = appContextRef.current.privacyMode
        || (outputUsesVoice && currentSettings.voicePrivacy !== "standard");
      const safeFailure = definition && shouldHideSensitive
        ? redactToolFailureForSensitiveOutput(execution.result, definition.scopes)
        : execution.result;
      return flattenToolResult(safeFailure);
    }
    const privacySafeData = definition
      ? redactToolPayloadForPrivacy(
        stripInternalToolMetadata(execution.result.data),
        definition.scopes,
        appContextRef.current.privacyMode,
      )
      : stripInternalToolMetadata(execution.result.data);
    const data = definition && outputUsesVoice
      ? redactToolPayloadForVoice(privacySafeData, definition.scopes, currentSettings.voicePrivacy)
      : privacySafeData;
    const boundaryMessage = isRecord(data) && (data.privacyRestricted === true || data.voiceRestricted === true)
      ? readString(data.message)
      : execution.result.message;
    return flattenToolResult({ ...execution.result, data, message: boundaryMessage });
  }, [registry]);

  const prepareVoiceForTool = useCallback((toolName: string) => {
    const definition = registry.get(toolName);
    const currentSettings = settingsRef.current;
    if (
      !definition
      || currentSettings.voicePrivacy !== "silent_sensitive"
      || !currentSettings.voiceEnabled
      || !stateRef.current.audioEnabled
      || !isVoiceSensitive(definition.scopes)
      || transport.connectionState !== "connected"
    ) return;
    voiceSuppressedForTurnRef.current = true;
    transport.updateSession(sessionConfiguration());
    debugAssistantEvent(currentSettings, "voice.sensitive_turn_suppressed", { tool: toolName });
  }, [registry, sessionConfiguration, transport]);

  const presentExecution = useCallback((execution: AssistantExecutedToolCall) => {
    try {
      if (execution.result.success && isRecord(execution.result.data) && readString(execution.result.data.eventId)) {
        notifyAssistantDomainChange();
      }
      const panel = redactPanelForPrivacy(
        panelFromToolExecution(execution),
        appContextRef.current.privacyMode,
        registry.get(execution.name)?.scopes,
      );
      if (settingsRef.current.assistantPanelsEnabled) {
        presentation.addOrReplacePanel(panel, {
          title: panel.title ?? "Wynik",
          layout: panel.type === "confirmation" ? "confirmation" : panel.type === "action_result" ? "focus" : "focus_with_supporting",
        });
      }
      if (panel.data.undoToken && panel.data.message && panel.data.undoExpiresAt) {
        setUndoNotice({ token: panel.data.undoToken, message: panel.data.message, expiresAt: panel.data.undoExpiresAt });
        const delay = Math.max(0, new Date(panel.data.undoExpiresAt).getTime() - Date.now());
        window.setTimeout(() => setUndoNotice((current) => current?.token === panel.data.undoToken ? null : current), delay);
      }
    } catch {
      recordAssistantDiagnostic(settingsRef.current, { event: "error", outcome: "failure", category: "panel_validation" });
      if (settingsRef.current.assistantPanelsEnabled) {
        presentation.addOrReplacePanel(panelFromToolExecution({
          ...execution,
          result: { success: false, code: "VALIDATION", message: "Nie można bezpiecznie wyświetlić wyniku narzędzia." },
        }), { title: "Wynik wymaga uwagi", layout: "focus" });
      }
    }
  }, [presentation, registry]);

  const processToolCall = useCallback(async (
    call: AssistantToolCall,
    sessionId: string,
    turnId: string,
    options: {
      requestResponse?: boolean;
      blockedResult?: AssistantToolResult<unknown>;
    } = {},
  ) => {
    if (transport.sessionId !== sessionId) return "skipped" as const;
    const callKey = `${sessionId}:${call.callId}`;
    if (handledCallIds.current.has(callKey)) return "skipped" as const;
    handledCallIds.current.add(callKey);
    resetIdleTimer();
    dispatch({ type: "tool_execution_started", sessionId, callId: call.callId });
    const execution: AssistantExecutedToolCall = options.blockedResult
      ? { callId: call.callId, name: call.name, result: options.blockedResult, requiresConfirmation: false }
      : await executor.execute(call, {
        sessionId,
        turnId,
        now: new Date(),
        app: appContextRef.current,
        signal: sessionAbortRef.current?.signal,
      });
    recordAssistantDiagnostic(settingsRef.current, {
      event: "tool",
      outcome: execution.result.success ? "success" : "failure",
      category: call.name,
    });
    debugAssistantEvent(settingsRef.current, "tool.completed", {
      tool: call.name,
      success: execution.result.success,
      confirmation: execution.requiresConfirmation,
    });
    if (transport.sessionId !== sessionId) {
      if (execution.result.success && isRecord(execution.result.data) && readString(execution.result.data.eventId)) {
        notifyAssistantDomainChange();
      }
      return "skipped" as const;
    }
    if (execution.requiresConfirmation && !execution.result.success && execution.result.confirmationId) {
      const confirmationId = execution.result.confirmationId;
      const pending = executor.confirmations.list(sessionId).find((item) => item.id === confirmationId);
      if (pending) {
        confirmationCalls.current.set(pending.id, { callId: call.callId, name: call.name, sessionId, turnId });
        setPendingConfirmation(pending);
        presentation.addOrReplacePanel(panelFromConfirmation(pending), { title: "Potwierdzenie", layout: "confirmation" });
        dispatch({
          type: "request_confirmation",
          confirmation: {
            id: pending.id,
            sessionId,
            turnId,
            callId: call.callId,
            title: pending.operation,
            description: [pending.record, pending.previousValue, pending.nextValue].filter(Boolean).join(" → "),
            risk: "high",
          },
        });
      }
      return "confirmation" as const;
    }
    prepareVoiceForTool(call.name);
    presentExecution(execution);
    transport.completeFunctionCall(call.callId, resultForModel(execution), {
      requestResponse: options.requestResponse !== false,
    });
    dispatch({
      type: "tool_execution_completed",
      sessionId,
      callId: call.callId,
      ...(!execution.result.success ? { error: { message: execution.result.message, recoverable: execution.result.code !== "VALIDATION" } } : {}),
    });
    return "completed" as const;
  }, [executor, prepareVoiceForTool, presentExecution, presentation, resetIdleTimer, resultForModel, transport]);

  const processToolBatch = useCallback(async (
    calls: AssistantToolCall[],
    sessionId: string,
    turnId: string,
  ) => {
    const uniqueCalls = [...new Map(calls.map((call) => [call.callId, call])).values()];
    const writeCount = uniqueCalls.filter((call) => {
      const risk = registry.get(call.name)?.risk;
      return risk && risk !== "read";
    }).length;
    let completedAny = false;
    let awaitingConfirmation = false;
    for (const call of uniqueCalls) {
      const definition = registry.get(call.name);
      const blockedResult: AssistantToolResult<unknown> | undefined = writeCount > 1 && definition?.risk !== "read"
        ? {
          success: false,
          code: "UNSUPPORTED",
          message: "Pakiet zawiera kilka zapisów. Dla bezpieczeństwa wykonaj i potwierdź każdą zmianę osobno.",
        }
        : undefined;
      const status = await processToolCall(call, sessionId, turnId, {
        requestResponse: false,
        ...(blockedResult ? { blockedResult } : {}),
      });
      completedAny ||= status === "completed";
      awaitingConfirmation ||= status === "confirmation";
    }
    if (completedAny && !awaitingConfirmation && transport.sessionId === sessionId) {
      transport.requestResponse();
    }
  }, [processToolCall, registry, transport]);

  useEffect(() => {
    const unsubscribe = transport.onEvent((event: RealtimeTransportEvent) => {
      if (event.type === "transport.server_event" && event.sessionId !== transport.sessionId) {
        debugAssistantEvent(settingsRef.current, "event.stale_dropped", { type: event.event.type });
        return;
      }
      dispatch({ type: "transport_event", event });
      resetIdleTimer();
      debugAssistantEvent(settingsRef.current, "transport.event", {
        type: event.type === "transport.server_event"
          ? event.event.type
          : event.type === "transport.connection"
            ? event.connectionState
            : "remote_audio",
      });
      if (
        event.type === "transport.connection"
        && (event.connectionState === "connecting" || event.connectionState === "reconnecting")
        && pendingConfirmationRef.current
        && pendingConfirmationRef.current.sessionId !== event.sessionId
      ) {
        const staleConfirmation = pendingConfirmationRef.current;
        executor.clearSession(staleConfirmation.sessionId);
        confirmationCalls.current.delete(staleConfirmation.id);
        pendingConfirmationRef.current = null;
        setPendingConfirmation(null);
        presentation.clear();
      }
      if (event.type === "transport.connection" && event.connectionState === "disconnected") {
        executor.clearSession(event.sessionId);
      }
      if (event.type === "transport.connection" && event.connectionState === "error" && event.error?.recoverable && openRef.current && !closingRef.current) {
        if (reconnectAttemptsRef.current < 2) {
          reconnectAttemptsRef.current += 1;
          window.setTimeout(() => {
            if (!openRef.current || closingRef.current) return;
            dispatch({ type: "request_reconnect", sessionId: event.sessionId });
            void transport.reconnect().then(() => {
              armSessionTimers();
              recordAssistantDiagnostic(settingsRef.current, { event: "reconnect", outcome: "success" });
            }).catch((error: unknown) => {
              recordAssistantDiagnostic(settingsRef.current, { event: "reconnect", outcome: "failure" });
              dispatch({ type: "runtime_error", error: safeRuntimeError(error, event.sessionId) });
            });
          }, 500 * reconnectAttemptsRef.current);
        }
      }
      if (event.type !== "transport.server_event") return;
      const serverEvent = event.event;
      if (serverEvent.type === "conversation.item.input_audio_transcription.completed" && serverEvent.transcript) {
        const pending = pendingConfirmationRef.current;
        const decision = confirmationDecision(serverEvent.transcript);
        if (pending && decision !== null) {
          // VAD/PTT may already have opened a response for this utterance. Stop it
          // before returning the confirmed tool output so only one answer wins.
          transport.interrupt();
          void resolveConfirmationRef.current(pending.id, decision);
        }
        const selected = clarificationSelection(serverEvent.transcript, presentation.getSnapshot().view);
        if (selected && executor.authorizeEntity(event.sessionId, selected.id)) {
          transport.sendContext(`Użytkownik jednoznacznie wybrał rekord ${selected.id} (${selected.label}).`);
        }
      }
      if (serverEvent.type === "response.function_call_arguments.done" && serverEvent.call_id && serverEvent.name) {
        const responseId = serverEvent.response_id ?? `call-${serverEvent.call_id}`;
        const call = {
          callId: serverEvent.call_id,
          name: serverEvent.name,
          arguments: serverEvent.arguments ?? "{}",
        };
        const existing = queuedToolBatches.current.get(responseId);
        if (existing) window.clearTimeout(existing.timer);
        const calls = existing?.calls ?? new Map<string, AssistantToolCall>();
        calls.set(call.callId, call);
        const turnId = existing?.turnId ?? serverEvent.response_id ?? stateRef.current.activeTurnId ?? createRuntimeId("turn");
        const timer = window.setTimeout(() => {
          const queued = queuedToolBatches.current.get(responseId);
          if (!queued) return;
          queuedToolBatches.current.delete(responseId);
          void processToolBatch([...queued.calls.values()], queued.sessionId, queued.turnId);
        }, 150);
        queuedToolBatches.current.set(responseId, { sessionId: event.sessionId, turnId, calls, timer });
      }
      let completedCalls = callsFromResponseDone(serverEvent);
      if (serverEvent.type === "response.done") {
        const responseId = serverEvent.response?.id;
        const queued = responseId ? queuedToolBatches.current.get(responseId) : undefined;
        if (queued) {
          window.clearTimeout(queued.timer);
          queuedToolBatches.current.delete(responseId!);
          completedCalls = [...queued.calls.values(), ...completedCalls];
        }
        if (completedCalls.length > 0) {
          void processToolBatch(completedCalls, event.sessionId, responseId ?? createRuntimeId("turn"));
        }
      }
      if (serverEvent.type === "response.done" && completedCalls.length === 0 && voiceSuppressedForTurnRef.current) {
        voiceSuppressedForTurnRef.current = false;
        transport.updateSession(sessionConfiguration());
      }
    });
    return unsubscribe;
  }, [armSessionTimers, executor, presentation, processToolBatch, resetIdleTimer, sessionConfiguration, transport]);

  const refreshAvailability = useCallback(async () => {
    const controller = new AbortController();
    setAvailability(CHECKING_AVAILABILITY);
    const result = await checkAssistantAvailability(controller.signal);
    setAvailability(result);
    recordAssistantDiagnostic(settingsRef.current, {
      event: "availability",
      outcome: result.status === "available" ? "success" : "failure",
      category: result.status,
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkAssistantAvailability(controller.signal).then((result) => {
      setAvailability(result);
      recordAssistantDiagnostic(settingsRef.current, {
        event: "availability",
        outcome: result.status === "available" ? "success" : "failure",
        category: result.status,
      });
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setAvailability({ status: "unreachable", message: "Nie można sprawdzić backendu asystenta." });
      }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const enabled = settings.assistantEnabled && availability.status === "available";
    dispatch({ type: enabled ? "enable" : "disable" });
    if (!enabled && isOpen) void closeAssistant();
  }, [availability.status, closeAssistant, isOpen, settings.assistantEnabled]);

  useEffect(() => {
    stateRef.current = { ...stateRef.current, audioEnabled: settings.voiceEnabled };
    dispatch({ type: "set_audio_enabled", enabled: settings.voiceEnabled });
  }, [settings.voiceEnabled]);

  useEffect(() => {
    if (transport.connectionState === "connected") transport.updateSession(sessionConfiguration());
  }, [sessionConfiguration, settings, transport]);

  useEffect(() => {
    if (!settings.assistantPanelsEnabled && !pendingConfirmation) presentation.clear();
  }, [pendingConfirmation, presentation, settings.assistantPanelsEnabled]);

  useEffect(() => () => {
    clearTimers();
    clearToolBatches();
    sessionAbortRef.current?.abort();
    void transport.disconnect();
  }, [clearTimers, clearToolBatches, transport]);

  useEffect(() => {
    if (!pendingConfirmation) return;
    const delay = Math.max(0, new Date(pendingConfirmation.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      const metadata = confirmationCalls.current.get(pendingConfirmation.id);
      if (!metadata) return;
      executor.confirmations.cancel(pendingConfirmation.id, metadata.sessionId);
      confirmationCalls.current.delete(pendingConfirmation.id);
      setPendingConfirmation(null);
      if (transport.sessionId === metadata.sessionId) {
        transport.completeFunctionCall(metadata.callId, { success: false, code: "CONFIRMATION_EXPIRED", message: "Potwierdzenie wygasło." });
        dispatch({ type: "resolve_confirmation", sessionId: metadata.sessionId, confirmationId: pendingConfirmation.id, approved: false });
        presentation.clear();
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [executor.confirmations, pendingConfirmation, presentation, transport]);

  const openAssistant = useCallback(() => {
    if (availability.status !== "available" || !settingsRef.current.assistantEnabled) return;
    setIsOpen(true);
  }, [availability.status]);

  const startVoice = useCallback(async () => {
    setIsOpen(true);
    try {
      await ensureConnected(true);
      dispatch({ type: "set_microphone_enabled", enabled: true });
    } catch (error) {
      dispatch({ type: "set_microphone_enabled", enabled: false });
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({ type: "runtime_error", error: safeRuntimeError(error, transport.sessionId ?? undefined) });
    }
  }, [ensureConnected, transport]);

  const sendText = useCallback(async (text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    setIsOpen(true);
    const pending = pendingConfirmationRef.current;
    const decision = confirmationDecision(normalized);
    if (pending && decision !== null) {
      appendAssistantCommand(normalized, settingsRef.current);
      await resolveConfirmationRef.current(pending.id, decision);
      return;
    }
    try {
      await ensureConnected(false);
      const sessionId = transport.sessionId;
      if (!sessionId) throw new Error("Brak aktywnej sesji.");
      const turnId = createRuntimeId("text-turn");
      dispatch({ type: "submit_text", sessionId, turnId, text: normalized });
      appendAssistantCommand(normalized, settingsRef.current);
      transport.sendText(normalized);
      resetIdleTimer();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({ type: "runtime_error", error: safeRuntimeError(error, transport.sessionId ?? undefined) });
    }
  }, [ensureConnected, resetIdleTimer, transport]);

  const cancelResponse = useCallback(() => {
    transport.interrupt();
    const sessionId = transport.sessionId;
    if (sessionId) dispatch({ type: "interrupt", sessionId, turnId: stateRef.current.activeTurnId ?? undefined });
    resetIdleTimer();
  }, [resetIdleTimer, transport]);

  const toggleAudio = useCallback(() => {
    const enabled = !stateRef.current.audioEnabled;
    stateRef.current = { ...stateRef.current, audioEnabled: enabled };
    dispatch({ type: "set_audio_enabled", enabled });
    if (transport.connectionState === "connected") {
      if (!enabled) transport.interrupt();
      transport.updateSession(sessionConfiguration());
    }
  }, [sessionConfiguration, transport]);

  const startPushToTalk = useCallback(async () => {
    try {
      await ensureConnected(true);
      transport.startPushToTalk();
      resetIdleTimer();
    } catch (error) {
      dispatch({ type: "set_microphone_enabled", enabled: false });
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        dispatch({ type: "runtime_error", error: safeRuntimeError(error, transport.sessionId ?? undefined) });
      }
    }
  }, [ensureConnected, resetIdleTimer, transport]);

  const stopPushToTalk = useCallback(() => {
    if (transport.connectionState === "connected") transport.stopPushToTalk();
    resetIdleTimer();
  }, [resetIdleTimer, transport]);

  const cancelPushToTalk = useCallback(() => {
    if (transport.connectionState === "connected") transport.cancelPushToTalk();
    resetIdleTimer();
  }, [resetIdleTimer, transport]);

  const resolveConfirmation = useCallback(async (confirmationId: string, approved: boolean) => {
    const metadata = confirmationCalls.current.get(confirmationId);
    if (!metadata || transport.sessionId !== metadata.sessionId) return;
    confirmationCalls.current.delete(confirmationId);
    setPendingConfirmation(null);
    presentation.clear();
    if (!approved) {
      executor.confirmations.cancel(confirmationId, metadata.sessionId);
      transport.completeFunctionCall(metadata.callId, { success: false, code: "UNAVAILABLE", message: "Użytkownik anulował operację." });
      transport.sendContext("Użytkownik odrzucił oczekujące potwierdzenie. Nie wykonano zmiany.");
      dispatch({ type: "resolve_confirmation", sessionId: metadata.sessionId, confirmationId, approved: false });
      return;
    }
    const resolution = await executor.confirm(confirmationId, {
      sessionId: metadata.sessionId,
      turnId: metadata.turnId,
      now: new Date(),
      app: appContextRef.current,
      signal: sessionAbortRef.current?.signal,
    });
    const result: AssistantToolResult<unknown> = resolution.status === "executed"
      ? resolution.result
      : { success: false, code: resolution.status === "expired" ? "CONFIRMATION_EXPIRED" : "NOT_FOUND", message: "Potwierdzenie nie jest już aktywne." };
    const execution: AssistantExecutedToolCall = { callId: metadata.callId, name: metadata.name, result, requiresConfirmation: false };
    dispatch({ type: "resolve_confirmation", sessionId: metadata.sessionId, confirmationId, approved: result.success });
    prepareVoiceForTool(metadata.name);
    presentExecution(execution);
    transport.completeFunctionCall(metadata.callId, resultForModel(execution));
    dispatch({
      type: "tool_execution_completed",
      sessionId: metadata.sessionId,
      callId: metadata.callId,
      ...(!result.success ? { error: { message: result.message, recoverable: result.code !== "VALIDATION" } } : {}),
    });
    recordAssistantDiagnostic(settingsRef.current, {
      event: "tool",
      outcome: result.success ? "success" : "failure",
      category: `${metadata.name}:confirmed`,
    });
  }, [executor, prepareVoiceForTool, presentExecution, presentation, resultForModel, transport]);

  resolveConfirmationRef.current = resolveConfirmation;

  const undo = useCallback(async (token: string) => {
    const sessionId = transport.sessionId ?? "local-assistant";
    const execution = await executor.execute({ callId: createRuntimeId("undo-call"), name: "undo_action", arguments: JSON.stringify({ undoToken: token }) }, {
      sessionId,
      turnId: createRuntimeId("undo-turn"),
      now: new Date(),
      app: appContextRef.current,
    });
    presentExecution(execution);
    setUndoNotice(null);
    if (transport.connectionState === "connected") {
      transport.sendContext(execution.result.success
        ? "Użytkownik cofnął ostatnią operację przez mechanizm domenowy Undo."
        : "Próba Undo nie powiodła się; nie potwierdzaj cofnięcia.");
    }
  }, [executor, presentExecution, transport]);

  const retry = useCallback(async () => {
    dispatch({ type: "clear_error" });
    if (transport.connectionState === "error" || transport.connectionState === "disconnected") {
      try {
        await transport.reconnect();
        armSessionTimers();
      } catch {
        await refreshAvailability();
      }
    } else {
      await refreshAvailability();
    }
  }, [armSessionTimers, refreshAvailability, transport]);

  const handlePanelInteraction = useCallback((interaction: AssistantPanelInteraction) => {
    resetIdleTimer();
    if (interaction.action === "confirm" || interaction.action === "cancel") {
      void resolveConfirmation(interaction.confirmationId, interaction.action === "confirm");
      return;
    }
    if (interaction.action === "undo") {
      void undo(interaction.undoToken);
      return;
    }
    if (interaction.action === "retry") {
      void retry();
      return;
    }
    if ((interaction.action === "select" || interaction.action === "open") && transport.connectionState === "connected") {
      const sessionId = transport.sessionId;
      if (!sessionId || !executor.authorizeEntity(sessionId, interaction.entityId)) {
        transport.sendContext("Nie można potwierdzić pochodzenia wybranego identyfikatora. Wyszukaj rekord ponownie.");
        return;
      }
      transport.sendText(`Wybieram rekord o identyfikatorze ${interaction.entityId}. Zweryfikuj go ponownie przed zapisem.`);
    }
  }, [executor, resetIdleTimer, resolveConfirmation, retry, transport, undo]);

  const updateAppContext = useCallback((context: AssistantApplicationContext) => {
    appContextRef.current = context;
    if (transport.connectionState === "connected") transport.updateSession(sessionConfiguration());
  }, [sessionConfiguration, transport]);

  const canOpen = availability.status === "available" && settings.assistantEnabled;
  const analyser = transport.getInputAnalyser();
  const value = useMemo(() => ({
    state: { ...state, error: state.error ? { ...state.error, message: userFacingError(state) ?? state.error.message } : null },
    isOpen,
    availability,
    view: presentationSnapshot.view,
    pendingConfirmation,
    undoNotice,
    analyser,
    canOpen,
    openAssistant,
    closeAssistant,
    startVoice,
    sendText,
    cancelResponse,
    toggleAudio,
    startPushToTalk,
    stopPushToTalk,
    cancelPushToTalk,
    retry,
    resolveConfirmation,
    undo,
    dismissUndo: () => setUndoNotice(null),
    handlePanelInteraction,
    updateAppContext,
    refreshAvailability,
  }), [
    analyser, availability, canOpen, cancelResponse, closeAssistant, handlePanelInteraction,
    isOpen, openAssistant, pendingConfirmation, presentationSnapshot.view, refreshAvailability,
    cancelPushToTalk, resolveConfirmation, retry, sendText, startPushToTalk, startVoice, state, stopPushToTalk,
    toggleAudio, undo, undoNotice, updateAppContext,
  ]);

  return <AssistantRuntimeContext.Provider value={value}>{children}</AssistantRuntimeContext.Provider>;
}
