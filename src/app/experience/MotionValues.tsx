import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { formatCurrency, formatPercent, formatWeight } from "../formatters";
import { useEffectiveReducedMotion } from "./useReducedMotion";

const DEFAULT_DURATION = 240;

type MotionStyle = CSSProperties & {
  "--motion-value-duration"?: string;
};

type MorphTransition<T> = {
  previous: T;
  revision: number;
};

/**
 * Keeps the last committed value available for one transition window. The
 * layout effect runs before paint, so a prop change never flashes without its
 * outgoing value first.
 */
function useMorphTransition<T>(
  transitionKey: string,
  value: T,
  duration: number,
  reduced: boolean,
) {
  const committedKey = useRef(transitionKey);
  const committedValue = useRef(value);
  const revision = useRef(0);
  const [transition, setTransition] = useState<MorphTransition<T> | null>(null);

  useLayoutEffect(() => {
    const keyChanged = committedKey.current !== transitionKey;
    const previous = committedValue.current;
    committedKey.current = transitionKey;
    committedValue.current = value;

    if (!keyChanged || reduced) {
      if (reduced) setTransition(null);
      return;
    }

    revision.current += 1;
    setTransition({ previous, revision: revision.current });
  }, [reduced, transitionKey, value]);

  useEffect(() => {
    if (!transition) return undefined;
    const activeRevision = transition.revision;
    const timeout = window.setTimeout(() => {
      setTransition((current) => (
        current?.revision === activeRevision ? null : current
      ));
    }, Math.max(0, duration));
    return () => window.clearTimeout(timeout);
  }, [duration, transition]);

  return transition;
}

type AnimatedValueProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  value: number;
  duration?: number;
  announce?: boolean;
  format: (value: number) => string;
  kind: "number" | "percentage" | "currency" | "weight";
};

function AnimatedValue({
  value,
  duration = DEFAULT_DURATION,
  announce = false,
  format,
  kind,
  className = "",
  style,
  ...props
}: AnimatedValueProps) {
  const reduced = useEffectiveReducedMotion();
  const transitionKey = Number.isNaN(value) ? "NaN" : String(value);
  const transition = useMorphTransition(transitionKey, value, duration, reduced);
  const previousValue = transition?.previous;
  const direction = previousValue === undefined || !Number.isFinite(previousValue) || !Number.isFinite(value)
    ? "none"
    : value > previousValue
      ? "up"
      : value < previousValue
        ? "down"
        : "none";
  const formatted = format(value);
  const classes = [
    "motion-value",
    `motion-value--${kind}`,
    transition ? "is-morphing" : "",
    className,
  ].filter(Boolean).join(" ");
  const motionStyle: MotionStyle = {
    ...style,
    "--motion-value-duration": `${Math.max(0, duration)}ms`,
  };

  return (
    <span
      className={classes}
      data-direction={direction}
      data-motion-state={transition ? "changing" : "settled"}
      aria-live={announce ? "polite" : undefined}
      aria-atomic={announce ? "true" : undefined}
      style={motionStyle}
      {...props}
    >
      <span className="motion-value__viewport">
        {transition && (
          <span className="motion-value__value motion-value__value--previous" aria-hidden="true">
            {format(transition.previous)}
          </span>
        )}
        <span
          key={`${transitionKey}-${transition?.revision ?? "steady"}`}
          className="motion-value__value motion-value__value--current"
        >
          {formatted}
        </span>
      </span>
    </span>
  );
}

export type AnimatedNumberProps = Omit<AnimatedValueProps, "format" | "kind"> & {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
};

export function AnimatedNumber({
  locale = "pl-PL",
  minimumFractionDigits = 0,
  maximumFractionDigits = 0,
  useGrouping = true,
  ...props
}: AnimatedNumberProps) {
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping,
  });
  return (
    <AnimatedValue
      {...props}
      kind="number"
      format={(nextValue) => Number.isFinite(nextValue) ? formatter.format(nextValue) : "—"}
    />
  );
}

export type AnimatedPercentageProps = Omit<AnimatedValueProps, "format" | "kind">;

export function AnimatedPercentage(props: AnimatedPercentageProps) {
  return <AnimatedValue {...props} kind="percentage" format={formatPercent} />;
}

export type AnimatedCurrencyProps = Omit<AnimatedValueProps, "format" | "kind"> & {
  currency?: string;
};

export function AnimatedCurrency({ currency = "PLN", ...props }: AnimatedCurrencyProps) {
  return (
    <AnimatedValue
      {...props}
      kind="currency"
      format={(nextValue) => formatCurrency(nextValue, currency)}
    />
  );
}

export type AnimatedWeightProps = Omit<AnimatedValueProps, "format" | "kind">;

export function AnimatedWeight(props: AnimatedWeightProps) {
  return <AnimatedValue {...props} kind="weight" format={formatWeight} />;
}

export type ProgressMorphTone = "default" | "success" | "warning" | "danger";

export type ProgressMorphProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  value: number;
  min?: number;
  max?: number;
  label: string;
  valueLabel?: ReactNode;
  valueText?: string;
  tone?: ProgressMorphTone;
  duration?: number;
};

export function ProgressMorph({
  value,
  min = 0,
  max = 100,
  label,
  valueLabel,
  valueText,
  tone = "default",
  duration = DEFAULT_DURATION,
  className = "",
  style,
  ...props
}: ProgressMorphProps) {
  const reduced = useEffectiveReducedMotion();
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 1;
  const safeValue = Number.isFinite(value) ? Math.min(safeMax, Math.max(safeMin, value)) : safeMin;
  const progress = (safeValue - safeMin) / (safeMax - safeMin);
  const classes = [
    "progress-morph",
    `progress-morph--${tone}`,
    className,
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} style={style} {...props}>
      <div
        className="progress-morph__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={safeMin}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        aria-valuetext={valueText}
      >
        <span
          className="progress-morph__fill"
          style={{
            transform: `scaleX(${progress})`,
            transition: reduced
              ? "none"
              : `transform ${Math.max(0, duration)}ms var(--ease-standard, cubic-bezier(0.2, 0, 0, 1))`,
          }}
        />
      </div>
      {valueLabel !== undefined && (
        <span className="progress-morph__value">{valueLabel}</span>
      )}
    </div>
  );
}

export type StatusMorphTone = "neutral" | "primary" | "success" | "warning" | "danger";

type StatusPresentation = {
  label: ReactNode;
  icon?: ReactNode;
  tone: StatusMorphTone;
};

export type StatusMorphProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  status: string;
  children: ReactNode;
  icon?: ReactNode;
  tone?: StatusMorphTone;
  duration?: number;
  announce?: boolean;
};

export function StatusMorph({
  status,
  children,
  icon,
  tone = "neutral",
  duration = DEFAULT_DURATION,
  announce = true,
  className = "",
  style,
  ...props
}: StatusMorphProps) {
  const reduced = useEffectiveReducedMotion();
  const current: StatusPresentation = { label: children, icon, tone };
  const transition = useMorphTransition(status, current, duration, reduced);
  const classes = [
    "status-morph",
    `status-morph--${tone}`,
    transition ? "is-morphing" : "",
    className,
  ].filter(Boolean).join(" ");
  const motionStyle: MotionStyle = {
    ...style,
    "--motion-value-duration": `${Math.max(0, duration)}ms`,
  };

  const renderPresentation = (
    presentation: StatusPresentation,
    modifier: "previous" | "current",
  ) => (
    <span
      className={`status-morph__state status-morph__state--${modifier} status-morph__state--${presentation.tone}`}
      aria-hidden={modifier === "previous" ? "true" : undefined}
    >
      {presentation.icon && (
        <span className="status-morph__icon" aria-hidden="true">{presentation.icon}</span>
      )}
      <span className="status-morph__label">{presentation.label}</span>
    </span>
  );

  return (
    <span
      className={classes}
      data-status={status}
      data-motion-state={transition ? "changing" : "settled"}
      aria-live={announce ? "polite" : undefined}
      aria-atomic={announce ? "true" : undefined}
      style={motionStyle}
      {...props}
    >
      {transition && renderPresentation(transition.previous, "previous")}
      {renderPresentation(current, "current")}
    </span>
  );
}
