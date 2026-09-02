// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  bootstrapRequestSchema,
  bootstrapResponseSchema,
  parseSyncV3Response,
  pullRequestSchema,
  pullResponseSchema,
  pushRequestSchema,
  pushResponseSchema,
  registerDeviceRequestSchema,
  registerDeviceResponseSchema,
  syncV3ErrorResponseSchema,
} from "./syncV3";
import { defaultFeatureFlags, evaluateFeatureFlags } from "./featureFlags";
import { serializeSyncV3Log } from "./syncV3Logging";

const correlation_id = "rt3_staging_123e4567-e89b-42d3-a456-426614174000";
const device_id = "ios_123e4567-e89b-42d3-a456-426614174000";
const operation_id = "op3_123e4567-e89b-42d3-a456-426614174000";

describe("sync-v3 contract", () => {
  it("validates every request boundary and supplies the pull default limit", () => {
    expect(bootstrapRequestSchema.parse({ correlation_id, device_id })).toEqual({
      correlation_id,
      device_id,
    });
    expect(pullRequestSchema.parse({ correlation_id, device_id, cursor: null })).toMatchObject({
      correlation_id,
      device_id,
      cursor: null,
      limit: 500,
    });
    expect(pushRequestSchema.parse({
      correlation_id,
      device_id,
      commands: [{
        operation_id,
        entity: "task",
        entity_id: "task-1",
        kind: "upsert",
        base_revision: 0,
        payload: { state: "complete" },
      }],
    })).toMatchObject({ device_id, commands: [{ operation_id }] });
    expect(registerDeviceRequestSchema.parse({
      correlation_id,
      device_id,
      platform: "ios",
      app_version: "0.1.0",
      environment: "staging",
      apns_environment: "sandbox",
      push_token: "fixture-token-that-is-not-a-real-apns-token",
    })).toMatchObject({ device_id, platform: "ios" });
    expect(registerDeviceRequestSchema.parse({
      correlation_id,
      device_id,
      platform: "ios",
      app_version: "0.1.0",
      environment: "staging",
    })).toMatchObject({ device_id, platform: "ios" });
    expect(() => registerDeviceRequestSchema.parse({
      correlation_id,
      device_id,
      platform: "ios",
      app_version: "0.1.0",
      environment: "staging",
      push_token: "token-without-apns-environment",
    })).toThrow();
  });

  it("requires contract_version 3 on each response and rejects a legacy version", () => {
    const pull = {
      contract_version: 3,
      correlation_id,
      from_cursor: 10,
      next_cursor: 11,
      has_more: false,
      changes: [{
        cursor: 11,
        entity: "task",
        entity_id: "task-1",
        operation: "upsert",
        record: { state: "complete" },
      }],
    };
    expect(pullResponseSchema.parse(pull)).toEqual(pull);
    expect(parseSyncV3Response("pull", pull)).toEqual(pull);
    expect(() => parseSyncV3Response("pull", { ...pull, contract_version: 2 })).toThrow();
    expect(() => parseSyncV3Response("pull", { ...pull, correlation_id: "legacy-request-id" })).toThrow();
  });

  it("validates the bootstrap, push, register-device and machine-error responses", () => {
    expect(bootstrapResponseSchema.parse({
      contract_version: 3,
      correlation_id,
      server_cursor: 11,
      next_cursor: 11,
      has_more: false,
      changes: [],
    })).toMatchObject({ server_cursor: 11 });
    expect(pushResponseSchema.parse({
      contract_version: 3,
      correlation_id,
      server_cursor: 12,
      results: [{ operation_id, status: "applied", entity: "task", entity_id: "task-1", revision: 4 }],
    })).toMatchObject({ server_cursor: 12 });
    expect(pushResponseSchema.parse({
      contract_version: 3,
      correlation_id,
      server_cursor: 13,
      results: [{
        operation_id,
        status: "conflict",
        entity: "task",
        entity_id: "task-1",
        server_revision: 12,
        server_record: { state: "complete" },
      }],
    })).toMatchObject({ results: [{ status: "conflict", server_record: { state: "complete" } }] });
    expect(registerDeviceResponseSchema.parse({
      contract_version: 3,
      correlation_id,
      device_id,
      environment: "staging",
      registered_at: "2026-09-02T10:00:00.000Z",
    })).toMatchObject({ device_id, environment: "staging" });
    expect(syncV3ErrorResponseSchema.parse({
      contract_version: 3,
      correlation_id,
      error: "cursor_expired",
    })).toMatchObject({ error: "cursor_expired" });
    expect(() => syncV3ErrorResponseSchema.parse({
      contract_version: 3,
      correlation_id,
      error: "database_password_leaked",
    })).toThrow();
  });

  it("redacts private payload values while retaining technical identifiers", () => {
    const log = serializeSyncV3Log({
      endpoint: "push",
      contract_version: 3,
      correlation_id,
      operation_id,
      device_id,
      entity: "note",
      entity_id: "note-42",
      payload: { title: "Prywatna treść notatki", text: "wynik badania zdrowia" },
      server_record: { amount: "konto finansowe" },
      metadata: { health_data: "private health details", pushToken: "private token" },
    });

    expect(log).toContain(correlation_id);
    expect(log).toContain(operation_id);
    expect(log).toContain(device_id);
    expect(log).toContain("note-42");
    expect(log).not.toContain("Prywatna treść notatki");
    expect(log).not.toContain("wynik badania zdrowia");
    expect(log).not.toContain("konto finansowe");
    expect(log).not.toContain("private health details");
    expect(log).not.toContain("private token");
  });
});

describe("sync-v3 feature flags", () => {
  it("starts with all flags disabled", () => {
    expect(defaultFeatureFlags()).toEqual({
      normalized_sync_enabled: { enabled: false, source: "default" },
      normalized_read_enabled: { enabled: false, source: "default" },
      notifications_enabled: { enabled: false, source: "default" },
    });
  });

  it("allows one account override without changing another account or the environment", () => {
    const accountA = evaluateFeatureFlags("account-a", "staging", {
      environment: { normalized_sync_enabled: false },
      account: { normalized_sync_enabled: true },
    });
    const accountB = evaluateFeatureFlags("account-b", "staging", {
      environment: { normalized_sync_enabled: false },
    });
    expect(accountA.normalized_sync_enabled).toEqual({ enabled: true, source: "account" });
    expect(accountB.normalized_sync_enabled).toEqual({ enabled: false, source: "environment" });
    expect(accountB.notifications_enabled).toEqual({ enabled: false, source: "default" });
  });

  it("supports a staging environment rollout while production remains off", () => {
    const staging = evaluateFeatureFlags("test-account", "staging", {
      environment: { normalized_sync_enabled: true },
    });
    const production = evaluateFeatureFlags("test-account", "production");
    expect(staging.normalized_sync_enabled).toEqual({ enabled: true, source: "environment" });
    expect(production.normalized_sync_enabled).toEqual({ enabled: false, source: "default" });
  });
});
