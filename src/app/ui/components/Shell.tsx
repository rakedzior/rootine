import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { maxWidthQuery } from "../breakpoints";
import { findModuleForPath } from "../../moduleRegistry";
import { useModuleMemory } from "../../experience/moduleMemory";
import { useSubtabTransition } from "../../experience/transitions";
import { LivingDay, type LivingDayArea } from "../../experience/LivingDay";
import type { RootineAreaId } from "../../experience/activeArea";
import { PageShell } from "./PageShell";
import type { PageWidth } from "./PageShell";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const detailPanelFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/**
 * Module frame: ambient scene, optional context sidebar and detail panel around
 * a PageShell.
 *
 * Like PageShell it has no title/header slot. Screen identity belongs to the
 * ContentHeader each module renders inside its own content.
 */
export interface ModuleShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  toolbar?: ReactNode;
  contextSidebar?: ReactNode;
  detailPanel?: ReactNode;
  pageWidth?: PageWidth;
  ambient?: AmbientVariant | AmbientConfig;
  memoryKey?: string;
}

export type AmbientVariant =
  | "quiet"
  | "warm"
  | "cool"
  | "focus"
  | "today"
  | "sport"
  | "goals"
  | "tasks"
  | "habits"
  | "calendar"
  | "nutrition"
  | "work"
  | "affairs"
  | "travel"
  | "notes";

export interface AmbientConfig {
  scene: AmbientVariant;
  progress?: number;
  dayProgress?: number;
  active?: boolean;
  signal?: string | number;
  areas?: readonly LivingDayArea[];
  activeAreaId?: RootineAreaId | null;
  remaining?: number;
}

export interface AmbientSceneProps {
  config: AmbientConfig;
  className?: string;
}

function clampUnit(value: number | undefined) {
  return Math.min(1, Math.max(0, value ?? 0));
}

function ambientDayPhase(dayProgress: number) {
  if (dayProgress < 0.22 || dayProgress >= 0.84) return "night";
  if (dayProgress < 0.36) return "morning";
  if (dayProgress < 0.68) return "day";
  return "evening";
}

export function AmbientScene({ config, className }: AmbientSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(() => (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  ));
  const previousSignal = useRef(config.signal);
  const [visibleSignal, setVisibleSignal] = useState<string | number | null>(null);
  const progress = clampUnit(config.progress);
  const dayProgress = clampUnit(config.dayProgress);
  const style = {
    "--ambient-progress": progress,
    "--ambient-goal-offset": 100 - (progress * 100),
    "--ambient-day-angle": `${-118 + (dayProgress * 236)}deg`,
    "--ambient-day-y": `${8 + (dayProgress * 84)}%`,
    "--ambient-progress-angle": `${progress * 236}deg`,
  } as CSSProperties;

  useEffect(() => {
    const updateVisibility = () => setPaused(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      setPaused(document.visibilityState === "hidden" || !entry.isIntersecting);
    }, { rootMargin: "80px" });
    if (sceneRef.current) observer.observe(sceneRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (Object.is(previousSignal.current, config.signal)) return;
    previousSignal.current = config.signal;
    if (config.signal === undefined) return;
    setVisibleSignal(config.signal);
    const timer = window.setTimeout(() => setVisibleSignal(null), 720);
    return () => window.clearTimeout(timer);
  }, [config.signal]);

  return (
    <div
      ref={sceneRef}
      className={cx("ui-ambient-scene", className)}
      data-scene={config.scene}
      data-active={config.active || undefined}
      data-day-phase={config.scene === "today" ? ambientDayPhase(dayProgress) : undefined}
      data-paused={paused || undefined}
      style={style}
      aria-hidden="true"
    >
      <span className="ui-ambient-scene__wash" />

      {config.scene === "today" && (
        <span className="ui-ambient-today ui-ambient-scene__motif">
          <span className="ui-ambient-today__light">
            <i />
            <b />
          </span>
          <span className="ui-ambient-today__living">
            <LivingDay
              areas={config.areas ?? []}
              dayProgress={dayProgress * 100}
              planProgress={progress * 100}
              remaining={config.remaining}
              activeAreaId={config.activeAreaId}
              variant="ambient"
            />
          </span>
        </span>
      )}

      {config.scene === "sport" && (
        <span className="ui-ambient-sport ui-ambient-scene__motif">
          {Array.from({ length: 7 }, (_, index) => (
            <i key={index} style={{ "--ambient-stream-index": index } as CSSProperties} />
          ))}
          <b />
        </span>
      )}

      {config.scene === "goals" && (
        <span className="ui-ambient-goals ui-ambient-scene__motif">
          <svg viewBox="0 0 320 320" role="presentation">
            <circle className="ui-ambient-goals__orbit" cx="160" cy="160" r="132" pathLength="100" />
            <circle className="ui-ambient-goals__track" cx="160" cy="160" r="108" pathLength="100" />
            <circle className="ui-ambient-goals__progress" cx="160" cy="160" r="108" pathLength="100" />
            <circle className="ui-ambient-goals__inner" cx="160" cy="160" r="66" pathLength="100" />
            <path className="ui-ambient-goals__crosshair" d="M160 38v52M160 230v52M38 160h52M230 160h52" />
            <circle className="ui-ambient-goals__core" cx="160" cy="160" r="8" />
          </svg>
          <i />
        </span>
      )}

      {config.scene === "tasks" && (
        <span className="ui-ambient-tasks ui-ambient-scene__motif">
          <svg viewBox="0 0 720 420" preserveAspectRatio="xMidYMid slice" role="presentation">
            <path className="ui-ambient-tasks__guide" d="M44 334C146 334 132 222 244 222S348 94 458 94s104 114 218 114" pathLength="100" />
            <path className="ui-ambient-tasks__progress" d="M44 334C146 334 132 222 244 222S348 94 458 94s104 114 218 114" pathLength="100" />
            {[{ x: 44, y: 334 }, { x: 244, y: 222 }, { x: 458, y: 94 }, { x: 676, y: 208 }].map((node, index) => (
              <circle key={index} cx={node.x} cy={node.y} r={index === 3 ? 7 : 5} />
            ))}
          </svg>
          {Array.from({ length: 4 }, (_, index) => <i key={index} style={{ "--ambient-lane-index": index } as CSSProperties} />)}
        </span>
      )}

      {config.scene === "habits" && (
        <span className="ui-ambient-habits ui-ambient-scene__motif">
          <svg viewBox="0 0 720 460" preserveAspectRatio="xMidYMid slice" role="presentation">
            <path className="ui-ambient-habits__guide" d="M58 316C150 316 162 176 264 176S386 286 476 286s112-136 190-136" pathLength="100" />
            <path className="ui-ambient-habits__progress" d="M58 316C150 316 162 176 264 176S386 286 476 286s112-136 190-136" pathLength="100" />
            {[
              { x: 58, y: 316 },
              { x: 154, y: 246 },
              { x: 264, y: 176 },
              { x: 370, y: 230 },
              { x: 476, y: 286 },
              { x: 570, y: 222 },
              { x: 666, y: 150 },
            ].map((node, index) => (
              <g key={index} className="ui-ambient-habits__day" style={{ "--ambient-habit-index": index } as CSSProperties}>
                <circle className="ui-ambient-habits__halo" cx={node.x} cy={node.y} r="17" />
                <circle className="ui-ambient-habits__node" cx={node.x} cy={node.y} r={index === 6 ? 7 : 5} />
              </g>
            ))}
          </svg>
          <i />
        </span>
      )}

      {config.scene === "calendar" && (
        <span className="ui-ambient-calendar ui-ambient-scene__motif">
          <span className="ui-ambient-calendar__grid" />
          <i className="ui-ambient-calendar__now" />
          <b className="ui-ambient-calendar__marker" />
        </span>
      )}

      {config.scene === "nutrition" && (
        <span className="ui-ambient-nutrition ui-ambient-scene__motif">
          {Array.from({ length: 5 }, (_, index) => <i key={index} style={{ "--ambient-contour-index": index } as CSSProperties} />)}
          <b />
        </span>
      )}

      {config.scene === "work" && (
        <span className="ui-ambient-work ui-ambient-scene__motif">
          {Array.from({ length: 7 }, (_, index) => <i key={index} style={{ "--ambient-work-index": index } as CSSProperties} />)}
          <b />
        </span>
      )}

      {config.scene === "affairs" && (
        <span className="ui-ambient-affairs ui-ambient-scene__motif">
          {Array.from({ length: 5 }, (_, index) => <i key={index} style={{ "--ambient-sheet-index": index } as CSSProperties} />)}
          <b />
        </span>
      )}

      {config.scene === "travel" && (
        <span className="ui-ambient-travel ui-ambient-scene__motif">
          <svg viewBox="0 0 720 520" preserveAspectRatio="xMidYMid slice" role="presentation">
            <path className="ui-ambient-travel__contour" d="M40 384c96-92 196-98 276-48s172 58 350-32" />
            <path className="ui-ambient-travel__contour" d="M14 438c116-102 218-122 314-72s190 66 378-38" />
            <path className="ui-ambient-travel__contour" d="M80 312c78-74 154-72 226-30s154 38 316-40" />
            <path className="ui-ambient-travel__contour" d="M176 238c52-48 104-44 154-16s112 24 226-32" />
            <path className="ui-ambient-travel__route" d="M54 402C172 366 186 242 306 268s162-96 346-156" pathLength="100" />
            <circle className="ui-ambient-travel__origin" cx="54" cy="402" r="6" />
            <circle className="ui-ambient-travel__destination" cx="652" cy="112" r="9" />
          </svg>
        </span>
      )}

      {config.scene === "notes" && (
        <span className="ui-ambient-notes ui-ambient-scene__motif">
          {Array.from({ length: 6 }, (_, index) => <i key={index} style={{ "--ambient-stroke-index": index } as CSSProperties} />)}
          <b />
        </span>
      )}

      {visibleSignal !== null && (
        <span key={String(visibleSignal)} className="ui-ambient-scene__signal" />
      )}
    </div>
  );
}

export function ModuleShell({
  toolbar,
  contextSidebar,
  detailPanel,
  pageWidth = "standard",
  ambient,
  memoryKey,
  children,
  className,
  ...props
}: ModuleShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const ambientConfig = typeof ambient === "string" ? { scene: ambient } : ambient;
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  const resolvedMemoryKey = memoryKey ?? findModuleForPath(pathname)?.id ?? pathname;
  const childItems = Children.toArray(children);
  const inlineModuleSidebar = childItems.find((child) => (
    isValidElement(child) && child.type === ModuleSidebar
  ));
  const resolvedModuleSidebar = contextSidebar ?? inlineModuleSidebar;
  const contentChildren = contextSidebar || inlineModuleSidebar
    ? childItems.filter((child) => child !== inlineModuleSidebar)
    : children;
  useModuleMemory(shellRef, resolvedMemoryKey);

  return (
    <div
      ref={shellRef}
      className={cx("ui-module-shell", Boolean(ambientConfig) && "ui-module-shell--ambient", className)}
      data-page-width={pageWidth}
      data-ambient={ambientConfig?.scene}
      data-module-memory={resolvedMemoryKey}
      {...props}
    >
      {ambientConfig && <AmbientScene config={ambientConfig} />}
      <WorkspaceLayout
        className="ui-module-shell__body"
        moduleSidebar={resolvedModuleSidebar}
      >
        <MainContent>
          <PageShell toolbar={toolbar} width={pageWidth}>
            {contentChildren}
          </PageShell>
        </MainContent>
        {detailPanel}
      </WorkspaceLayout>
    </div>
  );
}

export interface WorkspaceLayoutProps extends HTMLAttributes<HTMLDivElement> {
  moduleSidebar?: ReactNode;
}

export function WorkspaceLayout({ moduleSidebar, children, className, ...props }: WorkspaceLayoutProps) {
  return (
    <div className={cx("ui-workspace-layout", Boolean(moduleSidebar) && "is-with-module-sidebar", className)} {...props}>
      {moduleSidebar}
      {children}
    </div>
  );
}

export type MainContentProps = HTMLAttributes<HTMLElement>;

export function MainContent({ className, children, ...props }: MainContentProps) {
  return <main className={cx("ui-main-content", className)} {...props}>{children}</main>;
}

export type ModuleMainProps = HTMLAttributes<HTMLDivElement> & { transitionKey?: string };

export function ModuleMain({ className, transitionKey, ...props }: ModuleMainProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  useSubtabTransition(mainRef, transitionKey);
  return <div ref={mainRef} className={cx("ui-module-main", className)} {...props} />;
}

export interface ModuleSidebarProps extends HTMLAttributes<HTMLElement> {
  label: string;
}

/** @deprecated Use ModuleSidebarProps. */
export type ContextSidebarProps = ModuleSidebarProps;

export function ModuleSidebar({
  label,
  className,
  children,
  ...props
}: ModuleSidebarProps) {
  return (
    <aside
      aria-label={label}
      className={cx("ui-context-sidebar", "ui-module-sidebar", className)}
      {...props}
    >
      {children}
    </aside>
  );
}

/** @deprecated Use ModuleSidebar. */
export const ContextSidebar = ModuleSidebar;

export interface ContextNavItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
}

export function ContextNavItem({ active = false, icon, label, meta, className, type = "button", ...props }: ContextNavItemProps) {
  return (
    <button
      type={type}
      aria-current={active ? "page" : undefined}
      className={cx("context-nav-item", className)}
      {...props}
    >
      {icon && <span className="context-nav-item__icon" aria-hidden="true">{icon}</span>}
      <span className="context-nav-item__label">{label}</span>
      {meta !== undefined && <span className="context-nav-item__meta">{meta}</span>}
    </button>
  );
}

export interface DetailPanelProps extends HTMLAttributes<HTMLElement> {
  label: string;
  onDismiss?: () => void;
}

export const DetailPanel = forwardRef<HTMLElement, DetailPanelProps>(function DetailPanel(
  {
    label,
    onDismiss,
    className,
    role,
    tabIndex,
    "aria-label": ariaLabel,
    ...props
  },
  forwardedRef,
) {
  const panelRef = useRef<HTMLElement>(null);
  const onDismissRef = useRef(onDismiss);
  const isResponsiveDrawer = useMediaQuery(maxWidthQuery("detail"));
  const managedDrawer = isResponsiveDrawer && Boolean(onDismiss);

  useImperativeHandle(forwardedRef, () => panelRef.current as HTMLElement);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!managedDrawer) return;
    const panel = panelRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const isTopmostDrawer = () => {
      const drawers = Array.from(document.querySelectorAll<HTMLElement>(".ui-detail-panel[data-drawer-managed='true']"));
      return drawers.at(-1) === panel;
    };
    const isOwnedOverlayTarget = (target: EventTarget | null) => target instanceof Element
      && Boolean(target.closest(".ui-modal, .ui-date-picker, .ui-select-menu"));
    const frame = requestAnimationFrame(() => {
      const initialFocus = panel?.querySelector<HTMLElement>("[autofocus], [data-autofocus]")
        ?? panel?.querySelector<HTMLElement>(detailPanelFocusableSelector)
        ?? panel;
      initialFocus?.focus();
    });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        !panel
        || !isTopmostDrawer()
        || event.defaultPrevented
        || document.querySelector(".ui-modal")
        || isOwnedOverlayTarget(event.target)
      ) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onDismissRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(detailPanelFocusableSelector))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (
        !panel
        || !isTopmostDrawer()
        || document.querySelector(".ui-modal")
        || panel.contains(event.target as Node)
        || isOwnedOverlayTarget(event.target)
      ) return;
      const fallback = panel.querySelector<HTMLElement>(detailPanelFocusableSelector) ?? panel;
      fallback.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      if (previousFocus?.isConnected && !previousFocus.matches(":disabled")) previousFocus.focus();
    };
  }, [managedDrawer]);

  return (
    <>
      {managedDrawer && (
        <div
          className="ui-detail-panel-backdrop"
          aria-hidden="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onDismissRef.current?.();
          }}
        />
      )}
      <aside
        ref={panelRef}
        role={managedDrawer ? "dialog" : role}
        aria-modal={managedDrawer ? "true" : undefined}
        aria-label={ariaLabel ?? label}
        tabIndex={managedDrawer ? -1 : tabIndex}
        data-drawer-managed={managedDrawer ? "true" : undefined}
        className={cx("ui-detail-panel", className)}
        {...props}
      />
    </>
  );
});
