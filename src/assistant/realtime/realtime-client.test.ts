import { describe, expect, it, vi } from "vitest";
import { WebRtcRealtimeTransport } from "./realtime-client";

class FakeDataChannel extends EventTarget {
  readonly label = "oai-events";
  readyState: RTCDataChannelState = "connecting";
  readonly sent: string[] = [];
  closeCount = 0;
  removedListenerCount = 0;

  send(data: string): void {
    this.sent.push(data);
  }

  open(): void {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  close(): void {
    this.closeCount += 1;
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  }

  serverEvent(event: Readonly<Record<string, unknown>>): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(event) }),
    );
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    this.removedListenerCount += 1;
    super.removeEventListener(type, callback, options);
  }
}

class FakePeerConnection extends EventTarget {
  readonly channel = new FakeDataChannel();
  connectionState: RTCPeerConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "complete";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  createdDataChannelLabel: string | null = null;
  addTrackCount = 0;
  addTransceiverCount = 0;
  closeCount = 0;
  removedListenerCount = 0;

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "local-offer-sdp" };
  }

  async setLocalDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    this.localDescription = description;
  }

  async setRemoteDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    this.remoteDescription = description;
    this.channel.open();
  }

  createDataChannel(label: string): RTCDataChannel {
    this.createdDataChannelLabel = label;
    return this.channel as unknown as RTCDataChannel;
  }

  addTrack(): RTCRtpSender {
    this.addTrackCount += 1;
    return {} as unknown as RTCRtpSender;
  }

  addTransceiver(): RTCRtpTransceiver {
    this.addTransceiverCount += 1;
    return {} as unknown as RTCRtpTransceiver;
  }

  dispatchRemoteTrack(stream: MediaStream, track: MediaStreamTrack): void {
    const event = new Event("track");
    Object.defineProperties(event, {
      streams: { value: [stream] },
      track: { value: track },
    });
    this.dispatchEvent(event);
  }

  close(): void {
    this.closeCount += 1;
    this.connectionState = "closed";
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    this.removedListenerCount += 1;
    super.removeEventListener(type, callback, options);
  }
}

describe("WebRtcRealtimeTransport", () => {
  it("keeps a push-to-talk microphone track disabled outside an active press", async () => {
    const peerConnection = new FakePeerConnection();
    const stopTrack = vi.fn();
    const track = {
      enabled: true,
      stop: stopTrack,
    } as unknown as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    const transport = new WebRtcRealtimeTransport({
      dependencies: {
        createPeerConnection: () =>
          peerConnection as unknown as RTCPeerConnection,
        getUserMedia: () => Promise.resolve(stream),
        fetch: (() =>
          Promise.resolve(
            new Response("answer", {
              headers: { "content-type": "application/sdp" },
            }),
          )) as typeof fetch,
        createAudioContext: () => null,
        createSessionId: () => "ptt-session",
      },
    });

    await transport.connect({
      voice: true,
      session: { audio: { input: { turn_detection: null } } },
    });

    expect(track.enabled).toBe(false);
    peerConnection.channel.serverEvent({
      type: "response.created",
      response: { id: "response-before-ptt" },
    });

    transport.startPushToTalk();
    expect(track.enabled).toBe(true);
    expect(
      peerConnection.channel.sent.slice(-3).map((event) => JSON.parse(event)),
    ).toEqual([
      { type: "response.cancel", response_id: "response-before-ptt" },
      { type: "output_audio_buffer.clear" },
      { type: "input_audio_buffer.clear" },
    ]);

    transport.stopPushToTalk();
    expect(track.enabled).toBe(false);
    expect(
      peerConnection.channel.sent.slice(-2).map((event) => JSON.parse(event)),
    ).toEqual([
      { type: "input_audio_buffer.commit" },
      { type: "response.create" },
    ]);

    transport.startPushToTalk();
    expect(track.enabled).toBe(true);
    const eventCountBeforeCancel = peerConnection.channel.sent.length;
    transport.cancelPushToTalk();
    expect(track.enabled).toBe(false);
    expect(
      peerConnection.channel.sent
        .slice(eventCountBeforeCancel)
        .map((event) => JSON.parse(event)),
    ).toEqual([{ type: "input_audio_buffer.clear" }]);

    transport.updateSession({
      audio: { input: { turn_detection: { type: "semantic_vad" } } },
    });
    expect(track.enabled).toBe(true);

    await transport.disconnect();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("negotiates voice only on connect, handles barge-in, and fully cleans up", async () => {
    const peerConnection = new FakePeerConnection();
    const stopTrack = vi.fn();
    const track = { stop: stopTrack } as unknown as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(() => Promise.resolve(stream));
    const fetchSession = vi.fn(
      (
        _input: RequestInfo | URL,
        _init?: RequestInit,
      ): Promise<Response> =>
        Promise.resolve(
          new Response("remote-answer-sdp", {
            status: 200,
            headers: { "content-type": "application/sdp" },
          }),
        ),
    );

    const disconnectSource = vi.fn();
    const disconnectAnalyser = vi.fn();
    const closeAudioContext = vi.fn(() => Promise.resolve());
    const analyser = {
      disconnect: disconnectAnalyser,
    } as unknown as AnalyserNode;
    const audioContext = {
      state: "running",
      createMediaStreamSource: () => ({
        connect: vi.fn(),
        disconnect: disconnectSource,
      }),
      createAnalyser: () => analyser,
      close: closeAudioContext,
    } as unknown as AudioContext;

    const audio = document.createElement("audio");
    const playAudio = vi.fn(() => Promise.resolve());
    const pauseAudio = vi.fn();
    const loadAudio = vi.fn();
    Object.defineProperties(audio, {
      play: { value: playAudio },
      pause: { value: pauseAudio },
      load: { value: loadAudio },
    });

    const transport = new WebRtcRealtimeTransport({
      getAccessToken: () => "  ephemeral-token  ",
      dependencies: {
        createPeerConnection: () =>
          peerConnection as unknown as RTCPeerConnection,
        getUserMedia,
        fetch: fetchSession as typeof fetch,
        createAudioElement: () => audio,
        createAudioContext: () => audioContext,
        createSessionId: () => "local-session-1",
      },
    });
    const listener = vi.fn();
    transport.onEvent(listener);

    expect(getUserMedia).not.toHaveBeenCalled();
    await transport.connect({
      voice: true,
      session: { output_modalities: ["audio"] },
    });

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(peerConnection.createdDataChannelLabel).toBe("oai-events");
    expect(peerConnection.addTrackCount).toBe(1);
    expect(peerConnection.addTransceiverCount).toBe(0);
    expect(peerConnection.remoteDescription?.sdp).toBe("remote-answer-sdp");
    expect(transport.getInputAnalyser()).toBe(analyser);

    const [requestUrl, requestInit] = fetchSession.mock.calls[0];
    expect(requestUrl).toBe("/api/assistant/realtime-session");
    expect(requestInit?.body).toBe("local-offer-sdp");
    expect(new Headers(requestInit?.headers).get("authorization")).toBe(
      "Bearer ephemeral-token",
    );
    const negotiationSignal = requestInit?.signal;

    peerConnection.dispatchRemoteTrack(stream, track);
    expect(playAudio).toHaveBeenCalledOnce();
    expect(audio.getAttribute("playsinline")).toBe("");

    peerConnection.channel.serverEvent({
      type: "response.created",
      response: { id: "response-1" },
    });
    peerConnection.channel.serverEvent({
      type: "input_audio_buffer.speech_started",
      item_id: "user-1",
    });
    const sentEvents = peerConnection.channel.sent.map(
      (event) => JSON.parse(event) as unknown,
    );
    expect(sentEvents).toContainEqual({
      type: "response.cancel",
      response_id: "response-1",
    });
    expect(sentEvents).toContainEqual({ type: "output_audio_buffer.clear" });
    peerConnection.channel.serverEvent({
      type: "response.created",
      response: { id: "response-2" },
    });
    expect(playAudio).toHaveBeenCalledTimes(3);

    transport.startPushToTalk();
    const pushToTalkEvents = peerConnection.channel.sent.map(
      (event) => JSON.parse(event) as unknown,
    );
    expect(pushToTalkEvents).toContainEqual({
      type: "response.cancel",
      response_id: "response-2",
    });
    expect(pushToTalkEvents.at(-1)).toEqual({ type: "input_audio_buffer.clear" });

    const eventCountBeforeCleanup = listener.mock.calls.length;
    await transport.disconnect();

    expect(stopTrack).toHaveBeenCalledOnce();
    expect(disconnectSource).toHaveBeenCalledOnce();
    expect(disconnectAnalyser).toHaveBeenCalledOnce();
    expect(closeAudioContext).toHaveBeenCalledOnce();
    expect(pauseAudio).toHaveBeenCalled();
    expect(loadAudio).toHaveBeenCalledOnce();
    expect(peerConnection.channel.closeCount).toBe(1);
    expect(peerConnection.closeCount).toBe(1);
    expect(peerConnection.removedListenerCount).toBeGreaterThanOrEqual(2);
    expect(peerConnection.channel.removedListenerCount).toBeGreaterThanOrEqual(2);
    expect(negotiationSignal?.aborted).toBe(true);
    expect(transport.getInputAnalyser()).toBeNull();

    peerConnection.channel.serverEvent({
      type: "response.output_text.delta",
      response_id: "response-1",
      delta: "late",
    });
    expect(listener.mock.calls.length).toBe(eventCountBeforeCleanup + 2);
  });

  it("does not request microphone access for a text-only connection", async () => {
    const peerConnection = new FakePeerConnection();
    const getUserMedia = vi.fn(() => Promise.reject(new Error("unexpected")));
    const transport = new WebRtcRealtimeTransport({
      dependencies: {
        createPeerConnection: () =>
          peerConnection as unknown as RTCPeerConnection,
        getUserMedia,
        fetch: (() =>
          Promise.resolve(
            new Response("answer", {
              headers: { "content-type": "application/sdp" },
            }),
          )) as typeof fetch,
        createAudioContext: () => null,
        createSessionId: () => "text-session",
      },
    });

    await transport.connect({ voice: false });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(peerConnection.addTransceiverCount).toBe(1);
    await transport.disconnect();
  });

  it("stops a late microphone stream when disconnect wins the permission race", async () => {
    let resolveMicrophone: ((stream: MediaStream) => void) | undefined;
    const microphonePromise = new Promise<MediaStream>((resolve) => {
      resolveMicrophone = resolve;
    });
    const getUserMedia = vi.fn(() => microphonePromise);
    const stopTrack = vi.fn();
    const track = { stop: stopTrack } as unknown as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    const transport = new WebRtcRealtimeTransport({
      dependencies: {
        getUserMedia,
        createSessionId: () => "permission-race",
      },
    });

    const connectResult = transport.connect({ voice: true });
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    await transport.disconnect();
    resolveMicrophone?.(stream);

    await expect(connectResult).rejects.toMatchObject({ name: "AbortError" });
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("releases media when the peer connection reaches a terminal state", async () => {
    const peerConnection = new FakePeerConnection();
    const stopTrack = vi.fn();
    const track = { stop: stopTrack } as unknown as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    const transport = new WebRtcRealtimeTransport({
      dependencies: {
        createPeerConnection: () =>
          peerConnection as unknown as RTCPeerConnection,
        getUserMedia: () => Promise.resolve(stream),
        fetch: (() =>
          Promise.resolve(
            new Response("answer", {
              headers: { "content-type": "application/sdp" },
            }),
          )) as typeof fetch,
        createAudioContext: () => null,
        createSessionId: () => "terminal-session",
      },
    });

    await transport.connect({ voice: true });
    peerConnection.connectionState = "failed";
    peerConnection.dispatchEvent(new Event("connectionstatechange"));

    await vi.waitFor(() => expect(stopTrack).toHaveBeenCalledOnce());
    expect(transport.connectionState).toBe("error");
    expect(transport.sessionId).toBeNull();
    expect(peerConnection.closeCount).toBe(1);
  });
});
