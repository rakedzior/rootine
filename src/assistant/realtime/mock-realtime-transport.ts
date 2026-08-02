import type { RealtimeTransport } from "./realtime-transport";
import { RealtimeTransportNotConnectedError } from "./realtime-transport";
import type {
  RealtimeClientEvent,
  RealtimeConnectOptions,
  RealtimeConnectionState,
  RealtimeErrorDetails,
  RealtimeEventListener,
  RealtimeServerEvent,
  RealtimeSessionConfiguration,
  RealtimeTransportEvent,
} from "./realtime-types";

export interface MockRealtimeTransportOptions {
  sessionIdPrefix?: string;
  connectFailure?: Error | null;
}

/** Deterministic in-memory transport for component, reducer, and E2E tests. */
export class MockRealtimeTransport implements RealtimeTransport {
  private readonly listeners = new Set<RealtimeEventListener>();
  private readonly sessionIdPrefix: string;
  private sessionCounter = 0;
  private connectFailure: Error | null;
  private currentSessionId: string | null = null;
  private currentConnectionState: RealtimeConnectionState = "idle";
  private lastConnectOptions: RealtimeConnectOptions = {};
  private removeExternalAbortListener: (() => void) | null = null;
  private activeResponseId: string | null = null;
  private pushToTalkMode = false;

  readonly sentEvents: RealtimeClientEvent[] = [];
  microphoneRequestCount = 0;
  disconnectCount = 0;
  microphoneTrackEnabled = false;

  constructor(options: MockRealtimeTransportOptions = {}) {
    this.sessionIdPrefix = options.sessionIdPrefix ?? "mock-session";
    this.connectFailure = options.connectFailure ?? null;
  }

  get sessionId(): string | null {
    return this.currentSessionId;
  }

  get connectionState(): RealtimeConnectionState {
    return this.currentConnectionState;
  }

  async connect(options: RealtimeConnectOptions = {}): Promise<void> {
    if (this.currentSessionId) {
      await this.disconnect();
    }
    this.lastConnectOptions = copyOptions(options);
    await this.open(false);
  }

  async reconnect(): Promise<void> {
    if (this.currentSessionId) {
      await this.disconnect();
    }
    await this.open(true);
  }

  async disconnect(): Promise<void> {
    const sessionId = this.currentSessionId;
    if (!sessionId) {
      this.currentConnectionState = "disconnected";
      return;
    }

    this.emitConnection(sessionId, "disconnecting");
    this.disconnectCount += 1;
    this.activeResponseId = null;
    this.microphoneTrackEnabled = false;
    this.removeExternalAbortListener?.();
    this.removeExternalAbortListener = null;
    this.currentSessionId = null;
    this.currentConnectionState = "disconnected";
    this.emit({
      type: "transport.connection",
      sessionId,
      connectionState: "disconnected",
    });
  }

  sendText(text: string): void {
    if (text.trim().length === 0) {
      return;
    }
    this.sendContext(text);
    this.send({ type: "response.create" });
  }

  sendContext(text: string): void {
    if (text.trim().length === 0) {
      return;
    }
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
  }

  startPushToTalk(): void {
    if (this.activeResponseId) {
      this.cancelResponse();
    }
    this.send({ type: "input_audio_buffer.clear" });
    if (this.pushToTalkMode) {
      this.microphoneTrackEnabled = true;
    }
  }

  stopPushToTalk(): void {
    if (this.pushToTalkMode) {
      this.microphoneTrackEnabled = false;
    }
    this.send({ type: "input_audio_buffer.commit" });
    this.send({ type: "response.create" });
  }

  cancelPushToTalk(): void {
    if (this.pushToTalkMode) {
      this.microphoneTrackEnabled = false;
    }
    this.send({ type: "input_audio_buffer.clear" });
  }

  cancelResponse(): void {
    if (!this.currentSessionId || this.currentConnectionState !== "connected") {
      return;
    }
    this.send({
      type: "response.cancel",
      ...(this.activeResponseId
        ? { response_id: this.activeResponseId }
        : {}),
    });
    this.send({ type: "output_audio_buffer.clear" });
    this.activeResponseId = null;
  }

  interrupt(): void {
    this.cancelResponse();
  }

  updateSession(session: RealtimeSessionConfiguration): void {
    const pushToTalkMode = readPushToTalkMode(session);
    if (pushToTalkMode === true) {
      this.pushToTalkMode = true;
      this.microphoneTrackEnabled = false;
    }
    this.send({ type: "session.update", session });
    if (pushToTalkMode === false) {
      this.pushToTalkMode = false;
      this.microphoneTrackEnabled = Boolean(this.lastConnectOptions.voice);
    }
  }

  completeFunctionCall(callId: string, output: unknown, options: { requestResponse?: boolean } = {}): void {
    const normalizedCallId = callId.trim();
    if (normalizedCallId.length === 0) {
      throw new TypeError("A function call id is required.");
    }
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: normalizedCallId,
        output:
          typeof output === "string" ? output : JSON.stringify(output) ?? "null",
      },
    });
    if (options.requestResponse !== false) this.requestResponse();
  }

  requestResponse(): void {
    this.send({ type: "response.create" });
  }

  getInputAnalyser(): AnalyserNode | null {
    return null;
  }

  onEvent(listener: RealtimeEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitServerEvent(
    event: RealtimeServerEvent,
    sessionId: string | null = this.currentSessionId,
  ): void {
    if (!sessionId) {
      throw new RealtimeTransportNotConnectedError();
    }

    if (sessionId === this.currentSessionId) {
      if (event.type === "response.created") {
        this.activeResponseId = event.response?.id ?? null;
      } else if (
        event.type === "response.done" ||
        event.type === "response.error"
      ) {
        this.activeResponseId = null;
      } else if (
        event.type === "input_audio_buffer.speech_started" &&
        this.activeResponseId
      ) {
        this.cancelResponse();
      }
    }

    this.emit({
      type: "transport.server_event",
      sessionId,
      event,
    });
  }

  emitRemoteAudio(stream: MediaStream, sessionId = this.currentSessionId): void {
    if (!sessionId) {
      throw new RealtimeTransportNotConnectedError();
    }
    this.emit({
      type: "transport.remote_audio",
      sessionId,
      stream,
    });
  }

  setConnectFailure(failure: Error | null): void {
    this.connectFailure = failure;
  }

  clearSentEvents(): void {
    this.sentEvents.splice(0);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  private async open(reconnecting: boolean): Promise<void> {
    if (this.lastConnectOptions.signal?.aborted) {
      const abortError = new Error("The realtime connection was aborted.");
      abortError.name = "AbortError";
      throw abortError;
    }

    this.sessionCounter += 1;
    const sessionId = `${this.sessionIdPrefix}-${this.sessionCounter}`;
    this.currentSessionId = sessionId;
    this.pushToTalkMode = readPushToTalkMode(this.lastConnectOptions.session) ?? false;
    this.microphoneTrackEnabled = Boolean(
      this.lastConnectOptions.voice && !this.pushToTalkMode,
    );
    this.installExternalAbortListener(this.lastConnectOptions.signal);

    if (reconnecting) {
      this.emitConnection(sessionId, "reconnecting");
    }
    if (this.lastConnectOptions.voice) {
      this.microphoneRequestCount += 1;
      this.emitConnection(sessionId, "requesting_permission");
    }
    this.emitConnection(sessionId, reconnecting ? "reconnecting" : "connecting");

    if (this.connectFailure) {
      const details: RealtimeErrorDetails = {
        code: this.connectFailure.name,
        message: this.connectFailure.message,
        recoverable: true,
      };
      this.emitConnection(sessionId, "error", details);
      throw this.connectFailure;
    }

    this.emitConnection(sessionId, "connected");
    if (this.lastConnectOptions.session) {
      this.send({
        type: "session.update",
        session: this.lastConnectOptions.session,
      });
    }
  }

  private send(event: RealtimeClientEvent): void {
    if (!this.currentSessionId || this.currentConnectionState !== "connected") {
      throw new RealtimeTransportNotConnectedError();
    }
    this.sentEvents.push(event);
  }

  private emitConnection(
    sessionId: string,
    connectionState: RealtimeConnectionState,
    error?: RealtimeErrorDetails,
  ): void {
    this.currentConnectionState = connectionState;
    this.emit({
      type: "transport.connection",
      sessionId,
      connectionState,
      ...(error ? { error } : {}),
    });
  }

  private emit(event: RealtimeTransportEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // A test observer should not change mock transport behavior.
      }
    }
  }

  private installExternalAbortListener(signal: AbortSignal | undefined): void {
    this.removeExternalAbortListener?.();
    this.removeExternalAbortListener = null;
    if (!signal) {
      return;
    }

    const handleAbort = () => {
      void this.disconnect();
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    this.removeExternalAbortListener = () => {
      signal.removeEventListener("abort", handleAbort);
    };
  }
}

function copyOptions(options: RealtimeConnectOptions): RealtimeConnectOptions {
  return {
    voice: options.voice ?? false,
    ...(options.session ? { session: { ...options.session } } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
}

function readPushToTalkMode(
  session: RealtimeSessionConfiguration | undefined,
): boolean | undefined {
  const input = session?.audio?.input;
  if (!input || !("turn_detection" in input)) {
    return undefined;
  }
  return input.turn_detection === null;
}
