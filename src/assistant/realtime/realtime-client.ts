import {
  isRecord,
  parseRealtimeServerEvent,
  type RealtimeClientEvent,
  type RealtimeConnectOptions,
  type RealtimeConnectionState,
  type RealtimeErrorDetails,
  type RealtimeEventListener,
  type RealtimeServerEvent,
  type RealtimeSessionConfiguration,
  type RealtimeTransportEvent,
} from "./realtime-types";
import {
  RealtimeTransportNotConnectedError,
  type RealtimeTransport,
} from "./realtime-transport";

interface WebRtcRealtimeTransportDependencies {
  createPeerConnection: (configuration?: RTCConfiguration) => RTCPeerConnection;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  fetch: typeof fetch;
  createAudioElement: () => HTMLAudioElement;
  createAudioContext: () => AudioContext | null;
  createSessionId: () => string;
}

export interface WebRtcRealtimeTransportOptions {
  endpoint?: string;
  /** Read on each negotiation; the transport never persists the returned token. */
  getAccessToken?: () => string | null | undefined;
  rtcConfiguration?: RTCConfiguration;
  connectionTimeoutMs?: number;
  iceGatheringTimeoutMs?: number;
  dependencies?: Partial<WebRtcRealtimeTransportDependencies>;
}

interface ConnectionResources {
  readonly sessionId: string;
  readonly controller: AbortController;
  readonly listenerCleanups: Array<() => void>;
  peerConnection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  localStream: MediaStream | null;
  remoteAudio: HTMLAudioElement | null;
  audioContext: AudioContext | null;
  microphoneSource: MediaStreamAudioSourceNode | null;
  microphoneAnalyser: AnalyserNode | null;
  activeResponseId: string | null;
  pushToTalkMode: boolean;
}

const DEFAULT_ENDPOINT = "/api/assistant/realtime-session";
const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_ICE_GATHERING_TIMEOUT_MS = 2_000;

let fallbackSessionCounter = 0;

/**
 * Browser WebRTC implementation of the Realtime transport.
 *
 * Constructing this class is side-effect free. Microphone permission is only
 * requested by connect({ voice: true }), which should be called from an
 * explicit user gesture.
 */
export class WebRtcRealtimeTransport implements RealtimeTransport {
  private readonly endpoint: string;
  private readonly getAccessToken?: () => string | null | undefined;
  private readonly rtcConfiguration?: RTCConfiguration;
  private readonly connectionTimeoutMs: number;
  private readonly iceGatheringTimeoutMs: number;
  private readonly dependencies: WebRtcRealtimeTransportDependencies;
  private readonly listeners = new Set<RealtimeEventListener>();

  private resources: ConnectionResources | null = null;
  private lastConnectOptions: RealtimeConnectOptions = {};
  private currentConnectionState: RealtimeConnectionState = "idle";
  private currentSessionId: string | null = null;

  constructor(options: WebRtcRealtimeTransportOptions = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.getAccessToken = options.getAccessToken;
    this.rtcConfiguration = options.rtcConfiguration;
    this.connectionTimeoutMs =
      options.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS;
    this.iceGatheringTimeoutMs =
      options.iceGatheringTimeoutMs ?? DEFAULT_ICE_GATHERING_TIMEOUT_MS;
    this.dependencies = {
      createPeerConnection:
        options.dependencies?.createPeerConnection ?? defaultCreatePeerConnection,
      getUserMedia:
        options.dependencies?.getUserMedia ?? defaultGetUserMedia,
      fetch: options.dependencies?.fetch ?? defaultFetch,
      createAudioElement:
        options.dependencies?.createAudioElement ?? defaultCreateAudioElement,
      createAudioContext:
        options.dependencies?.createAudioContext ?? defaultCreateAudioContext,
      createSessionId:
        options.dependencies?.createSessionId ?? defaultCreateSessionId,
    };
  }

  get sessionId(): string | null {
    return this.currentSessionId;
  }

  get connectionState(): RealtimeConnectionState {
    return this.currentConnectionState;
  }

  async connect(options: RealtimeConnectOptions = {}): Promise<void> {
    await this.disconnect();
    this.lastConnectOptions = copyConnectOptions(options);
    await this.openConnection(this.lastConnectOptions, false);
  }

  async reconnect(): Promise<void> {
    const options = copyConnectOptions(this.lastConnectOptions);
    await this.disconnect();
    await this.openConnection(options, true);
  }

  async disconnect(): Promise<void> {
    const resources = this.resources;
    const sessionId = this.currentSessionId;

    if (!resources && !sessionId) {
      this.currentConnectionState = "disconnected";
      return;
    }

    if (sessionId) {
      this.setConnectionState(sessionId, "disconnecting");
    }

    this.resources = null;
    this.currentSessionId = null;
    if (resources) {
      await releaseConnectionResources(resources);
    }

    this.currentConnectionState = "disconnected";
    if (sessionId) {
      this.emit({
        type: "transport.connection",
        sessionId,
        connectionState: "disconnected",
      });
    }
  }

  sendText(text: string): void {
    if (text.trim().length === 0) {
      return;
    }

    this.sendContext(text);
    this.sendClientEvent({ type: "response.create" });
  }

  sendContext(text: string): void {
    if (text.trim().length === 0) {
      return;
    }

    this.sendClientEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
  }

  startPushToTalk(): void {
    if (this.resources?.activeResponseId) {
      this.cancelResponse();
    }
    this.sendClientEvent({ type: "input_audio_buffer.clear" });
    if (this.resources?.pushToTalkMode) {
      setMicrophoneTracksEnabled(this.resources, true);
    }
  }

  stopPushToTalk(): void {
    if (this.resources?.pushToTalkMode) {
      setMicrophoneTracksEnabled(this.resources, false);
    }
    this.sendClientEvent({ type: "input_audio_buffer.commit" });
    this.sendClientEvent({ type: "response.create" });
  }

  cancelPushToTalk(): void {
    if (this.resources?.pushToTalkMode) {
      setMicrophoneTracksEnabled(this.resources, false);
    }
    this.sendClientEvent({ type: "input_audio_buffer.clear" });
  }

  cancelResponse(): void {
    const resources = this.resources;
    if (!resources || resources.dataChannel?.readyState !== "open") {
      return;
    }

    this.sendClientEvent({
      type: "response.cancel",
      ...(resources.activeResponseId
        ? { response_id: resources.activeResponseId }
        : {}),
    });
    this.sendClientEvent({ type: "output_audio_buffer.clear" });
    resources.activeResponseId = null;
    stopRemoteAudio(resources.remoteAudio);
  }

  interrupt(): void {
    this.cancelResponse();
  }

  updateSession(session: RealtimeSessionConfiguration): void {
    const pushToTalkMode = readPushToTalkMode(session);
    const resources = this.resources;
    if (pushToTalkMode === true && resources) {
      resources.pushToTalkMode = true;
      setMicrophoneTracksEnabled(resources, false);
    }
    this.sendClientEvent({ type: "session.update", session });
    if (pushToTalkMode === false && resources) {
      resources.pushToTalkMode = false;
      setMicrophoneTracksEnabled(resources, true);
    }
  }

  completeFunctionCall(callId: string, output: unknown, options: { requestResponse?: boolean } = {}): void {
    const normalizedCallId = callId.trim();
    if (normalizedCallId.length === 0) {
      throw new TypeError("A function call id is required.");
    }

    this.sendClientEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: normalizedCallId,
        output: serializeFunctionOutput(output),
      },
    });
    if (options.requestResponse !== false) this.requestResponse();
  }

  requestResponse(): void {
    this.sendClientEvent({ type: "response.create" });
  }

  getInputAnalyser(): AnalyserNode | null {
    return this.resources?.microphoneAnalyser ?? null;
  }

  onEvent(listener: RealtimeEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async openConnection(
    options: RealtimeConnectOptions,
    reconnecting: boolean,
  ): Promise<void> {
    const sessionId = this.dependencies.createSessionId();
    const resources = createConnectionResources(
      sessionId,
      readPushToTalkMode(options.session) ?? false,
    );
    this.currentSessionId = sessionId;
    this.resources = resources;

    linkAbortSignal(options.signal, resources, () => {
      if (
        this.isCurrent(resources) &&
        this.currentConnectionState === "connected"
      ) {
        void this.disconnect();
      }
    });

    try {
      this.assertCurrent(resources);
      if (reconnecting) {
        this.setConnectionState(sessionId, "reconnecting");
      }

      if (options.voice) {
        this.setConnectionState(sessionId, "requesting_permission");
        const localStream = await this.dependencies.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        resources.localStream = localStream;
        this.assertCurrent(resources);
        this.createMicrophoneAnalysisGraph(resources, localStream);
      }

      this.assertCurrent(resources);
      this.setConnectionState(sessionId, reconnecting ? "reconnecting" : "connecting");

      const peerConnection = this.dependencies.createPeerConnection(
        this.rtcConfiguration,
      );
      resources.peerConnection = peerConnection;
      this.installPeerConnectionListeners(resources, peerConnection);

      if (resources.localStream) {
        for (const track of resources.localStream.getAudioTracks()) {
          if (resources.pushToTalkMode) {
            track.enabled = false;
          }
          peerConnection.addTrack(track, resources.localStream);
        }
      } else {
        peerConnection.addTransceiver("audio", { direction: "recvonly" });
      }

      const dataChannel = peerConnection.createDataChannel("oai-events");
      resources.dataChannel = dataChannel;
      this.installDataChannelListeners(resources, dataChannel);

      const offer = await peerConnection.createOffer();
      this.assertCurrent(resources);
      await peerConnection.setLocalDescription(offer);
      await waitForIceGathering(
        peerConnection,
        resources.controller.signal,
        this.iceGatheringTimeoutMs,
      );
      this.assertCurrent(resources);

      const offerSdp = peerConnection.localDescription?.sdp ?? offer.sdp;
      if (!offerSdp) {
        throw new Error("The browser did not produce a WebRTC SDP offer.");
      }

      const accessToken = this.getAccessToken?.()?.trim();
      const headers: Record<string, string> = {
        Accept: "application/sdp, application/json",
        "Content-Type": "application/sdp",
      };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const answerResponse = await this.dependencies.fetch(this.endpoint, {
        method: "POST",
        headers,
        body: offerSdp,
        signal: resources.controller.signal,
      });
      this.assertCurrent(resources);

      if (!answerResponse.ok) {
        throw new Error(
          `Realtime session negotiation failed (${answerResponse.status}).`,
        );
      }

      const answerBody = await answerResponse.text();
      this.assertCurrent(resources);
      const answerSdp = parseAnswerSdp(
        answerBody,
        answerResponse.headers.get("content-type"),
      );
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
      await waitForDataChannelOpen(
        dataChannel,
        resources.controller.signal,
        this.connectionTimeoutMs,
      );
      this.assertCurrent(resources);

      if (options.session) {
        this.sendClientEvent({
          type: "session.update",
          session: options.session,
        });
      }
      this.setConnectionState(sessionId, "connected");
    } catch (error: unknown) {
      await releaseConnectionResources(resources);

      if (!this.isCurrent(resources)) {
        throw toAbortError();
      }

      this.resources = null;
      if (isAbortError(error)) {
        this.currentSessionId = null;
        this.currentConnectionState = "disconnected";
        throw error;
      }

      const details = toRealtimeError(error, true);
      this.setConnectionState(sessionId, "error", details);
      throw error;
    }
  }

  private createMicrophoneAnalysisGraph(
    resources: ConnectionResources,
    stream: MediaStream,
  ): void {
    const audioContext = this.dependencies.createAudioContext();
    if (!audioContext) {
      return;
    }

    resources.audioContext = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    resources.microphoneSource = source;
    resources.microphoneAnalyser = analyser;
  }

  private installPeerConnectionListeners(
    resources: ConnectionResources,
    peerConnection: RTCPeerConnection,
  ): void {
    const handleTrack = (event: RTCTrackEvent) => {
      if (!this.isCurrent(resources)) {
        return;
      }

      const stream = event.streams[0] ?? createStreamForTrack(event.track);
      if (!stream) {
        return;
      }

      const audio =
        resources.remoteAudio ?? this.dependencies.createAudioElement();
      resources.remoteAudio = audio;
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.srcObject = stream;
      playRemoteAudio(audio);

      this.emit({
        type: "transport.remote_audio",
        sessionId: resources.sessionId,
        stream,
      });
    };

    const handleConnectionStateChange = () => {
      if (!this.isCurrent(resources)) {
        return;
      }

      if (peerConnection.connectionState === "failed") {
        this.terminateConnection(resources, "error", {
          code: "webrtc_connection_failed",
          message: "The realtime WebRTC connection failed.",
          recoverable: true,
        });
      } else if (
        peerConnection.connectionState === "disconnected" ||
        peerConnection.connectionState === "closed"
      ) {
        this.terminateConnection(resources, "disconnected");
      }
    };

    peerConnection.addEventListener("track", handleTrack);
    peerConnection.addEventListener(
      "connectionstatechange",
      handleConnectionStateChange,
    );
    resources.listenerCleanups.push(() => {
      peerConnection.removeEventListener("track", handleTrack);
      peerConnection.removeEventListener(
        "connectionstatechange",
        handleConnectionStateChange,
      );
    });
  }

  private installDataChannelListeners(
    resources: ConnectionResources,
    dataChannel: RTCDataChannel,
  ): void {
    const handleMessage = (message: MessageEvent<unknown>) => {
      if (!this.isCurrent(resources)) {
        return;
      }

      const event = parseDataChannelMessage(message.data);
      if (!event) {
        this.setConnectionState(resources.sessionId, "error", {
          code: "invalid_realtime_event",
          message: "The realtime service returned an invalid event.",
          recoverable: true,
        });
        return;
      }

      this.handleServerEvent(resources, event);
    };

    const handleError = () => {
      if (this.isCurrent(resources)) {
        this.terminateConnection(resources, "error", {
          code: "data_channel_error",
          message: "The realtime event channel failed.",
          recoverable: true,
        });
      }
    };

    const handleClose = () => {
      if (this.isCurrent(resources)) {
        this.terminateConnection(resources, "disconnected");
      }
    };

    dataChannel.addEventListener("message", handleMessage);
    dataChannel.addEventListener("error", handleError);
    dataChannel.addEventListener("close", handleClose);
    resources.listenerCleanups.push(() => {
      dataChannel.removeEventListener("message", handleMessage);
      dataChannel.removeEventListener("error", handleError);
      dataChannel.removeEventListener("close", handleClose);
    });
  }

  private handleServerEvent(
    resources: ConnectionResources,
    event: RealtimeServerEvent,
  ): void {
    if (event.type === "response.created") {
      resources.activeResponseId = event.response?.id ?? null;
      playRemoteAudio(resources.remoteAudio);
    } else if (
      event.type === "response.done" ||
      event.type === "response.error"
    ) {
      resources.activeResponseId = null;
    } else if (
      event.type === "input_audio_buffer.speech_started" &&
      resources.activeResponseId
    ) {
      this.cancelResponse();
    }

    this.emit({
      type: "transport.server_event",
      sessionId: resources.sessionId,
      event,
    });
  }

  private sendClientEvent(event: RealtimeClientEvent): void {
    const channel = this.resources?.dataChannel;
    if (!channel || channel.readyState !== "open") {
      throw new RealtimeTransportNotConnectedError();
    }

    channel.send(JSON.stringify(event));
  }

  private assertCurrent(resources: ConnectionResources): void {
    if (!this.isCurrent(resources) || resources.controller.signal.aborted) {
      throw toAbortError();
    }
  }

  private isCurrent(resources: ConnectionResources): boolean {
    return (
      this.resources === resources &&
      this.currentSessionId === resources.sessionId
    );
  }

  private terminateConnection(
    resources: ConnectionResources,
    connectionState: "disconnected" | "error",
    error?: RealtimeErrorDetails,
  ): void {
    if (!this.isCurrent(resources)) {
      return;
    }

    this.resources = null;
    this.currentSessionId = null;
    const cleanup = releaseConnectionResources(resources);
    this.setConnectionState(resources.sessionId, connectionState, error);
    void cleanup;
  }

  private setConnectionState(
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
        // An observer must not break negotiation or resource cleanup.
      }
    }
  }
}

function createConnectionResources(
  sessionId: string,
  pushToTalkMode: boolean,
): ConnectionResources {
  return {
    sessionId,
    controller: new AbortController(),
    listenerCleanups: [],
    peerConnection: null,
    dataChannel: null,
    localStream: null,
    remoteAudio: null,
    audioContext: null,
    microphoneSource: null,
    microphoneAnalyser: null,
    activeResponseId: null,
    pushToTalkMode,
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

function setMicrophoneTracksEnabled(
  resources: ConnectionResources | null,
  enabled: boolean,
): void {
  if (!resources) {
    return;
  }
  for (const track of resources.localStream?.getAudioTracks() ?? []) {
    track.enabled = enabled;
  }
}

function copyConnectOptions(
  options: RealtimeConnectOptions,
): RealtimeConnectOptions {
  return {
    voice: options.voice ?? false,
    ...(options.session ? { session: { ...options.session } } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
}

function linkAbortSignal(
  source: AbortSignal | undefined,
  resources: ConnectionResources,
  onExternalAbort: () => void,
): void {
  if (!source) {
    return;
  }

  const abort = () => {
    resources.controller.abort(source.reason);
    onExternalAbort();
  };
  if (source.aborted) {
    abort();
    return;
  }

  source.addEventListener("abort", abort, { once: true });
  resources.listenerCleanups.push(() => {
    source.removeEventListener("abort", abort);
  });
}

async function releaseConnectionResources(
  resources: ConnectionResources,
): Promise<void> {
  if (!resources.controller.signal.aborted) {
    resources.controller.abort();
  }

  for (const cleanup of resources.listenerCleanups.splice(0).reverse()) {
    cleanup();
  }

  if (resources.dataChannel?.readyState !== "closed") {
    try {
      resources.dataChannel?.close();
    } catch {
      // Cleanup remains best-effort when the browser already disposed the channel.
    }
  }
  resources.dataChannel = null;

  for (const track of resources.localStream?.getTracks() ?? []) {
    track.stop();
  }
  resources.localStream = null;

  try {
    resources.microphoneSource?.disconnect();
    resources.microphoneAnalyser?.disconnect();
  } catch {
    // A detached Web Audio graph may already be disconnected.
  }
  resources.microphoneSource = null;
  resources.microphoneAnalyser = null;

  const audioContext = resources.audioContext;
  resources.audioContext = null;
  let closeAudioContext: Promise<void> = Promise.resolve();
  if (audioContext && audioContext.state !== "closed") {
    try {
      closeAudioContext = audioContext.close().catch(() => undefined);
    } catch {
      // Some browsers reject close while the context is still initializing.
    }
  }

  stopRemoteAudio(resources.remoteAudio);
  if (resources.remoteAudio) {
    resources.remoteAudio.srcObject = null;
    resources.remoteAudio.removeAttribute("src");
    resources.remoteAudio.load();
  }
  resources.remoteAudio = null;

  try {
    resources.peerConnection?.close();
  } catch {
    // Closing an already closed peer connection is harmless.
  }
  resources.peerConnection = null;
  resources.activeResponseId = null;
  await closeAudioContext;
}

function stopRemoteAudio(audio: HTMLAudioElement | null): void {
  if (!audio) {
    return;
  }

  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // A media element can reject seeking before metadata is available.
  }
}

function playRemoteAudio(audio: HTMLAudioElement | null): void {
  if (!audio) {
    return;
  }

  try {
    const playResult = audio.play();
    if (playResult) {
      void playResult.catch(() => undefined);
    }
  } catch {
    // Autoplay policy can reject synchronously; the stream remains attached.
  }
}

function parseDataChannelMessage(data: unknown): RealtimeServerEvent | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    return parseRealtimeServerEvent(JSON.parse(data) as unknown);
  } catch {
    return null;
  }
}

function parseAnswerSdp(body: string, contentType: string | null): string {
  if (contentType?.includes("application/json")) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (isRecord(parsed) && typeof parsed.sdp === "string") {
        return parsed.sdp;
      }
    } catch {
      throw new Error("The realtime session endpoint returned invalid JSON.");
    }
    throw new Error("The realtime session endpoint did not return an SDP answer.");
  }

  if (body.trim().length === 0) {
    throw new Error("The realtime session endpoint returned an empty SDP answer.");
  }
  return body;
}

function serializeFunctionOutput(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }

  const serialized = JSON.stringify(output);
  return serialized ?? "null";
}

function waitForIceGathering(
  peerConnection: RTCPeerConnection,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  if (peerConnection.iceGatheringState === "complete" || timeoutMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      peerConnection.removeEventListener(
        "icegatheringstatechange",
        handleStateChange,
      );
      signal.removeEventListener("abort", handleAbort);
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const handleStateChange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        finish();
      }
    };
    const handleAbort = () => finish(toAbortError());

    peerConnection.addEventListener(
      "icegatheringstatechange",
      handleStateChange,
    );
    signal.addEventListener("abort", handleAbort, { once: true });
    const timeout = setTimeout(() => finish(), timeoutMs);

    if (signal.aborted) {
      finish(toAbortError());
    }
  });
}

function waitForDataChannelOpen(
  dataChannel: RTCDataChannel,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  if (dataChannel.readyState === "open") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      dataChannel.removeEventListener("open", handleOpen);
      dataChannel.removeEventListener("close", handleClose);
      dataChannel.removeEventListener("error", handleError);
      signal.removeEventListener("abort", handleAbort);
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const handleOpen = () => finish();
    const handleClose = () =>
      finish(new Error("The realtime event channel closed during setup."));
    const handleError = () =>
      finish(new Error("The realtime event channel failed during setup."));
    const handleAbort = () => finish(toAbortError());

    dataChannel.addEventListener("open", handleOpen, { once: true });
    dataChannel.addEventListener("close", handleClose, { once: true });
    dataChannel.addEventListener("error", handleError, { once: true });
    signal.addEventListener("abort", handleAbort, { once: true });
    const timeout = setTimeout(
      () => finish(new Error("Timed out opening the realtime event channel.")),
      timeoutMs,
    );

    if (signal.aborted) {
      finish(toAbortError());
    }
  });
}

function createStreamForTrack(track: MediaStreamTrack): MediaStream | null {
  if (typeof MediaStream === "undefined") {
    return null;
  }
  return new MediaStream([track]);
}

function toRealtimeError(
  error: unknown,
  recoverable: boolean,
): RealtimeErrorDetails {
  if (error instanceof Error) {
    return {
      code: error.name,
      message: error.message,
      recoverable,
    };
  }

  return {
    message: "The realtime connection failed.",
    recoverable,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toAbortError(): Error {
  const error = new Error("The realtime connection was aborted.");
  error.name = "AbortError";
  return error;
}

function defaultCreatePeerConnection(
  configuration?: RTCConfiguration,
): RTCPeerConnection {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("WebRTC is not supported in this browser.");
  }
  return new RTCPeerConnection(configuration);
}

function defaultGetUserMedia(
  constraints: MediaStreamConstraints,
): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(
      new Error("Microphone capture is not supported in this browser."),
    );
  }
  return navigator.mediaDevices.getUserMedia(constraints);
}

function defaultFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return globalThis.fetch(input, init);
}

function defaultCreateAudioElement(): HTMLAudioElement {
  if (typeof document === "undefined") {
    throw new Error("Audio playback is not supported in this environment.");
  }
  return document.createElement("audio");
}

function defaultCreateAudioContext(): AudioContext | null {
  if (typeof AudioContext === "undefined") {
    return null;
  }
  return new AudioContext();
}

function defaultCreateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  fallbackSessionCounter += 1;
  return `realtime-${Date.now()}-${fallbackSessionCounter}`;
}
