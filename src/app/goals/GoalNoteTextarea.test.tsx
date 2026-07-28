import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalNoteTextarea } from "./GoalNoteTextarea";

describe("GoalNoteTextarea", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("coalesces typing into one commit after 250 ms", () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    render(<GoalNoteTextarea aria-label="Notatka" value="" onCommit={onCommit} />);
    const textarea = screen.getByRole("textbox", { name: "Notatka" });

    fireEvent.change(textarea, { target: { value: "Pierwsza" } });
    fireEvent.change(textarea, { target: { value: "Pierwsza i druga" } });

    act(() => vi.advanceTimersByTime(249));
    expect(onCommit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Pierwsza i druga");
  });

  it("flushes a pending draft on blur", () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    render(<GoalNoteTextarea aria-label="Notatka" value="Start" onCommit={onCommit} />);
    const textarea = screen.getByRole("textbox", { name: "Notatka" });

    fireEvent.change(textarea, { target: { value: "Zapis na blur" } });
    fireEvent.blur(textarea);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Zapis na blur");
  });

  it("flushes a pending draft before the page is hidden", () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    render(<GoalNoteTextarea aria-label="Notatka" value="" onCommit={onCommit} />);
    const textarea = screen.getByRole("textbox", { name: "Notatka" });

    fireEvent.change(textarea, { target: { value: "Zapis lifecycle" } });
    window.dispatchEvent(new Event("pagehide"));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Zapis lifecycle");
  });
});
