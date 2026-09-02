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

function request(body: unknown, init: RequestInit = {}) {
  return new Request("https://rootine.example/functions/v1/mobile-sync", {
    method: "POST",
    headers: { authorization: "Bearer access-token", "content-type": "application/json", ...init.headers },
    body: JSON.stringify(body),
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
      request({ action: "bootstrap", device_id: "ios-1" }),
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
      request({ action: "bootstrap", device_id: "ios-1" }),
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

    const response = await handleMobileSync(request({ action: "pull", device_id: "device" }), {
      authorize,
      invokeRpc: rpc,
    });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "rootine_sync_pull",
      { p_cursor: 0, p_limit: 500, p_device_id: "device" },
      expect.any(AbortSignal),
    );
  });

  it("routes register and push without accepting a user_id", async () => {
    const register = await handleMobileSync(request({
      action: "register_device",
      device_id: "ios-1",
      platform: "iOS",
      app_version: "3.0.0",
      apns_environment: "sandbox",
      push_token: "token",
      user_id: "attacker",
    }), { authorize, invokeRpc: rpc });
    expect(register.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith(
      "rootine_register_device",
      {
        p_device_id: "ios-1",
        p_platform: "ios",
        p_app_version: "3.0.0",
        p_apns_environment: "sandbox",
        p_push_token: "token",
      },
      expect.any(AbortSignal),
    );

    await handleMobileSync(request({
      action: "push",
      device_id: "ios-1",
      commands: [{
        operation_id: "op-1",
        entity: "task",
        entity_id: "task-1",
        kind: "upsert",
        base_revision: 0,
        payload: { title: "Private task" },
      }],
    }), { authorize, invokeRpc: rpc });
    expect(rpc).toHaveBeenLastCalledWith(
      "rootine_sync_push",
      expect.objectContaining({ p_device_id: "ios-1" }),
      expect.any(AbortSignal),
    );
  });

  it("maps RPC auth, cursor expiry, and failures to stable redacted responses", async () => {
    const unauthorized = await handleMobileSync(request({ action: "bootstrap", device_id: "unknown" }), {
      authorize,
      invokeRpc: vi.fn(async () => ({ error_code: "unauthorized", error: "database detail" })),
    });
    expect(unauthorized.status).toBe(403);
    expect(await unauthorized.json()).toEqual({ error: "Device is not authorized" });

    const expired = await handleMobileSync(request({ action: "pull", device_id: "ios-1", cursor: 1, limit: 10 }), {
      authorize,
      invokeRpc: vi.fn(async () => ({ error_code: "cursor_expired", changes: [], oldest_cursor: 42 })),
    });
    expect(expired.status).toBe(409);
    expect(await expired.json()).toEqual({ error_code: "cursor_expired", changes: [], oldest_cursor: 42 });

    const failure = await handleMobileSync(request({ action: "bootstrap", device_id: "ios-1" }), {
      authorize,
      invokeRpc: vi.fn(async () => { throw new Error("private SQL error"); }),
    });
    expect(failure.status).toBe(502);
    expect(await failure.json()).toEqual({ error: "Sync service is temporarily unavailable" });
  });

  it("returns 408 when auth or RPC exceeds the request deadline", async () => {
    const timeout = await handleMobileSync(request({ action: "bootstrap", device_id: "ios-1" }), {
      authorize: (() => new Promise<MobileSyncAuthorization>(() => undefined)) as MobileSyncAuthorizer,
      invokeRpc: rpc,
      timeoutMs: 5,
    });
    expect(timeout.status).toBe(408);
    expect(await timeout.json()).toEqual({ error: "Sync service timed out" });
  });

  it("enforces the per-user/device rate limit", async () => {
    const options = { authorize, invokeRpc: rpc, clientKey: () => "same-client" };
    for (let index = 0; index < 60; index += 1) {
      await handleMobileSync(request({ action: "bootstrap", device_id: "ios-1" }), options);
    }
    const limited = await handleMobileSync(request({ action: "bootstrap", device_id: "ios-1" }), options);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(60);
  });
});
