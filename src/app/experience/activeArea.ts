import { useCallback, useSyncExternalStore } from "react";
import type { AppModuleId } from "../moduleRegistry";

export type RootineAreaId = AppModuleId | "habits";

/*
 * The active area is pure hover/focus highlight state: it changes on every
 * pointer move across the navigation and it is read by a handful of leaves.
 *
 * It used to live in a context provider mounted *above* RouterProvider, so each
 * pointerenter re-rendered the provider, the layout and the whole current page —
 * twice per nav item, before the click even landed. Measured at 1070ms of
 * renderer time for 24 hovers, against 1ms for an idle page.
 *
 * An external store fixes the class of problem rather than this one call site:
 * the setter is a module function that no component subscribes to, and readers
 * subscribe to the narrowest snapshot they can use. `useIsActiveArea` returns a
 * boolean, so a hover re-renders only the two nav items whose state actually
 * flipped.
 */
let activeAreaId: RootineAreaId | null = null;
const listeners = new Set<() => void>();

export function setActiveAreaId(value: RootineAreaId | null) {
  if (activeAreaId === value) return;
  activeAreaId = value;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getActiveAreaId() {
  return activeAreaId;
}

function getServerActiveAreaId(): RootineAreaId | null {
  return null;
}

/** Subscribes to the active area itself. Use only where the id is actually needed. */
export function useActiveAreaId() {
  return useSyncExternalStore(subscribe, getActiveAreaId, getServerActiveAreaId);
}

/**
 * Subscribes to "is *this* area active". The snapshot is a boolean, so hovering
 * a sibling does not re-render this component.
 */
export function useIsActiveArea(id: RootineAreaId) {
  const getSnapshot = useCallback(() => activeAreaId === id, [id]);
  const getServerSnapshot = useCallback(() => false, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test seam: the store is module state, so suites must be able to reset it. */
export function resetActiveAreaForTests() {
  activeAreaId = null;
  listeners.clear();
}
