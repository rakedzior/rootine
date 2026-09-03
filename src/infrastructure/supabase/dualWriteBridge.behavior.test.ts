import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountDataScope, setRootineDataScope } from "../../app/data/accountStorage";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("./client", () => ({
  supabase: {
    rpc: state.rpc,
  },
}));

import {
  commitWorkspaceThroughBridge,
  operationIdFor,
  readDualWriteFlags,
  readSyncCursor,
  writeSyncCursor,
} from "./dualWriteBridge";

const command = {
  operationId: operationIdFor("rootine.tasks.v1", 3, "content-hash", "web"),
  storageKey: "rootine.tasks.v1",
  payload: { version: 2, tasks: [{ id: 1, text: "offline edit" }] },
  contentHash: "content-hash",
  baseRevision: 3,
  clientSource: "web" as const,
  correlationId: "correlation-fixture",
};

describe("dual-write bridge deterministic behavior", () => {
  beforeEach(() => {
    state.rpc.mockReset();
    window.localStorage.clear();
    setRootineDataScope(accountDataScope("user-a"));
  });

  it("stores cursors monotonically and scopes the same cursor key per account", () => {
    writeSyncCursor("user-a", 12);
    writeSyncCursor("user-a", 11);
    expect(readSyncCursor("user-a")).toBe(12);

    setRootineDataScope(accountDataScope("user-b"));
    expect(readSyncCursor("user-b")).toBe(0);
    writeSyncCursor("user-b", 4);
    expect(readSyncCursor("user-b")).toBe(4);

    setRootineDataScope(accountDataScope("user-a"));
    expect(readSyncCursor("user-a")).toBe(12);
  });

  it("keeps a retry idempotent and advances the cursor only from the server commit", async () => {
    state.rpc
      .mockResolvedValueOnce({
        data: [{
          applied: true,
          operation_status: "applied",
          operation_id: command.operationId,
          storage_key: command.storageKey,
          payload: command.payload,
          content_hash: command.contentHash,
          revision: 4,
          change_cursor: 20,
          updated_at: "2026-09-03T10:00:00.000Z",
          client_source: "web",
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          applied: false,
          operation_status: "already_applied",
          operation_id: command.operationId,
          storage_key: command.storageKey,
          payload: command.payload,
          content_hash: command.contentHash,
          revision: 4,
          change_cursor: 20,
          updated_at: "2026-09-03T10:00:00.000Z",
          client_source: "web",
        }],
        error: null,
      });

    const first = await commitWorkspaceThroughBridge("user-a", command);
    const retry = await commitWorkspaceThroughBridge("user-a", command);

    expect(first.commit).toMatchObject({ status: "applied", applied: true, revision: 4, cursor: 20 });
    expect(retry.commit).toMatchObject({ status: "already_applied", applied: true, revision: 4, cursor: 20 });
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(state.rpc.mock.calls[0]?.[1]).toMatchObject({
      p_operation_id: command.operationId,
      p_expected_revision: 3,
      p_cursor: 0,
    });
    expect(state.rpc.mock.calls[1]?.[1]).toMatchObject({ p_operation_id: command.operationId, p_cursor: 20 });
    expect(readSyncCursor("user-a")).toBe(20);
  });

  it("preserves a tombstone payload and reports a CAS conflict without applying it", async () => {
    const tombstone = {
      version: 2,
      deleted: true,
      deletedAt: "2026-09-03T10:00:00.000Z",
    };
    state.rpc.mockResolvedValue({
      data: [{
        applied: false,
        operation_status: "conflict",
        operation_id: command.operationId,
        storage_key: command.storageKey,
        payload: tombstone,
        content_hash: "server-tombstone-hash",
        revision: 8,
        change_cursor: 31,
        updated_at: "2026-09-03T10:00:00.000Z",
        client_source: "ios",
      }],
      error: null,
    });

    const result = await commitWorkspaceThroughBridge("user-a", { ...command, payload: tombstone });

    expect(result.commit).toMatchObject({
      status: "conflict",
      applied: false,
      payload: tombstone,
      contentHash: "server-tombstone-hash",
      clientSource: "ios",
    });
    expect(state.rpc.mock.calls[0]?.[1]).toMatchObject({ p_payload: tombstone });
    expect(readSyncCursor("user-a")).toBe(31);
  });

  it("falls back to the legacy four-argument CAS RPC only when the metadata overload is absent", async () => {
    state.rpc
      .mockResolvedValueOnce({ error: { code: "PGRST202", message: "function is missing" } })
      .mockResolvedValueOnce({
        data: [{
          applied: true,
          storage_key: command.storageKey,
          payload: command.payload,
          content_hash: command.contentHash,
          revision: 4,
          updated_at: "2026-09-03T10:00:00.000Z",
        }],
        error: null,
      });

    await expect(commitWorkspaceThroughBridge("user-a", command)).resolves.toMatchObject({
      commit: expect.objectContaining({ status: "applied", revision: 4 }),
      error: null,
    });
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(state.rpc.mock.calls[1]?.[1]).toEqual({
      p_storage_key: command.storageKey,
      p_payload: command.payload,
      p_content_hash: command.contentHash,
      p_expected_revision: command.baseRevision,
    });
  });

  it("uses safe defaults when feature flag RPC is unavailable or malformed", async () => {
    state.rpc.mockResolvedValueOnce({ error: { message: "temporary outage" } });
    await expect(readDualWriteFlags()).resolves.toEqual({
      dualWriteEnabled: true,
      shadowReadEnabled: true,
      observeReconciliation: true,
    });

    state.rpc.mockResolvedValueOnce({ data: [{ dual_write_enabled: false, shadow_read_enabled: true, observe_reconciliation: false, reason: "staging" }], error: null });
    await expect(readDualWriteFlags()).resolves.toEqual({
      dualWriteEnabled: false,
      shadowReadEnabled: true,
      observeReconciliation: false,
      reason: "staging",
    });
  });
});
