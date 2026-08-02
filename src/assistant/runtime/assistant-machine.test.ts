import { describe, expect, it } from "vitest";
import type { RealtimeServerEvent } from "../realtime/realtime-types";
import {
  assistantMachineReducer,
  createInitialAssistantState,
  type AssistantMachineState,
} from "./assistant-machine";

function connectSession(
  sessionId: string,
  microphoneEnabled = false,
): AssistantMachineState {
  let state = createInitialAssistantState({ enabled: true });
  state = assistantMachineReducer(state, {
    type: "begin_session",
    sessionId,
    microphoneEnabled,
  });
  return assistantMachineReducer(state, {
    type: "transport_event",
    event: {
      type: "transport.connection",
      sessionId,
      connectionState: "connected",
    },
  });
}

function serverEvent(
  state: AssistantMachineState,
  sessionId: string,
  event: RealtimeServerEvent,
): AssistantMachineState {
  return assistantMachineReducer(state, {
    type: "transport_event",
    event: {
      type: "transport.server_event",
      sessionId,
      event,
    },
  });
}

describe("assistantMachineReducer", () => {
  it("ignores events from a stale session", () => {
    const current = connectSession("session-current");
    const stale = serverEvent(current, "session-old", {
      type: "response.output_text.delta",
      response_id: "response-old",
      delta: "This must not leak into the current session.",
    });

    expect(stale).toBe(current);
    expect(stale.assistantText).toBe("");
    expect(stale.activeTurnId).toBeNull();
  });

  it("reduces a complete text turn into the transcript", () => {
    let state = connectSession("session-1");
    state = assistantMachineReducer(state, {
      type: "submit_text",
      sessionId: "session-1",
      turnId: "user-1",
      text: "  Co dziś robię?  ",
    });
    state = serverEvent(state, "session-1", {
      type: "response.created",
      response: { id: "response-1" },
    });
    state = serverEvent(state, "session-1", {
      type: "response.output_text.delta",
      response_id: "response-1",
      delta: "Masz ",
    });
    state = serverEvent(state, "session-1", {
      type: "response.output_text.done",
      response_id: "response-1",
      text: "Masz trzy priorytety.",
    });
    state = serverEvent(state, "session-1", {
      type: "response.done",
      response: { id: "response-1", status: "completed" },
    });

    expect(state.status).toBe("idle");
    expect(state.assistantText).toBe("Masz trzy priorytety.");
    expect(state.transcript).toEqual([
      expect.objectContaining({
        role: "user",
        turnId: "user-1",
        text: "Co dziś robię?",
      }),
      expect.objectContaining({
        role: "assistant",
        turnId: "response-1",
        text: "Masz trzy priorytety.",
      }),
    ]);

    const completed = state;
    state = serverEvent(state, "session-1", {
      type: "response.output_text.delta",
      response_id: "response-1",
      delta: "late",
    });
    expect(state).toBe(completed);
  });

  it("tombstones an interrupted turn and ignores its late events", () => {
    let state = connectSession("voice-session", true);
    state = serverEvent(state, "voice-session", {
      type: "response.created",
      response: { id: "response-voice" },
    });
    state = serverEvent(state, "voice-session", {
      type: "response.output_audio_transcript.delta",
      response_id: "response-voice",
      delta: "Zaczynam długą odpowiedź",
    });
    expect(state.status).toBe("assistant_speaking");

    state = serverEvent(state, "voice-session", {
      type: "input_audio_buffer.speech_started",
      item_id: "user-barge-in",
    });
    expect(state.status).toBe("user_speaking");
    expect(state.activeTurnId).toBe("user-barge-in");
    expect(state.ignoredTurnIds).toContain("response-voice");
    expect(state.assistantText).toBe("");
    expect(state.lastAction?.type).toBe("barge_in");

    const afterLateEvent = serverEvent(state, "voice-session", {
      type: "response.output_audio_transcript.delta",
      response_id: "response-voice",
      delta: " — spóźniona końcówka",
    });
    expect(afterLateEvent).toBe(state);
  });

  it("keeps an explicitly cancelled response cancelled", () => {
    let state = connectSession("session-1");
    state = serverEvent(state, "session-1", {
      type: "response.created",
      response: { id: "response-1" },
    });
    state = assistantMachineReducer(state, {
      type: "interrupt",
      sessionId: "session-1",
      turnId: "response-1",
    });
    const interrupted = state;

    state = serverEvent(state, "session-1", {
      type: "response.done",
      response: { id: "response-1", status: "cancelled" },
    });

    expect(state).toBe(interrupted);
    expect(state.status).toBe("interrupted");
    expect(state.transcript).toHaveLength(0);
  });

  it("does not let a late connection event re-enable a disabled session", () => {
    let state = connectSession("session-to-close", true);
    state = assistantMachineReducer(state, { type: "disable" });
    const disabled = state;

    state = assistantMachineReducer(state, {
      type: "transport_event",
      event: {
        type: "transport.connection",
        sessionId: "session-to-close",
        connectionState: "connected",
      },
    });

    expect(state).toBe(disabled);
    expect(state.status).toBe("disabled");
    expect(state.enabled).toBe(false);
  });
});
