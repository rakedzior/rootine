import type { ReactNode } from "react";

export type ProgressTone = "default" | "success" | "warning" | "danger";
export type ProgressSize = "sm" | "md";

export interface ProgressBarProps {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  tone?: ProgressTone;
  size?: ProgressSize;
  /** Rendered next to the track — usually the percentage. */
  valueLabel?: ReactNode;
  /** Accessible name. Omit only when an adjacent visible label already names the bar. */
  label?: string;
  className?: string;
}

/**
 * The single progress indicator. Replaces six independent implementations across
 * goals, work, travel, sport, JDG and today.
 *
 * The value label sits directly beside the track so the number and the bar read as
 * one unit rather than being pushed to opposite edges of the row.
 */
export function ProgressBar({
  value,
  tone = "default",
  size = "md",
  valueLabel,
  label,
  className = "",
}: ProgressBarProps) {
  const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const classes = ["ui-progress", `ui-progress--${size}`, tone === "default" ? "" : `ui-progress--${tone}`, className]
    .filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div
        className="ui-progress__track"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="ui-progress__fill" style={{ transform: `scaleX(${clamped / 100})` }} />
      </div>
      {valueLabel !== undefined && <span className="ui-progress__value">{valueLabel}</span>}
    </div>
  );
}
