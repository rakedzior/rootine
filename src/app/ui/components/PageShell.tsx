import type { ReactNode } from "react";
import { PageToolbar } from "./PageToolbar";

export type PageWidth = "standard" | "wide" | "fluid";

export interface PageShellProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  /** Compatibility slot for embedded renderers while they move to explicit header props. */
  header?: ReactNode;
  width?: PageWidth;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PageShell({
  toolbar,
  width = "standard",
  children,
  className = "",
  contentClassName = "",
  ..._legacyHeaderProps
}: PageShellProps) {
  return (
    <div className={`ui-page-shell ui-page-shell--${width} ${className}`.trim()}>
      {/*
       * The global page header is intentionally absent. Screen identity,
       * filters and local actions belong to ContentHeader inside the workspace;
       * keeping this compatibility slot prevents older route call sites from
       * reintroducing the removed top bar.
       */}
      {toolbar && <PageToolbar>{toolbar}</PageToolbar>}
      <div className={`ui-page-shell__content ${contentClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}
