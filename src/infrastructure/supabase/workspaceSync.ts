import {
  exportAllLocalWorkspaces,
  getLocalMutationSequence,
  importAllLocalWorkspaces,
} from "../../app/data/localRepository";
import { rootineObservability } from "../../app/observability";
import { supabase } from "./client";
import {
  canonicalDiff,
  commitWorkspaceThroughBridge,
  newCorrelationId,
  operationIdFor,
  recordCanonicalDiff,
  type DualWriteCommit,
} from "./dualWriteBridge";

export const ROOTINE_WORKSPACE_TABLE = "rootine_workspace_snapshots";

/**
 * How long user interaction must be quiet before the safety-net scan runs.
 * Kept at the old poll interval so the worst-case latency for an unannounced
 * change is unchanged; what changed is that idle and mid-typing ticks are free.
 */
const SCAN_SETTLE_INTERVAL_MS = 2_000;

export type RemoteWorkspaceSyncStatus =
  | "disabled"
  | "signed-out"
  | "syncing"
  | "synced"
  | "conflict"
  | "schema-missing"
  | "error";

export type RemoteWorkspaceSyncResult = {
  status: Exclude<RemoteWorkspaceSyncStatus, "disabled" | "signed-out" | "syncing">;
  uploaded: number;
  downloaded: number;
  message?: string;
  conflictKeys?: string[];
};

type RemoteWorkspaceSyncOutcome = {
  result: RemoteWorkspaceSyncResult;
  /** Exact revisions confirmed on the remote side. */
  knownRemoteRows: Map<string, RemoteWorkspaceRow>;
  /** Hashes of the exact local values represented by those revisions. */
  knownLocalHashes: Map<string, string>;
};

type ReconciliationControl = {
  changedDuringInitialSync?: (storageKey: string) => boolean;
  recordShadowDiff?: (input: {
    storageKey: string;
    localPayload: unknown;
    remotePayload: unknown;
    revision: number;
  }) => Promise<void> | void;
};

type RemoteWorkspaceRow = {
  storage_key: string;
  payload: unknown;
  content_hash: string;
  revision: number;
  updated_at: string;
};

type WorkspaceUploadResult = {
  confirmed: RemoteWorkspaceRow[];
  conflicts: RemoteWorkspaceRow[];
  commits: DualWriteCommit[];
  error: { code?: string; message: string } | null;
};

type WorkspaceChangeDetail = {
  key?: string;
  origin?: string;
};

const REMOTE_HYDRATION_ORIGIN = "rootine-supabase-hydrate";

function isMissingSchemaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "PGRST205"
    || (typeof candidate.message === "string" && candidate.message.includes(ROOTINE_WORKSPACE_TABLE));
}

function rawPayload(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function payloadRaw(payload: unknown) {
  try {
    const raw = JSON.stringify(payload);
    return raw === undefined ? null : raw;
  } catch {
    return null;
  }
}

function equivalentWorkspaceContent(leftRaw: string, rightRaw: string) {
  if (leftRaw === rightRaw) return true;
  try {
    const left = JSON.parse(leftRaw) as Record<string, unknown>;
    const right = JSON.parse(rightRaw) as Record<string, unknown>;
    if (!left || !right || Array.isArray(left) || Array.isArray(right)) return false;
    const { updatedAt: _leftUpdatedAt, ...leftContent } = left;
    const { updatedAt: _rightUpdatedAt, ...rightContent } = right;
    return canonicalJson(leftContent) === canonicalJson(rightContent);
  } catch {
    return false;
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function hashRaw(raw: string) {
  let normalized = raw;
  try {
    normalized = canonicalJson(JSON.parse(raw) as unknown);
  } catch {
    // Invalid JSON is never uploaded, but hashing the raw value keeps the
    // scanner deterministic while a repository recovery issue is visible.
  }
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${normalized.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function notifyRemoteHydration() {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("rootine:workspace-change", {
      detail: { key: "*", origin: REMOTE_HYDRATION_ORIGIN },
    }));
  }, 0);
}

async function readRemoteRows(userId: string) {
  if (!supabase) return { rows: [] as RemoteWorkspaceRow[], error: null };
  const { data, error } = await supabase
    .from(ROOTINE_WORKSPACE_TABLE)
    .select("storage_key,payload,content_hash,revision,updated_at")
    .eq("user_id", userId);
  return {
    rows: (data ?? []) as RemoteWorkspaceRow[],
    error,
  };
}

async function uploadWorkspaces(
  userId: string,
  entries: Array<[string, string]>,
  expectedRemoteRows: ReadonlyMap<string, RemoteWorkspaceRow>,
): Promise<WorkspaceUploadResult> {
  const result: WorkspaceUploadResult = { confirmed: [], conflicts: [], commits: [], error: null };
  if (!supabase || entries.length === 0) return result;

  for (const [storageKey, raw] of entries) {
    const payload = rawPayload(raw);
    if (payload === null) continue;
    const expectedRevision = expectedRemoteRows.get(storageKey)?.revision ?? 0;
    const contentHash = hashRaw(raw);
    const commitResult = await commitWorkspaceThroughBridge(userId, {
      operationId: operationIdFor(storageKey, expectedRevision, contentHash, "web"),
      storageKey,
      payload,
      contentHash,
      baseRevision: expectedRevision,
      clientSource: "web",
      correlationId: newCorrelationId(),
    });
    if (commitResult.error) {
      result.error = commitResult.error;
      return result;
    }
    const commit = commitResult.commit;
    if (!commit) {
      result.error = { message: "Serwer nie zwrócił wyniku zapisu workspace’u." };
      return result;
    }
    result.commits.push(commit);
    const remoteRow: RemoteWorkspaceRow = {
      storage_key: commit.storageKey,
      payload: commit.payload,
      content_hash: commit.contentHash,
      revision: commit.revision,
      updated_at: commit.updatedAt,
    };
    if (commit.applied) result.confirmed.push(remoteRow);
    else result.conflicts.push(remoteRow);
  }

  return result;
}

async function reconcileRemoteWorkspaces(
  userId: string,
  control: ReconciliationControl = {},
): Promise<RemoteWorkspaceSyncOutcome> {
  if (!supabase) {
    return {
      result: { status: "error", uploaded: 0, downloaded: 0, message: "Supabase nie jest skonfigurowane." },
      knownRemoteRows: new Map(),
      knownLocalHashes: new Map(),
    };
  }

  const localBackupAtStart = await exportAllLocalWorkspaces();
  const { rows, error } = await readRemoteRows(userId);
  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        result: {
          status: "schema-missing",
          uploaded: 0,
          downloaded: 0,
          message: `Brakuje tabeli ${ROOTINE_WORKSPACE_TABLE}. Zastosuj migrację Supabase.`,
        },
        knownRemoteRows: new Map(),
        knownLocalHashes: new Map(),
      };
    }
    return {
      result: { status: "error", uploaded: 0, downloaded: 0, message: error.message },
      knownRemoteRows: new Map(),
      knownLocalHashes: new Map(),
    };
  }

  // Reading Supabase is asynchronous. A user can save a task while that
  // request is in flight, so take a fresh snapshot before deciding which side
  // wins. Without this second read, the first login could overwrite a fresh
  // local task with the older remote snapshot.
  const localBackup = await exportAllLocalWorkspaces();
  const remoteByKey = new Map(rows.map((row) => [row.storage_key, row]));
  const restoreEntries: Array<[string, string]> = [];
  const uploadEntries = new Map<string, string>();
  const reconciliationConflictKeys = new Set<string>();
  const knownRemoteRows = new Map<string, RemoteWorkspaceRow>();
  const localEntries = Object.entries(localBackup.workspaces);
  const knownLocalHashes = new Map(
    localEntries.map(([storageKey, raw]) => [storageKey, hashRaw(raw)] as const),
  );

  rows.forEach((row) => {
    const remoteRaw = payloadRaw(row.payload);
    if (remoteRaw !== null) knownRemoteRows.set(row.storage_key, row);
  });

  for (const [storageKey, raw] of localEntries) {
    const remote = remoteByKey.get(storageKey);
    if (!remote) {
      uploadEntries.set(storageKey, raw);
      continue;
    }

    const remoteRaw = payloadRaw(remote.payload);
    if (remoteRaw === null || remoteRaw === raw) continue;

    const localAtStart = localBackupAtStart.workspaces[storageKey];
    const changedWhileReading = localAtStart === undefined
      || !equivalentWorkspaceContent(localAtStart, raw);
    if (changedWhileReading) {
      uploadEntries.set(storageKey, raw);
      continue;
    }

    // Without a persisted common base there is no safe, cross-domain way to
    // decide which existing document is newer. Some workspaces intentionally
    // have no top-level updatedAt. Preserve both and ask the user instead of
    // turning a timestamp heuristic into silent data loss.
    reconciliationConflictKeys.add(storageKey);
    if (control.recordShadowDiff) {
      const diff = canonicalDiff(rawPayload(raw), remote.payload);
      if (diff) {
        await control.recordShadowDiff({
          storageKey,
          localPayload: rawPayload(raw),
          remotePayload: remote.payload,
          revision: remote.revision,
        });
      }
    }
  }

  for (const remote of rows) {
    if (!localBackup.workspaces[remote.storage_key]) {
      const raw = payloadRaw(remote.payload);
      if (raw !== null) restoreEntries.push([remote.storage_key, raw]);
    }
  }

  // A bounded provider timeout can make the app interactive while the remote
  // read is still in flight. Re-read at the last safe point and turn every
  // affected restore into an upload of the current local payload. Unchanged
  // and remote-only keys still follow newer-wins, guarded by repository CAS.
  const latestLocalBackup = restoreEntries.length > 0
    ? await exportAllLocalWorkspaces()
    : localBackup;
  const safeRestoreEntries: Array<[string, string]> = [];
  restoreEntries.forEach(([storageKey, remoteRaw]) => {
    const currentRaw = latestLocalBackup.workspaces[storageKey];
    const snapshotRaw = localBackup.workspaces[storageKey];
    const changedDuringSync = control.changedDuringInitialSync?.(storageKey) ?? false;
    const changedAfterSnapshot = currentRaw !== snapshotRaw;

    if (changedDuringSync || changedAfterSnapshot) {
      if (currentRaw !== undefined) uploadEntries.set(storageKey, currentRaw);
      return;
    }
    safeRestoreEntries.push([storageKey, remoteRaw]);
  });

  let downloaded = 0;
  if (safeRestoreEntries.length > 0) {
    const restored = await importAllLocalWorkspaces({
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: Object.fromEntries(safeRestoreEntries),
    }, {
      expectedWorkspaces: Object.fromEntries(safeRestoreEntries.map(([storageKey]) => [
        storageKey,
        latestLocalBackup.workspaces[storageKey] ?? null,
      ])),
    });
    if (!restored.ok) {
      return {
        result: { status: "error", uploaded: 0, downloaded: 0, message: restored.error },
        knownRemoteRows,
        knownLocalHashes,
      };
    }
    downloaded = restored.restored;
    const skippedKeys = new Set(restored.skipped ?? []);
    safeRestoreEntries.forEach(([storageKey, remoteRaw]) => {
      if (!skippedKeys.has(storageKey)) knownLocalHashes.set(storageKey, hashRaw(remoteRaw));
    });
    if (downloaded > 0) notifyRemoteHydration();
    if (restored.skipped?.length) {
      const afterConflictBackup = await exportAllLocalWorkspaces();
      restored.skipped.forEach((storageKey) => {
        const currentRaw = afterConflictBackup.workspaces[storageKey];
        if (currentRaw !== undefined) uploadEntries.set(storageKey, currentRaw);
      });
    }
  }

  const finalUploadEntries = [...uploadEntries.entries()];
  const finalUploadRawByKey = new Map(finalUploadEntries);
  const uploadResult = await uploadWorkspaces(userId, finalUploadEntries, remoteByKey);
  uploadResult.confirmed.forEach((row) => {
    knownRemoteRows.set(row.storage_key, row);
    const raw = finalUploadRawByKey.get(row.storage_key);
    if (raw !== undefined) knownLocalHashes.set(row.storage_key, hashRaw(raw));
  });
  if (uploadResult.error) {
    if (uploadResult.conflicts.length > 0 || reconciliationConflictKeys.size > 0) {
      uploadResult.conflicts.forEach((row) => knownRemoteRows.set(row.storage_key, row));
      const conflictKeys = [
        ...reconciliationConflictKeys,
        ...uploadResult.conflicts.map((row) => row.storage_key),
      ];
      return {
        result: {
          status: "conflict",
          uploaded: uploadResult.confirmed.length,
          downloaded,
          conflictKeys: [...new Set(conflictKeys)],
          message: "Wykryto konflikt danych; pozostałe zapisy zostaną ponowione po wybraniu wersji.",
        },
        knownRemoteRows,
        knownLocalHashes,
      };
    }
    if (isMissingSchemaError(uploadResult.error) || isMissingSyncContractError(uploadResult.error)) {
      return {
        result: {
          status: "schema-missing",
          uploaded: 0,
          downloaded,
          message: "Brakuje aktualnego kontraktu synchronizacji Supabase. Zastosuj wszystkie migracje.",
        },
        knownRemoteRows,
        knownLocalHashes,
      };
    }
    return {
      result: {
        status: "error",
        uploaded: uploadResult.confirmed.length,
        downloaded,
        message: uploadResult.error.message,
      },
      knownRemoteRows,
      knownLocalHashes,
    };
  }

  if (uploadResult.conflicts.length > 0 || reconciliationConflictKeys.size > 0) {
    uploadResult.conflicts.forEach((row) => knownRemoteRows.set(row.storage_key, row));
    const conflictKeys = [...new Set([
      ...reconciliationConflictKeys,
      ...uploadResult.conflicts.map((row) => row.storage_key),
    ])];
    return {
      result: {
        status: "conflict",
        uploaded: uploadResult.confirmed.length,
        downloaded,
        conflictKeys,
        message: "Dane zmieniły się na innym urządzeniu. Żadna wersja nie została nadpisana.",
      },
      knownRemoteRows,
      knownLocalHashes,
    };
  }
  return {
    result: { status: "synced", uploaded: uploadResult.confirmed.length, downloaded },
    knownRemoteRows,
    knownLocalHashes,
  };
}

function isMissingSyncContractError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "PGRST202"
    || candidate.code === "42883"
    || (typeof candidate.message === "string"
      && candidate.message.includes("rootine_apply_workspace_snapshot"));
}

export async function syncRemoteWorkspaces(
  userId: string,
): Promise<RemoteWorkspaceSyncResult> {
  return (await reconcileRemoteWorkspaces(userId)).result;
}

export type RemoteConflictResolution = "keep-local" | "use-remote";

export async function resolveRemoteWorkspaceConflicts(
  userId: string,
  storageKeys: readonly string[],
  resolution: RemoteConflictResolution,
): Promise<RemoteWorkspaceSyncResult> {
  const uniqueKeys = [...new Set(storageKeys)];
  if (uniqueKeys.length === 0) {
    return { status: "synced", uploaded: 0, downloaded: 0 };
  }

  const { rows, error } = await readRemoteRows(userId);
  if (error) {
    return {
      status: isMissingSchemaError(error) ? "schema-missing" : "error",
      uploaded: 0,
      downloaded: 0,
      message: error.message,
    };
  }
  const remoteByKey = new Map(rows.map((row) => [row.storage_key, row]));
  const localBackup = await exportAllLocalWorkspaces();

  if (resolution === "keep-local") {
    const entries = uniqueKeys
      .map((key) => [key, localBackup.workspaces[key]] as const)
      .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string")
      .map(([key, raw]) => [key, raw] as [string, string]);
    const uploadResult = await uploadWorkspaces(userId, entries, remoteByKey);
    if (uploadResult.error) {
      return {
        status: isMissingSchemaError(uploadResult.error) || isMissingSyncContractError(uploadResult.error)
          ? "schema-missing"
          : "error",
        uploaded: uploadResult.confirmed.length,
        downloaded: 0,
        message: uploadResult.error.message,
      };
    }
    if (uploadResult.conflicts.length > 0) {
      return {
        status: "conflict",
        uploaded: uploadResult.confirmed.length,
        downloaded: 0,
        conflictKeys: uploadResult.conflicts.map((row) => row.storage_key),
        message: "Dane na koncie zmieniły się ponownie. Wybierz rozwiązanie jeszcze raz.",
      };
    }
    return { status: "synced", uploaded: uploadResult.confirmed.length, downloaded: 0 };
  }

  const restoreEntries = uniqueKeys.flatMap((key) => {
    const row = remoteByKey.get(key);
    const raw = row ? payloadRaw(row.payload) : null;
    return raw === null ? [] : [[key, raw] as [string, string]];
  });
  const restored = await importAllLocalWorkspaces({
    version: 1,
    exportedAt: new Date().toISOString(),
    workspaces: Object.fromEntries(restoreEntries),
  }, {
    expectedWorkspaces: Object.fromEntries(restoreEntries.map(([key]) => [
      key,
      localBackup.workspaces[key] ?? null,
    ])),
  });
  if (!restored.ok) {
    return { status: "error", uploaded: 0, downloaded: 0, message: restored.error };
  }
  if (restored.skipped?.length) {
    return {
      status: "conflict",
      uploaded: 0,
      downloaded: restored.restored,
      conflictKeys: restored.skipped,
      message: "Lokalne dane zmieniły się podczas rozwiązywania konfliktu. Żadna zmiana nie została utracona.",
    };
  }
  if (restored.restored > 0) notifyRemoteHydration();
  return { status: "synced", uploaded: 0, downloaded: restored.restored };
}

export async function startRemoteWorkspaceSync(
  userId: string,
  onResult: (result: RemoteWorkspaceSyncResult) => void,
) {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const changedDuringInitialSync = new Set<string>();
  let everyWorkspaceChangedDuringInitialSync = false;
  const captureInitialWorkspaceChange = (event: Event) => {
    const detail = (event as CustomEvent<WorkspaceChangeDetail>).detail;
    if (detail?.origin === REMOTE_HYDRATION_ORIGIN) return;
    if (detail?.key === "*") {
      everyWorkspaceChangedDuringInitialSync = true;
      return;
    }
    if (detail?.key) changedDuringInitialSync.add(detail.key);
  };
  if (typeof window !== "undefined") {
    window.addEventListener("rootine:workspace-change", captureInitialWorkspaceChange);
  }

  let outcome: RemoteWorkspaceSyncOutcome;
  try {
    outcome = await reconcileRemoteWorkspaces(userId, {
      changedDuringInitialSync: (storageKey) => (
        everyWorkspaceChangedDuringInitialSync || changedDuringInitialSync.has(storageKey)
      ),
      recordShadowDiff: async ({ storageKey, localPayload, remotePayload, revision }) => {
        const diff = canonicalDiff(localPayload, remotePayload);
        if (!diff) return;
        await recordCanonicalDiff({
          domain: storageKey.split(/[.-]/)[1] ?? "workspace",
          entity: "workspace",
          entityId: storageKey,
          revision,
          clientSource: "web",
          diff,
        });
      },
    });
  } catch (error) {
    const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    rootineObservability.recordSyncOperation({
      endpoint: "pull",
      outcome: "failure",
      durationMs: Math.max(0, endedAt - startedAt),
      error,
      attributes: { source: "web", trigger: "initial" },
    });
    if (typeof window !== "undefined") {
      window.removeEventListener("rootine:workspace-change", captureInitialWorkspaceChange);
    }
    throw error;
  }
  const initial = outcome.result;
  const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  rootineObservability.recordSyncOperation({
    endpoint: "pull",
    outcome: initial.status === "synced" ? "success" : initial.status === "conflict" ? "degraded" : "failure",
    status: initial.status,
    durationMs: Math.max(0, endedAt - startedAt),
    attributes: {
      source: "web",
      trigger: "initial",
      changeCount: initial.downloaded,
      queueDepth: initial.uploaded,
    },
  });
  onResult(initial);
  if (initial.status !== "synced" || !supabase || typeof window === "undefined") {
    if (typeof window !== "undefined") {
      window.removeEventListener("rootine:workspace-change", captureInitialWorkspaceChange);
    }
    return () => undefined;
  }
  const realtimeClient = supabase;

  const pendingKeys = new Set(changedDuringInitialSync);
  const conflictedKeys = new Set<string>();
  const knownRemoteRows = new Map<string, RemoteWorkspaceRow>();
  const knownLocalHashes = new Map<string, string>();
  let flushTimer: number | null = null;
  let retryTimer: number | null = null;
  let activeFlush: Promise<void> | null = null;
  let activeScan: Promise<void> | null = null;

  outcome.knownRemoteRows.forEach((row, key) => knownRemoteRows.set(key, row));
  outcome.knownLocalHashes.forEach((hash, key) => knownLocalHashes.set(key, hash));

  const flush = async () => {
    if (activeFlush || pendingKeys.size === 0) return activeFlush;
    const keys = new Set(pendingKeys);
    pendingKeys.clear();
    activeFlush = (async () => {
      const backup = await exportAllLocalWorkspaces();
      const entries = [...keys]
        .map((key) => [key, backup.workspaces[key]] as const)
        .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string")
        .map(([key, raw]) => [key, raw] as [string, string]);
      const rawByKey = new Map(entries);
      const uploadResult = await uploadWorkspaces(userId, entries, knownRemoteRows);
      uploadResult.confirmed.forEach((row) => {
        knownRemoteRows.set(row.storage_key, row);
        const raw = rawByKey.get(row.storage_key);
        if (raw !== undefined) knownLocalHashes.set(row.storage_key, hashRaw(raw));
      });
      if (uploadResult.error) {
        uploadResult.conflicts.forEach((row) => {
          knownRemoteRows.set(row.storage_key, row);
          conflictedKeys.add(row.storage_key);
        });
        const confirmedKeys = new Set(uploadResult.confirmed.map((row) => row.storage_key));
        const conflictKeys = new Set(uploadResult.conflicts.map((row) => row.storage_key));
        keys.forEach((key) => {
          if (!confirmedKeys.has(key) && !conflictKeys.has(key)) pendingKeys.add(key);
        });
        onResult(uploadResult.conflicts.length > 0
          ? {
            status: "conflict",
            uploaded: uploadResult.confirmed.length,
            downloaded: 0,
            conflictKeys: [...conflictedKeys],
            message: "Wykryto konflikt danych; pozostałe zapisy zostaną ponowione automatycznie.",
          }
          : {
            status: isMissingSchemaError(uploadResult.error) || isMissingSyncContractError(uploadResult.error)
              ? "schema-missing"
              : "error",
            uploaded: uploadResult.confirmed.length,
            downloaded: 0,
            message: isMissingSchemaError(uploadResult.error) || isMissingSyncContractError(uploadResult.error)
              ? "Brakuje aktualnego kontraktu synchronizacji Supabase. Zastosuj wszystkie migracje."
              : uploadResult.error.message,
          });
        if (retryTimer === null) {
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            void flush();
          }, 2_000);
        }
      } else if (uploadResult.conflicts.length > 0) {
        uploadResult.conflicts.forEach((row) => {
          knownRemoteRows.set(row.storage_key, row);
          conflictedKeys.add(row.storage_key);
        });
        onResult({
          status: "conflict",
          uploaded: uploadResult.confirmed.length,
          downloaded: 0,
          conflictKeys: uploadResult.conflicts.map((row) => row.storage_key),
          message: "Dane zmieniły się na innym urządzeniu. Żadna wersja nie została nadpisana.",
        });
      } else if (entries.length > 0) {
        onResult(conflictedKeys.size > 0
          ? {
            status: "conflict",
            uploaded: uploadResult.confirmed.length,
            downloaded: 0,
            conflictKeys: [...conflictedKeys],
            message: "Dane zmieniły się na innym urządzeniu. Żadna wersja nie została nadpisana.",
          }
          : { status: "synced", uploaded: uploadResult.confirmed.length, downloaded: 0 });
      }
    })().finally(() => {
      activeFlush = null;
      if (pendingKeys.size > 0 && retryTimer === null) void flush();
    });
    return activeFlush;
  };

  const scheduleFlush = () => {
    if (flushTimer !== null) window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flush();
    }, 120);
  };

  const scanForUnannouncedChanges = () => {
    if (activeScan) return activeScan;
    activeScan = exportAllLocalWorkspaces()
      .then((backup) => {
        Object.entries(backup.workspaces).forEach(([key, raw]) => {
          if (conflictedKeys.has(key)) return;
          if (knownLocalHashes.get(key) !== hashRaw(raw)) pendingKeys.add(key);
        });
        if (pendingKeys.size > 0) scheduleFlush();
      })
      .finally(() => {
        activeScan = null;
      });
    return activeScan;
  };

  const onWorkspaceChange = (event: Event) => {
    const detail = (event as CustomEvent<WorkspaceChangeDetail>).detail;
    if (detail?.origin === REMOTE_HYDRATION_ORIGIN) return;
    if (detail?.key === "*") {
      void exportAllLocalWorkspaces().then((backup) => {
        Object.keys(backup.workspaces).forEach((key) => {
          if (!conflictedKeys.has(key)) pendingKeys.add(key);
        });
        scheduleFlush();
      });
      return;
    }
    if (!detail?.key) return;
    if (conflictedKeys.has(detail.key)) return;
    pendingKeys.add(detail.key);
    scheduleFlush();
  };

  const flushOnPageHide = () => { void flush(); };
  const scanWhenHidden = () => {
    if (document.visibilityState !== "hidden") return;
    lastScannedMutation = getLocalMutationSequence();
    lastTickMutation = lastScannedMutation;
    void scanForUnannouncedChanges().then(() => flush());
  };

  /*
   * The scan is a safety net for writes that never announced themselves; the
   * `rootine:workspace-change` listener above is the primary path. It used to
   * run unconditionally every 2s, and each run reads *every* workspace out of
   * IndexedDB and hashes it — a cost that grows with the user's data and that
   * an idle app paid forever.
   *
   * Two gates make it proportional to what it can actually find. Nothing can
   * have changed unless the user interacted, so an unchanged mutation counter
   * means there is nothing to scan for. And scanning mid-interaction is the
   * worst possible moment, so the scan waits for the counter to hold still for
   * a tick — it runs shortly after activity settles, not during it.
   */
  let lastTickMutation = getLocalMutationSequence();
  let lastScannedMutation = lastTickMutation;
  const scanTimer = window.setInterval(() => {
    if (document.visibilityState === "hidden") return;
    const current = getLocalMutationSequence();
    const settled = current === lastTickMutation;
    lastTickMutation = current;
    if (!settled || current === lastScannedMutation) return;
    lastScannedMutation = current;
    void scanForUnannouncedChanges();
  }, SCAN_SETTLE_INTERVAL_MS);
  window.addEventListener("rootine:workspace-change", onWorkspaceChange);
  window.removeEventListener("rootine:workspace-change", captureInitialWorkspaceChange);
  window.addEventListener("pagehide", flushOnPageHide);
  document.addEventListener("visibilitychange", scanWhenHidden);

  const reportRemoteConflict = (row: RemoteWorkspaceRow) => {
    knownRemoteRows.set(row.storage_key, row);
    conflictedKeys.add(row.storage_key);
    pendingKeys.delete(row.storage_key);
    onResult({
      status: "conflict",
      uploaded: 0,
      downloaded: 0,
      conflictKeys: [...conflictedKeys],
      message: "Dane zmieniły się równocześnie na kilku urządzeniach. Żadna wersja nie została nadpisana.",
    });
  };

  const applyRealtimeRow = async (row: RemoteWorkspaceRow) => {
    const remoteRaw = payloadRaw(row.payload);
    if (remoteRaw === null) return;
    const backup = await exportAllLocalWorkspaces();
    const localRaw = backup.workspaces[row.storage_key];
    const localHash = localRaw === undefined ? null : hashRaw(localRaw);
    const knownLocalHash = knownLocalHashes.get(row.storage_key);

    // This is either our own confirmed write or an equivalent write from
    // another client. Only the server revision baseline needs updating.
    if (
      localHash === row.content_hash
      || (localRaw !== undefined && equivalentWorkspaceContent(localRaw, remoteRaw))
    ) {
      knownRemoteRows.set(row.storage_key, row);
      if (localHash !== null) knownLocalHashes.set(row.storage_key, localHash);
      return;
    }

    const localIsUnchanged = localRaw === undefined
      || (knownLocalHash !== undefined && localHash === knownLocalHash);
    if (!localIsUnchanged) {
      const diff = localRaw === undefined ? null : canonicalDiff(rawPayload(localRaw), row.payload);
      if (diff) {
        void recordCanonicalDiff({
          domain: row.storage_key.split(/[.-]/)[1] ?? "workspace",
          entity: "workspace",
          entityId: row.storage_key,
          revision: row.revision,
          clientSource: "web",
          diff,
        });
      }
      reportRemoteConflict(row);
      return;
    }

    const restored = await importAllLocalWorkspaces({
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: { [row.storage_key]: remoteRaw },
    }, {
      expectedWorkspaces: { [row.storage_key]: localRaw ?? null },
    });
    if (!restored.ok || restored.skipped?.length) {
      reportRemoteConflict(row);
      return;
    }
    knownRemoteRows.set(row.storage_key, row);
    knownLocalHashes.set(row.storage_key, hashRaw(remoteRaw));
    if (restored.restored > 0) {
      notifyRemoteHydration();
      onResult({ status: "synced", uploaded: 0, downloaded: restored.restored });
    }
  };

  let remoteChangeQueue = Promise.resolve();
  const realtimeChannel = realtimeClient
    .channel(`rootine-workspaces:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: ROOTINE_WORKSPACE_TABLE,
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const candidate = payload.new as Partial<RemoteWorkspaceRow>;
        if (
          typeof candidate.storage_key !== "string"
          || typeof candidate.content_hash !== "string"
          || typeof candidate.revision !== "number"
          || typeof candidate.updated_at !== "string"
          || candidate.payload === undefined
        ) return;
        const row = candidate as RemoteWorkspaceRow;
        remoteChangeQueue = remoteChangeQueue
          .then(() => applyRealtimeRow(row))
          .catch(() => {
            onResult({
              status: "error",
              uploaded: 0,
              downloaded: 0,
              message: "Nie udało się zastosować zmiany z innego urządzenia. Dane lokalne pozostały bez zmian.",
            });
          });
      },
    )
    .subscribe((status) => {
      if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
      onResult({
        status: "error",
        uploaded: 0,
        downloaded: 0,
        message: "Synchronizacja na żywo została przerwana. Zmiany lokalne pozostają bezpieczne; spróbuj ponownie.",
      });
    });

  // This scan is deliberately unconditional. It compares against the exact
  // remote payloads from reconciliation, so a write made while an upload was
  // hanging cannot be mistaken for an already-synced current snapshot.
  void scanForUnannouncedChanges();

  return () => {
    if (flushTimer !== null) window.clearTimeout(flushTimer);
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    window.clearInterval(scanTimer);
    window.removeEventListener("rootine:workspace-change", captureInitialWorkspaceChange);
    window.removeEventListener("rootine:workspace-change", onWorkspaceChange);
    window.removeEventListener("pagehide", flushOnPageHide);
    document.removeEventListener("visibilitychange", scanWhenHidden);
    void realtimeClient.removeChannel(realtimeChannel);
    void flush();
  };
}
