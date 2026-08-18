import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteWorkspaceSyncResult } from "./workspaceSync";
import {
  REMOTE_INITIAL_SYNC_TIMEOUT_MS,
  RemotePersistenceProvider,
  useRemoteSync,
} from "./RemotePersistenceProvider";

const testState = vi.hoisted(() => ({
  auth: {
    loading: true,
    session: null as { user: { id: string } } | null,
  },
  startSync: vi.fn(),
  resolveConflicts: vi.fn(),
}));

vi.mock("./auth", () => ({
  useSupabaseAuth: () => testState.auth,
}));

vi.mock("./client", () => ({
  isSupabaseConfigured: true,
}));

vi.mock("./workspaceSync", () => ({
  resolveRemoteWorkspaceConflicts: testState.resolveConflicts,
  startRemoteWorkspaceSync: testState.startSync,
}));

function RemoteStateProbe() {
  const remote = useRemoteSync();
  return (
    <>
      <div>Rootine app</div>
      <button type="button" onClick={() => void remote.resolveConflict("keep-local")}>Rozwiąż konflikt</button>
      <output data-testid="remote-state">
        {remote.status}|{remote.message ?? ""}|{remote.initialSyncAttempt}|{remote.initialSyncElapsedMs ?? ""}|{String(remote.initialSyncTimedOut)}
      </output>
    </>
  );
}

describe("RemotePersistenceProvider", () => {
  beforeEach(() => {
    testState.auth.loading = true;
    testState.auth.session = null;
    testState.startSync.mockReset();
    testState.resolveConflicts.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not mount the app before the persisted auth session is known", () => {
    render(
      <RemotePersistenceProvider>
        <div>Rootine app</div>
      </RemotePersistenceProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Ładowanie danych profilu");
    expect(screen.queryByText("Rootine app")).not.toBeInTheDocument();
  });

  it("mounts the app only after the first remote workspace sync finishes", async () => {
    let finishSync!: () => void;
    const syncFinished = new Promise<void>((resolve) => {
      finishSync = resolve;
    });
    testState.auth.loading = false;
    testState.auth.session = { user: { id: "user-1" } };
    testState.startSync.mockImplementation(async (_userId, onResult) => {
      onResult({ status: "synced", uploaded: 0, downloaded: 1 });
      await syncFinished;
      return () => undefined;
    });

    render(
      <RemotePersistenceProvider>
        <div>Rootine app</div>
      </RemotePersistenceProvider>,
    );

    expect(screen.queryByText("Rootine app")).not.toBeInTheDocument();
    expect(testState.startSync).toHaveBeenCalledWith("user-1", expect.any(Function));

    await act(async () => {
      finishSync();
      await syncFinished;
    });

    expect(await screen.findByText("Rootine app")).toBeInTheDocument();
  });

  it("keeps local mode available when the initial remote sync fails", async () => {
    testState.auth.loading = false;
    testState.auth.session = { user: { id: "user-1" } };
    testState.startSync.mockRejectedValue(new Error("network unavailable"));

    render(
      <RemotePersistenceProvider>
        <div>Rootine app</div>
      </RemotePersistenceProvider>,
    );

    expect(await screen.findByText("Rootine app")).toBeInTheDocument();
  });

  it("continues locally after a bounded initial timeout and accepts a late sync result", async () => {
    vi.useFakeTimers();
    let reportResult!: (result: RemoteWorkspaceSyncResult) => void;
    let finishSync!: (cleanup: () => void) => void;
    const syncFinished = new Promise<() => void>((resolve) => {
      finishSync = resolve;
    });
    testState.auth.loading = false;
    testState.auth.session = { user: { id: "user-1" } };
    testState.startSync.mockImplementation((_userId, onResult) => {
      reportResult = onResult;
      return syncFinished;
    });

    render(
      <RemotePersistenceProvider>
        <RemoteStateProbe />
      </RemotePersistenceProvider>,
    );

    expect(screen.queryByText("Rootine app")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REMOTE_INITIAL_SYNC_TIMEOUT_MS);
    });

    expect(screen.getByText("Rootine app")).toBeInTheDocument();
    expect(screen.getByTestId("remote-state")).toHaveTextContent("error|Synchronizacja profilu trwa zbyt długo");
    expect(screen.getByTestId("remote-state")).toHaveTextContent("|1|10000|true");
    expect(screen.getByText(/Rootine działa dalej lokalnie/, { selector: ".ui-toast__message" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();

    await act(async () => {
      reportResult({ status: "synced", uploaded: 1, downloaded: 2 });
      finishSync(() => undefined);
      await syncFinished;
    });

    expect(screen.getByTestId("remote-state")).toHaveTextContent("synced|");
    expect(screen.queryByText(/Rootine działa dalej lokalnie/)).not.toBeInTheDocument();
  });

  it("retries from the global notice and ignores a late result from the stale attempt", async () => {
    vi.useFakeTimers();
    let reportFirst!: (result: RemoteWorkspaceSyncResult) => void;
    let reportSecond!: (result: RemoteWorkspaceSyncResult) => void;
    let finishFirst!: (cleanup: () => void) => void;
    let finishSecond!: (cleanup: () => void) => void;
    const firstFinished = new Promise<() => void>((resolve) => { finishFirst = resolve; });
    const secondFinished = new Promise<() => void>((resolve) => { finishSecond = resolve; });
    testState.auth.loading = false;
    testState.auth.session = { user: { id: "user-1" } };
    testState.startSync
      .mockImplementationOnce((_userId, onResult) => {
        reportFirst = onResult;
        return firstFinished;
      })
      .mockImplementationOnce((_userId, onResult) => {
        reportSecond = onResult;
        return secondFinished;
      });

    render(
      <RemotePersistenceProvider>
        <RemoteStateProbe />
      </RemotePersistenceProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REMOTE_INITIAL_SYNC_TIMEOUT_MS);
    });
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    expect(testState.startSync).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("remote-state")).toHaveTextContent("syncing||2||false");

    await act(async () => {
      reportFirst({ status: "synced", uploaded: 99, downloaded: 99 });
      finishFirst(() => undefined);
      await firstFinished;
    });

    expect(screen.getByTestId("remote-state")).toHaveTextContent("syncing||2||false");

    await act(async () => {
      reportSecond({ status: "synced", uploaded: 1, downloaded: 0 });
      finishSecond(() => undefined);
      await secondFinished;
    });

    expect(screen.getByTestId("remote-state")).toHaveTextContent("synced||2|");
  });

  it("resolves reported conflicts and starts a fresh synchronization baseline", async () => {
    const key = "rootine.tasks.workspace.v2";
    testState.auth.loading = false;
    testState.auth.session = { user: { id: "user-1" } };
    testState.startSync
      .mockImplementationOnce(async (_userId, onResult) => {
        onResult({
          status: "conflict",
          uploaded: 0,
          downloaded: 0,
          conflictKeys: [key],
        });
        return () => undefined;
      })
      .mockResolvedValueOnce(() => undefined);
    testState.resolveConflicts.mockResolvedValue({
      status: "synced",
      uploaded: 1,
      downloaded: 0,
    });

    render(
      <RemotePersistenceProvider>
        <RemoteStateProbe />
      </RemotePersistenceProvider>,
    );

    expect(await screen.findByText("Rootine app")).toBeInTheDocument();
    expect(screen.getByTestId("remote-state")).toHaveTextContent("conflict|");
    fireEvent.click(screen.getByRole("button", { name: "Rozwiąż konflikt" }));

    await vi.waitFor(() => {
      expect(testState.resolveConflicts).toHaveBeenCalledWith("user-1", [key], "keep-local");
      expect(testState.startSync).toHaveBeenCalledTimes(2);
    });
  });
});
