import { forwardRef } from "react";
import { Button, type ButtonProps } from "./Button";

export interface IconButtonProps extends Omit<ButtonProps, "iconOnly" | "leadingIcon" | "trailingIcon" | "fullWidth" | "children"> {
  /** Required: an icon alone carries no accessible name. */
  "aria-label": string;
  icon: ButtonProps["leadingIcon"];
}

/**
 * A square, label-less action. Sizes come from --control-height-*, so an icon button is
 * always the same height as the text buttons beside it.
 *
 * Use for: row actions, toolbar controls, close/collapse affordances.
 * Do not use when a label would fit — a labelled Button is easier to hit and to scan.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, variant = "ghost", size = "sm", ...props },
  ref,
) {
  return (
    <Button ref={ref} variant={variant} size={size} iconOnly {...props}>
      {icon}
    </Button>
  );
});
