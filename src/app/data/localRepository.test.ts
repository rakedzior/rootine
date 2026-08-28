import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkspacePayloadRecord,
  WorkspacePayloadStore,
  WorkspacePayloadWriteInput,
  WorkspacePayloadWriteResult,
} from "./indexedDbWorkspaceStore";

type Fixture = { version: 1; items: string[] };

const fallback = (): Fixture => ({ version: 1, items: ["demo"] });
const validate = (value: unknown): value is Fixture => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Fixture>;
  return candidate.version === 1
    && Array.isArray(candidate.items)
    && candidate.items.every((item) => typeof item === "string");
};

type MemoryWorkspaceStore = WorkspacePayloadStore & {
  records: Map<string, WorkspacePayloadRecord>;
  writeError?: Error;
};

function createMemoryWorkspaceStore(): MemoryWorkspaceStore {
  const records = new Map<string, WorkspacePayloadRecord>();
  return {
    available: true,
    records,
    async read(key) {
      return records.get(key) ?? null;
    },
    async list() {
      return [...records.values()];
    },
    async compareAndSwap(input: WorkspacePayloadWriteInput): Promise<WorkspacePayloadWriteResult> {
      if (this.writeError) throw this.writeError;
      const current = records.get(input.key) ?? null;
      const matches = input.expectedRevision === null
        ? current === null
        : current?.revision === input.expectedRevision
          && current.contentHash === input.expectedContentHash;
      if (!matches) return { status: "conflict", current };
      const record: WorkspacePayloadRecord = {
        key: input.key,
        raw: input.raw,
        revision: (current?.revision ?? 0) + 1,
        contentHash: input.contentHash,
        updatedAt: input.updatedAt,
        writtenAt: new Date().toISOString(),
        byteLength: input.byteLength,
      };
      records.set(input.key, record);
      return { status: "saved", record };
    },
    async remove(key) {
      records.delete(key);
    },
  };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("local repository", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("loads valid data without creating a recovery copy", async () => {
    const repository = await import("./localRepository");
    const stored: Fixture = { version: 1, items: ["saved"] };
    window.localStorage.setItem("rootine.fixture.v1", JSON.stringify(stored));

    const result = repository.readLocalWorkspace({
      key: "rootine.fixture.v1",
      fallback,
      validate,
    });

    expect(result).toMatchObject({ status: "ok", workspace: stored });
    expect(repository.listLocalRecoveryRecords()).toEqual([]);
  });

  it("claims anonymous data once and keeps later accounts physically isolated", async () => {
    const repository = await import("./localRepository");
    const storage = await import("./accountStorage");
    const key = "rootine.fixture.account-isolation.v1";
    const localValue = { version: 1 as const, items: ["anonymous"] };
    const accountAValue = { version: 1 as const, items: ["account-a"] };
    const accountBValue = { version: 1 as const, items: ["account-b"] };

    expect(repository.writeLocalWorkspace(key, localValue)).toBe(true);
    await repository.flushLocalWorkspaceWrites();
    await repository.prepareWorkspaceScopeForAccount("user-a");

    expect(repository.getActiveWorkspaceScope()).toBe(storage.accountDataScope("user-a"));
    await expect(repository.exportAllLocalWorkspaces()).resolves.toMatchObject({
      workspaces: { [key]: JSON.stringify(localValue) },
    });
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(window.localStorage.getItem(storage.scopedRootineStorageKey(key))).toBe(JSON.stringify(localValue));

    await repository.switchWorkspaceScope(storage.accountDataScope("user-b"));
    await expect(repository.exportAllLocalWorkspaces()).resolves.toMatchObject({ workspaces: {} });
    expect(repository.writeLocalWorkspace(key, accountBValue)).toBe(true);
    await repository.flushLocalWorkspaceWrites();

    await repository.switchWorkspaceScope(storage.accountDataScope("user-a"));
    await expect(repository.exportAllLocalWorkspaces()).resolves.toMatchObject({
      workspaces: { [key]: JSON.stringify(localValue) },
    });
    expect(repository.writeLocalWorkspace(key, accountAValue)).toBe(true);
    await repository.flushLocalWorkspaceWrites();
    const accountABackup = await repository.exportAllLocalWorkspaces();

    await repository.switchWorkspaceScope(storage.accountDataScope("user-b"));
    await expect(repository.exportAllLocalWorkspaces()).resolves.toMatchObject({
      workspaces: { [key]: JSON.stringify(accountBValue) },
    });
    await expect(repository.importAllLocalWorkspaces(accountABackup)).resolves.toMatchObject({
      ok: false,
      error: "Ta kopia pochodzi z innego konta. Otwórz właściwe konto przed importem.",
    });
    await repository.switchWorkspaceScope("local");
    await expect(repository.exportAllLocalWorkspaces()).resolves.toMatchObject({ workspaces: {} });
  });

  it("claims text preferences without treating the global theme as a corrupt workspace", async () => {
    const repository = await import("./localRepository");
    const storage = await import("./accountStorage");
    window.localStorage.setItem("rootine.appearance.theme", "rootine-cobalt");
    window.localStorage.setItem("rootine.notes.layout", "list");
    window.localStorage.setItem("rootine.tasks.view-mode.v1", "calendar");

    await expect(repository.prepareWorkspaceScopeForAccount("user-preferences")).resolves.toBeUndefined();
    await expect(repository.exportAllLocalWorkspaces()).resolves.toMatchObject({
      workspaces: {
        "rootine.notes.layout": "list",
        "rootine.tasks.view-mode.v1": "calendar",
      },
    });
    expect(window.localStorage.getItem("rootine.appearance.theme")).toBe("rootine-cobalt");
    expect(window.localStorage.getItem("rootine.notes.layout")).toBeNull();
    expect(window.localStorage.getItem(storage.scopedRootineStorageKey("rootine.notes.layout"))).toBe("list");
    await repository.switchWorkspaceScope("local");
  });

  it("quarantines corrupt data and blocks the mount autosave", async () => {
    const repository = await import("./localRepository");
    const key = "rootine.fixture.v1";
    const corruptRaw = "{not-json";
    window.localStorage.setItem(key, corruptRaw);

    const result = repository.readLocalWorkspace({ key, fallback, validate });
    expect(result.status).toBe("corrupt");
    expect(result.recoveryId).toBeTruthy();

    expect(repository.writeLocalWorkspace(key, result.workspace)).toBe(true);
    expect(window.localStorage.getItem(key)).toBe(corruptRaw);
    await expect(repository.exportLocalRecoveryRecord(result.recoveryId!)).resolves.toBe(corruptRaw);
  });

  it("allows a user mutation while retaining the corrupt recovery payload", async () => {
    const repository = await import("./localRepository");
    const key = "rootine.fixture.v1";
    const corruptRaw = JSON.stringify({ version: 99, items: [] });
    window.localStorage.setItem(key, corruptRaw);

    const result = repository.readLocalWorkspace({ key, fallback, validate });
    window.dispatchEvent(new Event("input", { bubbles: true }));
    const next: Fixture = { version: 1, items: ["new"] };

    expect(repository.writeLocalWorkspace(key, next)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(key) ?? "")).toEqual(next);
    await expect(repository.exportLocalRecoveryRecord(result.recoveryId!)).resolves.toBe(corruptRaw);
  });

  it("backs up existing workspaces before a full restore", async () => {
    const repository = await import("./localRepository");
    const key = "rootine.fixture.v1";
    window.localStorage.setItem(key, JSON.stringify({ version: 1, items: ["current"] }));

    const result = await repository.importAllLocalWorkspaces({
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: {
        [key]: JSON.stringify({ version: 1, items: ["restored"] }),
      },
    });

    expect(result).toEqual({ ok: true, restored: 1 });
    expect(JSON.parse(window.localStorage.getItem(key) ?? "")).toEqual({ version: 1, items: ["restored"] });
    expect(repository.listLocalRecoveryRecords()).toHaveLength(1);
  });

  it("CAS-skips a remote import when the local raw changes after its snapshot", async () => {
    const repository = await import("./localRepository");
    const key = "rootine.fixture.cas-inline.v1";
    const current = JSON.stringify({ version: 1, items: ["current"] });
    const concurrent = JSON.stringify({ version: 1, items: ["concurrent"] });
    const remote = JSON.stringify({ version: 1, items: ["remote"] });
    window.localStorage.setItem(key, current);
    const originalSetItem = Storage.prototype.setItem;
    let injectedConcurrentEdit = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function setItem(this: Storage, storageKey, value) {
      originalSetItem.call(this, storageKey, value);
      if (storageKey === "rootine.recovery.index.v1" && !injectedConcurrentEdit) {
        injectedConcurrentEdit = true;
        originalSetItem.call(this, key, concurrent);
      }
    });

    const result = await repository.importAllLocalWorkspaces({
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: { [key]: remote },
    }, {
      expectedWorkspaces: { [key]: current },
    });

    expect(result).toEqual({ ok: true, restored: 0, skipped: [key] });
    expect(window.localStorage.getItem(key)).toBe(concurrent);
  });

  it("CAS-skips a tiered remote import when IndexedDB changes after its snapshot", async () => {
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    const key = "rootine.fixture.cas-tiered.v1";
    const current = JSON.stringify({ version: 1, items: ["current"] });
    const concurrent = JSON.stringify({ version: 1, items: ["concurrent"] });
    const remote = JSON.stringify({ version: 1, items: ["remote"] });
    const currentRecord: WorkspacePayloadRecord = {
      key,
      raw: current,
      revision: 1,
      contentHash: "hash-current",
      updatedAt: "2026-08-10T08:00:00.000Z",
      writtenAt: "2026-08-10T08:00:00.000Z",
      byteLength: current.length,
    };
    store.records.set(key, currentRecord);
    window.localStorage.setItem(key, JSON.stringify({
      __rootineWorkspaceManifest: 1,
      key,
      storage: "indexeddb",
      revision: currentRecord.revision,
      contentHash: currentRecord.contentHash,
      updatedAt: currentRecord.updatedAt,
      byteLength: currentRecord.byteLength,
    }));
    repository.setWorkspacePayloadStoreForTests(store);
    const originalRead = store.read.bind(store);
    let targetReads = 0;
    store.read = vi.fn(async (storageKey) => {
      if (storageKey !== key) return originalRead(storageKey);
      targetReads += 1;
      if (targetReads === 2) {
        store.records.set(key, {
          ...currentRecord,
          raw: concurrent,
          revision: 2,
          contentHash: "hash-concurrent",
          updatedAt: "2026-08-10T08:01:00.000Z",
          writtenAt: "2026-08-10T08:01:00.000Z",
          byteLength: concurrent.length,
        });
      }
      return originalRead(storageKey);
    });
    const compareAndSwap = vi.spyOn(store, "compareAndSwap");

    const result = await repository.importAllLocalWorkspaces({
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: { [key]: remote },
    }, {
      expectedWorkspaces: { [key]: current },
    });

    expect(result).toEqual({ ok: true, restored: 0, skipped: [key] });
    expect(store.records.get(key)?.raw).toBe(concurrent);
    expect(compareAndSwap).not.toHaveBeenCalledWith(expect.objectContaining({ key, raw: remote }));
    expect(window.localStorage.getItem(key)).not.toBe(remote);
  });

  it("validates every imported entry before writing any workspace", async () => {
    const repository = await import("./localRepository");
    const firstKey = "rootine.fixture.first.v1";
    const secondKey = "rootine.fixture.second.v1";
    const current = JSON.stringify({ version: 1, items: ["current"] });
    window.localStorage.setItem(firstKey, current);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const result = await repository.importAllLocalWorkspaces({
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: {
        [firstKey]: JSON.stringify({ version: 1, items: ["replacement"] }),
        [secondKey]: "{invalid-json",
      },
    });

    expect(result).toMatchObject({ ok: false, restored: 0 });
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(firstKey)).toBe(current);
    expect(window.localStorage.getItem(secondKey)).toBeNull();
    expect(repository.listLocalRecoveryRecords()).toEqual([]);
  });

  it("rolls back earlier workspace writes when a later imported write fails", async () => {
    const repository = await import("./localRepository");
    const firstKey = "rootine.fixture.first.v1";
    const secondKey = "rootine.fixture.second.v1";
    const currentFirst = JSON.stringify({ version: 1, items: ["first-current"] });
    const currentSecond = JSON.stringify({ version: 1, items: ["second-current"] });
    const nextFirst = JSON.stringify({ version: 1, items: ["first-imported"] });
    const nextSecond = JSON.stringify({ version: 1, items: ["second-imported"] });
    window.localStorage.setItem(firstKey, currentFirst);
    window.localStorage.setItem(secondKey, currentSecond);
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function setItem(this: Storage, key, value) {
      if (key === secondKey && value === nextSecond) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    });

    const result = await repository.importAllLocalWorkspaces({
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: {
        [firstKey]: nextFirst,
        [secondKey]: nextSecond,
      },
    });

    expect(result).toMatchObject({ ok: false, restored: 0 });
    expect(result.error).toContain("wycofany");
    expect(window.localStorage.getItem(firstKey)).toBe(currentFirst);
    expect(window.localStorage.getItem(secondKey)).toBe(currentSecond);
    expect(repository.listLocalRecoveryRecords()).toHaveLength(2);
  });

  it("accepts raw app preferences and rootine-dash workspace keys in a full backup", async () => {
    const repository = await import("./localRepository");
    const expectedWorkspaces = {
      "rootine.sidebar.collapsed": "true",
      "rootine.goals.layout": "grid",
      "rootine.goals.sort": "updated",
      "rootine.goals.next-step-depth": "2",
      "rootine.notes.layout": "list",
      "rootine.tasks.view-mode.v1": "calendar",
      "rootine-sport-planner-v1": JSON.stringify({ version: 1 }),
    };
    Object.entries(expectedWorkspaces).forEach(([key, raw]) => window.localStorage.setItem(key, raw));

    const backup = await repository.exportAllLocalWorkspaces();
    window.localStorage.clear();
    const result = await repository.importAllLocalWorkspaces(backup);

    expect(result).toEqual({ ok: true, restored: 7 });
    expect(backup.workspaces).toEqual(expectedWorkspaces);
    Object.entries(expectedWorkspaces).forEach(([key, raw]) => {
      expect(window.localStorage.getItem(key)).toBe(raw);
    });
  });

  it("keeps the global theme outside workspace imports", async () => {
    const repository = await import("./localRepository");
    window.localStorage.setItem("rootine.appearance.theme", "rootine-cobalt");
    const result = await repository.importAllLocalWorkspaces({
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: { "rootine.appearance.theme": "olive-walnut-ivory" },
    });

    expect(result).toEqual({ ok: true, restored: 0 });
    expect(window.localStorage.getItem("rootine.appearance.theme")).toBe("rootine-cobalt");
  });

  it("reports origin storage usage and handles unavailable estimates", async () => {
    const repository = await import("./localRepository");

    await expect(repository.estimateOriginStorage({
      estimate: async () => ({ usage: 250, quota: 1_000 }),
    })).resolves.toEqual({
      status: "ready",
      usage: 250,
      quota: 1_000,
      ratio: 0.25,
    });
    await expect(repository.estimateOriginStorage(undefined)).resolves.toMatchObject({
      status: "unsupported",
    });
    await expect(repository.estimateOriginStorage({
      estimate: async () => {
        throw new Error("denied");
      },
    })).resolves.toMatchObject({
      status: "error",
    });
  });

  it("skips writes that only refresh the top-level update timestamp", async () => {
    const repository = await import("./localRepository");
    const key = "rootine.fixture.v1";
    window.localStorage.setItem(key, JSON.stringify({
      version: 1,
      updatedAt: "2026-01-01T10:00:00.000Z",
      items: ["saved"],
    }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    expect(repository.writeLocalWorkspace(key, {
      version: 1,
      updatedAt: "2026-01-01T10:01:00.000Z",
      items: ["saved"],
    })).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("notifies subscribers for external changes but ignores its own write event", async () => {
    const repository = await import("./localRepository");
    const key = "rootine.fixture.v1";
    const listener = vi.fn();
    const unsubscribe = repository.subscribeToLocalWorkspace(key, listener);

    repository.writeLocalWorkspace(key, { version: 1, items: ["local"] });
    expect(listener).not.toHaveBeenCalled();

    window.dispatchEvent(new CustomEvent("rootine:workspace-change", {
      detail: { key, updatedAt: new Date().toISOString() },
    }));
    expect(listener).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new StorageEvent("storage", { key }));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(new CustomEvent("rootine:workspace-change", { detail: { key } }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("moves a large legacy workspace to IndexedDB and leaves only a compact manifest", async () => {
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    repository.setWorkspacePayloadStoreForTests(store);
    const key = "rootine.fixture.large.v1";
    const stored: Fixture = {
      version: 1,
      items: Array.from({ length: 4_000 }, (_, index) => `${index}-${"x".repeat(120)}`),
    };
    const raw = JSON.stringify(stored);
    window.localStorage.setItem(key, raw);

    expect(repository.readLocalWorkspace({ key, fallback, validate })).toMatchObject({
      status: "ok",
      workspace: stored,
    });
    await repository.flushLocalWorkspaceWrites();

    const manifestRaw = window.localStorage.getItem(key) ?? "";
    expect(manifestRaw.length).toBeLessThan(400);
    expect(JSON.parse(manifestRaw)).toMatchObject({
      __rootineWorkspaceManifest: 1,
      key,
      storage: "indexeddb",
    });
    expect(store.records.get(key)?.raw).toBe(raw);
    await expect(repository.exportAllLocalWorkspaces()).resolves.toMatchObject({
      workspaces: { [key]: raw },
    });

    repository.setWorkspacePayloadStoreForTests(store);
    expect(repository.readLocalWorkspace({ key, fallback, validate }).status).toBe("missing");
    await repository.flushLocalWorkspaceWrites();
    const lateSubscriber = vi.fn();
    const unsubscribe = repository.subscribeToLocalWorkspace(key, lateSubscriber);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(lateSubscriber).toHaveBeenCalled();
    unsubscribe();
    expect(repository.readLocalWorkspace({ key, fallback, validate })).toMatchObject({
      status: "ok",
      workspace: stored,
    });
  });

  it("rebases a user edit queued while a compatible legacy workspace is migrating", async () => {
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    repository.setWorkspacePayloadStoreForTests(store);
    const key = "rootine.fixture.migrating.v1";
    const stored: Fixture = { version: 1, items: ["legacy"] };
    const edited: Fixture = { version: 1, items: ["edited-during-migration"] };
    window.localStorage.setItem(key, JSON.stringify(stored));

    repository.readLocalWorkspace({ key, fallback, validate });
    window.dispatchEvent(new Event("input", { bubbles: true }));
    expect(repository.writeLocalWorkspace(key, edited)).toBe(true);
    await repository.flushLocalWorkspaceWrites();

    expect(JSON.parse(store.records.get(key)?.raw ?? "{}")).toEqual(edited);
    expect(JSON.parse(window.localStorage.getItem(key) ?? "{}")).toMatchObject({
      __rootineWorkspaceManifest: 1,
      revision: 2,
    });
    expect(repository.listLocalPersistenceIssues()).toEqual([]);
  });

  it("serializes edits queued during an active CAS and rebases them onto the saved revision", async () => {
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    repository.setWorkspacePayloadStoreForTests(store);
    const key = "rootine.fixture.active-cas.v1";
    repository.readLocalWorkspace({ key, fallback, validate });
    await repository.flushLocalWorkspaceWrites();

    const firstWriteStarted = createDeferred();
    const releaseFirstWrite = createDeferred();
    const expectedRevisions: Array<number | null> = [];
    const originalCompareAndSwap = store.compareAndSwap.bind(store);
    let activeWrites = 0;
    let maxActiveWrites = 0;
    let writeCount = 0;
    store.compareAndSwap = vi.fn(async (input) => {
      expectedRevisions.push(input.expectedRevision);
      activeWrites += 1;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      writeCount += 1;
      try {
        if (writeCount === 1) {
          firstWriteStarted.resolve();
          await releaseFirstWrite.promise;
        }
        return await originalCompareAndSwap(input);
      } finally {
        activeWrites -= 1;
      }
    });

    const first: Fixture = { version: 1, items: ["first"] };
    const second: Fixture = { version: 1, items: ["second"] };
    expect(repository.writeLocalWorkspace(key, first)).toBe(true);
    const flushing = repository.flushLocalWorkspaceWrites();
    await firstWriteStarted.promise;

    expect(repository.writeLocalWorkspace(key, second)).toBe(true);
    releaseFirstWrite.resolve();
    await flushing;

    expect(expectedRevisions).toEqual([null, 1]);
    expect(maxActiveWrites).toBe(1);
    expect(store.records.get(key)).toMatchObject({
      raw: JSON.stringify(second),
      revision: 2,
    });
    expect(repository.listLocalPersistenceIssues()).toEqual([]);
    expect(repository.listLocalRecoveryRecords()).toEqual([]);
  });

  it("keeps the latest queued edit inline when an active CAS and its successor both fall back", async () => {
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    repository.setWorkspacePayloadStoreForTests(store);
    const key = "rootine.fixture.active-cas-fallback.v1";
    const base = {
      version: 1 as const,
      updatedAt: "2026-01-01T10:00:00.000Z",
      items: ["base"],
    };
    window.localStorage.setItem(key, JSON.stringify(base));
    repository.readLocalWorkspace({ key, fallback, validate });
    await repository.flushLocalWorkspaceWrites();

    const firstWriteStarted = createDeferred();
    const releaseFirstWrite = createDeferred();
    const originalCompareAndSwap = store.compareAndSwap.bind(store);
    let writeCount = 0;
    store.writeError = new DOMException("temporarily unavailable", "InvalidStateError");
    store.compareAndSwap = vi.fn(async (input) => {
      writeCount += 1;
      if (writeCount === 1) {
        firstWriteStarted.resolve();
        await releaseFirstWrite.promise;
      }
      return originalCompareAndSwap(input);
    });

    const first = {
      version: 1 as const,
      updatedAt: "2026-01-01T10:01:00.000Z",
      items: ["first-fallback"],
    };
    const latest = {
      version: 1 as const,
      updatedAt: "2026-01-01T10:02:00.000Z",
      items: ["latest-fallback"],
    };
    expect(repository.writeLocalWorkspace(key, first)).toBe(true);
    const flushing = repository.flushLocalWorkspaceWrites();
    await firstWriteStarted.promise;
    expect(repository.writeLocalWorkspace(key, latest)).toBe(true);
    releaseFirstWrite.resolve();
    await flushing;

    expect(store.compareAndSwap).toHaveBeenCalledTimes(2);
    expect(store.records.get(key)).toMatchObject({
      raw: JSON.stringify(base),
      revision: 1,
    });
    expect(window.localStorage.getItem(key)).toBe(JSON.stringify(latest));
    const [issue] = repository.listLocalPersistenceIssues();
    expect(issue).toMatchObject({
      key,
      kind: "unavailable",
      retryable: true,
      hasDraft: true,
    });
    expect(repository.exportLocalPersistenceIssueDraft(issue.id)).toBe(JSON.stringify(latest));
    expect(repository.listLocalRecoveryRecords()).toEqual([]);

    store.writeError = undefined;
    await expect(repository.retryLocalPersistenceIssue(issue.id)).resolves.toBe(true);
    expect(store.records.get(key)).toMatchObject({
      raw: JSON.stringify(latest),
      revision: 2,
    });
    expect(repository.listLocalPersistenceIssues()).toEqual([]);
  });

  it("flushes writes enqueued by later page lifecycle listeners and installs one listener per event", async () => {
    const windowAddEventListener = vi.spyOn(window, "addEventListener");
    const documentAddEventListener = vi.spyOn(document, "addEventListener");
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    const compareAndSwap = vi.spyOn(store, "compareAndSwap");
    repository.setWorkspacePayloadStoreForTests(store);
    const pagehideKey = "rootine.fixture.pagehide.v1";
    const visibilityKey = "rootine.fixture.visibility.v1";
    repository.readLocalWorkspace({ key: pagehideKey, fallback, validate });
    repository.readLocalWorkspace({ key: visibilityKey, fallback, validate });
    await repository.flushLocalWorkspaceWrites();

    expect(windowAddEventListener.mock.calls.filter(([event]) => event === "pagehide")).toHaveLength(1);
    expect(documentAddEventListener.mock.calls.filter(([event]) => event === "visibilitychange")).toHaveLength(1);

    const pagehideWorkspace: Fixture = { version: 1, items: ["from-pagehide"] };
    window.addEventListener("pagehide", () => {
      repository.writeLocalWorkspace(pagehideKey, pagehideWorkspace);
    }, { once: true });
    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() => {
      expect(store.records.get(pagehideKey)?.raw).toBe(JSON.stringify(pagehideWorkspace));
    });

    const visibilityWorkspace: Fixture = { version: 1, items: ["from-hidden"] };
    document.addEventListener("visibilitychange", () => {
      repository.writeLocalWorkspace(visibilityKey, visibilityWorkspace);
    }, { once: true });
    const visibilityState = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => {
      expect(store.records.get(visibilityKey)?.raw).toBe(JSON.stringify(visibilityWorkspace));
    });

    expect(compareAndSwap).toHaveBeenCalledTimes(2);
    visibilityState.mockRestore();
    documentAddEventListener.mockRestore();
    windowAddEventListener.mockRestore();
  });

  it("waits for active writes, flushes pending writes, and exports their latest payloads", async () => {
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    repository.setWorkspacePayloadStoreForTests(store);
    const activeKey = "rootine.fixture.export-active.v1";
    const pendingKey = "rootine.fixture.export-pending.v1";
    repository.readLocalWorkspace({ key: activeKey, fallback, validate });
    repository.readLocalWorkspace({ key: pendingKey, fallback, validate });
    await repository.flushLocalWorkspaceWrites();

    const activeWriteStarted = createDeferred();
    const releaseActiveWrite = createDeferred();
    const originalCompareAndSwap = store.compareAndSwap.bind(store);
    store.compareAndSwap = vi.fn(async (input) => {
      if (input.key === activeKey) {
        activeWriteStarted.resolve();
        await releaseActiveWrite.promise;
      }
      return originalCompareAndSwap(input);
    });

    const activeWorkspace: Fixture = { version: 1, items: ["active-latest"] };
    const pendingWorkspace: Fixture = { version: 1, items: ["pending-latest"] };
    expect(repository.writeLocalWorkspace(activeKey, activeWorkspace)).toBe(true);
    const activeFlush = repository.flushLocalWorkspaceWrites();
    await activeWriteStarted.promise;
    expect(repository.writeLocalWorkspace(pendingKey, pendingWorkspace)).toBe(true);

    const backupPromise = repository.exportAllLocalWorkspaces();
    releaseActiveWrite.resolve();
    const backup = await backupPromise;
    await activeFlush;

    expect(backup.workspaces).toMatchObject({
      [activeKey]: JSON.stringify(activeWorkspace),
      [pendingKey]: JSON.stringify(pendingWorkspace),
    });
  });

  it("keeps a chronologically newer Zulu record when a lexically larger offset timestamp is older", async () => {
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    repository.setWorkspacePayloadStoreForTests(store);
    const key = "rootine.fixture.timestamp-remote-newer.v1";
    const remote = {
      version: 1 as const,
      updatedAt: "2026-01-01T09:00:00.000Z",
      items: ["remote-newer"],
    };
    const local = {
      version: 1 as const,
      updatedAt: "2026-01-01T10:00:00.000+02:00",
      items: ["local-older"],
    };
    const remoteRaw = JSON.stringify(remote);
    store.records.set(key, {
      key,
      raw: remoteRaw,
      revision: 1,
      contentHash: "remote-newer",
      updatedAt: remote.updatedAt,
      writtenAt: "2026-01-01T09:00:01.000Z",
      byteLength: new TextEncoder().encode(remoteRaw).byteLength,
    });
    window.localStorage.setItem(key, JSON.stringify(local));

    repository.readLocalWorkspace({ key, fallback, validate });
    await repository.flushLocalWorkspaceWrites();

    expect(store.records.get(key)).toMatchObject({
      raw: remoteRaw,
      revision: 1,
      updatedAt: remote.updatedAt,
    });
  });

  it("promotes a chronologically newer offset record when its timestamp is lexically smaller", async () => {
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    repository.setWorkspacePayloadStoreForTests(store);
    const key = "rootine.fixture.timestamp-local-newer.v1";
    const remote = {
      version: 1 as const,
      updatedAt: "2026-01-01T09:00:00.000Z",
      items: ["remote-older"],
    };
    const local = {
      version: 1 as const,
      updatedAt: "2026-01-01T08:30:00.000-02:00",
      items: ["local-newer"],
    };
    const remoteRaw = JSON.stringify(remote);
    const localRaw = JSON.stringify(local);
    store.records.set(key, {
      key,
      raw: remoteRaw,
      revision: 1,
      contentHash: "remote-older",
      updatedAt: remote.updatedAt,
      writtenAt: "2026-01-01T09:00:01.000Z",
      byteLength: new TextEncoder().encode(remoteRaw).byteLength,
    });
    window.localStorage.setItem(key, localRaw);

    repository.readLocalWorkspace({ key, fallback, validate });
    await repository.flushLocalWorkspaceWrites();

    expect(store.records.get(key)).toMatchObject({
      raw: localRaw,
      revision: 2,
      updatedAt: local.updatedAt,
    });
    expect(repository.listLocalPersistenceIssues()).toEqual([]);
  });

  it("keeps the legacy payload intact when IndexedDB migration is unavailable", async () => {
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    store.writeError = new DOMException("blocked", "InvalidStateError");
    repository.setWorkspacePayloadStoreForTests(store);
    const key = "rootine.fixture.fallback.v1";
    const stored: Fixture = { version: 1, items: ["legacy-safe"] };
    const raw = JSON.stringify(stored);
    window.localStorage.setItem(key, raw);

    expect(repository.readLocalWorkspace({ key, fallback, validate }).workspace).toEqual(stored);
    await repository.flushLocalWorkspaceWrites();

    expect(window.localStorage.getItem(key)).toBe(raw);
    expect(repository.listLocalPersistenceIssues()).toEqual([
      expect.objectContaining({ key, kind: "unavailable", retryable: true }),
    ]);
  });

  it("rejects a stale tab write using the manifest revision and preserves its draft", async () => {
    const store = createMemoryWorkspaceStore();
    const firstRepository = await import("./localRepository");
    firstRepository.setWorkspacePayloadStoreForTests(store);
    const key = "rootine.fixture.concurrent.v1";
    window.localStorage.setItem(key, JSON.stringify({
      version: 1,
      updatedAt: "2026-01-01T10:00:00.000Z",
      items: ["base"],
    }));
    firstRepository.readLocalWorkspace({ key, fallback, validate });
    await firstRepository.flushLocalWorkspaceWrites();
    firstRepository.readLocalWorkspace({ key, fallback, validate });

    vi.resetModules();
    const secondRepository = await import("./localRepository");
    secondRepository.setWorkspacePayloadStoreForTests(store);
    secondRepository.readLocalWorkspace({ key, fallback, validate });
    await secondRepository.flushLocalWorkspaceWrites();
    secondRepository.readLocalWorkspace({ key, fallback, validate });
    expect(secondRepository.writeLocalWorkspace(key, {
      version: 1,
      updatedAt: "2026-01-01T10:02:00.000Z",
      items: ["second-tab"],
    })).toBe(true);
    await secondRepository.flushLocalWorkspaceWrites();

    const rollbackListener = vi.fn();
    const unsubscribe = firstRepository.subscribeToLocalWorkspace(key, rollbackListener);
    expect(firstRepository.writeLocalWorkspace(key, {
      version: 1,
      updatedAt: "2026-01-01T10:03:00.000Z",
      items: ["stale-first-tab"],
    })).toBe(false);
    expect(JSON.parse(store.records.get(key)?.raw ?? "{}").items).toEqual(["second-tab"]);
    expect(firstRepository.listLocalPersistenceIssues()).toEqual([
      expect.objectContaining({
        key,
        kind: "conflict",
        localUpdatedAt: "2026-01-01T10:03:00.000Z",
        remoteUpdatedAt: "2026-01-01T10:02:00.000Z",
        hasDraft: true,
      }),
    ]);
    expect(firstRepository.listLocalRecoveryRecords()).toHaveLength(1);
    expect(rollbackListener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("classifies an ordinary quota failure and retries the retained draft", async () => {
    const repository = await import("./localRepository");
    const key = "rootine.sidebar.modules";
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function mockedSetItem(
      this: Storage,
      itemKey,
      value,
    ) {
      if (itemKey === key) throw new DOMException("full", "QuotaExceededError");
      return originalSetItem.call(this, itemKey, value);
    });

    expect(repository.writeLocalWorkspace(key, { version: 1, items: ["draft"] })).toBe(false);
    const [issue] = repository.listLocalPersistenceIssues();
    expect(issue).toMatchObject({ key, kind: "quota", retryable: true, hasDraft: true });

    setItem.mockRestore();
    await expect(repository.retryLocalPersistenceIssue(issue.id)).resolves.toBe(true);
    expect(JSON.parse(window.localStorage.getItem(key) ?? "{}")).toEqual({
      version: 1,
      items: ["draft"],
    });
    expect(repository.listLocalPersistenceIssues()).toEqual([]);
  });

  it("retains and retries a tiered write when both IndexedDB and compatibility storage are full", async () => {
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    store.writeError = new DOMException("full", "QuotaExceededError");
    repository.setWorkspacePayloadStoreForTests(store);
    const key = "rootine.fixture.tier-quota.v1";
    repository.readLocalWorkspace({ key, fallback, validate });
    await repository.flushLocalWorkspaceWrites();
    window.dispatchEvent(new Event("input", { bubbles: true }));
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function mockedSetItem(
      this: Storage,
      itemKey,
      value,
    ) {
      if (itemKey === key) throw new DOMException("full", "QuotaExceededError");
      return originalSetItem.call(this, itemKey, value);
    });

    expect(repository.writeLocalWorkspace(key, { version: 1, items: ["tiered-draft"] })).toBe(true);
    await repository.flushLocalWorkspaceWrites();
    const [issue] = repository.listLocalPersistenceIssues();
    expect(issue).toMatchObject({ key, kind: "quota", retryable: true, hasDraft: true });
    expect(store.records.has(key)).toBe(false);

    setItem.mockRestore();
    store.writeError = undefined;
    await expect(repository.retryLocalPersistenceIssue(issue.id)).resolves.toBe(true);
    expect(JSON.parse(store.records.get(key)?.raw ?? "{}")).toEqual({
      version: 1,
      items: ["tiered-draft"],
    });
    expect(repository.listLocalPersistenceIssues()).toEqual([]);
  });

  it("deletes recovery payloads evicted beyond the retained index", async () => {
    const repository = await import("./localRepository");
    for (let index = 0; index < 43; index += 1) {
      const key = `rootine.corrupt.${index}.v1`;
      window.localStorage.setItem(key, `{broken-${index}`);
      repository.readLocalWorkspace({ key, fallback, validate });
    }

    const records = repository.listLocalRecoveryRecords();
    const payloadKeys = Array.from({ length: window.localStorage.length }, (_, index) => (
      window.localStorage.key(index)
    )).filter((key): key is string => key?.startsWith("rootine.recovery.payload.") ?? false);
    expect(records).toHaveLength(40);
    expect(payloadKeys).toHaveLength(40);
    expect(new Set(payloadKeys)).toEqual(new Set(records.map((record) => record.backupKey)));
  });

  it("keeps a large recovery payload in IndexedDB instead of duplicating it in localStorage", async () => {
    const repository = await import("./localRepository");
    const store = createMemoryWorkspaceStore();
    repository.setWorkspacePayloadStoreForTests(store);
    const key = "rootine.fixture.large-corrupt.v1";
    const corruptRaw = `{${"x".repeat(70_000)}`;
    window.localStorage.setItem(key, corruptRaw);

    const result = repository.readLocalWorkspace({ key, fallback, validate });
    expect(result.status).toBe("corrupt");
    await repository.flushLocalWorkspaceWrites();

    const recovery = repository.listLocalRecoveryRecords().find((record) => (
      record.id === result.recoveryId
    ));
    expect(recovery).toMatchObject({ tier: "indexeddb", storageKey: key });
    expect(window.localStorage.getItem(recovery?.backupKey ?? "")).toBeNull();
    expect(store.records.get(recovery?.backupKey ?? "")?.raw).toBe(corruptRaw);
    await expect(repository.exportLocalRecoveryRecord(result.recoveryId!)).resolves.toBe(corruptRaw);
    await expect(repository.deleteLocalRecoveryRecord(result.recoveryId!)).resolves.toBe(true);
    expect(store.records.has(recovery?.backupKey ?? "")).toBe(false);
    expect(repository.listLocalRecoveryRecords()).toEqual([]);
  });

  it("reports and requests persistent storage without overstating browser guarantees", async () => {
    const repository = await import("./localRepository");
    const provider = {
      persisted: vi.fn(async () => false),
      persist: vi.fn(async () => false),
    };

    await expect(repository.getPersistentStorageStatus(provider)).resolves.toMatchObject({
      status: "ready",
      persisted: false,
    });
    await expect(repository.requestPersistentStorage(provider)).resolves.toMatchObject({
      status: "ready",
      persisted: false,
    });
    expect(provider.persist).toHaveBeenCalledTimes(1);
    await expect(repository.requestPersistentStorage(undefined)).resolves.toMatchObject({
      status: "unsupported",
    });
  });
});
