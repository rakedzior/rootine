import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemotePersistenceProvider } from "./RemotePersistenceProvider";

const testState = vi.hoisted(() => ({
  auth: {
    loading: true,
    session: null as { user: { id: string } } | null,
  },
  startSync: vi.fn(),
}));

vi.mock("./auth", () => ({
  useSupabaseAuth: () => testState.auth,
}));

vi.mock("./client", () => ({
  isSupabaseConfigured: true,
}));

vi.mock("./workspaceSync", () => ({
  startRemoteWorkspaceSync: testState.startSync,
}));

describe("RemotePersistenceProvider", () => {
  beforeEach(() => {
    testState.auth.loading = true;
    testState.auth.session = null;
    testState.startSync.mockReset();
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
});
