import { forwardRef, useId, type SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  compact?: boolean;
  fieldClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { id, label, hint, error, options, compact = false, fieldClassName = "", className = "", "aria-describedby": describedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const descriptionIds = [describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <label className={`ui-field ${fieldClassName}`.trim()} htmlFor={controlId}>
      {label && <span className="ui-field__label">{label}</span>}
      <select
        ref={ref}
        id={controlId}
        className={`ui-field__control ui-select ${compact ? "ui-select--compact" : ""} ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionIds}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <p id={hintId} className="ui-field__hint">{hint}</p>}
      {error && <p id={errorId} className="ui-field__error" role="alert">{error}</p>}
    </label>
  );
});
