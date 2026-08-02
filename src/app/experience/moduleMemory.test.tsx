import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MODULE_MEMORY_KEY,
  readModuleMemoryValue,
  useModuleMemory,
  writeModuleMemoryValue,
} from "./moduleMemory";

function MemoryFixture({ moduleKey }: { moduleKey: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useModuleMemory(rootRef, moduleKey);
  return (
    <div ref={rootRef}>
      <div data-testid="scroll-region" data-module-scroll-key="agenda" />
    </div>
  );
}

function createAnimationFrameQueue() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    callbacks.delete(id);
  });
  return {
    flushNext() {
      const first = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!first) throw new Error("Expected a queued animation frame");
      callbacks.delete(first[0]);
      first[1](0);
    },
  };
}

describe("moduleMemory", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    ["malformed JSON", "{broken"],
    ["an unsupported version", JSON.stringify({ version: 7, modules: { today: { state: { date: "stale" } } } })],
    ["a missing modules map", JSON.stringify({ version: 1 })],
  ])("ignores %s and creates a clean current-version store", (_case, raw) => {
    window.localStorage.setItem(MODULE_MEMORY_KEY, raw);

    expect(readModuleMemoryValue("today", "date", (value): value is string => typeof value === "string")).toBeNull();

    writeModuleMemoryValue("today", "date", "2026-08-02");
    expect(JSON.parse(window.localStorage.getItem(MODULE_MEMORY_KEY) ?? "{}")).toEqual({
      version: 1,
      modules: {
        today: {
          scroll: {},
          state: { date: "2026-08-02" },
        },
      },
    });
  });

  it("preserves other modules, scroll positions, and sibling state fields on write", () => {
    window.localStorage.setItem(MODULE_MEMORY_KEY, JSON.stringify({
      version: 1,
      modules: {
        today: {
          scroll: { ".today-main": 48 },
          state: { date: "2026-08-01", view: "agenda" },
        },
        tasks: {
          scroll: { ".task-list": 120 },
          state: { filter: "open" },
        },
      },
    }));

    writeModuleMemoryValue("today", "date", "2026-08-02");

    expect(JSON.parse(window.localStorage.getItem(MODULE_MEMORY_KEY) ?? "{}")).toEqual({
      version: 1,
      modules: {
        today: {
          scroll: { ".today-main": 48 },
          state: { date: "2026-08-02", view: "agenda" },
        },
        tasks: {
          scroll: { ".task-list": 120 },
          state: { filter: "open" },
        },
      },
    });
  });

  it("returns state only when the caller's validator accepts it", () => {
    writeModuleMemoryValue("calendar", "month", "2026-08");

    expect(readModuleMemoryValue("calendar", "month", (value): value is string => typeof value === "string")).toBe("2026-08");
    expect(readModuleMemoryValue("calendar", "month", (value): value is number => typeof value === "number")).toBeNull();
    expect(readModuleMemoryValue("calendar", "missing", (_value): _value is string => true)).toBeNull();
  });

  it("restores and captures scroll by an explicit stable key", () => {
    window.localStorage.setItem(MODULE_MEMORY_KEY, JSON.stringify({
      version: 1,
      modules: {
        tasks: { scroll: { agenda: 84 }, state: { filter: "open" } },
      },
    }));
    const frames = createAnimationFrameQueue();

    render(<MemoryFixture moduleKey="tasks" />);
    const region = screen.getByTestId("scroll-region");
    act(() => frames.flushNext());
    act(() => frames.flushNext());

    expect(region.scrollTop).toBe(84);

    region.scrollTop = 156;
    fireEvent.scroll(region);
    act(() => frames.flushNext());

    expect(JSON.parse(window.localStorage.getItem(MODULE_MEMORY_KEY) ?? "{}")).toEqual({
      version: 1,
      modules: {
        tasks: { scroll: { agenda: 156 }, state: { filter: "open" } },
      },
    });
  });
});
