import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toast, ToastViewport } from "./Toast";

describe("Toast", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("exposes one action and a dismiss control", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(<Toast actionLabel="Cofnij" onAction={onAction} onDismiss={onDismiss}>Usunięto zadanie.</Toast>);

    expect(screen.getByRole("status")).toHaveTextContent("Usunięto zadanie.");
    await user.click(screen.getByRole("button", { name: "Cofnij" }));
    await user.click(screen.getByRole("button", { name: "Zamknij powiadomienie" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("stacks independent producers in one global live-region host", () => {
    render(
      <>
        <ToastViewport><Toast durationMs={null} onDismiss={() => undefined}>Pierwszy</Toast></ToastViewport>
        <ToastViewport><Toast durationMs={null} onDismiss={() => undefined}>Drugi</Toast></ToastViewport>
      </>,
    );

    expect(screen.getAllByRole("region", { name: "Powiadomienia" })).toHaveLength(1);
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("keeps the original timeout across rerenders and calls the latest dismiss callback", () => {
    vi.useFakeTimers();
    const firstDismiss = vi.fn();
    const latestDismiss = vi.fn();
    const { rerender } = render(
      <Toast durationMs={8_000} onDismiss={firstDismiss}>Synchronizacja zakończona.</Toast>,
    );

    vi.advanceTimersByTime(4_000);
    rerender(
      <Toast durationMs={8_000} onDismiss={latestDismiss}>Synchronizacja zakończona.</Toast>,
    );
    vi.advanceTimersByTime(3_999);

    expect(firstDismiss).not.toHaveBeenCalled();
    expect(latestDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(firstDismiss).not.toHaveBeenCalled();
    expect(latestDismiss).toHaveBeenCalledOnce();
  });
});
