export type RealtimeConnectionState =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnecting"
  | "disconnected"
  | "error";

export type RealtimeOutputModality = "text" | "audio";

export interface RealtimeFunctionTool {
  type: "function";
  name: string;
  description?: string;
  parameters?: Readonly<Record<string, unknown>>;
}

export interface RealtimeSessionConfiguration {
  type?: "realtime";
  instructions?: string;
  output_modalities?: readonly RealtimeOutputModality[];
  tools?: readonly RealtimeFunctionTool[];
  tool_choice?: "auto" | "none" | "required" | Readonly<Record<string, unknown>>;
  max_output_tokens?: number | "inf";
  audio?: Readonly<{
    input?: Readonly<Record<string, unknown>>;
    output?: Readonly<Record<string, unknown>>;
  }>;
  metadata?: Readonly<Record<string, string>>;
  [key: string]: unknown;
}

export interface RealtimeConnectOptions {
  /** Request microphone access and publish the microphone track. */
  voice?: boolean;
  session?: RealtimeSessionConfiguration;
  signal?: AbortSignal;
}

export interface RealtimeErrorDetails {
  code?: string;
  message: string;
  type?: string;
  eventId?: string;
  recoverable: boolean;
}

interface RealtimeEventBase {
  type: string;
  event_id?: string;
}

export interface SessionCreatedEvent extends RealtimeEventBase {
  type: "session.created";
  session?: Readonly<Record<string, unknown>> & { id?: string };
}

export interface SessionUpdatedEvent extends RealtimeEventBase {
  type: "session.updated";
  session?: Readonly<Record<string, unknown>> & { id?: string };
}

export interface InputAudioSpeechStartedEvent extends RealtimeEventBase {
  type: "input_audio_buffer.speech_started";
  audio_start_ms?: number;
  item_id?: string;
}

export interface InputAudioSpeechStoppedEvent extends RealtimeEventBase {
  type: "input_audio_buffer.speech_stopped";
  audio_end_ms?: number;
  item_id?: string;
}

export interface InputAudioCommittedEvent extends RealtimeEventBase {
  type: "input_audio_buffer.committed";
  item_id?: string;
  previous_item_id?: string;
}

interface InputAudioTranscriptionEventBase extends RealtimeEventBase {
  item_id?: string;
  content_index?: number;
}

export interface InputAudioTranscriptionDeltaEvent
  extends InputAudioTranscriptionEventBase {
  type: "conversation.item.input_audio_transcription.delta";
  delta?: string;
}

export interface InputAudioTranscriptionCompletedEvent
  extends InputAudioTranscriptionEventBase {
  type: "conversation.item.input_audio_transcription.completed";
  transcript?: string;
}

export interface InputAudioTranscriptionFailedEvent
  extends InputAudioTranscriptionEventBase {
  type: "conversation.item.input_audio_transcription.failed";
  error?: Readonly<Record<string, unknown>> & {
    code?: string;
    message?: string;
    type?: string;
  };
}

export interface ResponseCreatedEvent extends RealtimeEventBase {
  type: "response.created";
  response?: Readonly<Record<string, unknown>> & {
    id?: string;
    status?: string;
  };
}

interface ResponseOutputEventBase extends RealtimeEventBase {
  response_id?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
}

export interface ResponseOutputTextDeltaEvent extends ResponseOutputEventBase {
  type: "response.output_text.delta";
  delta?: string;
}

export interface ResponseOutputTextDoneEvent extends ResponseOutputEventBase {
  type: "response.output_text.done";
  text?: string;
}

export interface ResponseOutputAudioTranscriptDeltaEvent
  extends ResponseOutputEventBase {
  type: "response.output_audio_transcript.delta";
  delta?: string;
}

export interface ResponseOutputAudioTranscriptDoneEvent
  extends ResponseOutputEventBase {
  type: "response.output_audio_transcript.done";
  transcript?: string;
}

export interface ResponseFunctionCallArgumentsDoneEvent
  extends ResponseOutputEventBase {
  type: "response.function_call_arguments.done";
  call_id?: string;
  name?: string;
  arguments?: string;
}

export interface ResponseDoneEvent extends RealtimeEventBase {
  type: "response.done";
  response?: Readonly<Record<string, unknown>> & {
    id?: string;
    status?: string;
    status_details?: Readonly<Record<string, unknown>>;
    output?: readonly unknown[];
  };
}

export interface ResponseErrorEvent extends RealtimeEventBase {
  type: "response.error";
  response_id?: string;
  error?: Readonly<Record<string, unknown>> & {
    code?: string;
    message?: string;
    type?: string;
  };
}

export interface ErrorEvent extends RealtimeEventBase {
  type: "error";
  error?: Readonly<Record<string, unknown>> & {
    code?: string;
    event_id?: string;
    message?: string;
    type?: string;
  };
}

export interface RateLimitsUpdatedEvent extends RealtimeEventBase {
  type: "rate_limits.updated";
  rate_limits?: readonly (Readonly<Record<string, unknown>> & {
    name?: string;
    limit?: number;
    remaining?: number;
    reset_seconds?: number;
  })[];
}

export interface UnknownRealtimeServerEvent extends RealtimeEventBase {
  type: "unknown";
  originalType: string;
  payload: Readonly<Record<string, unknown>>;
}

export type KnownRealtimeServerEvent =
  | SessionCreatedEvent
  | SessionUpdatedEvent
  | InputAudioSpeechStartedEvent
  | InputAudioSpeechStoppedEvent
  | InputAudioCommittedEvent
  | InputAudioTranscriptionDeltaEvent
  | InputAudioTranscriptionCompletedEvent
  | InputAudioTranscriptionFailedEvent
  | ResponseCreatedEvent
  | ResponseOutputTextDeltaEvent
  | ResponseOutputTextDoneEvent
  | ResponseOutputAudioTranscriptDeltaEvent
  | ResponseOutputAudioTranscriptDoneEvent
  | ResponseFunctionCallArgumentsDoneEvent
  | ResponseDoneEvent
  | ResponseErrorEvent
  | ErrorEvent
  | RateLimitsUpdatedEvent;

export type RealtimeServerEvent =
  | KnownRealtimeServerEvent
  | UnknownRealtimeServerEvent;

export interface RealtimeSessionSnapshot {
  localSessionId: string;
  remoteSessionId?: string;
}

export type RealtimeTransportEvent =
  | {
      type: "transport.connection";
      sessionId: string;
      connectionState: RealtimeConnectionState;
      error?: RealtimeErrorDetails;
    }
  | {
      type: "transport.server_event";
      sessionId: string;
      event: RealtimeServerEvent;
    }
  | {
      type: "transport.remote_audio";
      sessionId: string;
      stream: MediaStream;
    };

export type RealtimeEventListener = (event: RealtimeTransportEvent) => void;

export type RealtimeClientEvent =
  | {
      type: "session.update";
      session: RealtimeSessionConfiguration;
    }
  | {
      type: "conversation.item.create";
      item:
        | {
            type: "message";
            role: "user";
            content: readonly [{ type: "input_text"; text: string }];
          }
        | {
            type: "function_call_output";
            call_id: string;
            output: string;
          };
    }
  | { type: "response.create" }
  | { type: "response.cancel"; response_id?: string }
  | { type: "input_audio_buffer.clear" }
  | { type: "input_audio_buffer.commit" }
  | { type: "output_audio_buffer.clear" };

export function parseRealtimeServerEvent(
  value: unknown,
): RealtimeServerEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  if (KNOWN_SERVER_EVENT_TYPES.has(value.type)) {
    return value as unknown as KnownRealtimeServerEvent;
  }

  return {
    type: "unknown",
    originalType: value.type,
    payload: value,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const KNOWN_SERVER_EVENT_TYPES: ReadonlySet<string> = new Set([
  "session.created",
  "session.updated",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "input_audio_buffer.committed",
  "conversation.item.input_audio_transcription.delta",
  "conversation.item.input_audio_transcription.completed",
  "conversation.item.input_audio_transcription.failed",
  "response.created",
  "response.output_text.delta",
  "response.output_text.done",
  "response.output_audio_transcript.delta",
  "response.output_audio_transcript.done",
  "response.function_call_arguments.done",
  "response.done",
  "response.error",
  "error",
  "rate_limits.updated",
]);
