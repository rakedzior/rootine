import { setWorkspacePayloadStoreForTests } from "../data/localRepository";
import { resetActivityLogCacheForWorkspaceSwitch } from "../experience/activityLog";
import {
  createBrowserWorkspacePayloadStore,
  type WorkspacePayloadRecord,
  type WorkspacePayloadWriteInput,
  type WorkspacePayloadStore,
} from "../data/indexedDbWorkspaceStore";
import { createGeneratedDemoEntries } from "./demoWorkspace";

type StorageName = "localStorage" | "sessionStorage";

type ActiveTestWorkspace = {
  restoreLocalStorage: () => void;
  restoreSessionStorage: () => void;
};

let activeWorkspace: ActiveTestWorkspace | null = null;
const TEST_WORKSPACE_SNAPSHOT_KEY = "rootine:test-workspace:storage";
const TEST_WORKSPACE_PAYLOADS_KEY = "rootine:test-workspace:payloads";

function createMemoryStorage(onChange?: (values: Map<string, string>) => void): Storage {
  const values = new Map<string, string>();
  const notify = () => onChange?.(values);
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
      notify();
    },
    getItem(key: string) {
      return values.get(String(key)) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(String(key));
      notify();
    },
    setItem(key: string, value: string) {
      values.set(String(key), String(value));
      notify();
    },
  };
}

function restoreSnapshot(storage: Storage, snapshot: string | null) {
  if (!snapshot) return;
  try {
    const entries = JSON.parse(snapshot) as unknown;
    if (!Array.isArray(entries)) return;
    entries.forEach((entry) => {
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || typeof entry[1] !== "string") return;
      storage.setItem(entry[0], entry[1]);
    });
  } catch {
    // An invalid snapshot must not block the isolated account from starting.
  }
}

function replaceWindowStorage(name: StorageName, storage: Storage) {
  const ownDescriptor = Object.getOwnPropertyDescriptor(window, name);
  Object.defineProperty(window, name, {
    configurable: true,
    enumerable: true,
    value: storage,
  });
  return () => {
    if (ownDescriptor) {
      Object.defineProperty(window, name, ownDescriptor);
      return;
    }
    delete (window as unknown as Record<StorageName, Storage>)[name];
  };
}

function createSessionWorkspacePayloadStore(backingSession: Storage): WorkspacePayloadStore {
  const readRecords = () => {
    try {
      const parsed: unknown = JSON.parse(backingSession.getItem(TEST_WORKSPACE_PAYLOADS_KEY) ?? "[]");
      if (!Array.isArray(parsed)) return [] as WorkspacePayloadRecord[];
      return parsed.filter((record): record is WorkspacePayloadRecord => Boolean(
        record
        && typeof record === "object"
        && typeof (record as WorkspacePayloadRecord).key === "string"
        && typeof (record as WorkspacePayloadRecord).raw === "string"
        && typeof (record as WorkspacePayloadRecord).revision === "number",
      ));
    } catch {
      return [] as WorkspacePayloadRecord[];
    }
  };

  const writeRecords = (records: WorkspacePayloadRecord[]) => {
    backingSession.setItem(TEST_WORKSPACE_PAYLOADS_KEY, JSON.stringify(records));
  };

  return {
    // Test-account data remains a session-scoped local workspace. Keeping this
    // tier inline lets every module hydrate synchronously on a reload while
    // the record implementation below remains available to recovery helpers.
    available: false,
    read: async (key) => readRecords().find((record) => record.key === key) ?? null,
    list: async () => readRecords(),
    compareAndSwap: async (input: WorkspacePayloadWriteInput) => {
      const records = readRecords();
      const current = records.find((record) => record.key === input.key) ?? null;
      const expectedMatches = input.expectedRevision === null
        ? current === null
        : current?.revision === input.expectedRevision && current.contentHash === input.expectedContentHash;
      if (!expectedMatches) return { status: "conflict", current };
      const record: WorkspacePayloadRecord = {
        key: input.key,
        raw: input.raw,
        revision: (current?.revision ?? 0) + 1,
        contentHash: input.contentHash,
        updatedAt: input.updatedAt,
        writtenAt: new Date().toISOString(),
        byteLength: input.byteLength,
      };
      writeRecords([...records.filter((item) => item.key !== input.key), record]);
      return { status: "saved", record };
    },
    remove: async (key) => writeRecords(readRecords().filter((record) => record.key !== key)),
  };
}

function seedTestWorkspace(storage: Storage) {
  createGeneratedDemoEntries().forEach(([key, value]) => storage.setItem(key, JSON.stringify(value)));
}

/** Mounts a fully isolated Rootine workspace backed only by in-memory storage. */
export function activateEphemeralTestWorkspace() {
  if (activeWorkspace || typeof window === "undefined") return;

  // Keep test-account writes isolated from the regular local workspace, while
  // retaining them for a same-tab reload. The backing session storage is read
  // before we install the in-memory facade, so no production key is exposed to
  // the test account.
  const backingSession = window.sessionStorage;
  const persistSnapshot = (values: Map<string, string>) => {
    try {
      backingSession.setItem(TEST_WORKSPACE_SNAPSHOT_KEY, JSON.stringify([...values.entries()]));
    } catch {
      // Session persistence is a progressive enhancement for the QA account.
    }
  };
  const local = createMemoryStorage(persistSnapshot);
  const session = createMemoryStorage();
  restoreSnapshot(local, backingSession.getItem(TEST_WORKSPACE_SNAPSHOT_KEY));
  const restoreLocalStorage = replaceWindowStorage("localStorage", local);
  const restoreSessionStorage = replaceWindowStorage("sessionStorage", session);

  setWorkspacePayloadStoreForTests(createSessionWorkspacePayloadStore(backingSession));
  if (local.length === 0) seedTestWorkspace(local);
  persistSnapshot(new Map(Array.from({ length: local.length }, (_, index) => {
    const key = local.key(index) ?? "";
    return [key, local.getItem(key) ?? ""];
  })));
  resetActivityLogCacheForWorkspaceSwitch();
  activeWorkspace = { restoreLocalStorage, restoreSessionStorage };
}

export function isEphemeralTestWorkspaceActive() {
  return activeWorkspace !== null;
}

/** Test-only escape hatch. The product exits demo mode through a full reload. */
export function deactivateEphemeralTestWorkspaceForTests() {
  if (!activeWorkspace || typeof window === "undefined") return;
  activeWorkspace.restoreSessionStorage();
  activeWorkspace.restoreLocalStorage();
  activeWorkspace = null;
  window.sessionStorage.removeItem(TEST_WORKSPACE_SNAPSHOT_KEY);
  window.sessionStorage.removeItem(TEST_WORKSPACE_PAYLOADS_KEY);
  setWorkspacePayloadStoreForTests(createBrowserWorkspacePayloadStore());
}
