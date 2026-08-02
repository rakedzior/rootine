import { useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router";
import type { RootineAreaId } from "./activeArea";

const CENTER = 160;
const OUTER_RADIUS = 145;
const AREA_RADIUS = 116;
const PLAN_RADIUS = 82;
const FOREGROUND_VIEWBOX = "34 34 252 252";
const EXPANDED_AREA_END = 360;
const FULL_CIRCLE_THRESHOLD = 359.99;

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function polarPoint(radius: number, angle: number) {
  const radians = (angle - 90) * Math.PI / 180;
  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
}

function describeArc(radius: number, startAngle: number, endAngle: number) {
  const start = polarPoint(radius, endAngle);
  const end = polarPoint(radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
  ].join(" ");
}

type RingArcProps = {
  className: string;
  startAngle: number;
  endAngle: number;
  pathLength?: number;
};

function RingArc({ className, startAngle, endAngle, pathLength }: RingArcProps) {
  if (endAngle - startAngle >= FULL_CIRCLE_THRESHOLD) {
    return (
      <circle
        className={className}
        cx={CENTER}
        cy={CENTER}
        r={AREA_RADIUS}
        pathLength={pathLength}
      />
    );
  }

  return (
    <path
      className={className}
      d={describeArc(AREA_RADIUS, startAngle, endAngle)}
      pathLength={pathLength}
    />
  );
}

function circleDash(progress: number) {
  return {
    strokeDasharray: 100,
    strokeDashoffset: 100 - clamp(progress, 0, 100),
  };
}

export type LivingDayAreaStatus = "active" | "attention" | "complete" | "empty";

export type LivingDayAreaBreakdown = {
  /** Wszystkie elementy należące do dzisiejszego planu, także już wykonane. */
  plannedToday: number;
  /** Wykonane elementy z dzisiejszego planu. */
  completedToday: number;
  /** Niewykonane elementy sprzed dzisiaj; nie zawierają się w plannedToday. */
  overdue: number;
};

export type LivingDayArea = {
  id: RootineAreaId;
  label: string;
  to: string;
  completed?: number;
  total?: number;
  remaining?: number;
  progress?: number;
  /** Relative share of the circle. Defaults to an equal share. */
  weight?: number;
  /** Activity strength from 0 to 1. Defaults to the area's relative item count. */
  intensity?: number;
  status?: LivingDayAreaStatus;
  valueLabel?: string;
  breakdown?: LivingDayAreaBreakdown;
};

export type LivingDayInteractionSource = "pointer" | "focus";

export type LivingDayProps = {
  areas: readonly LivingDayArea[];
  dayProgress: number;
  planProgress?: number;
  remaining?: number;
  summaryLabel?: ReactNode;
  activeAreaId?: RootineAreaId | null;
  variant?: "foreground" | "ambient";
  ariaLabel?: string;
  className?: string;
  onActiveAreaChange?: (
    areaId: RootineAreaId | null,
    source: LivingDayInteractionSource,
  ) => void;
};

type Segment = {
  area: LivingDayArea;
  start: number;
  end: number;
  progress: number;
  remaining: number;
  status: LivingDayAreaStatus;
  intensity: number;
  breakdown: (LivingDayAreaBreakdown & {
    remainingToday: number;
    compositionTotal: number;
  }) | null;
};

function getStatus(area: LivingDayArea, remaining: number): LivingDayAreaStatus {
  if (area.status) return area.status;
  const total = Math.max(0, area.total ?? 0);
  if (total === 0) return "empty";
  return remaining <= 0 ? "complete" : "active";
}

export function LivingDay({
  areas,
  dayProgress,
  planProgress,
  remaining,
  summaryLabel,
  activeAreaId = null,
  variant = "foreground",
  ariaLabel = "Bilans dnia według obszarów",
  className = "",
  onActiveAreaChange,
}: LivingDayProps) {
  const hoveredArea = useRef<RootineAreaId | null>(null);
  const focusedArea = useRef<RootineAreaId | null>(null);
  const interactive = variant === "foreground";
  const showProgressRings = variant === "ambient";

  const segments = useMemo<Segment[]>(() => {
    if (areas.length === 0) return [];
    const weights = areas.map((area) => Math.max(0.1, area.weight ?? 1));
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const maximumCount = Math.max(1, ...areas.map((area) => Math.max(0, area.total ?? 0)));
    const gap = Math.min(5, 24 / areas.length);
    const availableAngle = 360 - gap * areas.length;
    let cursor = 0;

    return areas.map((area, index) => {
      const arcLength = availableAngle * weights[index] / weightTotal;
      const start = cursor + gap / 2;
      const end = start + arcLength;
      cursor += arcLength + gap;
      const total = Math.max(0, area.total ?? 0);
      const completed = clamp(area.completed ?? 0, 0, total || Number.MAX_SAFE_INTEGER);
      const breakdown = area.breakdown
        ? (() => {
            const plannedToday = Math.max(0, area.breakdown.plannedToday);
            const completedToday = clamp(area.breakdown.completedToday, 0, plannedToday);
            const overdue = Math.max(0, area.breakdown.overdue);
            const remainingToday = Math.max(0, plannedToday - completedToday);
            return {
              plannedToday,
              completedToday,
              overdue,
              remainingToday,
              compositionTotal: plannedToday + overdue,
            };
          })()
        : null;
      const areaRemaining = breakdown
        ? breakdown.remainingToday + breakdown.overdue
        : Math.max(0, area.remaining ?? Math.max(0, total - completed));
      const progress = breakdown
        ? (breakdown.plannedToday > 0
            ? breakdown.completedToday / breakdown.plannedToday * 100
            : 0)
        : clamp(
            area.progress ?? (total > 0 ? completed / total * 100 : 0),
            0,
            100,
          );

      return {
        area,
        start,
        end,
        progress,
        remaining: areaRemaining,
        status: getStatus(area, areaRemaining),
        intensity: clamp(area.intensity ?? total / maximumCount, 0, 1),
        breakdown,
      };
    });
  }, [areas]);

  const derivedRemaining = segments.reduce((sum, segment) => sum + segment.remaining, 0);
  const remainingValue = Math.max(0, remaining ?? derivedRemaining);
  const derivedPlanProgress = segments.length > 0
    ? segments.reduce((sum, segment) => sum + segment.progress, 0) / segments.length
    : 0;
  const safePlanProgress = clamp(planProgress ?? derivedPlanProgress, 0, 100);
  const activeSegment = activeAreaId
    ? segments.find((segment) => segment.area.id === activeAreaId)
    : undefined;
  const activeBreakdown = activeSegment?.breakdown;
  const centerValue = activeSegment?.status === "empty"
    ? "—"
    : activeSegment?.remaining ?? remainingValue;
  const centerSummary = activeSegment?.status === "empty"
    ? "brak planu"
    : activeSegment
      ? "pozostało"
      : typeof summaryLabel === "string" || typeof summaryLabel === "number"
        ? summaryLabel
        : "pozostało";
  const centerDetail = activeSegment?.status === "empty"
    ? null
    : `${Math.round(activeSegment?.progress ?? safePlanProgress)}% wykonane`;
  const classes = [
    "living-day",
    `living-day--${variant}`,
    interactive && activeSegment ? "has-active-area" : "",
    className,
  ].filter(Boolean).join(" ");

  const emitActiveArea = (source: LivingDayInteractionSource) => {
    onActiveAreaChange?.(focusedArea.current ?? hoveredArea.current, source);
  };

  const handlePointerEnter = (areaId: RootineAreaId) => {
    hoveredArea.current = areaId;
    emitActiveArea("pointer");
  };
  const handlePointerLeave = (areaId: RootineAreaId) => {
    if (hoveredArea.current === areaId) hoveredArea.current = null;
    emitActiveArea("pointer");
  };
  const handleFocus = (areaId: RootineAreaId) => {
    focusedArea.current = areaId;
    emitActiveArea("focus");
  };
  const handleBlur = (areaId: RootineAreaId) => {
    if (focusedArea.current === areaId) focusedArea.current = null;
    emitActiveArea("focus");
  };

  return (
    <div
      className={classes}
      data-variant={variant}
      data-active-area={activeAreaId ?? undefined}
    >
      <svg
        className="living-day__svg"
        viewBox={interactive ? FOREGROUND_VIEWBOX : "0 0 320 320"}
        role={interactive ? "group" : "presentation"}
        aria-label={interactive ? ariaLabel : undefined}
        aria-hidden={interactive ? undefined : "true"}
        focusable="false"
      >
        {showProgressRings && (
          <>
            <circle className="living-day__outer-track" cx={CENTER} cy={CENTER} r={OUTER_RADIUS} />
            <circle
              className="living-day__outer-progress"
              cx={CENTER}
              cy={CENTER}
              r={OUTER_RADIUS}
              pathLength={100}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
              style={circleDash(dayProgress)}
            />

            <circle className="living-day__plan-track" cx={CENTER} cy={CENTER} r={PLAN_RADIUS} />
            <circle
              className="living-day__plan-progress"
              cx={CENTER}
              cy={CENTER}
              r={PLAN_RADIUS}
              pathLength={100}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
              style={circleDash(safePlanProgress)}
            />
          </>
        )}

        <g className="living-day__areas">
          {segments.map((segment) => {
            const { area } = segment;
            const isActive = activeAreaId === area.id;
            const isExpanded = interactive && Boolean(activeSegment) && isActive;
            const displayStart = isExpanded ? 0 : segment.start;
            const displayEnd = isExpanded ? EXPANDED_AREA_END : segment.end;
            const displaySpan = displayEnd - displayStart;
            const progressEnd = displayStart + displaySpan * segment.progress / 100;
            const breakdown = segment.breakdown;
            const breakdownScale = breakdown && breakdown.compositionTotal > 0
              ? displaySpan / breakdown.compositionTotal
              : 0;
            const completedEnd = breakdown
              ? displayStart + breakdown.completedToday * breakdownScale
              : displayStart;
            const todayEnd = breakdown
              ? completedEnd + breakdown.remainingToday * breakdownScale
              : displayStart;
            const segmentClassName = [
              "living-day__area",
              `living-day__area--${segment.status}`,
              breakdown ? "has-breakdown" : "",
              breakdown?.remainingToday ? "has-today-remaining" : "",
              breakdown?.overdue ? "has-overdue" : "",
              isActive ? "is-active" : "",
              interactive && activeSegment && !isActive ? "is-muted" : "",
            ].filter(Boolean).join(" ");
            const visibleValue = area.valueLabel
              ?? (breakdown
                ? `na dziś: ${breakdown.remainingToday} · zaległe: ${breakdown.overdue} · wykonane: ${breakdown.completedToday} z ${breakdown.plannedToday}`
                : segment.status === "empty"
                  ? "brak planu"
                  : `${Math.round(segment.progress)}% · ${segment.remaining} pozostało`);
            const content = (
              <>
                <title>{`${area.label}: ${visibleValue}`}</title>
                <RingArc
                  className="living-day__area-hit"
                  startAngle={displayStart}
                  endAngle={displayEnd}
                />
                <RingArc
                  className="living-day__area-track"
                  startAngle={displayStart}
                  endAngle={displayEnd}
                  pathLength={100}
                />
                {breakdown ? (
                  <>
                    {breakdown.completedToday > 0 && (
                      <RingArc
                        className="living-day__area-slice living-day__area-slice--done"
                        startAngle={displayStart}
                        endAngle={completedEnd}
                        pathLength={100}
                      />
                    )}
                    {breakdown.remainingToday > 0 && (
                      <RingArc
                        className="living-day__area-slice living-day__area-slice--today"
                        startAngle={completedEnd}
                        endAngle={todayEnd}
                        pathLength={100}
                      />
                    )}
                    {breakdown.overdue > 0 && (
                      <RingArc
                        className="living-day__area-slice living-day__area-slice--overdue"
                        startAngle={todayEnd}
                        endAngle={displayEnd}
                        pathLength={100}
                      />
                    )}
                  </>
                ) : segment.progress > 0 && (
                  <RingArc
                    className="living-day__area-progress"
                    startAngle={displayStart}
                    endAngle={progressEnd}
                    pathLength={100}
                  />
                )}
                <circle
                  className="living-day__area-signal"
                  cx={polarPoint(AREA_RADIUS, displayEnd).x}
                  cy={polarPoint(AREA_RADIUS, displayEnd).y}
                  r={2.5 + segment.intensity * 2.5}
                />
              </>
            );

            if (!interactive) {
              return (
                <g
                  key={area.id}
                  className={segmentClassName}
                  data-area={area.id}
                  data-status={segment.status}
                  data-intensity={segment.intensity.toFixed(2)}
                  data-expanded={isExpanded || undefined}
                >
                  {content}
                </g>
              );
            }

            return (
              <Link
                key={area.id}
                className={segmentClassName}
                data-area={area.id}
                data-status={segment.status}
                data-intensity={segment.intensity.toFixed(2)}
                data-expanded={isExpanded || undefined}
                to={area.to}
                viewTransition
                aria-label={`${area.label}: ${visibleValue}`}
                onPointerEnter={() => handlePointerEnter(area.id)}
                onPointerLeave={() => handlePointerLeave(area.id)}
                onFocus={() => handleFocus(area.id)}
                onBlur={() => handleBlur(area.id)}
              >
                {content}
              </Link>
            );
          })}
        </g>

        <g
          className={`living-day__center ${activeSegment ? "is-contextual" : ""}`}
          data-context-area={activeSegment?.area.id}
          aria-hidden="true"
        >
          {interactive && (
            <text className="living-day__context" x={CENTER} y={CENTER - 32} textAnchor="middle">
              {activeSegment?.area.label ?? "Wszystkie obszary"}
            </text>
          )}
          {activeBreakdown ? (
            <>
              <text
                className="living-day__metric-value living-day__metric-value--today"
                x={CENTER - 30}
                y={CENTER + 1}
                textAnchor="middle"
              >
                {activeBreakdown.remainingToday}
              </text>
              <text
                className="living-day__metric-label"
                x={CENTER - 30}
                y={CENTER + 23}
                textAnchor="middle"
              >
                na dziś
              </text>
              <text
                className="living-day__metric-value living-day__metric-value--overdue"
                x={CENTER + 30}
                y={CENTER + 1}
                textAnchor="middle"
              >
                {activeBreakdown.overdue}
              </text>
              <text
                className="living-day__metric-label"
                x={CENTER + 30}
                y={CENTER + 23}
                textAnchor="middle"
              >
                zaległe
              </text>
              <text className="living-day__detail" x={CENTER} y={CENTER + 45} textAnchor="middle">
                {activeBreakdown.plannedToday > 0
                  ? `${activeBreakdown.completedToday} z ${activeBreakdown.plannedToday} wykonane`
                  : "brak planu na dziś"}
              </text>
            </>
          ) : (
            <>
              <text
                className="living-day__remaining"
                x={CENTER}
                y={interactive ? CENTER + 1 : CENTER - 2}
                textAnchor="middle"
              >
                {centerValue}
              </text>
              <text
                className="living-day__summary"
                x={CENTER}
                y={interactive ? CENTER + 23 : CENTER + 19}
                textAnchor="middle"
              >
                {centerSummary}
              </text>
              {interactive && centerDetail && (
                <text className="living-day__detail" x={CENTER} y={CENTER + 45} textAnchor="middle">
                  {centerDetail}
                </text>
              )}
            </>
          )}
        </g>
      </svg>
      {summaryLabel && typeof summaryLabel !== "string" && typeof summaryLabel !== "number" && (
        <span className="living-day__summary-content">{summaryLabel}</span>
      )}
    </div>
  );
}
