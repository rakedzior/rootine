import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "violet";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  appearance?: "pill" | "plain";
  dot?: boolean;
  leading?: ReactNode;
}

export function Badge({ tone = "neutral", appearance = "pill", dot = false, leading, className = "", children, ...props }: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge--${tone} ${appearance === "plain" ? "ui-badge--plain" : ""} ${className}`.trim()} {...props}>
      {dot && <span className="ui-badge__dot" aria-hidden="true" />}
      {leading}
      {children}
    </span>
  );
}
