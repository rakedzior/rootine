import { forwardRef, useId, type InputHTMLAttributes } from "react";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  fieldClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, hint, error, fieldClassName = "", className = "", "aria-describedby": describedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const descriptionIds = [describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`ui-field ${fieldClassName}`.trim()}>
      {label && <label className="ui-field__label" htmlFor={controlId}>{label}</label>}
      <input
        ref={ref}
        id={controlId}
        className={`ui-field__control ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionIds}
        {...props}
      />
      {hint && <p id={hintId} className="ui-field__hint">{hint}</p>}
      {error && <p id={errorId} className="ui-field__error" role="alert">{error}</p>}
    </div>
  );
});
