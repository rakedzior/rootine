import {
  createBrowserWorkspacePayloadStore,
  type WorkspacePayloadRecord,
  type WorkspacePayloadStore,
} from "./indexedDbWorkspaceStore";

export type LocalLoadStatus = "missing" | "ok" | "migrated" | "corrupt";

export type LocalLoadResult<T> = {
  status: LocalLoadStatus;
  workspace: T;
  recoveryId?: string;
  error?: string;
};

export type LocalRecoveryRecord = {
  id: string;
  storageKey: string;
  backupKey: string;
  createdAt: string;
  reason: string;
  byteLength: number;
  contentHash?: string;
  tier?: "localStorage" | "indexeddb";
};

export type LocalPersistenceIssueKind =
  | "quota"
  | "conflict"
  | "permission"
  | "unavailable"
  | "corrupt"
  | "unknown";

export type LocalPersistenceIssue = {
  id: string;
  key: string;
  kind: LocalPersistenceIssueKind;
  createdAt: string;
  message: string;
  retryable: boolean;
  hasDraft: boolean;
  byteLength: number;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
};

type LocalReadOptions<T> = {
  key: string;
  fallback: () => T;
  validate: (value: unknown) => value is T;
  migrate?: (value: unknown) => T | null;
};

type StoredBackupEnvelope = {
  version: 1;
  createdAt: string;
  reason: string;
  storageKey: string;
  raw: string;
};

type WorkspaceManifest = {
  __rootineWorkspaceManifest: 1;
  key: string;
  storage: "indexeddb";
  revision: number;
  contentHash: string;
  updatedAt: string;
  byteLength: number;
};

type WorkspaceBaseline = {
  tier: "inline" | "indexeddb";
  revision: number;
  contentHash: string;
  updatedAt: string;
  raw: string;
};

type PendingTierWrite = {
  key: string;
  raw: string;
  contentHash: string;
  byteLength: number;
  updatedAt: string;
  expectedRevision: number | null;
  expectedContentHash: string | null;
  timer: number | null;
};

type RetryOperation =
  | {
    type: "inline";
    key: string;
    raw: string;
    expectedContentHash: string | null;
  }
  | {
    type: "tier";
    pending: Omit<PendingTierWrite, "timer">;
  }
  | {
    type: "manifest";
    record: WorkspacePayloadRecord;
  }
  | {
    type: "hydrate";
    key: string;
    manifest?: WorkspaceManifest;
  }
  | {
    type: "migrate";
    key: string;
    raw: string;
  };

type InternalPersistenceIssue = LocalPersistenceIssue & {
  draftRaw?: string;
  retryOperation?: RetryOperation;
};

const RECOVERY_INDEX_KEY = "rootine.recovery.index.v1";
const BACKUP_PREFIX = "rootine.recovery.payload.";
const EXPORT_VERSION = 1 as const;
const MANIFEST_MARKER = 1 as const;
const MAX_RECOVERY_RECORDS = 40;
const INDEXEDDB_RECOVERY_THRESHOLD_BYTES = 64 * 1024;
const WRITE_BATCH_DELAY_MS = 40;
const WORKSPACE_CHANNEL = "rootine:workspace";
const repositoryOrigin = `rootine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const rollbackOrigin = `${repositoryOrigin}-rollback`;
const hydrationOrigin = `${repositoryOrigin}-hydrate`;

const INLINE_STORAGE_KEYS = new Set([
  "rootine.sidebar.collapsed",
  "rootine.sidebar.modules",
  "rootine.goals.layout",
  "rootine.goals.sort",
  "rootine.task-completion.v1",
]);

let payloadStore: WorkspacePayloadStore = createBrowserWorkspacePayloadStore();
let mutationSequence = 0;
let mutationListenersInstalled = false;
let persistenceLifecycleListenersInstalled = false;
const blockedWrites = new Map<string, number>();
const baselines = new Map<string, WorkspaceBaseline>();
const workspaceCache = new Map<string, WorkspacePayloadRecord>();
const parsedWorkspaceCache = new Map<string, { raw: string; value: unknown }>();
const knownMissingKeys = new Set<string>();
const hydrationPromises = new Map<string, Promise<void>>();
const migrationPromises = new Map<string, Promise<void>>();
const deferredTierWrites = new Map<string, Omit<PendingTierWrite, "timer">>();
const pendingTierWrites = new Map<string, PendingTierWrite>();
const activeFlushes = new Map<string, Promise<boolean>>();
const persistenceIssues = new Map<string, InternalPersistenceIssue>();
const persistenceIssueListeners = new Set<() => void>();
const pendingRecoveryCopies = new Map<string, {
  record: LocalRecoveryRecord;
  raw: string;
  promise: Promise<boolean>;
}>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function byteLength(raw: string) {
  return new TextEncoder().encode(raw).byteLength;
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

function updatedAtFromRaw(raw: string, fallback = new Date().toISOString()) {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && typeof parsed.updatedAt === "string") {
      const timestamp = new Date(parsed.updatedAt).getTime();
      if (Number.isFinite(timestamp)) return parsed.updatedAt;
    }
  } catch {
    // A valid fallback timestamp still gives the repository a deterministic revision order.
  }
  return fallback;
}

function updatedAtEpoch(updatedAt: string) {
  const timestamp = new Date(updatedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function equivalentIgnoringTopLevelUpdatedAt(leftRaw: string, rightRaw: string) {
  if (leftRaw === rightRaw) return true;
  try {
    const left: unknown = JSON.parse(leftRaw);
    const right: unknown = JSON.parse(rightRaw);
    if (!isRecord(left) || !isRecord(right) || !("updatedAt" in left) || !("updatedAt" in right)) {
      return false;
    }
    return JSON.stringify({ ...left, updatedAt: null }) === JSON.stringify({ ...right, updatedAt: null });
  } catch {
    return false;
  }
}

function manifestFromRecord(record: WorkspacePayloadRecord): WorkspaceManifest {
  return {
    __rootineWorkspaceManifest: MANIFEST_MARKER,
    key: record.key,
    storage: "indexeddb",
    revision: record.revision,
    contentHash: record.contentHash,
    updatedAt: record.updatedAt,
    byteLength: record.byteLength,
  };
}

function parseWorkspaceManifest(raw: string | null, expectedKey?: string): WorkspaceManifest | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value)
      || value.__rootineWorkspaceManifest !== MANIFEST_MARKER
      || value.storage !== "indexeddb"
      || typeof value.key !== "string"
      || (expectedKey !== undefined && value.key !== expectedKey)
      || typeof value.revision !== "number"
      || !Number.isInteger(value.revision)
      || value.revision < 1
      || typeof value.contentHash !== "string"
      || typeof value.updatedAt !== "string"
      || typeof value.byteLength !== "number"
      || value.byteLength < 0
    ) {
      return null;
    }
    return value as WorkspaceManifest;
  } catch {
    return null;
  }
}

function shouldUseIndexedDb(key: string) {
  return payloadStore.available && isRootineWorkspaceKey(key) && !INLINE_STORAGE_KEYS.has(key);
}

function installMutationListeners() {
  if (typeof window === "undefined") return;
  if (!mutationListenersInstalled) {
    const markMutationIntent = () => {
      mutationSequence += 1;
    };
    window.addEventListener("input", markMutationIntent, true);
    window.addEventListener("change", markMutationIntent, true);
    window.addEventListener("pointerup", markMutationIntent, true);
    window.addEventListener("keyup", (event) => {
      if (["Enter", " ", "Delete", "Backspace"].includes(event.key)) mutationSequence += 1;
    }, true);
    mutationListenersInstalled = true;
  }

  if (!persistenceLifecycleListenersInstalled && typeof document !== "undefined") {
    const flushPendingWrites = () => {
      void flushLocalWorkspaceWrites();
      globalThis.queueMicrotask(() => {
        void flushLocalWorkspaceWrites();
      });
    };
    const flushPendingWritesWhenHidden = () => {
      if (document.visibilityState === "hidden") flushPendingWrites();
    };
    window.addEventListener("pagehide", flushPendingWrites);
    document.addEventListener("visibilitychange", flushPendingWritesWhenHidden);
    persistenceLifecycleListenersInstalled = true;
  }
}

function broadcastWorkspaceChange(
  key: string,
  updatedAt: string,
  origin = repositoryOrigin,
) {
  if (typeof window === "undefined") return;
  const detail = { key, updatedAt, origin };
  window.dispatchEvent(new CustomEvent("rootine:workspace-change", { detail }));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(WORKSPACE_CHANNEL);
    channel.postMessage(detail);
    channel.close();
  }
}

function notifyLocalHydration(key: string) {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("rootine:workspace-change", {
      detail: { key, updatedAt: new Date().toISOString(), origin: hydrationOrigin },
    }));
  }, 0);
}

function notifyLocalRollback(key: string) {
  broadcastWorkspaceChange(key, new Date().toISOString(), rollbackOrigin);
}

function readRecoveryIndex(): LocalRecoveryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECOVERY_INDEX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LocalRecoveryRecord => (
      isRecord(item)
      && typeof item.id === "string"
      && typeof item.storageKey === "string"
      && typeof item.backupKey === "string"
      && typeof item.createdAt === "string"
      && typeof item.reason === "string"
      && typeof item.byteLength === "number"
      && (item.contentHash === undefined || typeof item.contentHash === "string")
      && (item.tier === undefined || item.tier === "localStorage" || item.tier === "indexeddb")
    ));
  } catch {
    return [];
  }
}

function writeRecoveryIndex(records: LocalRecoveryRecord[]) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(RECOVERY_INDEX_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

function cleanupRecoveryPayloads(records = readRecoveryIndex()) {
  if (typeof window === "undefined") return;
  const retained = new Set(records
    .filter((record) => record.tier !== "indexeddb")
    .map((record) => record.backupKey));
  const orphaned: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(BACKUP_PREFIX) && !retained.has(key)) orphaned.push(key);
  }
  orphaned.forEach((key) => window.localStorage.removeItem(key));
}

async function removeRecoveryPayload(record: LocalRecoveryRecord) {
  if (record.tier === "indexeddb") {
    await payloadStore.remove(record.backupKey);
    return;
  }
  if (typeof window !== "undefined") window.localStorage.removeItem(record.backupKey);
}

function commitRecoveryIndex(record: LocalRecoveryRecord) {
  const allRecords = [
    record,
    ...readRecoveryIndex().filter((candidate) => candidate.id !== record.id),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const retained = allRecords.slice(0, MAX_RECOVERY_RECORDS);
  const evicted = allRecords.slice(MAX_RECOVERY_RECORDS);
  if (!writeRecoveryIndex(retained)) return false;
  evicted.forEach((candidate) => {
    void removeRecoveryPayload(candidate);
  });
  cleanupRecoveryPayloads(retained);
  return true;
}

function createRecoveryCopy(storageKey: string, raw: string, reason: string): LocalRecoveryRecord | null {
  if (typeof window === "undefined") return null;
  const contentHash = hashRaw(raw);
  const existing = [
    ...readRecoveryIndex(),
    ...[...pendingRecoveryCopies.values()].map((pending) => pending.record),
  ].find((record) => {
    if (record.storageKey !== storageKey) return false;
    if (record.contentHash) return record.contentHash === contentHash;
    try {
      const envelope = JSON.parse(window.localStorage.getItem(record.backupKey) ?? "") as Partial<StoredBackupEnvelope>;
      return envelope.raw === raw;
    } catch {
      return false;
    }
  });
  if (existing) return existing;

  const createdAt = new Date().toISOString();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const backupKey = `${BACKUP_PREFIX}${id}`;
  const size = byteLength(raw);
  const record: LocalRecoveryRecord = {
    id,
    storageKey,
    backupKey,
    createdAt,
    reason,
    byteLength: size,
    contentHash,
    tier: payloadStore.available && size >= INDEXEDDB_RECOVERY_THRESHOLD_BYTES
      ? "indexeddb"
      : "localStorage",
  };

  const storeLocally = () => {
    const envelope: StoredBackupEnvelope = {
      version: 1,
      createdAt,
      reason,
      storageKey,
      raw,
    };
    record.tier = "localStorage";
    window.localStorage.setItem(backupKey, JSON.stringify(envelope));
    if (!commitRecoveryIndex(record)) {
      window.localStorage.removeItem(backupKey);
      return false;
    }
    return true;
  };

  if (record.tier === "indexeddb") {
    const promise = (async () => {
      try {
        const result = await payloadStore.compareAndSwap({
          key: backupKey,
          raw,
          expectedRevision: null,
          expectedContentHash: null,
          contentHash,
          updatedAt: createdAt,
          byteLength: size,
        });
        if (result.status === "conflict" && result.current?.raw !== raw) {
          throw new DOMException("Recovery payload key conflict.", "InvalidStateError");
        }
        if (!commitRecoveryIndex(record)) {
          await payloadStore.remove(backupKey);
          throw new DOMException("Recovery index is full.", "QuotaExceededError");
        }
        return true;
      } catch (error) {
        try {
          if (storeLocally()) {
            reportPersistenceIssue({
              key: storageKey,
              kind: classifyStorageError(error),
              draftRaw: raw,
              message: `Kopię „${storageKey}” zapisano w trybie zgodności, ponieważ IndexedDB było niedostępne.`,
            });
            return true;
          }
        } catch {
          // The actionable issue below retains an exportable in-memory draft.
        }
        reportPersistenceIssue({
          key: storageKey,
          kind: classifyStorageError(error),
          draftRaw: raw,
          message: `Nie udało się utworzyć trwałej kopii „${storageKey}”. Oryginał nie został nadpisany.`,
        });
        return false;
      }
    })();
    pendingRecoveryCopies.set(id, { record, raw, promise });
    void promise.finally(() => pendingRecoveryCopies.delete(id));
    return record;
  }

  try {
    return storeLocally() ? record : null;
  } catch {
    return null;
  }
}

async function ensureRecoveryCopy(storageKey: string, raw: string, reason: string) {
  const record = createRecoveryCopy(storageKey, raw, reason);
  if (!record) return null;
  const pending = pendingRecoveryCopies.get(record.id);
  if (pending && !(await pending.promise)) return null;
  return record;
}

function classifyStorageError(error: unknown): Exclude<LocalPersistenceIssueKind, "conflict" | "corrupt"> {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return "quota";
  if (name === "SecurityError" || name === "NotAllowedError") return "permission";
  if (
    name === "NotSupportedError"
    || name === "InvalidStateError"
    || name === "VersionError"
    || name === "AbortError"
  ) {
    return "unavailable";
  }
  return "unknown";
}

function issueMessage(kind: LocalPersistenceIssueKind, key: string) {
  if (kind === "quota") {
    return `Brak miejsca na zapis „${key}”. Wyeksportuj kopię, usuń zbędne dane i spróbuj ponownie.`;
  }
  if (kind === "conflict") {
    return `Nowsza wersja „${key}” została zapisana w innej karcie. Rootine zachował tamtą wersję i nie nadpisał jej po cichu.`;
  }
  if (kind === "permission") {
    return `Przeglądarka zablokowała zapis „${key}”. Sprawdź ustawienia danych witryny i spróbuj ponownie.`;
  }
  if (kind === "unavailable") {
    return `Trwały magazyn dla „${key}” jest chwilowo niedostępny. Dane pozostają w bezpiecznej kopii lub pamięci zgodności.`;
  }
  if (kind === "corrupt") {
    return `Nie można odczytać trwałego zapisu „${key}”. Oryginał nie został nadpisany.`;
  }
  return `Nie udało się zapisać „${key}”. Pobierz szkic lub spróbuj ponownie.`;
}

function emitPersistenceIssues() {
  persistenceIssueListeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("rootine:persistence-issues"));
  }
}

function reportPersistenceIssue({
  key,
  kind,
  draftRaw,
  retryOperation,
  localUpdatedAt,
  remoteUpdatedAt,
  message,
}: {
  key: string;
  kind: LocalPersistenceIssueKind;
  draftRaw?: string;
  retryOperation?: RetryOperation;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  message?: string;
}) {
  for (const [id, issue] of persistenceIssues) {
    if (issue.key === key && issue.kind === kind) persistenceIssues.delete(id);
  }
  const createdAt = new Date().toISOString();
  const issue: InternalPersistenceIssue = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    kind,
    createdAt,
    message: message ?? issueMessage(kind, key),
    retryable: Boolean(retryOperation) && kind !== "conflict",
    hasDraft: draftRaw !== undefined,
    byteLength: draftRaw ? byteLength(draftRaw) : 0,
    localUpdatedAt,
    remoteUpdatedAt,
    draftRaw,
    retryOperation,
  };
  persistenceIssues.set(issue.id, issue);
  emitPersistenceIssues();
  return issue;
}

function clearPersistenceIssuesForKey(key: string) {
  let changed = false;
  for (const [id, issue] of persistenceIssues) {
    if (issue.key !== key) continue;
    persistenceIssues.delete(id);
    changed = true;
  }
  if (changed) emitPersistenceIssues();
}

function recordBaseline(record: WorkspacePayloadRecord) {
  workspaceCache.set(record.key, record);
  knownMissingKeys.delete(record.key);
  baselines.set(record.key, {
    tier: "indexeddb",
    revision: record.revision,
    contentHash: record.contentHash,
    updatedAt: record.updatedAt,
    raw: record.raw,
  });
}

function recordInlineBaseline(key: string, raw: string) {
  knownMissingKeys.delete(key);
  baselines.set(key, {
    tier: "inline",
    revision: 0,
    contentHash: hashRaw(raw),
    updatedAt: updatedAtFromRaw(raw),
    raw,
  });
}

function parseCachedWorkspace(key: string, raw: string) {
  const cached = parsedWorkspaceCache.get(key);
  if (cached?.raw === raw) return cached.value;
  const value: unknown = JSON.parse(raw);
  parsedWorkspaceCache.set(key, { raw, value });
  return value;
}

function writeManifest(record: WorkspacePayloadRecord) {
  if (typeof window === "undefined") throw new DOMException("Browser storage is unavailable.", "NotSupportedError");
  const current = parseWorkspaceManifest(window.localStorage.getItem(record.key), record.key);
  if (current && current.revision > record.revision) return;
  window.localStorage.setItem(record.key, JSON.stringify(manifestFromRecord(record)));
}

function currentLocalState(key: string) {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  const manifest = parseWorkspaceManifest(raw, key);
  if (manifest) {
    return {
      tier: "indexeddb" as const,
      revision: manifest.revision,
      contentHash: manifest.contentHash,
      updatedAt: manifest.updatedAt,
      raw,
      manifest,
    };
  }
  if (raw !== null) {
    return {
      tier: "inline" as const,
      revision: 0,
      contentHash: hashRaw(raw),
      updatedAt: updatedAtFromRaw(raw),
      raw,
      manifest: null,
    };
  }
  return null;
}

function baselineMatchesCurrent(key: string, current: ReturnType<typeof currentLocalState>) {
  const baseline = baselines.get(key);
  if (!baseline) return true;
  if (!current) return false;
  return baseline.tier === current.tier
    && baseline.revision === current.revision
    && baseline.contentHash === current.contentHash;
}

function conflictWrite(key: string, attemptedRaw: string, currentUpdatedAt?: string) {
  const localUpdatedAt = updatedAtFromRaw(attemptedRaw);
  const recovery = createRecoveryCopy(
    key,
    attemptedRaw,
    "Szkic odrzucony po wykryciu nowszej wersji z innej karty",
  );
  reportPersistenceIssue({
    key,
    kind: "conflict",
    draftRaw: attemptedRaw,
    localUpdatedAt,
    remoteUpdatedAt: currentUpdatedAt,
    message: recovery
      ? `${issueMessage("conflict", key)} Szkic dodano do zabezpieczonych zapisów.`
      : issueMessage("conflict", key),
  });
  notifyLocalRollback(key);
  return false;
}

function scheduleHydration(key: string, manifest?: WorkspaceManifest) {
  const existing = hydrationPromises.get(key);
  if (existing) return existing;
  if (!blockedWrites.has(key)) blockedWrites.set(key, mutationSequence);

  const promise = payloadStore.read(key)
    .then(async (record) => {
      if (!record) {
        knownMissingKeys.add(key);
        workspaceCache.delete(key);
        baselines.delete(key);
        blockedWrites.delete(key);
        if (manifest) {
          reportPersistenceIssue({
            key,
            kind: "corrupt",
            retryOperation: { type: "hydrate", key, manifest },
            message: `Indeks „${key}” istnieje, ale jego dane nie są dostępne. Indeks nie został nadpisany.`,
          });
        }
        notifyLocalHydration(key);
        return;
      }

      recordBaseline(record);
      blockedWrites.delete(key);
      if (pendingTierWrites.has(key)) {
        // A user can edit the workspace while IndexedDB is still hydrating.
        // Do not notify subscribers with the older read result; flush the
        // queued edit first, then let them load the authoritative payload.
        await flushTierWrite(key);
        notifyLocalHydration(key);
        return;
      }
      let manifestReady = true;
      if (
        !manifest
        || manifest.revision !== record.revision
        || manifest.contentHash !== record.contentHash
      ) {
        try {
          writeManifest(record);
        } catch (error) {
          manifestReady = false;
          reportPersistenceIssue({
            key,
            kind: classifyStorageError(error),
            draftRaw: record.raw,
            retryOperation: { type: "manifest", record },
          });
        }
      }
      if (manifestReady) clearPersistenceIssuesForKey(key);
      notifyLocalHydration(key);
    })
    .catch((error) => {
      reportPersistenceIssue({
        key,
        kind: classifyStorageError(error),
        retryOperation: { type: "hydrate", key, manifest },
      });
    })
    .finally(() => {
      hydrationPromises.delete(key);
    });

  hydrationPromises.set(key, promise);
  return promise;
}

function getLegacyWorkspaceKey(key: string) {
  if (key.startsWith("rootine.")) return `routine.${key.slice("rootine.".length)}`;
  if (key.startsWith("rootine-")) return `routine-${key.slice("rootine-".length)}`;
  return null;
}

function scheduleLegacyWorkspaceMigration(key: string, legacyKey: string) {
  const existing = hydrationPromises.get(key);
  if (existing) return existing;
  if (!blockedWrites.has(key)) blockedWrites.set(key, mutationSequence);

  const promise = payloadStore.read(legacyKey)
    .then(async (record) => {
      if (!record) {
        knownMissingKeys.add(key);
        blockedWrites.delete(key);
        notifyLocalHydration(key);
        return;
      }
      await migrateLegacyRaw(key, record.raw);
      notifyLocalHydration(key);
    })
    .catch((error) => {
      reportPersistenceIssue({
        key,
        kind: classifyStorageError(error),
        retryOperation: { type: "hydrate", key },
      });
    })
    .finally(() => {
      hydrationPromises.delete(key);
    });

  hydrationPromises.set(key, promise);
  return promise;
}

async function migrateLegacyRaw(key: string, raw: string) {
  const contentHash = hashRaw(raw);
  const updatedAt = updatedAtFromRaw(raw);
  const size = byteLength(raw);
  const initial = await payloadStore.compareAndSwap({
    key,
    raw,
    expectedRevision: null,
    expectedContentHash: null,
    contentHash,
    updatedAt,
    byteLength: size,
  });

  let selected: WorkspacePayloadRecord;
  if (initial.status === "saved") {
    selected = initial.record;
  } else if (!initial.current) {
    throw new DOMException("IndexedDB conflict did not return a current record.", "UnknownError");
  } else if (updatedAtEpoch(updatedAt) > updatedAtEpoch(initial.current.updatedAt)) {
    createRecoveryCopy(
      key,
      initial.current.raw,
      "Starsza wersja zabezpieczona podczas uzgadniania migracji IndexedDB",
    );
    const replacement = await payloadStore.compareAndSwap({
      key,
      raw,
      expectedRevision: initial.current.revision,
      expectedContentHash: initial.current.contentHash,
      contentHash,
      updatedAt,
      byteLength: size,
    });
    if (replacement.status === "conflict") {
      selected = replacement.current ?? initial.current;
    } else {
      selected = replacement.record;
    }
  } else {
    selected = initial.current;
  }

  const hadConflict = selected.raw !== raw;
  if (hadConflict) {
    conflictWrite(key, raw, selected.updatedAt);
  }
  writeManifest(selected);
  recordBaseline(selected);
  blockedWrites.delete(key);
  if (!hadConflict) clearPersistenceIssuesForKey(key);
  if (selected.raw !== raw) notifyLocalHydration(key);
  return { record: selected, hadConflict };
}

function scheduleLegacyMigration(key: string, raw: string) {
  const existing = migrationPromises.get(key);
  if (existing) return existing;

  const promise = migrateLegacyRaw(key, raw)
    .then(({ record, hadConflict }) => {
      const deferred = deferredTierWrites.get(key);
      if (!deferred) return;
      deferredTierWrites.delete(key);
      if (hadConflict) {
        conflictWrite(key, deferred.raw, record.updatedAt);
        return;
      }
      enqueueTierWrite({
        ...deferred,
        expectedRevision: record.revision,
        expectedContentHash: record.contentHash,
      });
    })
    .catch((error) => {
      recordInlineBaseline(key, raw);
      reportPersistenceIssue({
        key,
        kind: classifyStorageError(error),
        draftRaw: raw,
        retryOperation: { type: "migrate", key, raw },
        message: `Dane „${key}” pozostają w zgodnym zapisie lokalnym. Nie udało się jeszcze przenieść ich do trwalszego magazynu.`,
      });
      const deferred = deferredTierWrites.get(key);
      if (!deferred) return;
      deferredTierWrites.delete(key);
      const current = currentLocalState(key);
      if (current?.tier !== "inline" || current.contentHash !== hashRaw(raw)) {
        conflictWrite(key, deferred.raw, current?.updatedAt);
        return;
      }
      try {
        window.localStorage.setItem(key, deferred.raw);
        recordInlineBaseline(key, deferred.raw);
        blockedWrites.delete(key);
        reportPersistenceIssue({
          key,
          kind: classifyStorageError(error),
          draftRaw: deferred.raw,
          retryOperation: { type: "migrate", key, raw: deferred.raw },
          message: `Najnowsze dane „${key}” zapisano w trybie zgodności. Migrację do IndexedDB możesz ponowić w centrum odzyskiwania.`,
        });
        broadcastWorkspaceChange(key, deferred.updatedAt);
      } catch (fallbackError) {
        reportPersistenceIssue({
          key,
          kind: classifyStorageError(fallbackError),
          draftRaw: deferred.raw,
          retryOperation: { type: "tier", pending: deferred },
        });
        notifyLocalRollback(key);
      }
    })
    .finally(() => {
      migrationPromises.delete(key);
    });

  migrationPromises.set(key, promise);
  return promise;
}

function readCachedWorkspace<T>(
  record: WorkspacePayloadRecord,
  fallback: T,
  validate: (value: unknown) => value is T,
  migrate?: (value: unknown) => T | null,
): LocalLoadResult<T> {
  try {
    const parsed = parseCachedWorkspace(record.key, record.raw);
    if (validate(parsed)) return { status: "ok", workspace: parsed };
    const migrated = migrate?.(parsed) ?? null;
    if (migrated && validate(migrated)) return { status: "migrated", workspace: migrated };
    const recovery = createRecoveryCopy(record.key, record.raw, "Nieprawidłowy format danych z trwałego magazynu");
    return {
      status: "corrupt",
      workspace: fallback,
      recoveryId: recovery?.id,
      error: "Trwały zapis ma nieprawidłowy format. Oryginał zachowano do odzyskania.",
    };
  } catch (error) {
    const recovery = createRecoveryCopy(record.key, record.raw, "Nie można odczytać danych JSON z trwałego magazynu");
    return {
      status: "corrupt",
      workspace: fallback,
      recoveryId: recovery?.id,
      error: error instanceof Error ? error.message : "Nie można odczytać danych lokalnych.",
    };
  }
}

export function readLocalWorkspace<T>({
  key,
  fallback,
  validate,
  migrate,
}: LocalReadOptions<T>): LocalLoadResult<T> {
  const safeFallback = fallback();
  if (typeof window === "undefined") return { status: "missing", workspace: safeFallback };
  installMutationListeners();

  try {
    const raw = window.localStorage.getItem(key);
    const legacyKey = raw === null ? getLegacyWorkspaceKey(key) : null;
    const legacyRaw = legacyKey ? window.localStorage.getItem(legacyKey) : null;
    const manifest = parseWorkspaceManifest(raw, key);

    if (!raw && legacyRaw && legacyKey) {
      const legacyManifest = parseWorkspaceManifest(legacyRaw, legacyKey);
      if (legacyManifest && shouldUseIndexedDb(key)) {
        scheduleLegacyWorkspaceMigration(key, legacyKey);
        return { status: "missing", workspace: safeFallback };
      }
      const legacyParsed = parseCachedWorkspace(legacyKey, legacyRaw);
      recordInlineBaseline(key, legacyRaw);
      if (validate(legacyParsed)) {
        try {
          window.localStorage.setItem(key, legacyRaw);
        } catch {
          // Keep the legacy copy available if the new key cannot be written yet.
        }
        if (shouldUseIndexedDb(key)) scheduleLegacyMigration(key, legacyRaw);
        return { status: "ok", workspace: legacyParsed };
      }
      const migratedLegacy = migrate?.(legacyParsed) ?? null;
      if (migratedLegacy && validate(migratedLegacy)) {
        const migratedRaw = JSON.stringify(migratedLegacy);
        try {
          window.localStorage.setItem(key, migratedRaw);
        } catch {
          // Keep the legacy copy available if the new key cannot be written yet.
        }
        if (shouldUseIndexedDb(key)) scheduleLegacyMigration(key, migratedRaw);
        return { status: "migrated", workspace: migratedLegacy };
      }
    }

    if (manifest) {
      const cached = workspaceCache.get(key);
      if (
        cached
        && cached.revision === manifest.revision
        && cached.contentHash === manifest.contentHash
      ) {
        recordBaseline(cached);
        return readCachedWorkspace(cached, safeFallback, validate, migrate);
      }
      scheduleHydration(key, manifest);
      baselines.set(key, {
        tier: "indexeddb",
        revision: manifest.revision,
        contentHash: manifest.contentHash,
        updatedAt: manifest.updatedAt,
        raw: "",
      });
      if (cached) {
        return readCachedWorkspace(cached, safeFallback, validate, migrate);
      }
      return { status: "missing", workspace: safeFallback };
    }

    if (!raw) {
      parsedWorkspaceCache.delete(key);
      const cached = workspaceCache.get(key);
      if (cached) return readCachedWorkspace(cached, safeFallback, validate, migrate);
      if (shouldUseIndexedDb(key) && !knownMissingKeys.has(key)) {
        scheduleHydration(key);
        return { status: "missing", workspace: safeFallback };
      }
      blockedWrites.delete(key);
      baselines.delete(key);
      return { status: "missing", workspace: safeFallback };
    }

    const parsed = parseCachedWorkspace(key, raw);
    recordInlineBaseline(key, raw);
    if (validate(parsed)) {
      if (shouldUseIndexedDb(key)) scheduleLegacyMigration(key, raw);
      return { status: "ok", workspace: parsed };
    }
    const migrated = migrate?.(parsed) ?? null;
    if (migrated && validate(migrated)) {
      const migratedRaw = JSON.stringify(migrated);
      if (shouldUseIndexedDb(key)) scheduleLegacyMigration(key, migratedRaw);
      return { status: "migrated", workspace: migrated };
    }

    const recovery = createRecoveryCopy(key, raw, "Nieprawidłowy lub nieobsługiwany format danych");
    if (!blockedWrites.has(key)) blockedWrites.set(key, mutationSequence);
    return {
      status: "corrupt",
      workspace: safeFallback,
      recoveryId: recovery?.id,
      error: "Zapis ma nieprawidłowy format. Oryginał zachowano w centrum odzyskiwania.",
    };
  } catch (error) {
    const raw = window.localStorage.getItem(key);
    const recovery = raw ? createRecoveryCopy(key, raw, "Nie można odczytać danych JSON") : null;
    if (!blockedWrites.has(key)) blockedWrites.set(key, mutationSequence);
    return {
      status: "corrupt",
      workspace: safeFallback,
      recoveryId: recovery?.id,
      error: error instanceof Error ? error.message : "Nie można odczytać danych lokalnych.",
    };
  }
}

function inlineWriteNow(
  key: string,
  raw: string,
  expectedContentHash: string | null,
  reportFailure = true,
) {
  if (typeof window === "undefined") return false;
  const current = currentLocalState(key);
  const currentHash = current?.contentHash ?? null;
  if (currentHash !== expectedContentHash) {
    return conflictWrite(key, raw, current?.updatedAt);
  }
  try {
    window.localStorage.setItem(key, raw);
    recordInlineBaseline(key, raw);
    blockedWrites.delete(key);
    clearPersistenceIssuesForKey(key);
    broadcastWorkspaceChange(key, updatedAtFromRaw(raw));
    return true;
  } catch (error) {
    if (reportFailure) {
      reportPersistenceIssue({
        key,
        kind: classifyStorageError(error),
        draftRaw: raw,
        retryOperation: {
          type: "inline",
          key,
          raw,
          expectedContentHash,
        },
      });
    }
    return false;
  }
}

async function fallbackTierWrite(pending: Omit<PendingTierWrite, "timer">, error: unknown) {
  if (typeof window === "undefined") return false;
  const current = currentLocalState(pending.key);
  const baseline = baselines.get(pending.key);
  const indexedDbExpectationMatches = pending.expectedRevision === null
    ? current === null
    : current?.tier === "indexeddb"
      && current.revision === pending.expectedRevision
      && current.contentHash === pending.expectedContentHash;
  const chainedInlineFallbackMatches = current?.tier === "inline"
    && baseline?.tier === "inline"
    && current.contentHash === baseline.contentHash
    && current.raw === baseline.raw;
  if (!indexedDbExpectationMatches && !chainedInlineFallbackMatches) {
    return conflictWrite(pending.key, pending.raw, current?.updatedAt);
  }

  try {
    window.localStorage.setItem(pending.key, pending.raw);
    recordInlineBaseline(pending.key, pending.raw);
    blockedWrites.delete(pending.key);
    reportPersistenceIssue({
      key: pending.key,
      kind: classifyStorageError(error),
      draftRaw: pending.raw,
      retryOperation: { type: "migrate", key: pending.key, raw: pending.raw },
      message: `Dane „${pending.key}” zapisano w trybie zgodności. Trwalszy magazyn jest chwilowo niedostępny; możesz ponowić migrację.`,
    });
    broadcastWorkspaceChange(pending.key, pending.updatedAt);
    return true;
  } catch (fallbackError) {
    reportPersistenceIssue({
      key: pending.key,
      kind: classifyStorageError(fallbackError),
      draftRaw: pending.raw,
      retryOperation: { type: "tier", pending },
    });
    notifyLocalRollback(pending.key);
    return false;
  }
}

type TierWriteOutcome =
  | { status: "saved"; record: WorkspacePayloadRecord }
  | { status: "fallback" }
  | { status: "failed" };

async function persistTierWrite(
  pending: Omit<PendingTierWrite, "timer">,
): Promise<TierWriteOutcome> {
  try {
    const result = await payloadStore.compareAndSwap({
      key: pending.key,
      raw: pending.raw,
      expectedRevision: pending.expectedRevision,
      expectedContentHash: pending.expectedContentHash,
      contentHash: pending.contentHash,
      updatedAt: pending.updatedAt,
      byteLength: pending.byteLength,
    });
    if (result.status === "conflict") {
      if (result.current) {
        recordBaseline(result.current);
        try {
          writeManifest(result.current);
        } catch {
          // The newer IndexedDB revision remains authoritative even if its small manifest cannot be refreshed.
        }
      }
      conflictWrite(pending.key, pending.raw, result.current?.updatedAt);
      return { status: "failed" };
    }

    recordBaseline(result.record);
    try {
      writeManifest(result.record);
    } catch (error) {
      reportPersistenceIssue({
        key: pending.key,
        kind: classifyStorageError(error),
        draftRaw: pending.raw,
        retryOperation: { type: "manifest", record: result.record },
        message: `Dane „${pending.key}” są bezpieczne w trwałym magazynie, ale nie udało się odświeżyć małego indeksu startowego.`,
      });
      broadcastWorkspaceChange(pending.key, pending.updatedAt);
      return { status: "saved", record: result.record };
    }

    blockedWrites.delete(pending.key);
    clearPersistenceIssuesForKey(pending.key);
    broadcastWorkspaceChange(pending.key, pending.updatedAt);
    return { status: "saved", record: result.record };
  } catch (error) {
    return await fallbackTierWrite(pending, error)
      ? { status: "fallback" }
      : { status: "failed" };
  }
}

function flushTierWrite(key: string) {
  const existing = activeFlushes.get(key);
  if (existing) return existing;

  const promise = (async () => {
    let allSucceeded = true;
    while (true) {
      const pending = pendingTierWrites.get(key);
      if (!pending) return allSucceeded;
      if (pending.timer !== null && typeof window !== "undefined") {
        window.clearTimeout(pending.timer);
      }
      pendingTierWrites.delete(key);

      const operation: Omit<PendingTierWrite, "timer"> = {
        key: pending.key,
        raw: pending.raw,
        contentHash: pending.contentHash,
        byteLength: pending.byteLength,
        updatedAt: pending.updatedAt,
        expectedRevision: pending.expectedRevision,
        expectedContentHash: pending.expectedContentHash,
      };
      const outcome = await persistTierWrite(operation);
      if (outcome.status === "failed") allSucceeded = false;

      const next = pendingTierWrites.get(key);
      if (next && outcome.status === "saved") {
        next.expectedRevision = outcome.record.revision;
        next.expectedContentHash = outcome.record.contentHash;
      }
    }
  })().finally(() => {
    activeFlushes.delete(key);
    if (pendingTierWrites.has(key)) void flushTierWrite(key);
  });
  activeFlushes.set(key, promise);
  return promise;
}

function enqueueTierWrite(pending: Omit<PendingTierWrite, "timer">) {
  const queued = pendingTierWrites.get(pending.key);
  if (queued) {
    queued.raw = pending.raw;
    queued.contentHash = pending.contentHash;
    queued.byteLength = pending.byteLength;
    queued.updatedAt = pending.updatedAt;
    return true;
  }
  const withTimer: PendingTierWrite = { ...pending, timer: null };
  if (typeof window !== "undefined") {
    withTimer.timer = window.setTimeout(() => {
      void flushTierWrite(pending.key);
    }, WRITE_BATCH_DELAY_MS);
  }
  pendingTierWrites.set(pending.key, withTimer);
  return true;
}

export function writeLocalWorkspace<T>(key: string, workspace: T): boolean {
  if (typeof window === "undefined") return false;
  installMutationListeners();
  const blockedAt = blockedWrites.get(key);
  if (blockedAt !== undefined && mutationSequence <= blockedAt) return true;

  let serialized: string;
  try {
    serialized = JSON.stringify(workspace);
  } catch (error) {
    reportPersistenceIssue({
      key,
      kind: "unknown",
      message: error instanceof Error ? error.message : issueMessage("unknown", key),
    });
    return false;
  }

  const current = currentLocalState(key);
  const committedRaw = current?.tier === "indexeddb"
    ? workspaceCache.get(key)?.raw
    : current?.raw;
  const queuedRaw = pendingTierWrites.get(key)?.raw ?? deferredTierWrites.get(key)?.raw;
  if (
    (committedRaw && equivalentIgnoringTopLevelUpdatedAt(committedRaw, serialized))
    || (queuedRaw && equivalentIgnoringTopLevelUpdatedAt(queuedRaw, serialized))
  ) {
    return true;
  }

  if (!baselineMatchesCurrent(key, current)) {
    return conflictWrite(key, serialized, current?.updatedAt);
  }

  if (!shouldUseIndexedDb(key)) {
    return inlineWriteNow(key, serialized, current?.contentHash ?? null);
  }

  const operation: Omit<PendingTierWrite, "timer"> = {
    key,
    raw: serialized,
    contentHash: hashRaw(serialized),
    byteLength: byteLength(serialized),
    updatedAt: updatedAtFromRaw(serialized),
    expectedRevision: current?.tier === "indexeddb" ? current.revision : null,
    expectedContentHash: current?.tier === "indexeddb" ? current.contentHash : null,
  };

  if (migrationPromises.has(key)) {
    deferredTierWrites.set(key, operation);
    return true;
  }

  if (current?.tier === "inline") {
    deferredTierWrites.set(key, operation);
    scheduleLegacyMigration(key, current.raw);
    return true;
  }

  return enqueueTierWrite(operation);
}

export async function flushLocalWorkspaceWrites() {
  while (
    pendingTierWrites.size > 0
    || activeFlushes.size > 0
    || migrationPromises.size > 0
    || hydrationPromises.size > 0
    || pendingRecoveryCopies.size > 0
  ) {
    for (const pending of pendingTierWrites.values()) {
      if (pending.timer !== null && typeof window !== "undefined") {
        window.clearTimeout(pending.timer);
      }
      pending.timer = null;
    }

    const startedFlushes = [...pendingTierWrites.keys()].map((key) => flushTierWrite(key));
    const inFlight = new Set<Promise<unknown>>([
      ...startedFlushes,
      ...activeFlushes.values(),
      ...migrationPromises.values(),
      ...hydrationPromises.values(),
      ...[...pendingRecoveryCopies.values()].map((pending) => pending.promise),
    ]);
    await Promise.allSettled([...inFlight]);
  }
}

export function listLocalRecoveryRecords(): LocalRecoveryRecord[] {
  const records = [
    ...[...pendingRecoveryCopies.values()].map((pending) => pending.record),
    ...readRecoveryIndex(),
  ]
    .filter((record, index, all) => all.findIndex((candidate) => candidate.id === record.id) === index)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_RECOVERY_RECORDS);
  cleanupRecoveryPayloads(records);
  return records;
}

export async function exportLocalRecoveryRecord(id: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const pending = pendingRecoveryCopies.get(id);
  if (pending) return pending.raw;
  const record = readRecoveryIndex().find((candidate) => candidate.id === id);
  if (!record) return null;
  if (record.tier === "indexeddb") {
    try {
      return (await payloadStore.read(record.backupKey))?.raw ?? null;
    } catch {
      return null;
    }
  }
  try {
    const envelope = JSON.parse(window.localStorage.getItem(record.backupKey) ?? "") as Partial<StoredBackupEnvelope>;
    return typeof envelope.raw === "string" ? envelope.raw : null;
  } catch {
    return null;
  }
}

async function persistRawImmediately(key: string, raw: string) {
  if (!shouldUseIndexedDb(key)) {
    window.localStorage.setItem(key, raw);
    recordInlineBaseline(key, raw);
    return;
  }

  try {
    const currentRecord = await payloadStore.read(key);
    const result = await payloadStore.compareAndSwap({
      key,
      raw,
      expectedRevision: currentRecord?.revision ?? null,
      expectedContentHash: currentRecord?.contentHash ?? null,
      contentHash: hashRaw(raw),
      updatedAt: updatedAtFromRaw(raw),
      byteLength: byteLength(raw),
    });
    if (result.status === "conflict") {
      conflictWrite(key, raw, result.current?.updatedAt);
      throw new DOMException("The workspace changed during the operation.", "ConcurrencyError");
    }
    writeManifest(result.record);
    recordBaseline(result.record);
  } catch (error) {
    if (error instanceof DOMException && error.name === "ConcurrencyError") {
      throw error;
    }
    window.localStorage.setItem(key, raw);
    recordInlineBaseline(key, raw);
    reportPersistenceIssue({
      key,
      kind: classifyStorageError(error),
      draftRaw: raw,
      retryOperation: { type: "migrate", key, raw },
      message: `Dane „${key}” zapisano w trybie zgodności, ponieważ IndexedDB jest chwilowo niedostępne.`,
    });
  }
}

export async function restoreLocalRecoveryRecord(id: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const record = listLocalRecoveryRecords().find((candidate) => candidate.id === id);
  const raw = await exportLocalRecoveryRecord(id);
  if (!record || raw === null) return false;
  try {
    const current = await readAuthoritativeRaw(record.storageKey);
    if (current !== null && current !== raw) {
      if (!await ensureRecoveryCopy(
        record.storageKey,
        current,
        "Automatyczna kopia przed przywróceniem",
      )) {
        return false;
      }
    }
    await persistRawImmediately(record.storageKey, raw);
    blockedWrites.delete(record.storageKey);
    broadcastWorkspaceChange(record.storageKey, updatedAtFromRaw(raw), rollbackOrigin);
    return true;
  } catch (error) {
    reportPersistenceIssue({
      key: record.storageKey,
      kind: classifyStorageError(error),
      draftRaw: raw,
    });
    return false;
  }
}

export async function deleteLocalRecoveryRecord(id: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const pending = pendingRecoveryCopies.get(id);
  if (pending) await pending.promise;
  const records = readRecoveryIndex();
  const record = records.find((candidate) => candidate.id === id);
  if (!record) return false;
  try {
    await removeRecoveryPayload(record);
    return writeRecoveryIndex(records.filter((candidate) => candidate.id !== id));
  } catch {
    return false;
  }
}

function isRootineWorkspaceKey(key: string) {
  return (key.startsWith("rootine.") || key.startsWith("rootine-") || key.startsWith("routine.") || key.startsWith("routine-"))
    && key !== RECOVERY_INDEX_KEY
    && !key.startsWith(BACKUP_PREFIX);
}

export type FullLocalBackup = {
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  workspaces: Record<string, string>;
};

export type OriginStorageEstimate =
  | {
    status: "ready";
    usage: number;
    quota: number;
    ratio: number;
  }
  | {
    status: "unsupported" | "error";
    message: string;
  };

export type PersistentStorageStatus =
  | {
    status: "ready";
    persisted: boolean;
    message: string;
  }
  | {
    status: "unsupported" | "error";
    message: string;
  };

type StorageEstimateProvider = {
  estimate: () => Promise<StorageEstimate>;
};

type PersistentStorageProvider = {
  persisted: () => Promise<boolean>;
  persist: () => Promise<boolean>;
};

function getStorageManager() {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & {
    storage?: Partial<StorageEstimateProvider & PersistentStorageProvider>;
  }).storage;
}

type LocalBackupValidationResult =
  | { ok: true; backup: FullLocalBackup; entries: Array<[string, string]> }
  | { ok: false; error: string };

const RAW_VALUE_VALIDATORS: Record<string, (raw: string) => boolean> = {
  "rootine.sidebar.collapsed": (raw) => raw === "true" || raw === "false",
  "rootine.goals.layout": (raw) => raw === "list" || raw === "grid",
  "rootine.goals.sort": (raw) => ["priority", "due", "progress", "updated", "name"].includes(raw),
};

function validateStoredWorkspaceValue(key: string, raw: string) {
  const normalizedKey = key.startsWith("routine.") || key.startsWith("routine-")
    ? key.replace(/^routine([.-])/, "rootine$1")
    : key;
  const rawValidator = RAW_VALUE_VALIDATORS[key] ?? RAW_VALUE_VALIDATORS[normalizedKey];
  if (rawValidator) return rawValidator(raw);
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

function validateFullLocalBackup(value: unknown): LocalBackupValidationResult {
  if (
    !isRecord(value)
    || value.version !== EXPORT_VERSION
    || typeof value.exportedAt !== "string"
    || Number.isNaN(new Date(value.exportedAt).getTime())
    || !isRecord(value.workspaces)
  ) {
    return { ok: false, error: "Plik kopii ma nieobsługiwany format." };
  }

  const entries = Object.entries(value.workspaces);
  if (!entries.every(([key, raw]) => (
    isRootineWorkspaceKey(key)
    && typeof raw === "string"
    && validateStoredWorkspaceValue(key, raw)
  ))) {
    return { ok: false, error: "Kopia zawiera nieprawidłowe lub nieczytelne wpisy." };
  }

  return {
    ok: true,
    backup: value as FullLocalBackup,
    entries: entries as Array<[string, string]>,
  };
}

export function inspectFullLocalBackup(value: unknown):
  | { ok: true; backup: FullLocalBackup }
  | { ok: false; error: string } {
  const validation = validateFullLocalBackup(value);
  return validation.ok
    ? { ok: true, backup: validation.backup }
    : validation;
}

export async function estimateOriginStorage(
  provider: StorageEstimateProvider | undefined = (() => {
    const storage = getStorageManager();
    return typeof storage?.estimate === "function" ? storage as StorageEstimateProvider : undefined;
  })(),
): Promise<OriginStorageEstimate> {
  if (!provider) {
    return {
      status: "unsupported",
      message: "Ta przeglądarka nie udostępnia szacowania dostępnej pamięci.",
    };
  }

  try {
    const estimate = await provider.estimate();
    const usage = estimate.usage;
    const quota = estimate.quota;
    if (
      typeof usage !== "number"
      || !Number.isFinite(usage)
      || usage < 0
      || typeof quota !== "number"
      || !Number.isFinite(quota)
      || quota <= 0
    ) {
      return {
        status: "unsupported",
        message: "Przeglądarka nie zwróciła kompletnego szacunku pamięci.",
      };
    }
    return {
      status: "ready",
      usage,
      quota,
      ratio: usage / quota,
    };
  } catch {
    return {
      status: "error",
      message: "Nie udało się odczytać wykorzystania pamięci. Kopie nadal działają.",
    };
  }
}

export async function getPersistentStorageStatus(
  provider: Pick<PersistentStorageProvider, "persisted"> | undefined = (() => {
    const storage = getStorageManager();
    return typeof storage?.persisted === "function"
      ? storage as PersistentStorageProvider
      : undefined;
  })(),
): Promise<PersistentStorageStatus> {
  if (!provider) {
    return {
      status: "unsupported",
      message: "Ta przeglądarka nie informuje, czy dane są chronione przed automatycznym usunięciem.",
    };
  }
  try {
    const persisted = await provider.persisted();
    return {
      status: "ready",
      persisted,
      message: persisted
        ? "Przeglądarka oznaczyła dane Rootine jako trwałe."
        : "Dane działają lokalnie, ale przeglądarka może je usunąć podczas porządkowania pamięci.",
    };
  } catch {
    return {
      status: "error",
      message: "Nie udało się sprawdzić ochrony danych. Eksport kopii nadal jest najpewniejszym zabezpieczeniem.",
    };
  }
}

export async function requestPersistentStorage(
  provider: PersistentStorageProvider | undefined = (() => {
    const storage = getStorageManager();
    return typeof storage?.persist === "function" && typeof storage?.persisted === "function"
      ? storage as PersistentStorageProvider
      : undefined;
  })(),
): Promise<PersistentStorageStatus> {
  if (!provider) {
    return {
      status: "unsupported",
      message: "Ta przeglądarka nie obsługuje prośby o trwałą ochronę danych.",
    };
  }
  try {
    if (await provider.persisted()) {
      return {
        status: "ready",
        persisted: true,
        message: "Dane Rootine są już chronione przed automatycznym usunięciem.",
      };
    }
    const persisted = await provider.persist();
    return {
      status: "ready",
      persisted,
      message: persisted
        ? "Przeglądarka włączyła trwałą ochronę danych Rootine."
        : "Przeglądarka nie przyznała trwałej ochrony. Dane nadal działają, ale regularnie eksportuj kopię.",
    };
  } catch {
    return {
      status: "error",
      message: "Przeglądarka odrzuciła prośbę o ochronę. Dane nie zostały zmienione; wyeksportuj kopię.",
    };
  }
}

export function getWorkspaceStorageTierStatus() {
  return payloadStore.available
    ? {
      status: "indexeddb" as const,
      message: "Duże obszary danych są przechowywane w IndexedDB; localStorage zawiera tylko małe indeksy i preferencje.",
    }
    : {
      status: "fallback" as const,
      message: "IndexedDB jest niedostępne. Rootine korzysta z trybu zgodności localStorage o mniejszej pojemności.",
    };
}

async function readAuthoritativeRaw(key: string) {
  if (typeof window === "undefined") return null;
  const local = window.localStorage.getItem(key);
  const manifest = parseWorkspaceManifest(local, key);
  if (!manifest) {
    if (local !== null) return local;
    if (!payloadStore.available) return null;
    return (await payloadStore.read(key))?.raw ?? null;
  }
  const cached = workspaceCache.get(key);
  if (
    cached
    && cached.revision === manifest.revision
    && cached.contentHash === manifest.contentHash
  ) {
    return cached.raw;
  }
  return (await payloadStore.read(key))?.raw ?? null;
}

export async function exportAllLocalWorkspaces(): Promise<FullLocalBackup> {
  const workspaces: Record<string, string> = {};
  if (typeof window === "undefined") {
    return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), workspaces };
  }

  await flushLocalWorkspaceWrites();

  const keys = new Set<string>();
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && isRootineWorkspaceKey(key)) keys.add(key);
  }
  if (payloadStore.available) {
    try {
      (await payloadStore.list()).forEach((record) => {
        if (isRootineWorkspaceKey(record.key)) keys.add(record.key);
      });
    } catch (error) {
      reportPersistenceIssue({
        key: "rootine.backup",
        kind: classifyStorageError(error),
        message: "Nie udało się odczytać wszystkich obszarów IndexedDB. Eksport nie został utworzony.",
      });
      throw error;
    }
  }

  for (const key of keys) {
    const raw = await readAuthoritativeRaw(key);
    if (raw !== null) workspaces[key] = raw;
  }
  return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), workspaces };
}

export async function importAllLocalWorkspaces(
  value: unknown,
): Promise<{ ok: boolean; restored: number; error?: string }> {
  if (typeof window === "undefined") {
    return { ok: false, restored: 0, error: "Brak pamięci przeglądarki." };
  }
  const validation = validateFullLocalBackup(value);
  if (!validation.ok) return { ok: false, restored: 0, error: validation.error };

  const snapshots = new Map<string, string | null>();
  try {
    for (const [key] of validation.entries) {
      snapshots.set(key, await readAuthoritativeRaw(key));
    }
  } catch {
    return {
      ok: false,
      restored: 0,
      error: "Nie udało się odczytać bieżących danych. Import nie został rozpoczęty.",
    };
  }

  for (const [key, raw] of validation.entries) {
    const current = snapshots.get(key) ?? null;
    if (
      current !== null
      && current !== raw
      && (await ensureRecoveryCopy(
        key,
        current,
        "Automatyczna kopia przed importem pełnej kopii",
      )) === null
    ) {
      return {
        ok: false,
        restored: 0,
        error: "Nie udało się zabezpieczyć bieżących danych. Import nie został rozpoczęty.",
      };
    }
  }

  const appliedKeys: string[] = [];
  try {
    for (const [key, raw] of validation.entries) {
      if (snapshots.get(key) === raw) continue;
      await persistRawImmediately(key, raw);
      appliedKeys.push(key);
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const key of appliedKeys.reverse()) {
      try {
        const previous = snapshots.get(key) ?? null;
        if (previous === null) {
          window.localStorage.removeItem(key);
          workspaceCache.delete(key);
          baselines.delete(key);
          if (payloadStore.available) await payloadStore.remove(key);
        } else {
          await persistRawImmediately(key, previous);
        }
      } catch {
        rollbackFailed = true;
      }
    }
    const failureReason = classifyStorageError(error) === "quota"
      ? "Przeglądarka nie ma wystarczającej ilości wolnego miejsca."
      : "Przeglądarka odrzuciła zapis jednego z obszarów.";
    return {
      ok: false,
      restored: 0,
      error: rollbackFailed
        ? "Import nie powiódł się, a pełne wycofanie zmian nie było możliwe. Użyj zabezpieczonych zapisów."
        : `Import został bezpiecznie wycofany. ${failureReason}`,
    };
  }

  validation.entries.forEach(([key]) => blockedWrites.delete(key));
  broadcastWorkspaceChange("*", new Date().toISOString(), rollbackOrigin);
  return { ok: true, restored: validation.entries.length };
}

export function listLocalPersistenceIssues(): LocalPersistenceIssue[] {
  return [...persistenceIssues.values()]
    .map(({ draftRaw: _draftRaw, retryOperation: _retryOperation, ...issue }) => issue)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function subscribeToLocalPersistenceIssues(listener: () => void) {
  persistenceIssueListeners.add(listener);
  return () => {
    persistenceIssueListeners.delete(listener);
  };
}

export function exportLocalPersistenceIssueDraft(id: string) {
  return persistenceIssues.get(id)?.draftRaw ?? null;
}

export function dismissLocalPersistenceIssue(id: string) {
  const removed = persistenceIssues.delete(id);
  if (removed) emitPersistenceIssues();
  return removed;
}

async function executeRetryOperation(operation: RetryOperation) {
  if (operation.type === "inline") {
    return inlineWriteNow(
      operation.key,
      operation.raw,
      operation.expectedContentHash,
      false,
    );
  }
  if (operation.type === "tier") {
    return (await persistTierWrite(operation.pending)).status !== "failed";
  }
  if (operation.type === "manifest") {
    try {
      writeManifest(operation.record);
      recordBaseline(operation.record);
      return true;
    } catch {
      return false;
    }
  }
  if (operation.type === "hydrate") {
    await scheduleHydration(operation.key, operation.manifest);
    return workspaceCache.has(operation.key) || knownMissingKeys.has(operation.key);
  }
  try {
    await migrateLegacyRaw(operation.key, operation.raw);
    return true;
  } catch {
    return false;
  }
}

export async function retryLocalPersistenceIssue(id: string) {
  const issue = persistenceIssues.get(id);
  if (!issue?.retryOperation || issue.kind === "conflict") return false;
  const succeeded = await executeRetryOperation(issue.retryOperation);
  if (succeeded) {
    persistenceIssues.delete(id);
    emitPersistenceIssues();
  }
  return succeeded;
}

export function subscribeToLocalWorkspace(key: string, listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) listener();
  };
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ key?: string; origin?: string }>).detail;
    if (detail?.origin === repositoryOrigin) return;
    if (detail?.key === key || detail?.key === "*") listener();
  };
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(WORKSPACE_CHANNEL) : null;
  const onChannel = (event: MessageEvent<{ key?: string; origin?: string }>) => {
    if (event.data?.origin === repositoryOrigin) return;
    if (event.data?.key === key || event.data?.key === "*") listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener("rootine:workspace-change", onCustom);
  channel?.addEventListener("message", onChannel);
  const manifest = parseWorkspaceManifest(window.localStorage.getItem(key), key);
  const cached = workspaceCache.get(key);
  if (
    manifest
    && cached
    && cached.revision === manifest.revision
    && cached.contentHash === manifest.contentHash
  ) {
    window.setTimeout(listener, 0);
  }
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("rootine:workspace-change", onCustom);
    channel?.removeEventListener("message", onChannel);
    channel?.close();
  };
}

export function setWorkspacePayloadStoreForTests(store: WorkspacePayloadStore) {
  payloadStore = store;
  blockedWrites.clear();
  baselines.clear();
  workspaceCache.clear();
  parsedWorkspaceCache.clear();
  knownMissingKeys.clear();
  hydrationPromises.clear();
  migrationPromises.clear();
  deferredTierWrites.clear();
  pendingTierWrites.forEach((pending) => {
    if (pending.timer !== null && typeof window !== "undefined") window.clearTimeout(pending.timer);
  });
  pendingTierWrites.clear();
  activeFlushes.clear();
  persistenceIssues.clear();
  pendingRecoveryCopies.clear();
}
