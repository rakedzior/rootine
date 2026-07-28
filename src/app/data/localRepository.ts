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

const RECOVERY_INDEX_KEY = "rootine.recovery.index.v1";
const BACKUP_PREFIX = "rootine.recovery.payload.";
const EXPORT_VERSION = 1 as const;
const repositoryOrigin = `rootine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let mutationSequence = 0;
let mutationListenersInstalled = false;
const blockedWrites = new Map<string, number>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function installMutationListeners() {
  if (mutationListenersInstalled || typeof window === "undefined") return;
  const markMutationIntent = () => {
    mutationSequence += 1;
  };
  window.addEventListener("input", markMutationIntent, true);
  window.addEventListener("change", markMutationIntent, true);
  window.addEventListener("pointerup", markMutationIntent, true);
  window.addEventListener("keyup", (event) => {
    if (["Enter", " ", "Delete", "Backspace"].includes(event.key)) markMutationIntent();
  }, true);
  mutationListenersInstalled = true;
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

function createRecoveryCopy(storageKey: string, raw: string, reason: string): LocalRecoveryRecord | null {
  if (typeof window === "undefined") return null;
  const existing = readRecoveryIndex().find((record) => {
    if (record.storageKey !== storageKey) return false;
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
  const envelope: StoredBackupEnvelope = {
    version: 1,
    createdAt,
    reason,
    storageKey,
    raw,
  };
  const record: LocalRecoveryRecord = {
    id,
    storageKey,
    backupKey,
    createdAt,
    reason,
    byteLength: new Blob([raw]).size,
  };

  try {
    window.localStorage.setItem(backupKey, JSON.stringify(envelope));
    const records = [record, ...readRecoveryIndex()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40);
    if (!writeRecoveryIndex(records)) {
      window.localStorage.removeItem(backupKey);
      return null;
    }
    return record;
  } catch {
    return null;
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
    if (!raw) {
      blockedWrites.delete(key);
      return { status: "missing", workspace: safeFallback };
    }
    const parsed: unknown = JSON.parse(raw);
    if (validate(parsed)) {
      blockedWrites.delete(key);
      return { status: "ok", workspace: parsed };
    }
    const migrated = migrate?.(parsed) ?? null;
    if (migrated && validate(migrated)) {
      blockedWrites.delete(key);
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

export function writeLocalWorkspace<T>(key: string, workspace: T): boolean {
  if (typeof window === "undefined") return false;
  installMutationListeners();
  const blockedAt = blockedWrites.get(key);
  if (blockedAt !== undefined && mutationSequence <= blockedAt) {
    return true;
  }

  try {
    const serialized = JSON.stringify(workspace);
    const existingRaw = window.localStorage.getItem(key);
    if (existingRaw === serialized) return true;
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as unknown;
        if (isRecord(existing) && isRecord(workspace) && "updatedAt" in existing && "updatedAt" in workspace) {
          const existingComparable = { ...existing, updatedAt: null };
          const nextComparable = { ...workspace, updatedAt: null };
          if (JSON.stringify(existingComparable) === JSON.stringify(nextComparable)) return true;
        }
      } catch {
        // The normal write path below will replace only after mutation intent is established.
      }
    }
    window.localStorage.setItem(key, serialized);
    blockedWrites.delete(key);
    const detail = { key, updatedAt: new Date().toISOString(), origin: repositoryOrigin };
    window.dispatchEvent(new CustomEvent("rootine:workspace-change", { detail }));
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("rootine:workspace");
      channel.postMessage(detail);
      channel.close();
    }
    return true;
  } catch {
    return false;
  }
}

export function listLocalRecoveryRecords(): LocalRecoveryRecord[] {
  return readRecoveryIndex();
}

export function exportLocalRecoveryRecord(id: string): string | null {
  if (typeof window === "undefined") return null;
  const record = readRecoveryIndex().find((candidate) => candidate.id === id);
  if (!record) return null;
  try {
    const envelope = JSON.parse(window.localStorage.getItem(record.backupKey) ?? "") as Partial<StoredBackupEnvelope>;
    return typeof envelope.raw === "string" ? envelope.raw : null;
  } catch {
    return null;
  }
}

export function restoreLocalRecoveryRecord(id: string): boolean {
  if (typeof window === "undefined") return false;
  const record = readRecoveryIndex().find((candidate) => candidate.id === id);
  const raw = exportLocalRecoveryRecord(id);
  if (!record || raw === null) return false;
  try {
    const current = window.localStorage.getItem(record.storageKey);
    if (current !== null && current !== raw) {
      createRecoveryCopy(record.storageKey, current, "Automatyczna kopia przed przywróceniem");
    }
    window.localStorage.setItem(record.storageKey, raw);
    blockedWrites.delete(record.storageKey);
    window.dispatchEvent(new CustomEvent("rootine:workspace-change", {
      detail: { key: record.storageKey, updatedAt: new Date().toISOString() },
    }));
    return true;
  } catch {
    return false;
  }
}

export function deleteLocalRecoveryRecord(id: string): boolean {
  if (typeof window === "undefined") return false;
  const records = readRecoveryIndex();
  const record = records.find((candidate) => candidate.id === id);
  if (!record) return false;
  try {
    window.localStorage.removeItem(record.backupKey);
    return writeRecoveryIndex(records.filter((candidate) => candidate.id !== id));
  } catch {
    return false;
  }
}

function isRoutineWorkspaceKey(key: string) {
  return (key.startsWith("rootine.") || key.startsWith("routine.") || key.startsWith("routine-"))
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

type StorageEstimateProvider = {
  estimate: () => Promise<StorageEstimate>;
};

function getStorageEstimateProvider(): StorageEstimateProvider | undefined {
  if (typeof navigator === "undefined") return undefined;
  const candidate = (navigator as Navigator & {
    storage?: Partial<StorageEstimateProvider>;
  }).storage;
  return typeof candidate?.estimate === "function"
    ? candidate as StorageEstimateProvider
    : undefined;
}

type LocalBackupValidationResult =
  | { ok: true; backup: FullLocalBackup; entries: Array<[string, string]> }
  | { ok: false; error: string };

const RAW_VALUE_VALIDATORS: Record<string, (raw: string) => boolean> = {
  "routine.sidebar.collapsed": (raw) => raw === "true" || raw === "false",
  "routine.goals.layout": (raw) => raw === "list" || raw === "grid",
  "routine.goals.sort": (raw) => ["priority", "due", "progress", "updated", "name"].includes(raw),
};

function validateStoredWorkspaceValue(key: string, raw: string) {
  const rawValidator = RAW_VALUE_VALIDATORS[key];
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
    isRoutineWorkspaceKey(key)
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
  provider: StorageEstimateProvider | undefined = getStorageEstimateProvider(),
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

export function exportAllLocalWorkspaces(): FullLocalBackup {
  const workspaces: Record<string, string> = {};
  if (typeof window !== "undefined") {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !isRoutineWorkspaceKey(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (raw !== null) workspaces[key] = raw;
    }
  }
  return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), workspaces };
}

export function importAllLocalWorkspaces(value: unknown): { ok: boolean; restored: number; error?: string } {
  if (typeof window === "undefined") return { ok: false, restored: 0, error: "Brak pamięci przeglądarki." };
  const validation = validateFullLocalBackup(value);
  if (!validation.ok) return { ok: false, restored: 0, error: validation.error };

  const snapshots = new Map<string, string | null>();
  try {
    for (const [key] of validation.entries) {
      snapshots.set(key, window.localStorage.getItem(key));
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
      && !createRecoveryCopy(key, current, "Automatyczna kopia przed importem pełnej kopii")
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
      window.localStorage.setItem(key, raw);
      appliedKeys.push(key);
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const key of appliedKeys.reverse()) {
      try {
        const previous = snapshots.get(key) ?? null;
        if (previous === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, previous);
      } catch {
        rollbackFailed = true;
      }
    }
    const failureReason = error instanceof DOMException && (
      error.name === "QuotaExceededError"
      || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
    )
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
  try {
    window.dispatchEvent(new CustomEvent("rootine:workspace-change", {
      detail: { key: "*", updatedAt: new Date().toISOString() },
    }));
  } catch {
    // The data is already restored; the Recovery Center always offers a full reload.
  }
  return { ok: true, restored: validation.entries.length };
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
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("rootine:workspace") : null;
  const onChannel = (event: MessageEvent<{ key?: string; origin?: string }>) => {
    if (event.data?.origin === repositoryOrigin) return;
    if (event.data?.key === key || event.data?.key === "*") listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener("rootine:workspace-change", onCustom);
  channel?.addEventListener("message", onChannel);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("rootine:workspace-change", onCustom);
    channel?.removeEventListener("message", onChannel);
    channel?.close();
  };
}
