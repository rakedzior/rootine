import { describe, expect, it, vi } from "vitest";
import { createSportPersistenceQueue } from "./sportPersistence";

describe("sport persistence queue", () => {
  it("coalesces active-session edits and saves only the latest value", () => {
    vi.useFakeTimers();
    const save = vi.fn(() => true);
    const queue = createSportPersistenceQueue(save);

    queue.schedule({ note: "p" });
    queue.schedule({ note: "po" });
    queue.schedule({ note: "powtórzenia" });

    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(249);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ note: "powtórzenia" });
    vi.useRealTimers();
  });

  it("flushes pending edits for lifecycle transitions", () => {
    vi.useFakeTimers();
    const save = vi.fn(() => true);
    const queue = createSportPersistenceQueue(save);

    queue.schedule({ weight: 82.5 });
    expect(queue.hasPending()).toBe(true);
    expect(queue.flush()).toBe(true);

    expect(queue.hasPending()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ weight: 82.5 });
    vi.advanceTimersByTime(300);
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("persists structural transitions immediately", () => {
    const save = vi.fn(() => true);
    const queue = createSportPersistenceQueue(save);

    expect(queue.schedule({ status: "completed" }, "immediate")).toBe(true);
    expect(save).toHaveBeenCalledWith({ status: "completed" });
    expect(queue.hasPending()).toBe(false);
  });
});
