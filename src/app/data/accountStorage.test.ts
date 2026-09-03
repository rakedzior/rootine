import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  accountDataScope,
  getRootineDataScope,
  getRootineStorageItem,
  logicalRootineStorageKey,
  removeRootineStorageItem,
  scopedRootineStorageKey,
  setRootineDataScope,
  setRootineStorageItem,
} from "./accountStorage";

describe("account-scoped storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setRootineDataScope("local");
  });

  afterEach(() => {
    window.localStorage.clear();
    setRootineDataScope("local");
  });

  it.each([
    ["", "empty"],
    ["\u0000account", "control character"],
    ["account\u007f", "DEL character"],
    ["x".repeat(181), "overlong"],
  ])("rejects %s account IDs (%s)", (userId) => {
    expect(() => accountDataScope(userId)).toThrow("Nieprawidłowy identyfikator konta.");
  });

  it("encodes account scope in the physical key and round-trips its logical key", () => {
    const scope = accountDataScope("user/with spaces");
    const physicalKey = scopedRootineStorageKey("rootine.tasks.v1", scope);

    expect(physicalKey).toContain("rootine.scope.account%3Auser%2Fwith%20spaces:");
    expect(logicalRootineStorageKey(physicalKey, scope)).toBe("rootine.tasks.v1");
    expect(logicalRootineStorageKey("rootine.tasks.v1", scope)).toBeNull();
    expect(logicalRootineStorageKey(physicalKey, "local")).toBeNull();
  });

  it("keeps equal logical keys and cursors independent between accounts", () => {
    const key = "rootine.sync.cursor.v1.user%2Fone";

    setRootineDataScope(accountDataScope("user-a"));
    setRootineStorageItem("rootine.workspace.v1", "a");
    setRootineStorageItem(key, "12");

    setRootineDataScope(accountDataScope("user-b"));
    expect(getRootineStorageItem("rootine.workspace.v1")).toBeNull();
    expect(getRootineStorageItem(key)).toBeNull();
    setRootineStorageItem("rootine.workspace.v1", "b");
    setRootineStorageItem(key, "4");

    setRootineDataScope(accountDataScope("user-a"));
    expect(getRootineStorageItem("rootine.workspace.v1")).toBe("a");
    expect(getRootineStorageItem(key)).toBe("12");
    removeRootineStorageItem(key);
    expect(getRootineStorageItem(key)).toBeNull();
    expect(getRootineDataScope()).toBe(accountDataScope("user-a"));
  });

  it("does not hide unscoped global storage when an account scope is active", () => {
    const globalKey = "rootine.appearance.theme";
    window.localStorage.setItem(globalKey, "rootine-cobalt");
    setRootineDataScope(accountDataScope("user-a"));

    expect(logicalRootineStorageKey(globalKey)).toBeNull();
    expect(getRootineStorageItem(globalKey)).toBeNull();
    expect(window.localStorage.getItem(globalKey)).toBe("rootine-cobalt");
  });
});
