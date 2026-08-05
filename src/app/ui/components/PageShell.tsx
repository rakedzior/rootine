import type { ReactNode } from "react";
import { PageToolbar } from "./PageToolbar";

export type PageWidth = "standard" | "wide" | "fluid";

/**
 * The page frame. It deliberately has no title, subtitle, leading, meta or
 * actions slot: screen identity, filters and local actions belong to
 * ContentHeader inside the workspace.
 *
 * These props used to be accepted and silently discarded, which turned every
 * stale call site into invisible content rather than a build error - a back
 * button, a whole route error message and nine write-failure indicators were
 * lost that way. Do not reintroduce them.
 */
export interface PageShellProps {
  toolbar?: ReactNode;
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
}: PageShellProps) {
  return (
    <div className={`ui-page-shell ui-page-shell--${width} ${className}`.trim()}>
      {toolbar && <PageToolbar>{toolbar}</PageToolbar>}
      <div className={`ui-page-shell__content ${contentClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}
