import type { HTMLAttributes } from "react";

export interface SectionSurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article";
  padding?: "none" | "dense" | "default" | "spacious";
  elevated?: boolean;
}

export function SectionSurface({
  as: Element = "section",
  padding = "none",
  elevated = false,
  className = "",
  ...props
}: SectionSurfaceProps) {
  const classes = [
    "ui-section-surface",
    `ui-section-surface--${padding}`,
    elevated ? "ui-section-surface--elevated" : "",
    className,
  ].filter(Boolean).join(" ");

  return <Element className={classes} {...props} />;
}
