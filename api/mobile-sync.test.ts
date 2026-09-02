// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeMobileSyncRequest,
  handleMobileSync,
  resetMobileSyncRateLimitForTests,
  type MobileSyncAuthorizer,
  type MobileSyncAuthorization,
} from "../supabase/functions/mobile-sync/index";

const authorize: MobileSyncAuthorizer = vi.fn(async (): Promise<MobileSyncAuthorization> => ({
  ok: true,
  userId: "user-123",
}));

const correlationId = "rt3_staging_123e4567-e89b-42d3-a456-426614174000";
const deviceId = "ios_123e4567-e89b-42d3-a456-426614174000";
const operationId = "op3_123e4567-e89b-42d3-a456-426614174000";

function request(body: unknown, init: RequestInit = {}) {
  const requestBody = body && typeof body === "object" && !Array.isArray(body) && !("correlation_id" in body)
    ? { correlation_id: correlationId, ...body }
    : body;
  return new Request("https://rootine.example/functions/v1/mobile-sync", {
    method: "POST",
    headers: { authorization: "Bearer access-token", "content-type": "application/json", ...init.headers },
    body: JSON.stringify(requestBody),
    ...init,
  });
}

const rpc = vi.fn(async () => ({ contract_version: 1, ok: true }));

describe("mobile-sync Edge Function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMobileSyncRateLimitForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("validates bearer JWTs against the configured Supabase Auth endpoint", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "user-123" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(authorizeMobileSyncRequest(
      request({ action: "bootstrap", device_id: deviceId }),
      new AbortController().signal,
    )).resolves.toEqual({ ok: true, userId: "user-123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: "publishable-key",
          authorization: "Bearer access-token",
        }),
      }),
    );

    fetchMock.mockResolvedValueOnce(Response.json({ message: "private auth details" }, { status: 401 }));
    const invalid = await authorizeMobileSyncRequest(
      request({ action: "bootstrap", device_id: deviceId }),
      new AbortController().signal,
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(await invalid.response.json()).toEqual({ error: "Invalid or expired access token" });
  });

  it("requires POST and routes a pull request", async () => {
    const methodResponse = await handleMobileSync(request({}, { method: "GET", body: undefined }), {
      authorize,
      invokeRpc: rpc,
    });
    expect(methodResponse.status).toBe(405);

    const response = await handleMobileSync(request({ action: "pull", device_id: deviceId, cursor: null }), {
      authorize,
      invokeRpc: rpc,
    });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "rootine_sync_pull",
      { p_cursor: 0, p_limit: 500, p_device_id: deviceId },
      expect.any(AbortSignal),
    );
  });

  it("routes register and push without accepting a user_id", async () => {
    const register = await handleMobileSync(request({
      action: "register_device",
      device_id: deviceId,
      platform: "ios",
      app_version: "3.0.0",
      environment: "staging",
      apns_environment: "sandbox",
      push_token: "token",
      user_id: "attacker",
    }), { authorize, invokeRpc: rpc });
    expect(register.status).toBe(200);
    expect(await register.json()).toMatchObject({
      contract_version: 3,
      correlation_id: correlationId,
      device_id: deviceId,
      environment: "staging",
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "rootine_register_device",
      {
        p_device_id: deviceId,
        p_platform: "ios",
        p_app_version: "3.0.0",
        p_apns_environment: "sandbox",
        p_push_token: "token",
      },
      expect.any(AbortSignal),
    );

    await handleMobileSync(request({
      action: "push",
      device_id: deviceId,
      commands: [{
        operation_id: operationId,
        entity: "task",
        entity_id: "task-1",
        kind: "upsert",
        base_revision: 0,
        payload: { title: "Private task" },
      }],
    }), { authorize, invokeRpc: rpc });
    expect(rpc).toHaveBeenLastCalledWith(
      "rootine_sync_push",
      expect.objectContaining({ p_device_id: deviceId }),
      expect.any(AbortSignal),
    );
  });

  it("accepts register requests without APNs metadata when permission is unavailable", async () => {
    const response = await handleMobileSync(request({
      action: "register_device",
      device_id: deviceId,
      platform: "ios",
      app_version: "3.0.0",
      environment: "staging",
    }), { authorize, invokeRpc: rpc });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "rootine_register_device",
      {
        p_device_id: deviceId,
        p_platform: "ios",
        p_app_version: "3.0.0",
        p_apns_environment: null,
        p_push_token: null,
      },
      expect.any(AbortSignal),
    );

    const mismatch = await handleMobileSync(request({
      action: "register_device",
      device_id: deviceId,
      platform: "ios",
      app_version: "3.0.0",
      environment: "staging",
      apns_environment: "sandbox",
    }), { authorize, invokeRpc: rpc });
    expect(mismatch.status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("normalizes push conflicts with a whitelisted server record", async () => {
    const response = await handleMobileSync(request({
      action: "push",
      device_id: deviceId,
      commands: [{
        operation_id: operationId,
        entity: "task",
        entity_id: "task-1",
        kind: "upsert",
        base_revision: 1,
        payload: { title: "Private task" },
      }],
    }), {
      authorize,
      invokeRpc: vi.fn(async () => ({
        server_cursor: 42,
        results: [{
          operation_id: operationId,
          status: "conflict",
          entity: "task",
          entity_id: "task-1",
          server_revision: 2,
          server_record: {
            entity: "task",
            entity_id: "task-1",
            revision: 2,
            record: { title: "server title" },
            deleted_at: null,
            updated_at: "2026-09-02T10:00:00.000Z",
            private: "secret",
          },
        }],
      })),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      contract_version: 3,
      correlation_id: correlationId,
      server_cursor: 42,
      results: [{
        operation_id: operationId,
        status: "conflict",
        entity: "task",
        entity_id: "task-1",
        server_revision: 2,
        server_record: {
          entity: "task",
          entity_id: "task-1",
          revision: 2,
          record: { title: "server title" },
          deleted_at: null,
          updated_at: "2026-09-02T10:00:00.000Z",
        },
      }],
    });
  });

  it("maps RPC auth, cursor expiry, and failures to stable redacted responses", async () => {
    const unauthorized = await handleMobileSync(request({ action: "bootstrap", device_id: deviceId }), {
      authorize,
      invokeRpc: vi.fn(async () => ({ error_code: "unauthorized", error: "database detail" })),
    });
    expect(unauthorized.status).toBe(403);
    expect(await unauthorized.json()).toEqual({
      contract_version: 3,
      correlation_id: correlationId,
      error: "unauthorized",
    });

    const expired = await handleMobileSync(request({ action: "pull", device_id: deviceId, cursor: 1, limit: 10 }), {
      authorize,
      invokeRpc: vi.fn(async () => ({ error_code: "cursor_expired", changes: [], oldest_cursor: 42 })),
    });
    expect(expired.status).toBe(409);
    expect(await expired.json()).toEqual({
      contract_version: 3,
      correlation_id: correlationId,
      error: "cursor_expired",
    });

    const failure = await handleMobileSync(request({ action: "bootstrap", device_id: deviceId }), {
      authorize,
      invokeRpc: vi.fn(async () => { throw new Error("private SQL error"); }),
    });
    expect(failure.status).toBe(502);
    expect(await failure.json()).toEqual({
      contract_version: 3,
      correlation_id: correlationId,
      error: "server_error",
    });
  });

  it("returns 408 when auth or RPC exceeds the request deadline", async () => {
    const timeout = await handleMobileSync(request({ action: "bootstrap", device_id: deviceId }), {
      authorize: (() => new Promise<MobileSyncAuthorization>(() => undefined)) as MobileSyncAuthorizer,
      invokeRpc: rpc,
      timeoutMs: 5,
    });
    expect(timeout.status).toBe(408);
    expect(await timeout.json()).toEqual({
      contract_version: 3,
      correlation_id: correlationId,
      error: "server_error",
    });
  });

  it("enforces the per-user/device rate limit", async () => {
    const options = { authorize, invokeRpc: rpc, clientKey: () => "same-client" };
    for (let index = 0; index < 60; index += 1) {
      await handleMobileSync(request({ action: "bootstrap", device_id: deviceId }), options);
    }
    const limited = await handleMobileSync(request({ action: "bootstrap", device_id: deviceId }), options);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(60);
  });

  it("echoes correlation_id and emits the strict bootstrap/change shape", async () => {
    const response = await handleMobileSync(request({ action: "bootstrap", device_id: deviceId }), {
      authorize,
      invokeRpc: vi.fn(async () => ({
        contract_version: 1,
        device_id: deviceId,
        server_cursor: 12,
        next_cursor: 7,
        has_more: true,
        oldest_cursor: 2,
        changes: [{
          cursor: 7,
          entity: "task",
          entity_id: "task-1",
          revision: 3,
          operation: "delete",
          record: { id: "task-1" },
          deleted_at: "2026-09-02T10:00:00.000Z",
          updated_at: "2026-09-02T10:00:00.000Z",
        }],
      })),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      contract_version: 3,
      correlation_id: correlationId,
      server_cursor: 12,
      next_cursor: 7,
      has_more: true,
      changes: [{
        cursor: 7,
        entity: "task",
        entity_id: "task-1",
        operation: "delete",
        record: { id: "task-1", deleted_at: "2026-09-02T10:00:00.000Z" },
      }],
    });
  });

  it("rejects non-v3 correlation/device/operation IDs and invalid delete payloads", async () => {
    const invalidCorrelation = await handleMobileSync(request({
      correlation_id: "legacy-request-id",
      action: "bootstrap",
      device_id: deviceId,
    }), { authorize, invokeRpc: rpc });
    expect(invalidCorrelation.status).toBe(400);
    expect(await invalidCorrelation.json()).toMatchObject({ error: "invalid", contract_version: 3 });

    const invalidDevice = await handleMobileSync(request({
      action: "bootstrap",
      device_id: "ios-device",
    }), { authorize, invokeRpc: rpc });
    expect(invalidDevice.status).toBe(400);

    const invalidPush = await handleMobileSync(request({
      action: "push",
      device_id: deviceId,
      commands: [{
        operation_id: "op-1",
        entity: "task",
        entity_id: "task-1",
        kind: "delete",
        base_revision: 1,
        payload: {},
      }],
    }), { authorize, invokeRpc: rpc });
    expect(invalidPush.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
