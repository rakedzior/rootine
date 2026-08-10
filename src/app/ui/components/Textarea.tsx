import { forwardRef, useId, type TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  fieldClassName?: string;
  /** Keep the shared textarea contract while letting a feature layout own the control's geometry. */
  embedded?: boolean;
}

/** Multiline counterpart to Input with the same label, hint and error contract. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    id,
    label,
    hint,
    error,
    fieldClassName = "",
    className = "",
    embedded = false,
    "aria-describedby": describedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const descriptionIds = [describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`ui-field${embedded ? " ui-field--embedded" : ""} ${fieldClassName}`.trim()}>
      {label && <label className="ui-field__label" htmlFor={controlId}>{label}</label>}
      <textarea
        ref={ref}
        id={controlId}
        className={`ui-field__control ui-field__textarea ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionIds}
        {...props}
      />
      {hint && <p id={hintId} className="ui-field__hint">{hint}</p>}
      {error && <p id={errorId} className="ui-field__error" role="alert">{error}</p>}
    </div>
  );
});
