import { describe, expect, it, vi } from "vitest";
import { MockRealtimeTransport } from "./mock-realtime-transport";

describe("MockRealtimeTransport", () => {
  it("models push-to-talk microphone publication and cancellation", async () => {
    const transport = new MockRealtimeTransport();
    await transport.connect({
      voice: true,
      session: { audio: { input: { turn_detection: null } } },
    });

    expect(transport.microphoneTrackEnabled).toBe(false);
    transport.clearSentEvents();
    transport.emitServerEvent({
      type: "response.created",
      response: { id: "response-before-ptt" },
    });

    transport.startPushToTalk();
    expect(transport.microphoneTrackEnabled).toBe(true);
    expect(transport.sentEvents).toEqual([
      { type: "response.cancel", response_id: "response-before-ptt" },
      { type: "output_audio_buffer.clear" },
      { type: "input_audio_buffer.clear" },
    ]);

    transport.stopPushToTalk();
    expect(transport.microphoneTrackEnabled).toBe(false);
    expect(transport.sentEvents.slice(-2)).toEqual([
      { type: "input_audio_buffer.commit" },
      { type: "response.create" },
    ]);

    transport.clearSentEvents();
    transport.startPushToTalk();
    expect(transport.microphoneTrackEnabled).toBe(true);
    transport.cancelPushToTalk();
    expect(transport.microphoneTrackEnabled).toBe(false);
    expect(transport.sentEvents).toEqual([
      { type: "input_audio_buffer.clear" },
      { type: "input_audio_buffer.clear" },
    ]);

    transport.updateSession({
      audio: { input: { turn_detection: { type: "semantic_vad" } } },
    });
    expect(transport.microphoneTrackEnabled).toBe(true);
  });

  it("models text turns without requesting microphone permission", async () => {
    const transport = new MockRealtimeTransport();

    await transport.connect({
      voice: false,
      session: { instructions: "Be concise." },
    });
    transport.sendText("Plan dnia");

    expect(transport.microphoneRequestCount).toBe(0);
    expect(transport.sentEvents).toEqual([
      {
        type: "session.update",
        session: { instructions: "Be concise." },
      },
      {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Plan dnia" }],
        },
      },
      { type: "response.create" },
    ]);

    transport.clearSentEvents();
    transport.sendContext("Użytkownik cofnął poprzednią zmianę.");
    expect(transport.sentEvents).toEqual([
      {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Użytkownik cofnął poprzednią zmianę.",
            },
          ],
        },
      },
    ]);
  });

  it("cancels output audio when speech starts during a response", async () => {
    const transport = new MockRealtimeTransport();
    const listener = vi.fn();
    transport.onEvent(listener);
    await transport.connect({ voice: true });
    transport.clearSentEvents();

    transport.emitServerEvent({
      type: "response.created",
      response: { id: "response-1" },
    });
    transport.emitServerEvent({
      type: "input_audio_buffer.speech_started",
      item_id: "user-1",
    });

    expect(transport.sentEvents).toEqual([
      { type: "response.cancel", response_id: "response-1" },
      { type: "output_audio_buffer.clear" },
    ]);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "transport.server_event",
        event: expect.objectContaining({
          type: "input_audio_buffer.speech_started",
        }),
      }),
    );
  });

  it("uses a fresh local session id on reconnect and supports cleanup", async () => {
    const transport = new MockRealtimeTransport();
    const listener = vi.fn();
    const unsubscribe = transport.onEvent(listener);
    await transport.connect();
    const firstSessionId = transport.sessionId;

    await transport.reconnect();

    expect(transport.sessionId).not.toBe(firstSessionId);
    expect(transport.disconnectCount).toBe(1);
    expect(transport.listenerCount).toBe(1);

    unsubscribe();
    await transport.disconnect();
    expect(transport.listenerCount).toBe(0);
  });
});
