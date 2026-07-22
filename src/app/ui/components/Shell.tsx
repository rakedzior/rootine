import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export interface ModuleShellProps extends HTMLAttributes<HTMLDivElement> {
  contextSidebar?: ReactNode;
  detailPanel?: ReactNode;
}

export function ModuleShell({ contextSidebar, detailPanel, children, className, ...props }: ModuleShellProps) {
  return (
    <div className={cx("ui-module-shell", className)} {...props}>
      {contextSidebar}
      {children}
      {detailPanel}
    </div>
  );
}

export interface ModuleMainProps extends HTMLAttributes<HTMLElement> {}

export function ModuleMain({ className, ...props }: ModuleMainProps) {
  return <main className={cx("ui-module-main", className)} {...props} />;
}

export interface ContextSidebarProps extends HTMLAttributes<HTMLElement> {
  label: string;
}

export function ContextSidebar({ label, className, ...props }: ContextSidebarProps) {
  return <aside aria-label={label} className={cx("ui-context-sidebar", className)} {...props} />;
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

export interface WorkspaceToolbarProps extends HTMLAttributes<HTMLDivElement> {}

export function WorkspaceToolbar({ className, ...props }: WorkspaceToolbarProps) {
  return <div className={cx("ui-workspace-toolbar", className)} {...props} />;
}

export interface DetailPanelProps extends HTMLAttributes<HTMLElement> {
  label: string;
}

export function DetailPanel({ label, className, ...props }: DetailPanelProps) {
  return <aside aria-label={label} className={cx("ui-detail-panel", className)} {...props} />;
}
