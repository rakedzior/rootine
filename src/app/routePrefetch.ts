import type { ComponentType } from "react";
import { APP_MODULES, type AppModulePath } from "./moduleRegistry";

/*
 * Every page is a lazy chunk, so the first visit to a tab used to pay a network
 * round trip *after* the click: 131ms on broadband and 295ms on 4G, against
 * ~50ms once the chunk is cached. Nothing about that wait is work the user
 * asked for — the destination is knowable the moment the pointer reaches the
 * link.
 *
 * The loader table lives here rather than in routes.ts so that Layout can reach
 * it without importing the router (routes.ts imports Layout). Keeping it keyed
 * by `AppModulePath` makes it exhaustive: adding a module without a loader is a
 * type error, not a tab that quietly stays slow.
 */
type RouteLoader = () => Promise<{ default: ComponentType }>;

const MODULE_ROUTE_LOADERS = {
  "/dzisiaj": () => import("./pages/Dzisiaj"),
  "/zadania": () => import("./pages/Zadania"),
  "/odzywianie": () => import("./pages/Odzywanie"),
  "/sport": () => import("./pages/Sport"),
  "/praca": () => import("./pages/Praca"),
  "/cele": () => import("./pages/Cele"),
  "/sprawy": () => import("./pages/Sprawy"),
  "/notatki": () => import("./pages/Notatki"),
} satisfies Record<AppModulePath, RouteLoader>;

/** Routes reachable from inside a module rather than from the primary navigation. */
const SECONDARY_ROUTE_LOADERS = {
  "/kalendarz": () => import("./pages/Kalendarz"),
  "/podroze": () => import("./pages/Podroze"),
  "/cele/:goalId": () => import("./pages/CelSzczegoly"),
} satisfies Record<string, RouteLoader>;

export const ROUTE_LOADERS = {
  ...MODULE_ROUTE_LOADERS,
  ...SECONDARY_ROUTE_LOADERS,
};

export type PrefetchablePath = keyof typeof ROUTE_LOADERS;

const started = new Set<string>();

function isPrefetchable(path: string): path is PrefetchablePath {
  return path in ROUTE_LOADERS;
}

/**
 * Prefetching costs bandwidth the user did not ask to spend. Skip it when the
 * browser says the connection is metered or slow — a click still works, it just
 * pays the round trip it would have paid anyway.
 */
function prefetchIsWelcome() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return !["slow-2g", "2g"].includes(connection.effectiveType ?? "");
}

/** Warms one route's JS and CSS chunk. Safe to call on every pointer move. */
export function prefetchRoute(path: string) {
  if (!isPrefetchable(path) || started.has(path)) return;
  if (!prefetchIsWelcome()) return;
  started.add(path);
  void ROUTE_LOADERS[path]().catch(() => {
    // A failed prefetch must not poison the route: let the real navigation retry it.
    started.delete(path);
  });
}

/**
 * Warms the remaining primary destinations once the app is idle, one at a time
 * so the prefetch never competes with work the user can see.
 */
export function prefetchModuleRoutesWhenIdle() {
  if (typeof window === "undefined" || !prefetchIsWelcome()) return () => undefined;

  const queue = APP_MODULES.map((module) => module.to).filter((path) => !started.has(path));
  let cancelled = false;
  let handle: number | undefined;

  const schedule = (run: () => void) => {
    const idle = (window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    }).requestIdleCallback;
    handle = idle
      ? idle(run, { timeout: 2_000 })
      : window.setTimeout(run, 300);
  };

  const step = () => {
    if (cancelled) return;
    const next = queue.shift();
    if (!next) return;
    prefetchRoute(next);
    schedule(step);
  };

  schedule(step);

  return () => {
    cancelled = true;
    if (handle === undefined) return;
    const cancelIdle = (window as Window & {
      cancelIdleCallback?: (id: number) => void;
    }).cancelIdleCallback;
    if (cancelIdle) cancelIdle(handle);
    else window.clearTimeout(handle);
  };
}

/** Test seam: the prefetch ledger is module state. */
export function resetRoutePrefetchForTests() {
  started.clear();
}
