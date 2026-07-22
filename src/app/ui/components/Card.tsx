import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: "div" | "section" | "article";
  tone?: "card" | "panel" | "input";
  padding?: "none" | "dense" | "default" | "spacious";
  selected?: boolean;
}

export function Card({ as: Element = "div", tone = "card", padding = "default", selected = false, className = "", ...props }: CardProps) {
  const classes = [
    "ui-card",
    tone !== "card" ? `ui-card--${tone}` : "",
    `ui-card--${padding}`,
    selected ? "ui-card--selected" : "",
    className,
  ].filter(Boolean).join(" ");

  return <Element className={classes} {...props} />;
}
