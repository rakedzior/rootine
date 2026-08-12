import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "role" | "size" | "type"> {
  label?: ReactNode;
  description?: ReactNode;
}

/**
 * Canonical binary setting control.
 *
 * A real checkbox keeps native form, change and Space-key behaviour, while
 * `role="switch"` exposes the intended on/off interaction to assistive tech.
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    label,
    description,
    className = "",
    id,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    ...props
  },
  forwardedRef,
) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-switch`;
  const labelId = `${inputId}-label`;
  const descriptionId = `${inputId}-description`;
  const generatedLabelledBy = ariaLabel === undefined && ariaLabelledBy === undefined && label
    ? labelId
    : undefined;
  const describedBy = [ariaDescribedBy, description ? descriptionId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <label className={`ui-switch ${className}`.trim()} htmlFor={inputId}>
      <input
        {...props}
        ref={forwardedRef}
        id={inputId}
        type="checkbox"
        role="switch"
        className="ui-switch__input"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ?? generatedLabelledBy}
        aria-describedby={describedBy}
      />
      <span className="ui-switch__track" aria-hidden="true">
        <span className="ui-switch__thumb" />
      </span>
      {(label || description) && (
        <span className="ui-switch__copy">
          {label && <span id={labelId} className="ui-switch__label">{label}</span>}
          {description && <small id={descriptionId} className="ui-switch__description">{description}</small>}
        </span>
      )}
    </label>
  );
});
