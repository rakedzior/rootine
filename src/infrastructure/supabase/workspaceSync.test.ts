import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const testState = vi.hoisted(() => {
  const selectEq = vi.fn();
  const upsert = vi.fn();
  const from = vi.fn(() => ({
    select: () => ({ eq: selectEq }),
    upsert,
  }));
  return {
    localWorkspaces: {} as Record<string, string>,
    mutationSequence: 0,
    selectEq,
    upsert,
    from,
    exportAll: vi.fn(),
    importAll: vi.fn(),
  };
});

vi.mock("../../app/data/localRepository", () => ({
  exportAllLocalWorkspaces: testState.exportAll,
  getLocalMutationSequence: () => testState.mutationSequence,
  importAllLocalWorkspaces: testState.importAll,
}));

vi.mock("./client", () => ({
  supabase: { from: testState.from },
}));

import { startRemoteWorkspaceSync } from "./workspaceSync";

describe("remote workspace synchronization interleavings", () => {
  let stopSync: (() => void) | undefined;

  beforeEach(() => {
    testState.localWorkspaces = {};
    testState.mutationSequence = 0;
    testState.selectEq.mockReset();
    testState.upsert.mockReset();
    testState.from.mockClear();
    testState.exportAll.mockReset();
    testState.importAll.mockReset();
    testState.exportAll.mockImplementation(async () => ({
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: { ...testState.localWorkspaces },
    }));
    testState.importAll.mockImplementation(async (
      backup: { workspaces: Record<string, string> },
      options?: { expectedWorkspaces?: Record<string, string | null> },
    ) => {
      const skipped: string[] = [];
      let restored = 0;
      Object.entries(backup.workspaces).forEach(([key, raw]) => {
        const current = testState.localWorkspaces[key] ?? null;
        const expected = options?.expectedWorkspaces?.[key];
        if (expected !== undefined && current !== expected) {
          skipped.push(key);
          return;
        }
        testState.localWorkspaces[key] = raw;
        restored += 1;
      });
      return { ok: true, restored, skipped };
    });
    testState.upsert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    stopSync?.();
    stopSync = undefined;
    vi.useRealTimers();
  });

  it("CAS-preserves an edit made after the final snapshot while late hydration is committing", async () => {
    const key = "rootine.fixture.remote-race.v1";
    const localBefore = JSON.stringify({ updatedAt: "2026-08-10T08:00:00.000Z", value: "local-before" });
    const localAfter = JSON.stringify({ updatedAt: "2026-08-10T10:00:00.000Z", value: "local-after" });
    const remote = { updatedAt: "2026-08-10T09:00:00.000Z", value: "remote" };
    const importStarted = deferred<void>();
    const releaseImport = deferred<void>();
    testState.localWorkspaces = { [key]: localBefore };
    testState.selectEq.mockResolvedValue({
      data: [{
        storage_key: key,
        payload: remote,
        content_hash: "remote-hash",
        revision: 1,
        updated_at: remote.updatedAt,
      }],
      error: null,
    });
    testState.importAll.mockImplementationOnce(async (
      backup: { workspaces: Record<string, string> },
      options?: { expectedWorkspaces?: Record<string, string | null> },
    ) => {
      importStarted.resolve();
      await releaseImport.promise;
      const expected = options?.expectedWorkspaces?.[key] ?? null;
      if ((testState.localWorkspaces[key] ?? null) !== expected) {
        return { ok: true, restored: 0, skipped: [key] };
      }
      testState.localWorkspaces[key] = backup.workspaces[key];
      return { ok: true, restored: 1, skipped: [] };
    });

    const startPromise = startRemoteWorkspaceSync("user-1", vi.fn());
    await importStarted.promise;

    testState.localWorkspaces[key] = localAfter;
    window.dispatchEvent(new CustomEvent("rootine:workspace-change", { detail: { key } }));
    releaseImport.resolve();
    stopSync = await startPromise;

    expect(testState.localWorkspaces[key]).toBe(localAfter);
    expect(testState.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ storage_key: key, payload: JSON.parse(localAfter) })],
      { onConflict: "user_id,storage_key" },
    );
  });

  it("keeps a workspace created while the remote read is in flight", async () => {
    const key = "rootine.fixture.created-during-read.v1";
    const localCreated = JSON.stringify({ value: "local-created" });
    const remote = { updatedAt: "2026-08-10T12:00:00.000Z", value: "remote-newer" };
    const readStarted = deferred<void>();
    const finishRead = deferred<{ data: unknown[]; error: null }>();
    testState.selectEq.mockImplementationOnce(async () => {
      readStarted.resolve();
      return finishRead.promise;
    });

    const startPromise = startRemoteWorkspaceSync("user-1", vi.fn());
    await readStarted.promise;
    testState.localWorkspaces[key] = localCreated;
    testState.mutationSequence += 1;
    finishRead.resolve({
      data: [{
        storage_key: key,
        payload: remote,
        content_hash: "remote-hash",
        revision: 1,
        updated_at: remote.updatedAt,
      }],
      error: null,
    });
    stopSync = await startPromise;

    expect(testState.importAll).not.toHaveBeenCalled();
    expect(testState.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ storage_key: key, payload: JSON.parse(localCreated) })],
      { onConflict: "user_id,storage_key" },
    );
  });

  it("uploads an unannounced edit made while the initial upload is hanging", async () => {
    vi.useFakeTimers();
    const key = "rootine.fixture.upload-race.v1";
    const localBefore = JSON.stringify({ updatedAt: "2026-08-10T08:00:00.000Z", value: "before" });
    const localAfter = JSON.stringify({ updatedAt: "2026-08-10T08:01:00.000Z", value: "after" });
    const firstUploadStarted = deferred<void>();
    const releaseFirstUpload = deferred<{ error: null }>();
    testState.localWorkspaces = { [key]: localBefore };
    testState.selectEq.mockResolvedValue({ data: [], error: null });
    testState.upsert
      .mockImplementationOnce(async () => {
        firstUploadStarted.resolve();
        return releaseFirstUpload.promise;
      })
      .mockResolvedValue({ error: null });

    const startPromise = startRemoteWorkspaceSync("user-1", vi.fn());
    await firstUploadStarted.promise;

    // No workspace-change event: this reproduces the safety-net path that the
    // old current-state baseline accidentally marked as already synchronized.
    testState.localWorkspaces[key] = localAfter;
    testState.mutationSequence += 1;
    releaseFirstUpload.resolve({ error: null });
    stopSync = await startPromise;

    await vi.advanceTimersByTimeAsync(121);

    expect(testState.upsert).toHaveBeenCalledTimes(2);
    expect(testState.upsert.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ storage_key: key, payload: JSON.parse(localBefore) }),
    ]);
    expect(testState.upsert.mock.calls[1]?.[0]).toEqual([
      expect.objectContaining({ storage_key: key, payload: JSON.parse(localAfter) }),
    ]);
  });
});
