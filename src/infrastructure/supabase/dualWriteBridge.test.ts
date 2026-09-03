import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalDiff, canonicalJson, operationIdFor, redactSyncError } from "./dualWriteBridge";

const bridgeMigrationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260902100000_rootine_dual_write_bridge.sql"),
  "utf8",
);

describe("dual-write bridge contract", () => {
  it("canonicalizes object key order without dropping web-only fields", () => {
    const first = {
      amount: 12.5,
      currency: "PLN",
      webOnly: { source: "web" },
      updatedAt: "2026-09-02T10:00:00.000Z",
    };
    const second = {
      updatedAt: "2026-09-02T10:00:00.000Z",
      webOnly: { source: "web" },
      currency: "PLN",
      amount: 12.5,
    };
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(canonicalDiff(first, second)).toBeNull();
  });

  it("returns safe metadata for date/currency/soft-delete differences", () => {
    const diff = canonicalDiff(
      { date: "2026-09-02", amount: 10, currency: "PLN", deletedAt: null },
      { date: "2026-09-03", amount: 11, currency: "EUR", deletedAt: "2026-09-03T12:00:00Z" },
    );
    expect(diff).toMatchObject({
      changedPaths: ["amount", "currency", "date", "deletedAt"],
      leftType: "object",
      rightType: "object",
      truncated: false,
    });
    expect(diff?.leftHash).not.toContain("PLN");
    expect(diff?.rightHash).not.toContain("EUR");
  });

  it("derives a stable operation ID for retries and separates client sources", () => {
    expect(operationIdFor("rootine.tasks.v1", 4, "hash", "web"))
      .toBe(operationIdFor("rootine.tasks.v1", 4, "hash", "web"));
    expect(operationIdFor("rootine.tasks.v1", 4, "hash", "web"))
      .not.toBe(operationIdFor("rootine.tasks.v1", 4, "hash", "ios"));
  });

  it("redacts provider details while retaining actionable contract codes", () => {
    expect(redactSyncError({ code: "PGRST205", message: "relation auth.users leaked" })).toEqual({
      code: "PGRST205",
      message: "Brakuje tabeli synchronizacji Supabase. Zastosuj migracje.",
    });
    expect(redactSyncError({ code: "XX000", message: "stack trace and payload" })).toEqual({
      code: "XX000",
      message: "Synchronizacja nie powiodła się.",
    });
    expect(redactSyncError({ message: "private SQL details" }).message).not.toContain("private");
  });

  it("keeps the v2 four-argument RPC return shape beside the metadata overload", () => {
    const legacyRpc = bridgeMigrationSql.match(
      /create or replace function public\.rootine_apply_workspace_snapshot\(\s*p_storage_key text,\s*p_payload jsonb,\s*p_content_hash text,\s*p_expected_revision bigint\s*\)\s*returns table \(([^)]*)\)/is,
    );
    const metadataRpc = bridgeMigrationSql.match(
      /create or replace function public\.rootine_apply_workspace_snapshot\(\s*p_storage_key text,\s*p_payload jsonb,\s*p_content_hash text,\s*p_expected_revision bigint,\s*p_operation_id text,\s*p_client_source text,\s*p_correlation_id text,\s*p_cursor bigint\s*\)\s*returns table \(([^)]*)\)/is,
    );

    expect(legacyRpc?.[1].replace(/\s+/g, " ").trim()).toBe(
      "applied boolean, storage_key text, payload jsonb, content_hash text, revision bigint, updated_at timestamptz",
    );
    expect(metadataRpc?.[1]).toContain("operation_status text");
    expect(metadataRpc?.[1]).toContain("change_cursor bigint");
    expect(metadataRpc?.[1]).toContain("reconciliation_id text");
    expect(metadataRpc?.[0]).not.toContain("default");
  });
});
