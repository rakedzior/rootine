import { forwardRef, useEffect, useRef, type InputHTMLAttributes, type ReactNode } from "react";

export type CheckboxSize = "sm" | "md";
export type CheckboxShape = "square" | "round";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode;
  description?: ReactNode;
  size?: CheckboxSize;
  /** `round` is the task/habit completion affordance; `square` is a form control. */
  shape?: CheckboxShape;
  indeterminate?: boolean;
}

/**
 * The single checkbox in the app. Replaces four independent implementations
 * (.affairs-check, .jdg-check, the notes checklist button and the raw input in Layout).
 *
 * Always renders a real <input type="checkbox">, so keyboard, form semantics and
 * assistive technology work without extra ARIA.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, size = "md", shape = "square", indeterminate = false, className = "", id, ...props },
  forwardedRef,
) {
  const innerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const setRefs = (node: HTMLInputElement | null) => {
    innerRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const classes = [
    "ui-checkbox",
    `ui-checkbox--${size}`,
    shape === "round" ? "ui-checkbox--round" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <label className={classes} htmlFor={id}>
      <input ref={setRefs} id={id} type="checkbox" className="ui-checkbox__input" {...props} />
      <span className="ui-checkbox__box" aria-hidden="true" />
      {(label || description) && (
        <span className="ui-checkbox__copy">
          {label && <span className="ui-checkbox__label">{label}</span>}
          {description && <small className="ui-checkbox__description">{description}</small>}
        </span>
      )}
    </label>
  );
});
