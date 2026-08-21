export type RootineDataScope = "local" | `account:${string}`;

export const ROOTINE_ACCOUNT_CLAIM_KEY = "rootine.account-claim.v1";
export const ROOTINE_SCOPED_STORAGE_PREFIX = "rootine.scope.";

/**
 * Preferences that intentionally remain browser-global and must not be
 * copied into an account workspace or removed during an anonymous claim.
 */
export const ROOTINE_GLOBAL_STORAGE_KEYS = new Set([
  "rootine.appearance.theme",
]);

let activeScope: RootineDataScope = "local";

export function accountDataScope(userId: string): RootineDataScope {
  const normalized = userId.trim();
  if (!normalized || normalized.length > 180 || [...normalized].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })) {
    throw new Error("Nieprawidłowy identyfikator konta.");
  }
  return `account:${normalized}`;
}

export function getRootineDataScope(): RootineDataScope {
  return activeScope;
}

export function setRootineDataScope(scope: RootineDataScope) {
  activeScope = scope;
}

function scopePrefix(scope: RootineDataScope) {
  return scope === "local"
    ? ""
    : `${ROOTINE_SCOPED_STORAGE_PREFIX}${encodeURIComponent(scope)}:`;
}

export function scopedRootineStorageKey(key: string, scope = activeScope) {
  return `${scopePrefix(scope)}${key}`;
}

export function logicalRootineStorageKey(
  physicalKey: string,
  scope = activeScope,
): string | null {
  if (scope === "local") {
    return physicalKey.startsWith(ROOTINE_SCOPED_STORAGE_PREFIX) ? null : physicalKey;
  }
  const prefix = scopePrefix(scope);
  return physicalKey.startsWith(prefix) ? physicalKey.slice(prefix.length) : null;
}

export function getRootineStorageItem(key: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(scopedRootineStorageKey(key));
}

export function setRootineStorageItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(scopedRootineStorageKey(key), value);
}

export function removeRootineStorageItem(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(scopedRootineStorageKey(key));
}

/**
 * Account ownership metadata must remain outside account namespaces. It is
 * deliberately not part of a workspace backup.
 */
export function getUnscopedRootineStorageItem(key: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

export function setUnscopedRootineStorageItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

export function removeUnscopedRootineStorageItem(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}
