import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultAssistantSettings,
  saveAssistantSettings,
} from "../config/assistant-settings";
import { AssistantSettingsProvider } from "../config/AssistantSettingsProvider";
import { MockRealtimeTransport } from "../realtime";
import type { AssistantRuntimeContextValue } from "./assistant-runtime-context";
import { useAssistant } from "./useAssistant";
import { AssistantProvider } from "./AssistantProvider";
import {
  loadTaskWorkspace,
  TASK_STORAGE_KEY,
  type TaskWorkspace,
} from "../../app/data/taskWorkspace";
import { loadGoalsWorkspace } from "../../domain/goals/goalsRepository";
import { resetDomainTestStorage } from "../../domain/testSupport";

const AVAILABLE_RESPONSE = {
  enabled: true,
  configured: true,
  available: true,
  requiresAccessToken: false,
  model: "gpt-realtime-test",
  limits: {
    idleTimeoutSeconds: 120,
    maxSessionMinutes: 10,
  },
};

const TASK_FIXTURE: TaskWorkspace = {
  version: 2,
  updatedAt: "2026-08-02T08:00:00.000Z",
  tasks: [
    {
      id: 101,
      text: "Przygotować raport kwartalny",
      done: false,
      view: "dzis",
      calendarDate: "2026-08-02",
      date: "2026-08-02",
      priority: "high",
    },
  ],
  habits: [],
  lists: [],
  tags: [],
};

type RuntimeCapture = { current: AssistantRuntimeContextValue | null };

function RuntimeProbe({ capture }: { capture: RuntimeCapture }) {
  const assistant = useAssistant();
  capture.current = assistant;
  return (
    <output data-testid="runtime-state">
      {assistant.availability.status}:{assistant.state.status}:
      {assistant.isOpen ? "open" : "closed"}
    </output>
  );
}

async function renderRuntime(transport = new MockRealtimeTransport()) {
  const capture: RuntimeCapture = { current: null };
  const navigate = vi.fn();
  const transportFactory = () => transport;

  render(
    <AssistantSettingsProvider>
      <AssistantProvider
        navigate={navigate}
        transportFactory={transportFactory}
      >
        <RuntimeProbe capture={capture} />
      </AssistantProvider>
    </AssistantSettingsProvider>,
  );

  const current = () => {
    if (!capture.current) {
      throw new Error("Assistant runtime was not captured.");
    }
    return capture.current;
  };

  await waitFor(() => {
    expect(current().availability.status).toBe("available");
    expect(current().canOpen).toBe(true);
  });

  return { current, navigate, transport };
}

async function connectWithText(
  runtime: Awaited<ReturnType<typeof renderRuntime>>,
  text = "Pokaż plan dnia",
) {
  await act(async () => {
    await runtime.current().sendText(text);
  });
  const sessionId = runtime.transport.sessionId;
  if (!sessionId) {
    throw new Error("Expected an active mock realtime session.");
  }
  return sessionId;
}

function emitToolCall(
  transport: MockRealtimeTransport,
  input: {
    callId: string;
    name: string;
    arguments: Readonly<Record<string, unknown>>;
    responseId?: string;
    sessionId?: string;
  },
) {
  transport.emitServerEvent(
    {
      type: "response.function_call_arguments.done",
      response_id: input.responseId ?? `response-${input.callId}`,
      call_id: input.callId,
      name: input.name,
      arguments: JSON.stringify(input.arguments),
    },
    input.sessionId ?? transport.sessionId,
  );
}

function functionOutput(
  transport: MockRealtimeTransport,
  callId: string,
): unknown | undefined {
  for (const event of transport.sentEvents) {
    if (
      event.type === "conversation.item.create" &&
      event.item.type === "function_call_output" &&
      event.item.call_id === callId
    ) {
      return JSON.parse(event.item.output) as unknown;
    }
  }
  return undefined;
}

function userMessages(transport: MockRealtimeTransport): string[] {
  return transport.sentEvents.flatMap((event) => {
    if (
      event.type !== "conversation.item.create" ||
      event.item.type !== "message"
    ) {
      return [];
    }
    return [event.item.content[0].text];
  });
}

beforeEach(() => {
  resetDomainTestStorage();
  window.sessionStorage.clear();
  const settings = createDefaultAssistantSettings();
  settings.permissions.presentation = { read: true, write: true };
  saveAssistantSettings(settings);

  const availabilityFetch = vi.fn(
    (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(AVAILABLE_RESPONSE), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
  );
  vi.stubGlobal("fetch", availabilityFetch as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AssistantProvider integration", () => {
  it("opens independently, starts a text session, and never requests the microphone", async () => {
    const runtime = await renderRuntime();

    act(() => runtime.current().openAssistant());
    expect(runtime.current().isOpen).toBe(true);
    expect(runtime.transport.sessionId).toBeNull();

    const sessionId = await connectWithText(runtime, "Co mam dziś zrobić?");

    expect(sessionId).toBe("mock-session-1");
    expect(runtime.transport.microphoneRequestCount).toBe(0);
    expect(runtime.transport.connectionState).toBe("connected");
    expect(runtime.current().state.sessionId).toBe(sessionId);
    expect(runtime.current().state.transcript).toEqual([
      expect.objectContaining({
        role: "user",
        source: "text",
        text: "Co mam dziś zrobić?",
      }),
    ]);
    expect(userMessages(runtime.transport)).toContain("Co mam dziś zrobić?");
  });

  it("streams partial text, finalizes it, and interrupts the next response", async () => {
    const runtime = await renderRuntime();
    await connectWithText(runtime);

    act(() => {
      runtime.transport.emitServerEvent({
        type: "response.created",
        response: { id: "response-text" },
      });
      runtime.transport.emitServerEvent({
        type: "response.output_text.delta",
        response_id: "response-text",
        delta: "Masz dwa ",
      });
    });
    expect(runtime.current().state.assistantText).toBe("Masz dwa ");
    expect(runtime.current().state.status).toBe("processing");

    act(() => {
      runtime.transport.emitServerEvent({
        type: "response.output_text.done",
        response_id: "response-text",
        text: "Masz dwa ważne zadania.",
      });
      runtime.transport.emitServerEvent({
        type: "response.done",
        response: { id: "response-text", status: "completed" },
      });
    });
    expect(runtime.current().state.transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          text: "Masz dwa ważne zadania.",
          final: true,
        }),
      ]),
    );

    runtime.transport.clearSentEvents();
    act(() => {
      runtime.transport.emitServerEvent({
        type: "response.created",
        response: { id: "response-to-cancel" },
      });
      runtime.transport.emitServerEvent({
        type: "response.output_text.delta",
        response_id: "response-to-cancel",
        delta: "Długa odpowiedź",
      });
      runtime.current().cancelResponse();
    });

    expect(runtime.current().state.status).toBe("interrupted");
    expect(runtime.current().state.ignoredTurnIds).toContain(
      "response-to-cancel",
    );
    expect(runtime.transport.sentEvents).toEqual([
      { type: "response.cancel", response_id: "response-to-cancel" },
      { type: "output_audio_buffer.clear" },
    ]);
  });

  it("executes a read tool, presents its panel, and returns function output", async () => {
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(TASK_FIXTURE));
    const runtime = await renderRuntime();
    await connectWithText(runtime, "Pokaż priorytety");
    runtime.transport.clearSentEvents();

    act(() => {
      emitToolCall(runtime.transport, {
        callId: "call-read",
        name: "get_priority_tasks",
        arguments: { limit: 5 },
      });
    });

    await waitFor(() => {
      expect(runtime.current().view?.panels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "priority_tasks",
            data: expect.objectContaining({
              items: [
                expect.objectContaining({
                  id: "101",
                  label: "Przygotować raport kwartalny",
                }),
              ],
            }),
          }),
        ]),
      );
      expect(functionOutput(runtime.transport, "call-read")).toEqual(
        expect.objectContaining({ success: true, total: 1 }),
      );
    });
  });

  it("returns one follow-up response for a batch of read tools", async () => {
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(TASK_FIXTURE));
    const runtime = await renderRuntime();
    await connectWithText(runtime, "Porównaj pilne i priorytetowe zadania");
    runtime.transport.clearSentEvents();

    act(() => {
      runtime.transport.emitServerEvent({
        type: "response.done",
        response: {
          id: "response-read-batch",
          status: "completed",
          output: [
            { type: "function_call", call_id: "batch-priority", name: "get_priority_tasks", arguments: JSON.stringify({ limit: 5 }) },
            { type: "function_call", call_id: "batch-urgent", name: "get_urgent_tasks", arguments: JSON.stringify({ limit: 5 }) },
          ],
        },
      });
    });

    await waitFor(() => {
      expect(functionOutput(runtime.transport, "batch-priority")).toEqual(expect.objectContaining({ success: true }));
      expect(functionOutput(runtime.transport, "batch-urgent")).toEqual(expect.objectContaining({ success: true }));
    });
    expect(runtime.transport.sentEvents.filter((event) => event.type === "response.create")).toHaveLength(1);
  });

  it("fails a multi-write batch closed without mutating domain data", async () => {
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ ...TASK_FIXTURE, tasks: [] }));
    const runtime = await renderRuntime();
    await connectWithText(runtime, "Dodaj dwa zadania");
    runtime.transport.clearSentEvents();

    act(() => {
      runtime.transport.emitServerEvent({
        type: "response.done",
        response: {
          id: "response-write-batch",
          status: "completed",
          output: [
            { type: "function_call", call_id: "batch-write-1", name: "create_task", arguments: JSON.stringify({ title: "Pierwsze" }) },
            { type: "function_call", call_id: "batch-write-2", name: "create_task", arguments: JSON.stringify({ title: "Drugie" }) },
          ],
        },
      });
    });

    await waitFor(() => {
      expect(functionOutput(runtime.transport, "batch-write-1")).toEqual(expect.objectContaining({ success: false, code: "UNSUPPORTED" }));
      expect(functionOutput(runtime.transport, "batch-write-2")).toEqual(expect.objectContaining({ success: false, code: "UNSUPPORTED" }));
    });
    expect(loadTaskWorkspace().tasks).toHaveLength(0);
    expect(runtime.transport.sentEvents.filter((event) => event.type === "response.create")).toHaveLength(1);
  });

  it("executes a reversible write and compensates it through Undo", async () => {
    window.localStorage.setItem(
      TASK_STORAGE_KEY,
      JSON.stringify({ ...TASK_FIXTURE, tasks: [] }),
    );
    const runtime = await renderRuntime();
    await connectWithText(runtime, "Dodaj zadanie");
    runtime.transport.clearSentEvents();

    act(() => {
      emitToolCall(runtime.transport, {
        callId: "call-create",
        name: "create_task",
        arguments: {
          title: "Zarezerwować wizytę",
          date: "2026-08-03",
          time: "09:00",
          priority: "high",
        },
      });
    });

    await waitFor(() => {
      expect(
        loadTaskWorkspace().tasks.some(
          (task) =>
            task.text === "Zarezerwować wizytę" && !task.deleted,
        ),
      ).toBe(true);
      expect(runtime.current().view?.panels.at(-1)).toMatchObject({
        type: "action_result",
        data: { success: true, undoToken: expect.any(String) },
      });
      expect(runtime.current().undoNotice?.token).toEqual(expect.any(String));
      expect(functionOutput(runtime.transport, "call-create")).toEqual(
        expect.objectContaining({ success: true }),
      );
    });

    const undoToken = runtime.current().undoNotice?.token;
    if (!undoToken) throw new Error("Expected a domain undo token.");
    const sentBeforeUndo = runtime.transport.sentEvents.length;
    await act(async () => {
      await runtime.current().undo(undoToken);
    });

    expect(
      loadTaskWorkspace().tasks.some(
        (task) => task.text === "Zarezerwować wizytę" && !task.deleted,
      ),
    ).toBe(false);
    expect(runtime.current().undoNotice).toBeNull();
    expect(runtime.transport.sentEvents).toHaveLength(sentBeforeUndo + 1);
    expect(runtime.transport.sentEvents.at(-1)).toMatchObject({
      type: "conversation.item.create",
      item: { type: "message" },
    });
  });

  it("keeps Undo locally while Privacy Mode blocks a note mutation from model output", async () => {
    const settings = createDefaultAssistantSettings();
    settings.permissions.presentation = { read: true, write: true };
    settings.assistantNotesEnabled = true;
    settings.permissions.notes = { read: true, write: true };
    saveAssistantSettings(settings);
    const runtime = await renderRuntime();
    act(() => {
      runtime.current().updateAppContext({
        module: "notes",
        timezone: "Europe/Warsaw",
        locale: "pl-PL",
        privacyMode: true,
      });
    });
    await connectWithText(runtime, "Zapisz prywatną notatkę");
    runtime.transport.clearSentEvents();

    act(() => {
      emitToolCall(runtime.transport, {
        callId: "call-private-note",
        name: "create_note",
        arguments: { title: "Sekret", body: "Poufna treść" },
      });
    });

    await waitFor(() => {
      expect(runtime.current().undoNotice?.token).toEqual(expect.any(String));
      expect(functionOutput(runtime.transport, "call-private-note")).toEqual(expect.objectContaining({
        success: true,
        privacyRestricted: true,
      }));
    });
    expect(JSON.stringify(functionOutput(runtime.transport, "call-private-note"))).not.toMatch(/Sekret|Poufna|undo-|event-/i);
  });

  it("waits for confirmation and executes an approved confirmed write", async () => {
    const runtime = await renderRuntime();
    await connectWithText(runtime, "Zaktualizuj postęp celu");
    act(() => {
      emitToolCall(runtime.transport, {
        callId: "call-goal-lookup-approve",
        name: "get_goal_details",
        arguments: { goalId: "knee" },
      });
    });
    await waitFor(() => {
      expect(functionOutput(runtime.transport, "call-goal-lookup-approve")).toEqual(
        expect.objectContaining({ success: true, goal: expect.objectContaining({ id: "knee" }) }),
      );
    });
    act(() => {
      runtime.transport.emitServerEvent({
        type: "response.done",
        response: { id: "response-call-goal-lookup-approve", status: "completed" },
      });
    });
    runtime.transport.clearSentEvents();
    const before = loadGoalsWorkspace().goals.find(
      (goal) => goal.id === "knee",
    )?.progressEntries.length;

    act(() => {
      emitToolCall(runtime.transport, {
        callId: "call-confirm-approve",
        name: "update_goal_progress",
        arguments: {
          goalId: "knee",
          date: "2026-08-02",
          value: 80,
          kind: "absolute",
          note: "Kontrola",
        },
      });
    });

    await waitFor(() => {
      expect(runtime.current().pendingConfirmation).not.toBeNull();
      expect(runtime.current().state.status).toBe("awaiting_confirmation");
    });
    expect(
      loadGoalsWorkspace().goals.find((goal) => goal.id === "knee")
        ?.progressEntries.length,
    ).toBe(before);
    expect(functionOutput(runtime.transport, "call-confirm-approve")).toBeUndefined();

    const confirmationId = runtime.current().pendingConfirmation?.id;
    if (!confirmationId) throw new Error("Expected a pending confirmation.");
    await act(async () => {
      await runtime.current().resolveConfirmation(confirmationId, true);
    });

    expect(runtime.current().pendingConfirmation).toBeNull();
    expect(
      loadGoalsWorkspace().goals.find((goal) => goal.id === "knee")
        ?.progressEntries.length,
    ).toBe((before ?? 0) + 1);
    expect(functionOutput(runtime.transport, "call-confirm-approve")).toEqual(
      expect.objectContaining({ success: true }),
    );
  });

  it("cancels a confirmed write without mutating data and informs the model", async () => {
    const runtime = await renderRuntime();
    await connectWithText(runtime, "Nie zapisuj bez potwierdzenia");
    act(() => {
      emitToolCall(runtime.transport, {
        callId: "call-goal-lookup-cancel",
        name: "get_goal_details",
        arguments: { goalId: "knee" },
      });
    });
    await waitFor(() => {
      expect(functionOutput(runtime.transport, "call-goal-lookup-cancel")).toEqual(
        expect.objectContaining({ success: true, goal: expect.objectContaining({ id: "knee" }) }),
      );
    });
    act(() => {
      runtime.transport.emitServerEvent({
        type: "response.done",
        response: { id: "response-call-goal-lookup-cancel", status: "completed" },
      });
    });
    runtime.transport.clearSentEvents();
    const before = loadGoalsWorkspace().goals.find(
      (goal) => goal.id === "knee",
    )?.progressEntries.length;

    act(() => {
      emitToolCall(runtime.transport, {
        callId: "call-confirm-cancel",
        name: "update_goal_progress",
        arguments: {
          goalId: "knee",
          date: "2026-08-02",
          value: 99,
          kind: "absolute",
          note: "Nie zapisuj",
        },
      });
    });
    await waitFor(() => {
      expect(runtime.current().pendingConfirmation).not.toBeNull();
      expect(runtime.current().state.status).toBe("awaiting_confirmation");
    });

    const confirmationId = runtime.current().pendingConfirmation?.id;
    if (!confirmationId) throw new Error("Expected a pending confirmation.");
    await act(async () => {
      await runtime.current().resolveConfirmation(confirmationId, false);
    });

    expect(runtime.current().pendingConfirmation).toBeNull();
    expect(
      loadGoalsWorkspace().goals.find((goal) => goal.id === "knee")
        ?.progressEntries.length,
    ).toBe(before);
    expect(functionOutput(runtime.transport, "call-confirm-cancel")).toEqual(
      expect.objectContaining({
        success: false,
        code: "UNAVAILABLE",
      }),
    );
    expect(userMessages(runtime.transport).at(-1)).toMatch(/potwierdzenie/i);
  });

  it("cleans up on close and rejects text and tool events from the old session", async () => {
    window.localStorage.setItem(
      TASK_STORAGE_KEY,
      JSON.stringify({ ...TASK_FIXTURE, tasks: [] }),
    );
    const runtime = await renderRuntime();
    const oldSessionId = await connectWithText(runtime, "Pierwsza sesja");

    act(() => {
      emitToolCall(runtime.transport, {
        callId: "call-before-close",
        name: "get_priority_tasks",
        arguments: { limit: 5 },
      });
    });
    await waitFor(() => expect(runtime.current().view).not.toBeNull());

    await act(async () => {
      await runtime.current().closeAssistant();
    });
    expect(runtime.current().isOpen).toBe(false);
    expect(runtime.current().view).toBeNull();
    expect(runtime.current().state.sessionId).toBeNull();
    expect(runtime.transport.sessionId).toBeNull();
    expect(runtime.transport.disconnectCount).toBe(1);

    const newSessionId = await connectWithText(runtime, "Druga sesja");
    expect(newSessionId).not.toBe(oldSessionId);
    const sentBeforeStaleEvents = runtime.transport.sentEvents.length;

    await act(async () => {
      runtime.transport.emitServerEvent(
        {
          type: "response.output_text.delta",
          response_id: "stale-response",
          delta: "Nie pokazuj tego tekstu",
        },
        oldSessionId,
      );
      emitToolCall(runtime.transport, {
        callId: "call-stale-write",
        name: "create_task",
        arguments: { title: "Stary zapis nie może przejść" },
        sessionId: oldSessionId,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(runtime.current().state.assistantText).toBe("");
    expect(
      loadTaskWorkspace().tasks.some(
        (task) => task.text === "Stary zapis nie może przejść",
      ),
    ).toBe(false);
    expect(functionOutput(runtime.transport, "call-stale-write")).toBeUndefined();
    expect(runtime.transport.sentEvents).toHaveLength(sentBeforeStaleEvents);
  });

  it("closes an idle session on the configured timeout", async () => {
    const runtime = await renderRuntime();
    vi.useFakeTimers();
    await connectWithText(runtime);
    expect(runtime.current().isOpen).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(runtime.current().isOpen).toBe(false);
    expect(runtime.transport.sessionId).toBeNull();
    expect(runtime.transport.disconnectCount).toBe(1);
  });

  it("reconnects once after a recoverable transport failure", async () => {
    const runtime = await renderRuntime();
    act(() => runtime.current().openAssistant());
    expect(runtime.current().isOpen).toBe(true);
    vi.useFakeTimers();
    runtime.transport.setConnectFailure(new Error("temporary failure"));

    await act(async () => {
      await runtime.current().sendText("Spróbuj połączyć");
    });
    expect(runtime.current().state.connectionState).toBe("error");
    const failedSessionId = runtime.transport.sessionId;
    runtime.transport.setConnectFailure(null);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(runtime.transport.sessionId).not.toBe(failedSessionId);
    expect(runtime.transport.connectionState).toBe("connected");
    expect(runtime.current().state.connectionState).toBe("connected");
    expect(runtime.transport.disconnectCount).toBe(1);
  });
});
