import { assertEquals } from "jsr:@std/assert@1";
import {
  handleMobileSync,
  resetMobileSyncRateLimitForTests,
  type MobileSyncAuthorization,
  type MobileSyncAuthorizer,
} from "./index.ts";

const correlationId = "rt3_staging_123e4567-e89b-42d3-a456-426614174000";
const deviceId = "ios_123e4567-e89b-42d3-a456-426614174000";
const operationId = "op3_123e4567-e89b-42d3-a456-426614174000";

const authorize: MobileSyncAuthorizer = async (): Promise<MobileSyncAuthorization> => ({
  ok: true,
  userId: "00000000-0000-0000-0000-000000000001",
});

function request(body: Record<string, unknown>, init: RequestInit = {}) {
  return new Request("https://rootine.example/functions/v1/mobile-sync", {
    method: "POST",
    headers: {
      authorization: "Bearer synthetic-access-token",
      "content-type": "application/json",
      ...init.headers,
    },
    body: JSON.stringify({ correlation_id: correlationId, ...body }),
    ...init,
  });
}

Deno.test("mobile-sync rejects methods other than POST", async () => {
  const response = await handleMobileSync(request({}, { method: "GET", body: undefined }));
  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "POST");
  assertEquals((await response.json()).error, "invalid");
});

Deno.test("mobile-sync routes a bounded bootstrap with the caller identity", async () => {
  resetMobileSyncRateLimitForTests();
  let rpcName = "";
  let rpcArgs: Record<string, unknown> | undefined;
  const response = await handleMobileSync(request({ action: "bootstrap", device_id: deviceId }), {
    authorize,
    invokeRpc: async (name, args) => {
      rpcName = name;
      rpcArgs = args;
      return { contract_version: 3, server_cursor: 12, next_cursor: 12, has_more: false, changes: [] };
    },
  });

  assertEquals(response.status, 200);
  assertEquals(rpcName, "rootine_sync_bootstrap");
  assertEquals(rpcArgs, { p_device_id: deviceId });
  assertEquals(await response.json(), {
    contract_version: 3,
    correlation_id: correlationId,
    server_cursor: 12,
    next_cursor: 12,
    has_more: false,
    changes: [],
  });
});

Deno.test("mobile-sync rejects invalid IDs and never invokes the RPC", async () => {
  resetMobileSyncRateLimitForTests();
  let invoked = false;
  const response = await handleMobileSync(request({
    action: "push",
    device_id: deviceId,
    commands: [{
      operation_id: "legacy-operation",
      entity: "task",
      entity_id: "task-1",
      kind: "delete",
      base_revision: 1,
      payload: {},
    }],
  }), {
    authorize,
    invokeRpc: async () => {
      invoked = true;
      return {};
    },
  });

  assertEquals(response.status, 400);
  assertEquals(invoked, false);
  assertEquals((await response.json()).error, "invalid");
});

Deno.test("mobile-sync returns a redacted conflict record", async () => {
  resetMobileSyncRateLimitForTests();
  const response = await handleMobileSync(request({
    action: "push",
    device_id: deviceId,
    commands: [{
      operation_id: operationId,
      entity: "task",
      entity_id: "task-1",
      kind: "upsert",
      base_revision: 1,
      payload: { title: "private client title" },
    }],
  }), {
    authorize,
    invokeRpc: async () => ({
      contract_version: 3,
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
          private: "must not cross the boundary",
          updated_at: "2026-09-02T10:00:00.000Z",
        },
      }],
    }),
  });

  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.results[0].server_record, {
    entity: "task",
    entity_id: "task-1",
    revision: 2,
    record: { title: "server title" },
    updated_at: "2026-09-02T10:00:00.000Z",
  });
  assertEquals(JSON.stringify(body).includes("server title"), true);
  assertEquals(JSON.stringify(body).includes("must not cross the boundary"), false);
});
