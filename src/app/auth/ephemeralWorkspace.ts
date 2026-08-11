import { setWorkspacePayloadStoreForTests } from "../data/localRepository";
import { resetActivityLogCacheForWorkspaceSwitch } from "../experience/activityLog";
import {
  createBrowserWorkspacePayloadStore,
  type WorkspacePayloadStore,
} from "../data/indexedDbWorkspaceStore";
import { createGeneratedDemoEntries } from "./demoWorkspace";

type StorageName = "localStorage" | "sessionStorage";

type ActiveTestWorkspace = {
  restoreLocalStorage: () => void;
  restoreSessionStorage: () => void;
};

let activeWorkspace: ActiveTestWorkspace | null = null;

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(String(key)) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(String(key));
    },
    setItem(key: string, value: string) {
      values.set(String(key), String(value));
    },
  };
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

function createUnavailablePayloadStore(): WorkspacePayloadStore {
  const unavailable = async () => {
    throw new DOMException("Konto testowe używa wyłącznie pamięci sesji.", "NotSupportedError");
  };
  return {
    available: false,
    read: async () => null,
    list: async () => [],
    compareAndSwap: unavailable,
    remove: async () => undefined,
  };
}

function seedTestWorkspace(storage: Storage) {
  createGeneratedDemoEntries().forEach(([key, value]) => storage.setItem(key, JSON.stringify(value)));
}

/** Mounts a fully isolated Rootine workspace backed only by in-memory storage. */
export function activateEphemeralTestWorkspace() {
  if (activeWorkspace || typeof window === "undefined") return;

  const local = createMemoryStorage();
  const session = createMemoryStorage();
  const restoreLocalStorage = replaceWindowStorage("localStorage", local);
  const restoreSessionStorage = replaceWindowStorage("sessionStorage", session);

  setWorkspacePayloadStoreForTests(createUnavailablePayloadStore());
  seedTestWorkspace(local);
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
  setWorkspacePayloadStoreForTests(createBrowserWorkspacePayloadStore());
}
