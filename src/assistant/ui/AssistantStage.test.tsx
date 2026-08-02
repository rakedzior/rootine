import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantStage } from "./AssistantStage";

afterEach(cleanup);

function renderStage(overrides: Partial<React.ComponentProps<typeof AssistantStage>> = {}) {
  const noop = vi.fn();
  render(<AssistantStage
    open
    status="assistant_speaking"
    transcript="Poufna treść użytkownika"
    partialTranscript=""
    assistantText="Bezpieczne podsumowanie"
    view={null}
    pendingConfirmation={null}
    microphoneEnabled={false}
    microphoneMode="conversation"
    audioEnabled
    privacyMode
    analyser={null}
    onStartVoice={noop}
    onSendText={noop}
    onCancelResponse={noop}
    onToggleAudio={noop}
    onStartPushToTalk={noop}
    onStopPushToTalk={noop}
    onCancelPushToTalk={noop}
    onClose={noop}
    onInteraction={noop}
    onRetry={noop}
    {...overrides}
  />);
}

describe("AssistantStage privacy", () => {
  it("shows the assistant response but masks the user's transcript in Privacy Mode", () => {
    renderStage();
    expect(screen.getByText("Bezpieczne podsumowanie")).toBeInTheDocument();
    expect(screen.queryByText(/Poufna treść/)).not.toBeInTheDocument();
    expect(screen.getByText(/wypowiedź ukryta przez Privacy Mode/i)).toBeInTheDocument();
  });

  it("shows push-to-talk only in the configured microphone mode", () => {
    renderStage({ privacyMode: false, assistantText: "", transcript: "", status: "listening", microphoneEnabled: true, microphoneMode: "push_to_talk" });
    expect(screen.getByRole("button", { name: /Przytrzymaj i mów/i })).toBeInTheDocument();
    expect(screen.getByText(/PTT gotowy/i)).toBeInTheDocument();
    expect(screen.queryByText(/Mikrofon aktywny/i)).not.toBeInTheDocument();
  });

  it("cancels PTT without committing when pointer capture is interrupted", () => {
    const onCancelPushToTalk = vi.fn();
    const onStopPushToTalk = vi.fn();
    renderStage({
      privacyMode: false,
      assistantText: "",
      transcript: "",
      status: "listening",
      microphoneEnabled: true,
      microphoneMode: "push_to_talk",
      onCancelPushToTalk,
      onStopPushToTalk,
    });
    const button = screen.getByRole("button", { name: /Przytrzymaj i mów/i });
    Object.defineProperty(button, "setPointerCapture", { value: vi.fn(), configurable: true });
    fireEvent.pointerDown(button, { pointerId: 1 });
    fireEvent.pointerCancel(button, { pointerId: 1 });
    expect(onCancelPushToTalk).toHaveBeenCalledOnce();
    expect(onStopPushToTalk).not.toHaveBeenCalled();
  });
});
