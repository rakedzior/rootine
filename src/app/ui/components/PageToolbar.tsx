import type { HTMLAttributes, ReactNode } from "react";

export interface PageToolbarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function PageToolbar({ children, className = "", ...props }: PageToolbarProps) {
  return (
    <div className={`ui-page-toolbar ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
