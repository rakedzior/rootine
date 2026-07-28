export type WorkspacePayloadRecord = {
  key: string;
  raw: string;
  revision: number;
  contentHash: string;
  updatedAt: string;
  writtenAt: string;
  byteLength: number;
};

export type WorkspacePayloadWriteInput = {
  key: string;
  raw: string;
  expectedRevision: number | null;
  expectedContentHash: string | null;
  contentHash: string;
  updatedAt: string;
  byteLength: number;
};

export type WorkspacePayloadWriteResult =
  | { status: "saved"; record: WorkspacePayloadRecord }
  | { status: "conflict"; current: WorkspacePayloadRecord | null };

export interface WorkspacePayloadStore {
  readonly available: boolean;
  read(key: string): Promise<WorkspacePayloadRecord | null>;
  list(): Promise<WorkspacePayloadRecord[]>;
  compareAndSwap(input: WorkspacePayloadWriteInput): Promise<WorkspacePayloadWriteResult>;
  remove(key: string): Promise<void>;
}

const DATABASE_NAME = "rootine-workspaces";
const DATABASE_VERSION = 1;
const WORKSPACE_STORE = "workspaces";

function unavailableError() {
  return new DOMException("IndexedDB is not available in this browser.", "NotSupportedError");
}

export function createBrowserWorkspacePayloadStore(
  factory: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB,
): WorkspacePayloadStore {
  let databasePromise: Promise<IDBDatabase> | null = null;

  const openDatabase = () => {
    if (!factory) return Promise.reject(unavailableError());
    if (databasePromise) return databasePromise;

    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      } catch (error) {
        databasePromise = null;
        reject(error);
        return;
      }
      let settled = false;
      const blockedTimeout = globalThis.setTimeout(() => {
        settled = true;
        databasePromise = null;
        reject(new DOMException("IndexedDB upgrade was blocked by another tab.", "InvalidStateError"));
      }, 5_000);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(WORKSPACE_STORE)) {
          database.createObjectStore(WORKSPACE_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        globalThis.clearTimeout(blockedTimeout);
        const database = request.result;
        if (settled) {
          database.close();
          return;
        }
        settled = true;
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        globalThis.clearTimeout(blockedTimeout);
        if (settled) return;
        settled = true;
        databasePromise = null;
        reject(request.error ?? new DOMException("Could not open IndexedDB.", "UnknownError"));
      };
      request.onblocked = () => {
        // Give another Routine tab a short window to close its older connection.
      };
    });

    return databasePromise;
  };

  const read = async (key: string) => {
    const database = await openDatabase();
    return new Promise<WorkspacePayloadRecord | null>((resolve, reject) => {
      const transaction = database.transaction(WORKSPACE_STORE, "readonly");
      const request = transaction.objectStore(WORKSPACE_STORE).get(key);
      request.onsuccess = () => resolve((request.result as WorkspacePayloadRecord | undefined) ?? null);
      request.onerror = () => reject(request.error ?? transaction.error ?? new DOMException("IndexedDB read failed.", "UnknownError"));
    });
  };

  const list = async () => {
    const database = await openDatabase();
    return new Promise<WorkspacePayloadRecord[]>((resolve, reject) => {
      const transaction = database.transaction(WORKSPACE_STORE, "readonly");
      const request = transaction.objectStore(WORKSPACE_STORE).getAll();
      request.onsuccess = () => resolve(request.result as WorkspacePayloadRecord[]);
      request.onerror = () => reject(request.error ?? transaction.error ?? new DOMException("IndexedDB list failed.", "UnknownError"));
    });
  };

  const compareAndSwap = async (
    input: WorkspacePayloadWriteInput,
  ): Promise<WorkspacePayloadWriteResult> => {
    const database = await openDatabase();
    return new Promise<WorkspacePayloadWriteResult>((resolve, reject) => {
      const transaction = database.transaction(WORKSPACE_STORE, "readwrite");
      const store = transaction.objectStore(WORKSPACE_STORE);
      const request = store.get(input.key);
      let result: WorkspacePayloadWriteResult | null = null;
      let transactionError: unknown;

      request.onsuccess = () => {
        const current = (request.result as WorkspacePayloadRecord | undefined) ?? null;
        const expectedMatches = input.expectedRevision === null
          ? current === null
          : current?.revision === input.expectedRevision
            && current.contentHash === input.expectedContentHash;

        if (!expectedMatches) {
          result = { status: "conflict", current };
          transaction.abort();
          return;
        }

        const record: WorkspacePayloadRecord = {
          key: input.key,
          raw: input.raw,
          revision: (current?.revision ?? 0) + 1,
          contentHash: input.contentHash,
          updatedAt: input.updatedAt,
          writtenAt: new Date().toISOString(),
          byteLength: input.byteLength,
        };
        result = { status: "saved", record };
        store.put(record);
      };
      request.onerror = () => {
        transactionError = request.error;
      };
      transaction.oncomplete = () => {
        if (result?.status === "saved") resolve(result);
        else reject(transactionError ?? new DOMException("IndexedDB transaction completed without a result.", "UnknownError"));
      };
      transaction.onabort = () => {
        if (result?.status === "conflict") resolve(result);
        else reject(transactionError ?? transaction.error ?? new DOMException("IndexedDB transaction was aborted.", "AbortError"));
      };
      transaction.onerror = () => {
        transactionError = transaction.error;
      };
    });
  };

  const remove = async (key: string) => {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(WORKSPACE_STORE, "readwrite");
      transaction.objectStore(WORKSPACE_STORE).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new DOMException("IndexedDB delete failed.", "UnknownError"));
      transaction.onabort = () => reject(transaction.error ?? new DOMException("IndexedDB delete was aborted.", "AbortError"));
    });
  };

  return {
    available: Boolean(factory),
    read,
    list,
    compareAndSwap,
    remove,
  };
}
