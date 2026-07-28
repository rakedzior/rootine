import { beforeEach, describe, expect, it, vi } from "vitest";

type Fixture = { version: 1; items: string[] };

const fallback = (): Fixture => ({ version: 1, items: ["demo"] });
const validate = (value: unknown): value is Fixture => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Fixture>;
  return candidate.version === 1
    && Array.isArray(candidate.items)
    && candidate.items.every((item) => typeof item === "string");
};

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
    expect(repository.exportLocalRecoveryRecord(result.recoveryId!)).toBe(corruptRaw);
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
    expect(repository.exportLocalRecoveryRecord(result.recoveryId!)).toBe(corruptRaw);
  });

  it("backs up existing workspaces before a full restore", async () => {
    const repository = await import("./localRepository");
    const key = "rootine.fixture.v1";
    window.localStorage.setItem(key, JSON.stringify({ version: 1, items: ["current"] }));

    const result = repository.importAllLocalWorkspaces({
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

  it("validates every imported entry before writing any workspace", async () => {
    const repository = await import("./localRepository");
    const firstKey = "rootine.fixture.first.v1";
    const secondKey = "rootine.fixture.second.v1";
    const current = JSON.stringify({ version: 1, items: ["current"] });
    window.localStorage.setItem(firstKey, current);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const result = repository.importAllLocalWorkspaces({
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

    const result = repository.importAllLocalWorkspaces({
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

  it("accepts raw app preferences and routine-dash workspace keys in a full backup", async () => {
    const repository = await import("./localRepository");
    const result = repository.importAllLocalWorkspaces({
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: {
        "routine.sidebar.collapsed": "true",
        "routine.goals.layout": "grid",
        "routine-sport-planner-v1": JSON.stringify({ version: 1 }),
      },
    });

    expect(result).toEqual({ ok: true, restored: 3 });
    expect(window.localStorage.getItem("routine.sidebar.collapsed")).toBe("true");
    expect(window.localStorage.getItem("routine.goals.layout")).toBe("grid");
    expect(window.localStorage.getItem("routine-sport-planner-v1")).toBe(JSON.stringify({ version: 1 }));
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
});
