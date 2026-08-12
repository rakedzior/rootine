import { useId, useRef, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";

export type TelemetryTone = "neutral" | "primary" | "success" | "warning" | "danger";

export type TelemetrySegment = {
  id: string;
  label: string;
  value: number;
  max?: number;
  valueLabel?: ReactNode;
  accessibleValue?: string;
  description?: ReactNode;
  tone?: TelemetryTone;
  weight?: number;
  to?: string;
  disabled?: boolean;
};

export type TelemetryInteractionSource = "pointer" | "focus";

export type TelemetryBarProps = {
  segments: readonly TelemetrySegment[];
  label: string;
  activeSegmentId?: string | null;
  className?: string;
  showLabels?: boolean;
  onActiveSegmentChange?: (
    segmentId: string | null,
    source: TelemetryInteractionSource,
  ) => void;
  onSegmentActivate?: (segment: TelemetrySegment) => void;
};

type SegmentStyle = CSSProperties & {
  "--telemetry-segment-weight": number;
  "--telemetry-segment-progress": number;
};

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function defaultAccessibleValue(segment: TelemetrySegment) {
  if (segment.accessibleValue) return segment.accessibleValue;
  if (typeof segment.valueLabel === "string" || typeof segment.valueLabel === "number") {
    return String(segment.valueLabel);
  }
  const safeValue = Number.isFinite(segment.value) ? segment.value : 0;
  return segment.max !== undefined && Number.isFinite(segment.max)
    ? `${safeValue} z ${segment.max}`
    : String(safeValue);
}

export function TelemetryBar({
  segments,
  label,
  activeSegmentId = null,
  className = "",
  showLabels = false,
  onActiveSegmentChange,
  onSegmentActivate,
}: TelemetryBarProps) {
  const tooltipPrefix = useId().replaceAll(":", "");
  const hoveredSegment = useRef<string | null>(null);
  const focusedSegment = useRef<string | null>(null);
  const classes = [
    "telemetry-bar",
    activeSegmentId ? "has-active-segment" : "",
    showLabels ? "telemetry-bar--labeled" : "",
    className,
  ].filter(Boolean).join(" ");

  const emitActiveSegment = (source: TelemetryInteractionSource) => {
    onActiveSegmentChange?.(focusedSegment.current ?? hoveredSegment.current, source);
  };
  const handlePointerEnter = (segmentId: string) => {
    hoveredSegment.current = segmentId;
    emitActiveSegment("pointer");
  };
  const handlePointerLeave = (segmentId: string) => {
    if (hoveredSegment.current === segmentId) hoveredSegment.current = null;
    emitActiveSegment("pointer");
  };
  const handleFocus = (segmentId: string) => {
    focusedSegment.current = segmentId;
    emitActiveSegment("focus");
  };
  const handleBlur = (segmentId: string) => {
    if (focusedSegment.current === segmentId) focusedSegment.current = null;
    emitActiveSegment("focus");
  };

  return (
    <div className={classes} data-active-segment={activeSegmentId ?? undefined}>
      <div className="telemetry-bar__track" role="group" aria-label={label}>
        {segments.map((segment) => {
          const safeMax = Number.isFinite(segment.max) && Number(segment.max) > 0
            ? Number(segment.max)
            : 100;
          const progress = clamp(segment.value / safeMax * 100, 0, 100);
          const accessibleValue = defaultAccessibleValue(segment);
          const tooltipId = `${tooltipPrefix}-telemetry-${segment.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          const isActive = activeSegmentId === segment.id;
          const segmentClassName = [
            "telemetry-bar__segment",
            `telemetry-bar__segment--${segment.tone ?? "neutral"}`,
            isActive ? "is-active" : "",
            activeSegmentId && !isActive ? "is-muted" : "",
            segment.disabled ? "is-disabled" : "",
          ].filter(Boolean).join(" ");
          const segmentStyle: SegmentStyle = {
            "--telemetry-segment-weight": Math.max(0.1, segment.weight ?? 1),
            "--telemetry-segment-progress": progress / 100,
          };
          const content = (
            <>
              <span className="telemetry-bar__meter" aria-hidden="true">
                <span
                  className="telemetry-bar__fill"
                  style={{ transform: `scaleX(${progress / 100})` }}
                />
              </span>
              <span className={showLabels ? "telemetry-bar__caption" : "ui-sr-only"}>
                <span className="telemetry-bar__label">{segment.label}</span>
                <span className="telemetry-bar__value">{segment.valueLabel ?? accessibleValue}</span>
              </span>
              <span className="telemetry-bar__tooltip" id={tooltipId} role="tooltip">
                <strong>{segment.label}</strong>
                <span>{segment.description ?? accessibleValue}</span>
              </span>
            </>
          );
          const commonProps = {
            className: segmentClassName,
            style: segmentStyle,
            "data-segment": segment.id,
            "data-progress": progress.toFixed(1),
            "aria-label": `${segment.label}: ${accessibleValue}`,
            "aria-describedby": tooltipId,
            onPointerEnter: () => handlePointerEnter(segment.id),
            onPointerLeave: () => handlePointerLeave(segment.id),
            onFocus: () => handleFocus(segment.id),
            onBlur: () => handleBlur(segment.id),
          };

          if (segment.to && !segment.disabled) {
            return (
              <Link
                key={segment.id}
                {...commonProps}
                to={segment.to}
                viewTransition
                onClick={() => onSegmentActivate?.(segment)}
              >
                {content}
              </Link>
            );
          }

          if (onSegmentActivate) {
            return (
              <button
                key={segment.id}
                {...commonProps}
                type="button"
                disabled={segment.disabled}
                onClick={() => onSegmentActivate(segment)}
              >
                {content}
              </button>
            );
          }

          return (
            <span
              key={segment.id}
              {...commonProps}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={safeMax}
              aria-valuenow={clamp(segment.value, 0, safeMax)}
              aria-disabled={segment.disabled ? "true" : undefined}
            >
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}
