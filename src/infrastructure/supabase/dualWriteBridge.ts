import { getRootineStorageItem, setRootineStorageItem } from "../../app/data/accountStorage";
import { rootineObservability } from "../../app/observability";
import { supabase } from "./client";

/**
 * B06 keeps the legacy RPC name as the public compatibility boundary. The
 * migration adds an overload carrying the bridge metadata and routes the old
 * four-argument overload through the same relational commit path.
 */
export const ROOTINE_DUAL_WRITE_RPC = "rootine_apply_workspace_snapshot";
export const ROOTINE_DUAL_WRITE_CONTRACT_VERSION = 1;
export const ROOTINE_SYNC_CURSOR_STORAGE_KEY = "rootine.sync.cursor.v1";

export type DualWriteClientSource = "web" | "ios" | "legacy" | "system";
export type DualWriteOperationStatus =
  | "applied"
  | "already_applied"
  | "conflict"
  | "invalid"
  | "disabled";

export type DualWriteCommand = {
  operationId: string;
  storageKey: string;
  payload: unknown;
  contentHash: string;
  baseRevision: number;
  cursor?: number;
  clientSource: DualWriteClientSource;
  correlationId: string;
};

export type DualWriteCommit = {
  operationId: string;
  status: DualWriteOperationStatus;
  applied: boolean;
  storageKey: string;
  payload: unknown;
  contentHash: string;
  revision: number;
  cursor?: number;
  updatedAt: string;
  clientSource: DualWriteClientSource;
  materialized: boolean;
  reconciliationId?: string;
  message?: string;
};

export type CanonicalDiffMetadata = {
  changedPaths: string[];
  leftHash: string;
  rightHash: string;
  leftType: string;
  rightType: string;
  truncated: boolean;
};

export type DualWriteFlags = {
  dualWriteEnabled: boolean;
  shadowReadEnabled: boolean;
  observeReconciliation: boolean;
  reason?: string;
};

function fallbackUUID() {
  return `rootine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function newCorrelationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return fallbackUUID();
}

/** Stable IDs let a browser retry the same local write without a second effect. */
export function operationIdFor(
  storageKey: string,
  baseRevision: number,
  contentHash: string,
  source: DualWriteClientSource = "web",
) {
  const raw = `${source}:${storageKey}:${baseRevision}:${contentHash}`;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `rootine-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function hashCanonical(value: unknown) {
  const normalized = canonicalJson(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `${normalized.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function valueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function collectChangedPaths(left: unknown, right: unknown, path: string, output: string[], limit: number) {
  if (output.length >= limit) return;
  if (Object.is(left, right)) return;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    output.push(path || "$" );
    return;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      output.push(path || "$" );
      return;
    }
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length && output.length < limit; index += 1) {
      collectChangedPaths(left[index], right[index], `${path}[${index}]`, output, limit);
    }
    return;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
  keys.forEach((key) => {
    if (output.length < limit) collectChangedPaths(leftRecord[key], rightRecord[key], path ? `${path}.${key}` : key, output, limit);
  });
}

export function canonicalDiff(left: unknown, right: unknown, maxPaths = 64): CanonicalDiffMetadata | null {
  if (canonicalJson(left) === canonicalJson(right)) return null;
  const changedPaths: string[] = [];
  collectChangedPaths(left, right, "", changedPaths, maxPaths);
  return {
    changedPaths,
    leftHash: hashCanonical(left),
    rightHash: hashCanonical(right),
    leftType: valueType(left),
    rightType: valueType(right),
    truncated: changedPaths.length >= maxPaths,
  };
}

function parseRow(data: unknown, command: DualWriteCommand): DualWriteCommit | null {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row || typeof row !== "object") return null;
  const applied = row.applied === true || row.status === "applied" || row.operation_status === "applied";
  const status = row.operation_status === "already_applied"
    || row.status === "already_applied"
    || row.already_applied === true
    ? "already_applied"
    : typeof row.operation_status === "string"
      && ["conflict", "invalid", "disabled"].includes(row.operation_status)
      ? row.operation_status as DualWriteOperationStatus
      : applied ? "applied" : "conflict";
  const numberValue = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const source = row.client_source === "ios" || row.client_source === "legacy" || row.client_source === "system"
    ? row.client_source
    : command.clientSource;
  return {
    operationId: typeof row.operation_id === "string" ? row.operation_id : command.operationId,
    status,
    applied: applied || status === "already_applied",
    storageKey: typeof row.storage_key === "string" ? row.storage_key : command.storageKey,
    payload: row.payload === undefined ? command.payload : row.payload,
    contentHash: typeof row.content_hash === "string" ? row.content_hash : command.contentHash,
    revision: numberValue(row.revision, command.baseRevision + (applied ? 1 : 0)),
    cursor: numberValue(row.change_cursor ?? row.server_cursor ?? row.cursor, 0) || undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
    clientSource: source,
    materialized: row.materialized !== false,
    reconciliationId: typeof row.reconciliation_id === "string" ? row.reconciliation_id : undefined,
    message: typeof row.error_message === "string" ? row.error_message : undefined,
  };
}

function isMissingBridgeError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "PGRST202"
    || candidate.code === "42883"
    || (typeof candidate.message === "string" && candidate.message.includes("rootine_apply_workspace_snapshot"));
}

function cursorStorageKey(userId: string) {
  return `${ROOTINE_SYNC_CURSOR_STORAGE_KEY}.${encodeURIComponent(userId)}`;
}

export function readSyncCursor(userId: string) {
  const raw = getRootineStorageItem(cursorStorageKey(userId));
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function writeSyncCursor(userId: string, cursor: number | undefined) {
  if (cursor === undefined || !Number.isSafeInteger(cursor) || cursor < 0) return;
  const current = readSyncCursor(userId);
  if (cursor >= current) setRootineStorageItem(cursorStorageKey(userId), String(cursor));
}

export async function commitWorkspaceThroughBridge(
  userId: string,
  command: DualWriteCommand,
): Promise<{ commit: DualWriteCommit | null; error: { code?: string; message: string } | null }> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const recordOutcome = (outcome: "success" | "failure", status?: string, error?: unknown) => {
    const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    rootineObservability.recordSyncOperation({
      endpoint: "push",
      outcome,
      status,
      durationMs: Math.max(0, endedAt - startedAt),
      correlationId: command.correlationId,
      operationId: command.operationId,
      error,
      attributes: { source: command.clientSource, entity: command.storageKey },
    });
  };
  if (!supabase) {
    recordOutcome("failure", "missing_configuration", "missing configuration");
    return { commit: null, error: { message: "Supabase nie jest skonfigurowane." } };
  }
  const args = {
    p_storage_key: command.storageKey,
    p_payload: command.payload,
    p_content_hash: command.contentHash,
    p_expected_revision: command.baseRevision,
    p_operation_id: command.operationId,
    p_client_source: command.clientSource,
    p_correlation_id: command.correlationId,
    p_cursor: command.cursor ?? readSyncCursor(userId),
  };
  let response = await supabase.rpc(ROOTINE_DUAL_WRITE_RPC, args);
  // Accounts that have not received B06 yet continue through the old CAS
  // contract. This is deliberately a compatibility fallback, not a second
  // write: the old function performs one legacy-only operation on old servers.
  if (response.error && isMissingBridgeError(response.error)) {
    response = await supabase.rpc(ROOTINE_DUAL_WRITE_RPC, {
      p_storage_key: command.storageKey,
      p_payload: command.payload,
      p_content_hash: command.contentHash,
      p_expected_revision: command.baseRevision,
    });
  }
  if (response.error) {
    recordOutcome("failure", "rpc_error", response.error);
    return { commit: null, error: response.error };
  }
  const commit = parseRow(response.data, command);
  if (!commit) {
    recordOutcome("failure", "invalid_response", "invalid response");
    return { commit: null, error: { message: "Serwer nie zwrócił wyniku bridge’a zapisu." } };
  }
  writeSyncCursor(userId, commit.cursor);
  recordOutcome(commit.applied ? "success" : "failure", commit.status, commit.message);
  return { commit, error: null };
}

export async function recordCanonicalDiff(input: {
  domain: string;
  entity: string;
  entityId: string;
  revision: number;
  clientSource: DualWriteClientSource;
  correlationId?: string;
  diff: CanonicalDiffMetadata;
}) {
  if (!supabase) return false;
  const { error } = await supabase.rpc("rootine_record_sync_reconciliation", {
    p_domain: input.domain,
    p_entity: input.entity,
    p_entity_id: input.entityId,
    p_revision: input.revision,
    p_client_source: input.clientSource,
    p_correlation_id: input.correlationId ?? newCorrelationId(),
    p_diff_metadata: input.diff,
  });
  return !error;
}

export async function readDualWriteFlags(): Promise<DualWriteFlags> {
  const defaults: DualWriteFlags = {
    dualWriteEnabled: true,
    shadowReadEnabled: true,
    observeReconciliation: true,
  };
  if (!supabase) return defaults;
  const { data, error } = await supabase.rpc("rootine_get_dual_write_flags");
  if (error) return defaults;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return defaults;
  return {
    dualWriteEnabled: row.dual_write_enabled !== false,
    shadowReadEnabled: row.shadow_read_enabled !== false,
    observeReconciliation: row.observe_reconciliation !== false,
    reason: typeof row.reason === "string" ? row.reason : undefined,
  };
}
