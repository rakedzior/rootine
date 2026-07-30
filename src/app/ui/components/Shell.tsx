import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { maxWidthQuery } from "../breakpoints";

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

export interface ModuleShellProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  contextSidebar?: ReactNode;
  detailPanel?: ReactNode;
  pageWidth?: PageWidth;
}

export type PageWidth = "reading" | "standard" | "wide" | "canvas";

export function ModuleShell({
  header,
  contextSidebar,
  detailPanel,
  pageWidth = "standard",
  children,
  className,
  ...props
}: ModuleShellProps) {
  return (
    <div
      className={cx("ui-module-shell", className)}
      data-page-width={pageWidth}
      {...props}
    >
      {header && <div className="ui-module-shell__header">{header}</div>}
      <div className="ui-module-shell__body">
        {contextSidebar}
        {children}
        {detailPanel}
      </div>
    </div>
  );
}

export type ModuleMainProps = HTMLAttributes<HTMLElement>;

export function ModuleMain({ className, ...props }: ModuleMainProps) {
  return <main className={cx("ui-module-main", className)} {...props} />;
}

export interface ContextSidebarProps extends HTMLAttributes<HTMLElement> {
  label: string;
  collapsible?: boolean;
  storageKey?: string;
}

export function ContextSidebar({
  label,
  collapsible = true,
  storageKey,
  className,
  children,
  ...props
}: ContextSidebarProps) {
  const preferenceKey = storageKey ?? `rootine.context-sidebar.${encodeURIComponent(label)}.collapsed`;
  const legacyPreferenceKey = preferenceKey.startsWith("rootine.")
    ? `routine.${preferenceKey.slice("rootine.".length)}`
    : null;
  const [collapsed, setCollapsed] = useState(() => {
    if (!collapsible || typeof window === "undefined") return false;
    try {
      const saved = window.localStorage.getItem(preferenceKey);
      const legacySaved = saved === null && legacyPreferenceKey
        ? window.localStorage.getItem(legacyPreferenceKey)
        : null;
      if (saved === null && legacySaved !== null) {
        try {
          window.localStorage.setItem(preferenceKey, legacySaved);
        } catch {
          // Keep using the legacy preference if the new key cannot be written yet.
        }
      }
      return (saved ?? legacySaved) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!collapsible) return;
    try {
      window.localStorage.setItem(preferenceKey, String(collapsed));
    } catch {
      // The preference is optional; navigation remains available without storage.
    }
  }, [collapsed, collapsible, preferenceKey]);

  const CollapseIcon = collapsed ? ChevronRight : ChevronLeft;

  return (
    <aside
      aria-label={label}
      className={cx("ui-context-sidebar", collapsed && "is-collapsed", className)}
      data-collapsed={collapsed || undefined}
      {...props}
    >
      {collapsible && (
        <button
          type="button"
          className="ui-context-sidebar__collapse"
          aria-label={collapsed ? `Rozwiń: ${label}` : `Zwiń: ${label}`}
          title={collapsed ? `Rozwiń: ${label}` : `Zwiń: ${label}`}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((current) => !current)}
        >
          <CollapseIcon size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
      {children}
    </aside>
  );
}

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

export type WorkspaceToolbarProps = HTMLAttributes<HTMLDivElement>;

export function WorkspaceToolbar({ className, ...props }: WorkspaceToolbarProps) {
  return <div className={cx("ui-workspace-toolbar", className)} {...props} />;
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
