import type {
  RealtimeConnectionState,
  RealtimeErrorDetails,
  RealtimeServerEvent,
  RealtimeTransportEvent,
} from "../realtime/realtime-types";

export type AssistantStatus =
  | "disabled"
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "listening"
  | "user_speaking"
  | "processing"
  | "executing_tool"
  | "awaiting_confirmation"
  | "assistant_speaking"
  | "interrupted"
  | "reconnecting"
  | "error"
  | "closing";

export type AssistantTurnKind = "user" | "assistant";

export interface AssistantTranscriptEntry {
  id: string;
  sessionId: string;
  turnId: string;
  role: "user" | "assistant";
  source: "text" | "voice";
  text: string;
  final: boolean;
}

export interface AssistantPresentedPanel {
  id: string;
  type: string;
  title?: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface AssistantPendingToolCall {
  sessionId: string;
  turnId: string;
  callId: string;
  name: string;
  argumentsText: string;
  arguments: unknown;
}

export interface AssistantPendingConfirmation {
  id: string;
  sessionId: string;
  turnId: string;
  callId: string;
  title: string;
  description?: string;
  risk?: "low" | "medium" | "high";
}

export interface AssistantError extends RealtimeErrorDetails {
  source: "transport" | "server" | "transcription" | "tool" | "runtime";
  sessionId?: string;
  turnId?: string;
}

export interface AssistantRateLimit {
  name: string;
  limit?: number;
  remaining?: number;
  resetSeconds?: number;
}

export interface AssistantLastAction {
  type: string;
  sessionId?: string;
  turnId?: string;
  callId?: string;
}

export interface AssistantMachineState {
  status: AssistantStatus;
  enabled: boolean;
  sessionId: string | null;
  remoteSessionId: string | null;
  activeTurnId: string | null;
  activeTurnKind: AssistantTurnKind | null;
  transcript: readonly AssistantTranscriptEntry[];
  partialTranscript: string;
  assistantText: string;
  assistantTextSource: "text" | "audio_transcript" | null;
  presentedPanels: readonly AssistantPresentedPanel[];
  pendingToolCall: AssistantPendingToolCall | null;
  pendingConfirmation: AssistantPendingConfirmation | null;
  lastAction: AssistantLastAction | null;
  error: AssistantError | null;
  audioEnabled: boolean;
  microphoneEnabled: boolean;
  connectionState: RealtimeConnectionState;
  rateLimits: readonly AssistantRateLimit[];
  /** Bounded tombstones used to reject events arriving after cancel/reconnect. */
  ignoredTurnIds: readonly string[];
  retiredSessionIds: readonly string[];
}

export interface AssistantInitialStateOptions {
  enabled?: boolean;
  audioEnabled?: boolean;
  microphoneEnabled?: boolean;
}

export type AssistantMachineAction =
  | { type: "enable" }
  | { type: "disable" }
  | { type: "reset" }
  | {
      type: "begin_session";
      sessionId: string;
      microphoneEnabled: boolean;
      audioEnabled?: boolean;
    }
  | {
      type: "submit_text";
      sessionId: string;
      turnId: string;
      text: string;
    }
  | { type: "interrupt"; sessionId: string; turnId?: string }
  | { type: "request_reconnect"; sessionId?: string }
  | { type: "request_close"; sessionId?: string }
  | { type: "set_audio_enabled"; enabled: boolean }
  | { type: "set_microphone_enabled"; enabled: boolean }
  | {
      type: "present_panels";
      sessionId: string;
      turnId?: string;
      panels: readonly AssistantPresentedPanel[];
    }
  | {
      type: "request_confirmation";
      confirmation: AssistantPendingConfirmation;
    }
  | {
      type: "resolve_confirmation";
      sessionId: string;
      confirmationId: string;
      approved: boolean;
    }
  | {
      type: "tool_execution_started";
      sessionId: string;
      callId: string;
    }
  | {
      type: "tool_execution_completed";
      sessionId: string;
      callId: string;
      error?: Omit<AssistantError, "source" | "sessionId">;
    }
  | {
      type: "runtime_error";
      error: Omit<AssistantError, "source">;
    }
  | { type: "clear_error" }
  | { type: "transport_event"; event: RealtimeTransportEvent };

const TOMBSTONE_LIMIT = 24;

export function createInitialAssistantState(
  options: AssistantInitialStateOptions = {},
): AssistantMachineState {
  const enabled = options.enabled ?? false;
  return {
    status: enabled ? "idle" : "disabled",
    enabled,
    sessionId: null,
    remoteSessionId: null,
    activeTurnId: null,
    activeTurnKind: null,
    transcript: [],
    partialTranscript: "",
    assistantText: "",
    assistantTextSource: null,
    presentedPanels: [],
    pendingToolCall: null,
    pendingConfirmation: null,
    lastAction: null,
    error: null,
    audioEnabled: options.audioEnabled ?? true,
    microphoneEnabled: options.microphoneEnabled ?? false,
    connectionState: "idle",
    rateLimits: [],
    ignoredTurnIds: [],
    retiredSessionIds: [],
  };
}

export const initialAssistantState = createInitialAssistantState();

export function assistantMachineReducer(
  state: AssistantMachineState,
  action: AssistantMachineAction,
): AssistantMachineState {
  switch (action.type) {
    case "enable":
      return state.enabled
        ? state
        : {
            ...state,
            enabled: true,
            status: "idle",
            connectionState: "idle",
            error: null,
            lastAction: { type: "enable" },
          };

    case "disable":
      return {
        ...clearEphemeralState(state),
        enabled: false,
        status: "disabled",
        connectionState: "disconnected",
        microphoneEnabled: false,
        retiredSessionIds: state.sessionId
          ? addTombstone(state.retiredSessionIds, state.sessionId)
          : state.retiredSessionIds,
        lastAction: { type: "disable" },
      };

    case "reset": {
      const resetState = createInitialAssistantState({
        enabled: state.enabled,
        audioEnabled: state.audioEnabled,
        microphoneEnabled: false,
      });
      return {
        ...resetState,
        retiredSessionIds: state.sessionId
          ? addTombstone(state.retiredSessionIds, state.sessionId)
          : state.retiredSessionIds,
      };
    }

    case "begin_session": {
      const retiredSessionIds = state.sessionId
        ? addTombstone(state.retiredSessionIds, state.sessionId)
        : state.retiredSessionIds;
      return {
        ...clearEphemeralState(state),
        enabled: true,
        status: action.microphoneEnabled
          ? "requesting_permission"
          : "connecting",
        sessionId: action.sessionId,
        connectionState: action.microphoneEnabled
          ? "requesting_permission"
          : "connecting",
        microphoneEnabled: action.microphoneEnabled,
        audioEnabled: action.audioEnabled ?? state.audioEnabled,
        retiredSessionIds,
        lastAction: {
          type: "begin_session",
          sessionId: action.sessionId,
        },
      };
    }

    case "submit_text": {
      if (!isCurrentSession(state, action.sessionId)) {
        return state;
      }
      const text = action.text.trim();
      if (text.length === 0 || isIgnoredTurn(state, action.turnId)) {
        return state;
      }
      return {
        ...state,
        status: "processing",
        activeTurnId: action.turnId,
        activeTurnKind: "user",
        partialTranscript: "",
        assistantText: "",
        assistantTextSource: null,
        error: null,
        ignoredTurnIds: addTombstone(state.ignoredTurnIds, action.turnId),
        transcript: upsertTranscript(state.transcript, {
          id: `${action.sessionId}:${action.turnId}:user`,
          sessionId: action.sessionId,
          turnId: action.turnId,
          role: "user",
          source: "text",
          text,
          final: true,
        }),
        lastAction: {
          type: "submit_text",
          sessionId: action.sessionId,
          turnId: action.turnId,
        },
      };
    }

    case "interrupt": {
      if (!isCurrentSession(state, action.sessionId)) {
        return state;
      }
      const interruptedTurnId = action.turnId ?? state.activeTurnId;
      if (
        action.turnId &&
        state.activeTurnId &&
        action.turnId !== state.activeTurnId
      ) {
        return state;
      }
      return {
        ...state,
        status: "interrupted",
        activeTurnId: null,
        activeTurnKind: null,
        assistantText: "",
        assistantTextSource: null,
        ignoredTurnIds: interruptedTurnId
          ? addTombstone(state.ignoredTurnIds, interruptedTurnId)
          : state.ignoredTurnIds,
        lastAction: {
          type: "interrupt",
          sessionId: action.sessionId,
          ...(interruptedTurnId ? { turnId: interruptedTurnId } : {}),
        },
      };
    }

    case "request_reconnect":
      if (action.sessionId && !isCurrentSession(state, action.sessionId)) {
        return state;
      }
      return {
        ...state,
        status: "reconnecting",
        connectionState: "reconnecting",
        lastAction: {
          type: "request_reconnect",
          ...(state.sessionId ? { sessionId: state.sessionId } : {}),
        },
      };

    case "request_close":
      if (action.sessionId && !isCurrentSession(state, action.sessionId)) {
        return state;
      }
      return {
        ...state,
        status: "closing",
        connectionState: "disconnecting",
        lastAction: {
          type: "request_close",
          ...(state.sessionId ? { sessionId: state.sessionId } : {}),
        },
      };

    case "set_audio_enabled":
      return {
        ...state,
        audioEnabled: action.enabled,
        lastAction: { type: "set_audio_enabled" },
      };

    case "set_microphone_enabled":
      return {
        ...state,
        microphoneEnabled: action.enabled,
        status:
          state.connectionState === "connected"
            ? action.enabled
              ? "listening"
              : "idle"
            : state.status,
        lastAction: { type: "set_microphone_enabled" },
      };

    case "present_panels":
      if (
        !isCurrentSession(state, action.sessionId) ||
        !isCurrentTurnWhenSpecified(state, action.turnId)
      ) {
        return state;
      }
      return {
        ...state,
        presentedPanels: action.panels,
        lastAction: {
          type: "present_panels",
          sessionId: action.sessionId,
          ...(action.turnId ? { turnId: action.turnId } : {}),
        },
      };

    case "request_confirmation":
      if (
        !isCurrentSession(state, action.confirmation.sessionId) ||
        !matchesPendingCall(state, action.confirmation.callId)
      ) {
        return state;
      }
      return {
        ...state,
        status: "awaiting_confirmation",
        pendingConfirmation: action.confirmation,
        lastAction: {
          type: "request_confirmation",
          sessionId: action.confirmation.sessionId,
          turnId: action.confirmation.turnId,
          callId: action.confirmation.callId,
        },
      };

    case "resolve_confirmation":
      if (
        !isCurrentSession(state, action.sessionId) ||
        state.pendingConfirmation?.id !== action.confirmationId
      ) {
        return state;
      }
      return {
        ...state,
        status: action.approved ? "executing_tool" : "processing",
        pendingConfirmation: null,
        pendingToolCall: action.approved ? state.pendingToolCall : null,
        lastAction: {
          type: action.approved
            ? "confirmation_approved"
            : "confirmation_rejected",
          sessionId: action.sessionId,
          callId: state.pendingConfirmation.callId,
        },
      };

    case "tool_execution_started":
      if (
        !isCurrentSession(state, action.sessionId) ||
        !matchesPendingCall(state, action.callId)
      ) {
        return state;
      }
      return {
        ...state,
        status: "executing_tool",
        lastAction: {
          type: "tool_execution_started",
          sessionId: action.sessionId,
          callId: action.callId,
        },
      };

    case "tool_execution_completed":
      if (
        !isCurrentSession(state, action.sessionId) ||
        !matchesPendingCall(state, action.callId)
      ) {
        return state;
      }
      if (action.error) {
        return {
          ...state,
          status: "error",
          pendingConfirmation: null,
          error: {
            ...action.error,
            source: "tool",
            sessionId: action.sessionId,
          },
          lastAction: {
            type: "tool_execution_failed",
            sessionId: action.sessionId,
            callId: action.callId,
          },
        };
      }
      return {
        ...state,
        status: "processing",
        pendingToolCall: null,
        pendingConfirmation: null,
        lastAction: {
          type: "tool_execution_completed",
          sessionId: action.sessionId,
          callId: action.callId,
        },
      };

    case "runtime_error":
      return {
        ...state,
        status: "error",
        error: { source: "runtime", ...action.error },
        lastAction: { type: "runtime_error", sessionId: action.error.sessionId, turnId: action.error.turnId },
      };

    case "clear_error":
      return {
        ...state,
        status:
          state.connectionState === "connected"
            ? restingStatus(state)
            : state.enabled
              ? "idle"
              : "disabled",
        error: null,
        lastAction: { type: "clear_error" },
      };

    case "transport_event":
      return reduceTransportEvent(state, action.event);
  }
}

export const assistantReducer = assistantMachineReducer;

export function reduceTransportEvent(
  state: AssistantMachineState,
  transportEvent: RealtimeTransportEvent,
): AssistantMachineState {
  if (transportEvent.type === "transport.connection") {
    return reduceConnectionEvent(state, transportEvent);
  }

  if (!isCurrentSession(state, transportEvent.sessionId)) {
    return state;
  }

  if (transportEvent.type === "transport.remote_audio") {
    return {
      ...state,
      lastAction: {
        type: "remote_audio_ready",
        sessionId: transportEvent.sessionId,
      },
    };
  }

  return reduceServerEvent(
    state,
    transportEvent.sessionId,
    transportEvent.event,
  );
}

function reduceConnectionEvent(
  state: AssistantMachineState,
  event: Extract<RealtimeTransportEvent, { type: "transport.connection" }>,
): AssistantMachineState {
  const sameSession = state.sessionId === event.sessionId;
  const canAdoptSession =
    state.sessionId === null &&
    !state.retiredSessionIds.includes(event.sessionId) &&
    event.connectionState !== "disconnecting" &&
    event.connectionState !== "disconnected";

  if (!sameSession && !canAdoptSession) {
    return state;
  }

  const baseState: AssistantMachineState = canAdoptSession
    ? {
        ...state,
        enabled: true,
        sessionId: event.sessionId,
        remoteSessionId: null,
        activeTurnId: null,
        activeTurnKind: null,
        partialTranscript: "",
        assistantText: "",
        assistantTextSource: null,
        pendingToolCall: null,
        pendingConfirmation: null,
        error: null,
      }
    : state;

  if (event.connectionState === "disconnected") {
    return {
      ...clearEphemeralState(baseState),
      status: baseState.enabled ? "idle" : "disabled",
      connectionState: "disconnected",
      microphoneEnabled: false,
      retiredSessionIds: addTombstone(
        baseState.retiredSessionIds,
        event.sessionId,
      ),
      lastAction: {
        type: "disconnected",
        sessionId: event.sessionId,
      },
    };
  }

  if (event.connectionState === "error") {
    return {
      ...baseState,
      status: "error",
      connectionState: "error",
      error: {
        source: "transport",
        sessionId: event.sessionId,
        message: event.error?.message ?? "The realtime connection failed.",
        code: event.error?.code,
        type: event.error?.type,
        eventId: event.error?.eventId,
        recoverable: event.error?.recoverable ?? true,
      },
      lastAction: {
        type: "connection_error",
        sessionId: event.sessionId,
      },
    };
  }

  const status = connectionStatus(event.connectionState, baseState);
  return {
    ...baseState,
    status,
    connectionState: event.connectionState,
    microphoneEnabled:
      event.connectionState === "requesting_permission"
        ? true
        : baseState.microphoneEnabled,
    error: null,
    lastAction: {
      type: event.connectionState,
      sessionId: event.sessionId,
    },
  };
}

function reduceServerEvent(
  state: AssistantMachineState,
  sessionId: string,
  event: RealtimeServerEvent,
): AssistantMachineState {
  switch (event.type) {
    case "session.created":
    case "session.updated":
      return {
        ...state,
        remoteSessionId:
          event.session?.id ?? state.remoteSessionId,
        status:
          event.type === "session.created" &&
          state.connectionState === "connected"
            ? restingStatus(state)
            : state.status,
        lastAction: {
          type: event.type,
          sessionId,
        },
      };

    case "input_audio_buffer.speech_started": {
      const turnId =
        event.item_id ?? event.event_id ?? state.activeTurnId ?? "voice-input";
      const wasAssistantSpeaking =
        state.status === "assistant_speaking" ||
        state.activeTurnKind === "assistant";
      const ignoredTurnIds =
        wasAssistantSpeaking && state.activeTurnId
          ? addTombstone(state.ignoredTurnIds, state.activeTurnId)
          : state.ignoredTurnIds;
      return {
        ...state,
        status: "user_speaking",
        activeTurnId: turnId,
        activeTurnKind: "user",
        partialTranscript: "",
        assistantText: wasAssistantSpeaking ? "" : state.assistantText,
        assistantTextSource: wasAssistantSpeaking
          ? null
          : state.assistantTextSource,
        ignoredTurnIds,
        lastAction: {
          type: wasAssistantSpeaking ? "barge_in" : event.type,
          sessionId,
          turnId,
        },
      };
    }

    case "input_audio_buffer.speech_stopped":
    case "input_audio_buffer.committed": {
      if (!acceptsUserTurn(state, event.item_id)) {
        return state;
      }
      const turnId = event.item_id ?? state.activeTurnId ?? undefined;
      return {
        ...state,
        status: "processing",
        lastAction: {
          type: event.type,
          sessionId,
          ...(turnId ? { turnId } : {}),
        },
      };
    }

    case "conversation.item.input_audio_transcription.delta": {
      if (!acceptsUserTurn(state, event.item_id)) {
        return state;
      }
      const turnId = event.item_id ?? state.activeTurnId;
      return {
        ...state,
        activeTurnId: turnId,
        activeTurnKind: "user",
        partialTranscript: state.partialTranscript + (event.delta ?? ""),
        lastAction: {
          type: event.type,
          sessionId,
          ...(turnId ? { turnId } : {}),
        },
      };
    }

    case "conversation.item.input_audio_transcription.completed": {
      if (!acceptsUserTurn(state, event.item_id)) {
        return state;
      }
      const turnId = event.item_id ?? state.activeTurnId;
      if (!turnId) {
        return state;
      }
      const text = (event.transcript ?? state.partialTranscript).trim();
      return {
        ...state,
        status: "processing",
        activeTurnId: turnId,
        activeTurnKind: "user",
        partialTranscript: "",
        ignoredTurnIds: addTombstone(state.ignoredTurnIds, turnId),
        transcript:
          text.length > 0
            ? upsertTranscript(state.transcript, {
                id: event.event_id ?? `${sessionId}:${turnId}:user`,
                sessionId,
                turnId,
                role: "user",
                source: "voice",
                text,
                final: true,
              })
            : state.transcript,
        lastAction: {
          type: event.type,
          sessionId,
          turnId,
        },
      };
    }

    case "conversation.item.input_audio_transcription.failed": {
      if (!acceptsUserTurn(state, event.item_id)) {
        return state;
      }
      const failedState = withServerError(
        state,
        sessionId,
        event.item_id,
        "transcription",
        event.error,
        "Speech transcription failed.",
      );
      return {
        ...failedState,
        activeTurnId: null,
        activeTurnKind: null,
        ignoredTurnIds: event.item_id
          ? addTombstone(state.ignoredTurnIds, event.item_id)
          : state.ignoredTurnIds,
      };
    }

    case "response.created": {
      const turnId = event.response?.id ?? event.event_id;
      if (!turnId || isIgnoredTurn(state, turnId)) {
        return state;
      }
      return {
        ...state,
        status: "processing",
        activeTurnId: turnId,
        activeTurnKind: "assistant",
        assistantText: "",
        assistantTextSource: null,
        lastAction: {
          type: event.type,
          sessionId,
          turnId,
        },
      };
    }

    case "response.output_text.delta":
      return reduceAssistantDelta(
        state,
        sessionId,
        event.response_id,
        event.delta,
        "text",
        event.type,
      );

    case "response.output_audio_transcript.delta":
      return reduceAssistantDelta(
        state,
        sessionId,
        event.response_id,
        event.delta,
        "audio_transcript",
        event.type,
      );

    case "response.output_text.done":
      return reduceAssistantDoneText(
        state,
        sessionId,
        event.response_id,
        event.text,
        "text",
        event.type,
      );

    case "response.output_audio_transcript.done":
      return reduceAssistantDoneText(
        state,
        sessionId,
        event.response_id,
        event.transcript,
        "audio_transcript",
        event.type,
      );

    case "response.function_call_arguments.done": {
      const turnId = event.response_id ?? state.activeTurnId;
      if (
        !turnId ||
        !event.call_id ||
        !event.name ||
        !acceptsAssistantTurn(state, turnId)
      ) {
        return state;
      }
      const argumentsText = event.arguments ?? "{}";
      return {
        ...state,
        status: "executing_tool",
        activeTurnId: turnId,
        activeTurnKind: "assistant",
        pendingToolCall: {
          sessionId,
          turnId,
          callId: event.call_id,
          name: event.name,
          argumentsText,
          arguments: parseToolArguments(argumentsText),
        },
        lastAction: {
          type: event.type,
          sessionId,
          turnId,
          callId: event.call_id,
        },
      };
    }

    case "response.done": {
      const turnId = event.response?.id ?? state.activeTurnId;
      if (!turnId || !acceptsAssistantTurn(state, turnId)) {
        return state;
      }
      const finalText = state.assistantText.trim();
      return {
        ...state,
        status: state.pendingToolCall ? "executing_tool" : restingStatus(state),
        activeTurnId: state.pendingToolCall ? turnId : null,
        activeTurnKind: state.pendingToolCall ? "assistant" : null,
        ignoredTurnIds: addTombstone(state.ignoredTurnIds, turnId),
        transcript:
          finalText.length > 0
            ? upsertTranscript(state.transcript, {
                id: `${sessionId}:${turnId}:assistant`,
                sessionId,
                turnId,
                role: "assistant",
                source:
                  state.assistantTextSource === "audio_transcript"
                    ? "voice"
                    : "text",
                text: finalText,
                final: true,
              })
            : state.transcript,
        lastAction: {
          type: event.type,
          sessionId,
          turnId,
        },
      };
    }

    case "response.error": {
      if (event.response_id && !acceptsAssistantTurn(state, event.response_id)) {
        return state;
      }
      const failedState = withServerError(
        state,
        sessionId,
        event.response_id,
        "server",
        event.error,
        "The assistant response failed.",
      );
      return {
        ...failedState,
        activeTurnId: null,
        activeTurnKind: null,
        ignoredTurnIds: event.response_id
          ? addTombstone(state.ignoredTurnIds, event.response_id)
          : state.ignoredTurnIds,
      };
    }

    case "error": {
      const failedState = withServerError(
        state,
        sessionId,
        state.activeTurnId ?? undefined,
        "server",
        event.error,
        "The realtime service returned an error.",
      );
      return {
        ...failedState,
        activeTurnId: null,
        activeTurnKind: null,
        ignoredTurnIds: state.activeTurnId
          ? addTombstone(state.ignoredTurnIds, state.activeTurnId)
          : state.ignoredTurnIds,
      };
    }

    case "rate_limits.updated":
      return {
        ...state,
        rateLimits: (Array.isArray(event.rate_limits)
          ? event.rate_limits
          : []
        ).flatMap((limit) =>
          typeof limit.name === "string"
            ? [
                {
                  name: limit.name,
                  ...(typeof limit.limit === "number"
                    ? { limit: limit.limit }
                    : {}),
                  ...(typeof limit.remaining === "number"
                    ? { remaining: limit.remaining }
                    : {}),
                  ...(typeof limit.reset_seconds === "number"
                    ? { resetSeconds: limit.reset_seconds }
                    : {}),
                },
              ]
            : [],
        ),
        lastAction: { type: event.type, sessionId },
      };

    case "unknown":
      return state;
  }
}

function reduceAssistantDelta(
  state: AssistantMachineState,
  sessionId: string,
  responseId: string | undefined,
  delta: string | undefined,
  source: "text" | "audio_transcript",
  eventType: string,
): AssistantMachineState {
  const turnId = responseId ?? state.activeTurnId;
  if (
    !turnId ||
    !acceptsAssistantTurn(state, turnId) ||
    (state.assistantTextSource && state.assistantTextSource !== source)
  ) {
    return state;
  }

  return {
    ...state,
    status:
      source === "audio_transcript" && state.audioEnabled
        ? "assistant_speaking"
        : "processing",
    activeTurnId: turnId,
    activeTurnKind: "assistant",
    assistantText: state.assistantText + (delta ?? ""),
    assistantTextSource: source,
    lastAction: { type: eventType, sessionId, turnId },
  };
}

function reduceAssistantDoneText(
  state: AssistantMachineState,
  sessionId: string,
  responseId: string | undefined,
  finalText: string | undefined,
  source: "text" | "audio_transcript",
  eventType: string,
): AssistantMachineState {
  const turnId = responseId ?? state.activeTurnId;
  if (
    !turnId ||
    !acceptsAssistantTurn(state, turnId) ||
    (state.assistantTextSource && state.assistantTextSource !== source)
  ) {
    return state;
  }

  return {
    ...state,
    status:
      source === "audio_transcript" && state.audioEnabled
        ? "assistant_speaking"
        : "processing",
    activeTurnId: turnId,
    activeTurnKind: "assistant",
    assistantText: finalText ?? state.assistantText,
    assistantTextSource: source,
    lastAction: { type: eventType, sessionId, turnId },
  };
}

function withServerError(
  state: AssistantMachineState,
  sessionId: string,
  turnId: string | undefined,
  source: AssistantError["source"],
  error:
    | (Readonly<Record<string, unknown>> & {
        code?: string;
        message?: string;
        type?: string;
        event_id?: string;
      })
    | undefined,
  fallbackMessage: string,
): AssistantMachineState {
  return {
    ...state,
    status: "error",
    error: {
      source,
      sessionId,
      ...(turnId ? { turnId } : {}),
      message: error?.message ?? fallbackMessage,
      code: error?.code,
      type: error?.type,
      eventId: error?.event_id,
      recoverable: true,
    },
    lastAction: {
      type: `${source}_error`,
      sessionId,
      ...(turnId ? { turnId } : {}),
    },
  };
}

function connectionStatus(
  connectionState: RealtimeConnectionState,
  state: AssistantMachineState,
): AssistantStatus {
  switch (connectionState) {
    case "idle":
      return state.enabled ? "idle" : "disabled";
    case "requesting_permission":
      return "requesting_permission";
    case "connecting":
      return "connecting";
    case "connected":
      return restingStatus(state);
    case "reconnecting":
      return "reconnecting";
    case "disconnecting":
      return "closing";
    case "disconnected":
      return state.enabled ? "idle" : "disabled";
    case "error":
      return "error";
  }
}

function restingStatus(state: AssistantMachineState): AssistantStatus {
  return state.microphoneEnabled ? "listening" : "idle";
}

function clearEphemeralState(
  state: AssistantMachineState,
): AssistantMachineState {
  return {
    ...state,
    sessionId: null,
    remoteSessionId: null,
    activeTurnId: null,
    activeTurnKind: null,
    partialTranscript: "",
    assistantText: "",
    assistantTextSource: null,
    pendingToolCall: null,
    pendingConfirmation: null,
    error: null,
  };
}

function isCurrentSession(
  state: AssistantMachineState,
  sessionId: string,
): boolean {
  return state.sessionId !== null && state.sessionId === sessionId;
}

function isIgnoredTurn(
  state: AssistantMachineState,
  turnId: string,
): boolean {
  return state.ignoredTurnIds.includes(turnId);
}

function acceptsUserTurn(
  state: AssistantMachineState,
  turnId: string | undefined,
): boolean {
  if (turnId && isIgnoredTurn(state, turnId)) {
    return false;
  }
  if (!state.activeTurnId || state.activeTurnKind !== "user" || !turnId) {
    return true;
  }
  return state.activeTurnId === turnId;
}

function acceptsAssistantTurn(
  state: AssistantMachineState,
  turnId: string,
): boolean {
  if (isIgnoredTurn(state, turnId)) {
    return false;
  }
  if (!state.activeTurnId || state.activeTurnKind !== "assistant") {
    return true;
  }
  return state.activeTurnId === turnId;
}

function isCurrentTurnWhenSpecified(
  state: AssistantMachineState,
  turnId: string | undefined,
): boolean {
  if (!turnId || state.pendingToolCall?.turnId === turnId) {
    return true;
  }
  return (
    !isIgnoredTurn(state, turnId) &&
    (!state.activeTurnId || state.activeTurnId === turnId)
  );
}

function matchesPendingCall(
  state: AssistantMachineState,
  callId: string,
): boolean {
  return state.pendingToolCall?.callId === callId;
}

function addTombstone(values: readonly string[], value: string): readonly string[] {
  const unique = [...values.filter((entry) => entry !== value), value];
  return unique.slice(-TOMBSTONE_LIMIT);
}

function upsertTranscript(
  transcript: readonly AssistantTranscriptEntry[],
  entry: AssistantTranscriptEntry,
): readonly AssistantTranscriptEntry[] {
  const existingIndex = transcript.findIndex(
    (candidate) => candidate.id === entry.id,
  );
  if (existingIndex < 0) {
    return [...transcript, entry];
  }

  return transcript.map((candidate, index) =>
    index === existingIndex ? entry : candidate,
  );
}

function parseToolArguments(argumentsText: string): unknown {
  try {
    return JSON.parse(argumentsText) as unknown;
  } catch {
    return argumentsText;
  }
}
