import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGoalsStore } from "./goalsContext";
import { createSeedGoalsWorkspace } from "./goalsModel";
import { GOALS_STORAGE_KEY, saveGoalsWorkspace } from "./goalsRepository";
import { GoalsProvider } from "./goalsStore";
import { createBrowserWorkspacePayloadStore } from "../data/indexedDbWorkspaceStore";
import { setWorkspacePayloadStoreForTests } from "../data/localRepository";

const STORAGE_KEY = GOALS_STORAGE_KEY;
const GOAL_ID = "rehab-app";

function StoreHarness() {
  const store = useGoalsStore();
  return (
    <>
      <button type="button" onClick={() => store.updateGoal(GOAL_ID, { note: "Wersja robocza" })}>
        Zmień notatkę
      </button>
      <button type="button" onClick={() => store.updateGoal(GOAL_ID, { status: "paused" })}>
        Wstrzymaj
      </button>
      <button type="button" onClick={() => store.deleteGoal(GOAL_ID)}>
        Usuń
      </button>
    </>
  );
}

function renderStore() {
  return render(
    <GoalsProvider>
      <StoreHarness />
    </GoalsProvider>,
  );
}

function readStoredGoals() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) as { goals: Array<{ id: string; note: string; status: string }> } : null;
}

describe("GoalsProvider persistence", () => {
  beforeEach(() => {
    setWorkspacePayloadStoreForTests(createBrowserWorkspacePayloadStore(undefined));
    localStorage.clear();
    expect(saveGoalsWorkspace(createSeedGoalsWorkspace())).toBe(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("batches ordinary workspace changes for 250 ms", () => {
    renderStore();
    fireEvent.click(screen.getByRole("button", { name: "Zmień notatkę" }));

    expect(readStoredGoals()?.goals.find((goal) => goal.id === GOAL_ID)?.note).not.toBe("Wersja robocza");
    act(() => vi.advanceTimersByTime(249));
    expect(readStoredGoals()?.goals.find((goal) => goal.id === GOAL_ID)?.note).not.toBe("Wersja robocza");
    act(() => vi.advanceTimersByTime(1));
    expect(readStoredGoals()?.goals.find((goal) => goal.id === GOAL_ID)?.note).toBe("Wersja robocza");
  });

  it("persists status and destructive changes immediately", () => {
    renderStore();
    fireEvent.click(screen.getByRole("button", { name: "Wstrzymaj" }));
    expect(readStoredGoals()?.goals.find((goal) => goal.id === GOAL_ID)?.status).toBe("paused");

    fireEvent.click(screen.getByRole("button", { name: "Usuń" }));
    expect(readStoredGoals()?.goals.some((goal) => goal.id === GOAL_ID)).toBe(false);
  });

  it("flushes pending workspace changes on pagehide", () => {
    renderStore();
    fireEvent.click(screen.getByRole("button", { name: "Zmień notatkę" }));

    act(() => window.dispatchEvent(new Event("pagehide")));

    expect(readStoredGoals()?.goals.find((goal) => goal.id === GOAL_ID)?.note).toBe("Wersja robocza");
  });
});
