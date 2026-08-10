import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";

export function readSessionDraft<T>(storageKey: string): T | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export interface DraftProtectionOptions<T> {
  active: boolean;
  isDirty: boolean;
  draft: T;
  storageKey: string;
  onDiscard: () => void;
}

/**
 * Shared contract for long-form drafts: persist within the tab, protect SPA navigation
 * and reload, and let the caller render the product's standard confirmation dialog.
 */
export function useDraftProtection<T>({
  active,
  isDirty,
  draft,
  storageKey,
  onDiscard,
}: DraftProtectionOptions<T>) {
  const [closeRequested, setCloseRequested] = useState(false);
  const onDiscardRef = useRef(onDiscard);
  const allowNavigationRef = useRef(false);
  const blocker = useBlocker(useCallback(
    () => active && isDirty && !allowNavigationRef.current,
    [active, isDirty],
  ));

  useEffect(() => {
    onDiscardRef.current = onDiscard;
  }, [onDiscard]);

  useEffect(() => {
    if (!isDirty) allowNavigationRef.current = false;
  }, [isDirty]);

  useEffect(() => {
    if (!active || !storageKey || typeof window === "undefined") return;
    try {
      if (isDirty) window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
      else window.sessionStorage.removeItem(storageKey);
    } catch {
      // A blocked storage API must not make the form unusable; navigation protection remains active.
    }
  }, [active, draft, isDirty, storageKey]);

  useEffect(() => {
    if (!active || !isDirty) return;
    const protectReload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectReload);
    return () => window.removeEventListener("beforeunload", protectReload);
  }, [active, isDirty]);

  const clearDraft = useCallback(() => {
    allowNavigationRef.current = true;
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Best-effort cleanup only.
    }
  }, [storageKey]);

  const requestClose = useCallback(() => {
    if (active && isDirty) setCloseRequested(true);
    else onDiscardRef.current();
  }, [active, isDirty]);

  const keepEditing = useCallback(() => {
    setCloseRequested(false);
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker]);

  const confirmDiscard = useCallback(() => {
    clearDraft();
    setCloseRequested(false);
    const blockedNavigation = blocker.state === "blocked";
    onDiscardRef.current();
    if (blockedNavigation) blocker.proceed();
  }, [blocker, clearDraft]);

  return {
    clearDraft,
    confirmDiscard,
    keepEditing,
    promptOpen: closeRequested || blocker.state === "blocked",
    requestClose,
  };
}
