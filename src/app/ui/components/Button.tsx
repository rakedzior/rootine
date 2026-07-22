import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "quiet" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "quiet",
    size = "md",
    iconOnly = false,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    className = "",
    children,
    type = "button",
    ...props
  },
  ref,
) {
  const classes = [
    "ui-button",
    `ui-button--${variant}`,
    size === "sm" ? "ui-button--sm" : "",
    iconOnly ? "ui-button--icon" : "",
    fullWidth ? "ui-button--full" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button ref={ref} type={type} className={classes} {...props}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});
