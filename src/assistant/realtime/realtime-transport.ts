import type {
  RealtimeConnectOptions,
  RealtimeConnectionState,
  RealtimeEventListener,
  RealtimeSessionConfiguration,
} from "./realtime-types";

export interface RealtimeTransport {
  readonly sessionId: string | null;
  readonly connectionState: RealtimeConnectionState;

  connect(options?: RealtimeConnectOptions): Promise<void>;
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;

  sendText(text: string): void;
  /** Add model-visible context without starting a new response. */
  sendContext(text: string): void;
  startPushToTalk(): void;
  stopPushToTalk(): void;
  cancelPushToTalk(): void;
  cancelResponse(): void;
  interrupt(): void;
  updateSession(session: RealtimeSessionConfiguration): void;
  completeFunctionCall(callId: string, output: unknown, options?: { requestResponse?: boolean }): void;
  requestResponse(): void;
  /** Ephemeral analyser for a visible waveform; callers must not retain audio. */
  getInputAnalyser(): AnalyserNode | null;

  onEvent(listener: RealtimeEventListener): () => void;
}

export class RealtimeTransportNotConnectedError extends Error {
  constructor() {
    super("Realtime transport is not connected.");
    this.name = "RealtimeTransportNotConnectedError";
  }
}
