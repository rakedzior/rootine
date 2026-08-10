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
  memoryKey?: string;
}

export type AmbientVariant = "sport";

export interface AmbientConfig {
  scene: AmbientVariant;
  progress?: number;
  active?: boolean;
  signal?: string | number;
}

export interface AmbientSceneProps {
  config: AmbientConfig;
  className?: string;
}

function clampUnit(value: number | undefined) {
  return Math.min(1, Math.max(0, value ?? 0));
}

/**
 * The one ambient scene that reaches the screen: the active training session
 * draws it on its own opaque surface.
 *
 * Module shells used to render a scene too, behind ten different motifs. None
 * was ever visible: `.ui-main-content` paints the canvas colour across the
 * whole column, and the rule meant to punch through it targets a child two
 * levels further down than the one the DOM actually has. Hiding the scene
 * changed zero pixels on eight of ten routes, so the motifs, their stylesheet
 * and the per-page `ambient` configuration were deleted rather than repaired.
 */
export function AmbientScene({ config, className }: AmbientSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(() => (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  ));
  const previousSignal = useRef(config.signal);
  const [visibleSignal, setVisibleSignal] = useState<string | number | null>(null);
  const progress = clampUnit(config.progress);
  const style = {
    "--ambient-progress": progress,
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
      data-paused={paused || undefined}
      style={style}
      aria-hidden="true"
    >
      <span className="ui-ambient-sport ui-ambient-scene__motif">
        {Array.from({ length: 7 }, (_, index) => (
          <i key={index} style={{ "--ambient-stream-index": index } as CSSProperties} />
        ))}
      </span>

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
  memoryKey,
  children,
  className,
  ...props
}: ModuleShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
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
      className={cx("ui-module-shell", className)}
      data-page-width={pageWidth}
      data-module-memory={resolvedMemoryKey}
      {...props}
    >
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

export interface ContextNavItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  depth?: 0 | 1;
  icon?: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
}

export function ContextNavItem({ active = false, depth = 0, icon, label, meta, className, type = "button", ...props }: ContextNavItemProps) {
  return (
    <button
      type={type}
      aria-current={active ? "page" : undefined}
      className={cx("context-nav-item", depth === 1 && "context-nav-item--nested", className)}
      {...props}
    >
      {icon && <span className="context-nav-item__icon" aria-hidden="true">{icon}</span>}
      <span className="context-nav-item__label">{label}</span>
      {meta !== undefined && <span className="context-nav-item__meta">{meta}</span>}
    </button>
  );
}

export interface ContextNavGroupProps extends HTMLAttributes<HTMLElement> {
  label: ReactNode;
}

/**
 * A semantic group inside a module sidebar. Modules provide their own destinations,
 * while spacing and label hierarchy stay identical across the product.
 */
export function ContextNavGroup({ label, children, className, ...props }: ContextNavGroupProps) {
  return (
    <section className={cx("context-nav-group", className)} {...props}>
      <h2 className="context-nav-group__label">{label}</h2>
      <div className="context-nav-group__items">{children}</div>
    </section>
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
