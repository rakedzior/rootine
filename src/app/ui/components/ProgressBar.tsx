import type { CSSProperties, ReactNode } from "react";
import { ProgressMorph } from "../../experience/MotionValues";

export type ProgressTone = "default" | "success" | "warning" | "danger";
export type ProgressSize = "sm" | "md";

export interface ProgressBarProps {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  min?: number;
  max?: number;
  tone?: ProgressTone;
  size?: ProgressSize;
  /** Rendered next to the track — usually the percentage. */
  valueLabel?: ReactNode;
  /** Accessible name. Omit only when an adjacent visible label already names the bar. */
  label?: string;
  /** Optional spoken value when the visual label is abbreviated or formatted. */
  valueText?: string;
  /** Data-driven series color; use only for visualization/category semantics. */
  color?: string;
  className?: string;
}

/**
 * The shared simple progress indicator. Domain-specific bars and chart geometry stay
 * in their feature when their markup or scale carries additional meaning.
 *
 * The value label sits directly beside the track so the number and the bar read as
 * one unit rather than being pushed to opposite edges of the row.
 */
export function ProgressBar({
  value,
  min = 0,
  max = 100,
  tone = "default",
  size = "md",
  valueLabel,
  label,
  valueText,
  color,
  className = "",
}: ProgressBarProps) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 1;
  const clamped = Number.isFinite(value) ? Math.min(safeMax, Math.max(safeMin, value)) : safeMin;
  const classes = ["ui-progress", `ui-progress--${size}`, tone === "default" ? "" : `ui-progress--${tone}`, className]
    .filter(Boolean).join(" ");

  return (
    <ProgressMorph
      className={classes}
      value={clamped}
      min={safeMin}
      max={safeMax}
      label={label ?? "Postęp"}
      tone={tone}
      valueText={valueText}
      valueLabel={valueLabel}
      style={color ? { "--progress-color": color } as CSSProperties : undefined}
    />
  );
}
