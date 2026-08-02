/* eslint-disable react-refresh/only-export-components -- Transition hooks and wrappers intentionally share the same motion policy. */
import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useLocation } from "react-router";
import { APP_MODULES, findModuleForPath } from "../moduleRegistry";
import { useEffectiveReducedMotion } from "./useReducedMotion";

const VIEW_ORDER = [
  "overview", "dzis", "today", "all", "wszystkie", "skrzynka", "jutro", "7dni",
  "nawyki", "cycle", "templates", "history", "analysis", "list", "board", "calendar",
  "matters", "oneTime", "payments", "subscriptions", "documents", "vehicles", "budget", "jdg",
] as const;

function viewRank(value: string | null) {
  const index = VIEW_ORDER.indexOf(value as typeof VIEW_ORDER[number]);
  return index < 0 ? 0 : index;
}

function transitionSlice(search: string) {
  const params = new URLSearchParams(search);
  return ["widok", "sekcja", "uklad", "tydzien"]
    .map((key) => `${key}:${params.get(key) ?? ""}`)
    .join("|");
}

function transitionRank(search: string) {
  const params = new URLSearchParams(search);
  const namedView = params.get("widok") ?? params.get("sekcja");
  if (namedView) return viewRank(namedView);
  const week = Number(params.get("tydzien"));
  return Number.isFinite(week) ? week : 0;
}

export function RouteTransition({ children, inactive = false }: { children: ReactNode; inactive?: boolean }) {
  const location = useLocation();
  const reduced = useEffectiveReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const previousPath = useRef(location.pathname);
  const previousModule = useRef(findModuleForPath(location.pathname)?.id);
  const module = findModuleForPath(location.pathname);
  const announcement = module?.label ?? "Widok Rootine";

  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    const element = rootRef.current;
    const previousIndex = APP_MODULES.findIndex((item) => item.id === previousModule.current);
    const nextIndex = APP_MODULES.findIndex((item) => item.id === module?.id);
    const direction = nextIndex >= previousIndex ? 1 : -1;
    const moduleChanged = previousModule.current !== module?.id;
    previousPath.current = location.pathname;
    previousModule.current = module?.id;

    if (element && typeof element.animate === "function") {
      element.getAnimations().forEach((animation) => animation.cancel());
      element.animate(
        reduced
          ? [{ opacity: 0.88 }, { opacity: 1 }]
          : moduleChanged
            ? [
              { opacity: 0.72, transform: `translate3d(${direction * 12}px, 0, 0)` },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ]
            : [
              { opacity: 0.84, transform: "translate3d(0, 6px, 0)" },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
        {
          duration: reduced ? 90 : moduleChanged ? 420 : 240,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        },
      );
    }

    const focusFrame = window.requestAnimationFrame(() => {
      if (inactive) return;
      const heading = element?.querySelector<HTMLElement>("h1");
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [inactive, location.pathname, module?.id, reduced]);

  return (
    <div
      ref={rootRef}
      className="rootine-route-transition"
      data-route-module={module?.id}
      aria-hidden={inactive || undefined}
      inert={inactive || undefined}
    >
      <span className="ui-sr-only" role="status" aria-live="polite">{announcement}</span>
      {children}
    </div>
  );
}

export function useSubtabTransition(elementRef: React.RefObject<HTMLElement | null>, explicitKey?: string) {
  const reduced = useEffectiveReducedMotion();
  const search = typeof window === "undefined" ? "" : window.location.search;
  const key = explicitKey ?? transitionSlice(search);
  const rank = useMemo(() => {
    if (!explicitKey) return transitionRank(search);
    const numeric = Number(explicitKey);
    if (Number.isFinite(numeric)) return numeric;
    const dated = Date.parse(explicitKey);
    return Number.isNaN(dated) ? transitionRank(search) : dated;
  }, [explicitKey, search]);
  const previous = useRef({ key, rank });

  useEffect(() => {
    if (previous.current.key === key) return;
    const element = elementRef.current;
    const direction = rank >= previous.current.rank ? 1 : -1;
    previous.current = { key, rank };
    if (!element || typeof element.animate !== "function") return;
    element.getAnimations().forEach((animation) => animation.cancel());
    element.animate(
      reduced
        ? [{ opacity: 0.9 }, { opacity: 1 }]
        : [
          { opacity: 0.78, transform: `translate3d(${direction * 8}px, 0, 0)` },
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
        ],
      { duration: reduced ? 90 : 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [elementRef, key, rank, reduced]);
}

export function SubtabTransition({
  children,
  transitionKey,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; transitionKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useSubtabTransition(ref, transitionKey);
  return <div ref={ref} className={`rootine-subtab-transition ${className}`.trim()} {...props}>{children}</div>;
}

export function SharedElement({
  id,
  children,
  className = "",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rootine-shared-element ${className}`.trim()}
      data-shared-element={id}
      style={{ viewTransitionName: `rootine-${id.replace(/[^a-z0-9_-]/gi, "-")}` } as CSSProperties}
    >
      {children}
    </span>
  );
}

export const ModuleTransition = RouteTransition;
