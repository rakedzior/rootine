import type { HTMLAttributes } from "react";

export interface FilterBarProps extends HTMLAttributes<HTMLDivElement> {
  columns?: 2 | 3 | 4 | 5;
}

export function FilterBar({ columns = 5, className = "", ...props }: FilterBarProps) {
  return (
    <div
      className={["ui-filter-bar", `ui-filter-bar--${columns}`, className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
