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
  const from = vi.fn(() => ({
    select: () => ({ eq: selectEq }),
  }));
  const rpc = vi.fn();
  const realtime = {
    changeHandler: null as ((payload: { new: unknown }) => void) | null,
    statusHandler: null as ((status: string) => void) | null,
  };
  const channelApi: Record<string, unknown> = { topic: "rootine-test" };
  const subscribe = vi.fn((handler?: (status: string) => void) => {
    realtime.statusHandler = handler ?? null;
    return channelApi;
  });
  const on = vi.fn((
    _event: unknown,
    _filter: unknown,
    handler: (payload: { new: unknown }) => void,
  ) => {
    realtime.changeHandler = handler;
    return channelApi;
  });
  Object.assign(channelApi, { on, subscribe });
  const channel = vi.fn(() => channelApi);
  const removeChannel = vi.fn();
  return {
    localWorkspaces: {} as Record<string, string>,
    mutationSequence: 0,
    selectEq,
    rpc,
    realtime,
    on,
    subscribe,
    channel,
    removeChannel,
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
  supabase: {
    from: testState.from,
    rpc: testState.rpc,
    channel: testState.channel,
    removeChannel: testState.removeChannel,
  },
}));

import {
  resolveRemoteWorkspaceConflicts,
  startRemoteWorkspaceSync,
  syncRemoteWorkspaces,
} from "./workspaceSync";

describe("remote workspace synchronization interleavings", () => {
  let stopSync: (() => void) | undefined;

  beforeEach(() => {
    testState.localWorkspaces = {};
    testState.mutationSequence = 0;
    testState.selectEq.mockReset();
    testState.rpc.mockReset();
    testState.realtime.changeHandler = null;
    testState.realtime.statusHandler = null;
    testState.on.mockClear();
    testState.subscribe.mockClear();
    testState.channel.mockClear();
    testState.removeChannel.mockReset();
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
    testState.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
      data: [{
        applied: true,
        storage_key: args.p_storage_key,
        payload: args.p_payload,
        content_hash: args.p_content_hash,
        revision: Number(args.p_expected_revision) + 1,
        updated_at: "2026-08-10T12:00:00.000Z",
      }],
      error: null,
    }));
  });

  afterEach(() => {
    stopSync?.();
    stopSync = undefined;
    vi.useRealTimers();
  });

  it("CAS-preserves an edit made after the final snapshot while late hydration is committing", async () => {
    const key = "rootine.fixture.remote-race.v1";
    const localAfter = JSON.stringify({ updatedAt: "2026-08-10T10:00:00.000Z", value: "local-after" });
    const remote = { updatedAt: "2026-08-10T09:00:00.000Z", value: "remote" };
    const importStarted = deferred<void>();
    const releaseImport = deferred<void>();
    testState.localWorkspaces = {};
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
    expect(testState.rpc).toHaveBeenCalledWith(
      "rootine_apply_workspace_snapshot",
      expect.objectContaining({
        p_storage_key: key,
        p_payload: JSON.parse(localAfter),
        p_expected_revision: 1,
      }),
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
    expect(testState.rpc).toHaveBeenCalledWith(
      "rootine_apply_workspace_snapshot",
      expect.objectContaining({
        p_storage_key: key,
        p_payload: JSON.parse(localCreated),
        p_expected_revision: 1,
      }),
    );
  });

  it("uploads an unannounced edit made while the initial upload is hanging", async () => {
    vi.useFakeTimers();
    const key = "rootine.fixture.upload-race.v1";
    const localBefore = JSON.stringify({ updatedAt: "2026-08-10T08:00:00.000Z", value: "before" });
    const localAfter = JSON.stringify({ updatedAt: "2026-08-10T08:01:00.000Z", value: "after" });
    const firstUploadStarted = deferred<void>();
    const releaseFirstUpload = deferred<{ data: unknown[]; error: null }>();
    testState.localWorkspaces = { [key]: localBefore };
    testState.selectEq.mockResolvedValue({ data: [], error: null });
    testState.rpc
      .mockImplementationOnce(async (_name: string, _args: Record<string, unknown>) => {
        firstUploadStarted.resolve();
        return releaseFirstUpload.promise;
      })
      .mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
        data: [{
          applied: true,
          storage_key: args.p_storage_key,
          payload: args.p_payload,
          content_hash: args.p_content_hash,
          revision: Number(args.p_expected_revision) + 1,
          updated_at: "2026-08-10T12:00:00.000Z",
        }],
        error: null,
      }));

    const startPromise = startRemoteWorkspaceSync("user-1", vi.fn());
    await firstUploadStarted.promise;

    // No workspace-change event: this reproduces the safety-net path that the
    // old current-state baseline accidentally marked as already synchronized.
    testState.localWorkspaces[key] = localAfter;
    testState.mutationSequence += 1;
    releaseFirstUpload.resolve({
      data: [{
        applied: true,
        storage_key: key,
        payload: JSON.parse(localBefore),
        content_hash: "initial-hash",
        revision: 1,
        updated_at: "2026-08-10T12:00:00.000Z",
      }],
      error: null,
    });
    stopSync = await startPromise;

    await vi.advanceTimersByTimeAsync(121);

    expect(testState.rpc).toHaveBeenCalledTimes(2);
    expect(testState.rpc.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      p_storage_key: key,
      p_payload: JSON.parse(localBefore),
      p_expected_revision: 0,
    }));
    expect(testState.rpc.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      p_storage_key: key,
      p_payload: JSON.parse(localAfter),
      p_expected_revision: 1,
    }));
  });

  it("reports a stale-revision conflict without overwriting either version", async () => {
    const key = "rootine.fixture.conflict.v1";
    const local = JSON.stringify({ updatedAt: "2026-08-10T12:00:00.000Z", value: "local" });
    const remoteAfterRace = { updatedAt: "2026-08-10T12:01:00.000Z", value: "remote-after-race" };
    testState.localWorkspaces = { [key]: local };
    testState.selectEq.mockResolvedValue({ data: [], error: null });
    testState.rpc.mockResolvedValue({
      data: [{
        applied: false,
        storage_key: key,
        payload: remoteAfterRace,
        content_hash: "remote-hash-3",
        revision: 1,
        updated_at: remoteAfterRace.updatedAt,
      }],
      error: null,
    });

    const result = await syncRemoteWorkspaces("user-1");

    expect(result).toMatchObject({
      status: "conflict",
      uploaded: 0,
      downloaded: 0,
      conflictKeys: [key],
    });
    expect(testState.localWorkspaces[key]).toBe(local);
    expect(testState.importAll).not.toHaveBeenCalled();
    expect(testState.rpc).toHaveBeenCalledWith(
      "rootine_apply_workspace_snapshot",
      expect.objectContaining({ p_storage_key: key, p_expected_revision: 0 }),
    );
  });

  it("requires a decision when both sides already contain different data", async () => {
    const key = "rootine.fixture.no-common-base.v1";
    const local = JSON.stringify({ value: "local-existing" });
    const remote = { value: "remote-existing" };
    testState.localWorkspaces = { [key]: local };
    testState.selectEq.mockResolvedValue({
      data: [{
        storage_key: key,
        payload: remote,
        content_hash: "remote-hash-5",
        revision: 5,
        updated_at: "2026-08-10T12:00:00.000Z",
      }],
      error: null,
    });

    const result = await syncRemoteWorkspaces("user-1");

    expect(result).toMatchObject({ status: "conflict", conflictKeys: [key] });
    expect(testState.localWorkspaces[key]).toBe(local);
    expect(testState.importAll).not.toHaveBeenCalled();
    expect(testState.rpc).not.toHaveBeenCalled();
  });

  it("resolves a conflict only against the latest remote revision", async () => {
    const key = "rootine.fixture.resolve-conflict.v1";
    const local = JSON.stringify({ value: "keep-local" });
    const remote = { value: "remote" };
    testState.localWorkspaces = { [key]: local };
    testState.selectEq.mockResolvedValue({
      data: [{
        storage_key: key,
        payload: remote,
        content_hash: "remote-hash-7",
        revision: 7,
        updated_at: "2026-08-10T12:00:00.000Z",
      }],
      error: null,
    });

    const result = await resolveRemoteWorkspaceConflicts("user-1", [key, key], "keep-local");

    expect(result).toMatchObject({ status: "synced", uploaded: 1, downloaded: 0 });
    expect(testState.rpc).toHaveBeenCalledTimes(1);
    expect(testState.rpc).toHaveBeenCalledWith(
      "rootine_apply_workspace_snapshot",
      expect.objectContaining({
        p_storage_key: key,
        p_payload: JSON.parse(local),
        p_expected_revision: 7,
      }),
    );
  });

  it("can restore the remote conflict version through the guarded local repository", async () => {
    const key = "rootine.fixture.use-remote.v1";
    const local = JSON.stringify({ value: "local" });
    const remote = { value: "use-remote" };
    testState.localWorkspaces = { [key]: local };
    testState.selectEq.mockResolvedValue({
      data: [{
        storage_key: key,
        payload: remote,
        content_hash: "remote-hash-4",
        revision: 4,
        updated_at: "2026-08-10T12:00:00.000Z",
      }],
      error: null,
    });

    const result = await resolveRemoteWorkspaceConflicts("user-1", [key], "use-remote");

    expect(result).toMatchObject({ status: "synced", uploaded: 0, downloaded: 1 });
    expect(testState.localWorkspaces[key]).toBe(JSON.stringify(remote));
    expect(testState.importAll).toHaveBeenCalledWith(
      expect.objectContaining({ workspaces: { [key]: JSON.stringify(remote) } }),
      { expectedWorkspaces: { [key]: local } },
    );
  });

  it("hydrates a Realtime update when the local workspace still matches its base", async () => {
    const key = "rootine.fixture.realtime.v1";
    const initial = { updatedAt: "2026-08-10T10:00:00.000Z", value: "initial" };
    const remoteNext = { updatedAt: "2026-08-10T11:00:00.000Z", value: "remote-next" };
    testState.localWorkspaces = { [key]: JSON.stringify(initial) };
    testState.selectEq.mockResolvedValue({
      data: [{
        storage_key: key,
        payload: initial,
        content_hash: "initial-hash",
        revision: 1,
        updated_at: initial.updatedAt,
      }],
      error: null,
    });
    const onResult = vi.fn();
    stopSync = await startRemoteWorkspaceSync("user-1", onResult);

    expect(testState.realtime.changeHandler).not.toBeNull();
    testState.realtime.changeHandler?.({
      new: {
        storage_key: key,
        payload: remoteNext,
        content_hash: "remote-next-hash",
        revision: 2,
        updated_at: remoteNext.updatedAt,
      },
    });

    await vi.waitFor(() => {
      expect(testState.localWorkspaces[key]).toBe(JSON.stringify(remoteNext));
    });
    expect(onResult).toHaveBeenLastCalledWith({ status: "synced", uploaded: 0, downloaded: 1 });
  });

  it("turns concurrent local and Realtime changes into a visible conflict", async () => {
    const key = "rootine.fixture.realtime-conflict.v1";
    const initial = { updatedAt: "2026-08-10T10:00:00.000Z", value: "initial" };
    const localNext = { updatedAt: "2026-08-10T11:00:00.000Z", value: "local-next" };
    const remoteNext = { updatedAt: "2026-08-10T11:01:00.000Z", value: "remote-next" };
    testState.localWorkspaces = { [key]: JSON.stringify(initial) };
    testState.selectEq.mockResolvedValue({
      data: [{
        storage_key: key,
        payload: initial,
        content_hash: "initial-hash",
        revision: 1,
        updated_at: initial.updatedAt,
      }],
      error: null,
    });
    const onResult = vi.fn();
    stopSync = await startRemoteWorkspaceSync("user-1", onResult);
    testState.localWorkspaces[key] = JSON.stringify(localNext);

    testState.realtime.changeHandler?.({
      new: {
        storage_key: key,
        payload: remoteNext,
        content_hash: "remote-next-hash",
        revision: 2,
        updated_at: remoteNext.updatedAt,
      },
    });

    await vi.waitFor(() => {
      expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({
        status: "conflict",
        conflictKeys: [key],
      }));
    });
    expect(testState.localWorkspaces[key]).toBe(JSON.stringify(localNext));
    expect(testState.importAll).not.toHaveBeenCalled();
  });
});
