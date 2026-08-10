import {
  exportAllLocalWorkspaces,
  getLocalMutationSequence,
  importAllLocalWorkspaces,
} from "../../app/data/localRepository";
import { supabase } from "./client";

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
  | "schema-missing"
  | "error";

export type RemoteWorkspaceSyncResult = {
  status: Exclude<RemoteWorkspaceSyncStatus, "disabled" | "signed-out" | "syncing">;
  uploaded: number;
  downloaded: number;
  message?: string;
};

type RemoteWorkspaceRow = {
  storage_key: string;
  payload: unknown;
  content_hash: string;
  revision: number;
  updated_at: string;
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
    return JSON.stringify(leftContent) === JSON.stringify(rightContent);
  } catch {
    return false;
  }
}

function hashRaw(raw: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${raw.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function localUpdatedAt(raw: string | undefined) {
  if (!raw) return 0;
  const value = rawPayload(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  const timestamp = typeof updatedAt === "string" ? Date.parse(updatedAt) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function remoteUpdatedAt(row: RemoteWorkspaceRow) {
  const timestamp = Date.parse(row.updated_at);
  return Number.isFinite(timestamp) ? timestamp : 0;
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

async function uploadWorkspaces(userId: string, entries: Array<[string, string]>) {
  if (!supabase || entries.length === 0) return null;
  const rows = entries.flatMap(([storageKey, raw]) => {
    const payload = rawPayload(raw);
    if (payload === null) return [];
    return [{
      user_id: userId,
      storage_key: storageKey,
      payload,
      content_hash: hashRaw(raw),
      updated_at: new Date(localUpdatedAt(raw) || Date.now()).toISOString(),
    }];
  });
  if (rows.length === 0) return null;
  const { error } = await supabase
    .from(ROOTINE_WORKSPACE_TABLE)
    .upsert(rows, { onConflict: "user_id,storage_key" });
  return error;
}

export async function syncRemoteWorkspaces(userId: string): Promise<RemoteWorkspaceSyncResult> {
  if (!supabase) return { status: "error", uploaded: 0, downloaded: 0, message: "Supabase nie jest skonfigurowane." };

  const localBackupAtStart = await exportAllLocalWorkspaces();
  const { rows, error } = await readRemoteRows(userId);
  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        status: "schema-missing",
        uploaded: 0,
        downloaded: 0,
        message: `Brakuje tabeli ${ROOTINE_WORKSPACE_TABLE}. Zastosuj migrację Supabase.`,
      };
    }
    return { status: "error", uploaded: 0, downloaded: 0, message: error.message };
  }

  // Reading Supabase is asynchronous. A user can save a task while that
  // request is in flight, so take a fresh snapshot before deciding which side
  // wins. Without this second read, the first login could overwrite a fresh
  // local task with the older remote snapshot.
  const localBackup = await exportAllLocalWorkspaces();
  const remoteByKey = new Map(rows.map((row) => [row.storage_key, row]));
  const restoreEntries: Array<[string, string]> = [];
  const uploadEntries: Array<[string, string]> = [];
  const localEntries = Object.entries(localBackup.workspaces);

  for (const [storageKey, raw] of localEntries) {
    const remote = remoteByKey.get(storageKey);
    if (!remote) {
      uploadEntries.push([storageKey, raw]);
      continue;
    }

    const remoteRaw = payloadRaw(remote.payload);
    if (remoteRaw === null || remoteRaw === raw) continue;

    const localAtStart = localBackupAtStart.workspaces[storageKey];
    const changedWhileReading = localAtStart !== undefined
      && !equivalentWorkspaceContent(localAtStart, raw);
    if (changedWhileReading) {
      uploadEntries.push([storageKey, raw]);
      continue;
    }

    // A fresh account imports the current local browser data. Once a remote
    // snapshot exists, the newer top-level workspace timestamp wins; seeded
    // local defaults have timestamp zero and therefore never overwrite remote data.
    if (localUpdatedAt(raw) >= remoteUpdatedAt(remote) && localUpdatedAt(raw) > 0) {
      uploadEntries.push([storageKey, raw]);
    } else if (remoteRaw !== null) {
      restoreEntries.push([storageKey, remoteRaw]);
    }
  }

  for (const remote of rows) {
    if (!localBackup.workspaces[remote.storage_key]) {
      const raw = payloadRaw(remote.payload);
      if (raw !== null) restoreEntries.push([remote.storage_key, raw]);
    }
  }

  let downloaded = 0;
  if (restoreEntries.length > 0) {
    const restored = await importAllLocalWorkspaces({
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: Object.fromEntries(restoreEntries),
    });
    if (!restored.ok) {
      return { status: "error", uploaded: 0, downloaded: 0, message: restored.error };
    }
    downloaded = restored.restored;
    notifyRemoteHydration();
  }

  const uploadError = await uploadWorkspaces(userId, uploadEntries);
  if (uploadError) {
    if (isMissingSchemaError(uploadError)) {
      return {
        status: "schema-missing",
        uploaded: 0,
        downloaded,
        message: `Brakuje tabeli ${ROOTINE_WORKSPACE_TABLE}. Zastosuj migrację Supabase.`,
      };
    }
    return { status: "error", uploaded: 0, downloaded, message: uploadError.message };
  }

  return { status: "synced", uploaded: uploadEntries.length, downloaded };
}

export async function startRemoteWorkspaceSync(
  userId: string,
  onResult: (result: RemoteWorkspaceSyncResult) => void,
) {
  const initial = await syncRemoteWorkspaces(userId);
  onResult(initial);
  if (initial.status !== "synced" || !supabase || typeof window === "undefined") return () => undefined;

  const pendingKeys = new Set<string>();
  const knownHashes = new Map<string, string>();
  let flushTimer: number | null = null;
  let retryTimer: number | null = null;
  let activeFlush: Promise<void> | null = null;
  let activeScan: Promise<void> | null = null;

  const syncedBackup = await exportAllLocalWorkspaces();
  Object.entries(syncedBackup.workspaces).forEach(([key, raw]) => {
    knownHashes.set(key, hashRaw(raw));
  });

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
      const error = await uploadWorkspaces(userId, entries);
      if (error) {
        keys.forEach((key) => pendingKeys.add(key));
        onResult({
          status: isMissingSchemaError(error) ? "schema-missing" : "error",
          uploaded: 0,
          downloaded: 0,
          message: isMissingSchemaError(error)
            ? `Brakuje tabeli ${ROOTINE_WORKSPACE_TABLE}. Zastosuj migrację Supabase.`
            : error.message,
        });
        if (retryTimer === null) {
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            void flush();
          }, 2_000);
        }
      } else if (entries.length > 0) {
        entries.forEach(([key, raw]) => knownHashes.set(key, hashRaw(raw)));
        onResult({ status: "synced", uploaded: entries.length, downloaded: 0 });
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
          if (knownHashes.get(key) !== hashRaw(raw)) pendingKeys.add(key);
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
        Object.keys(backup.workspaces).forEach((key) => pendingKeys.add(key));
        scheduleFlush();
      });
      return;
    }
    if (!detail?.key) return;
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
  window.addEventListener("pagehide", flushOnPageHide);
  document.addEventListener("visibilitychange", scanWhenHidden);

  return () => {
    if (flushTimer !== null) window.clearTimeout(flushTimer);
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    window.clearInterval(scanTimer);
    window.removeEventListener("rootine:workspace-change", onWorkspaceChange);
    window.removeEventListener("pagehide", flushOnPageHide);
    document.removeEventListener("visibilitychange", scanWhenHidden);
    void flush();
  };
}
