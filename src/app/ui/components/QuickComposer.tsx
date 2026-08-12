import { type FormHTMLAttributes, type ReactNode } from "react";

export type QuickComposerDensity = "compact" | "standard";

export interface QuickComposerProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "children"> {
  editor: ReactNode;
  leadingAction?: ReactNode;
  propertyControls?: ReactNode;
  scheduleControl?: ReactNode;
  submitAction?: ReactNode;
  controlsLabel?: string;
  density?: QuickComposerDensity;
}

/**
 * Domain-neutral shell for high-frequency inline creation.
 *
 * Callers own data and controls; the shell standardises DOM order, spacing and
 * the accessible grouping used by Tasks, Work and future quick-entry surfaces.
 */
export function QuickComposer({
  editor,
  leadingAction,
  propertyControls,
  scheduleControl,
  submitAction,
  controlsLabel = "Właściwości nowego elementu",
  density = "standard",
  className = "",
  ...props
}: QuickComposerProps) {
  const hasControls = Boolean(propertyControls || scheduleControl);
  return (
    <form className={`ui-quick-composer ui-quick-composer--${density} ${className}`.trim()} {...props}>
      {leadingAction && <div className="ui-quick-composer__leading">{leadingAction}</div>}
      <div className="ui-quick-composer__editor">{editor}</div>
      {(hasControls || submitAction) && (
        <div className="ui-quick-composer__actions">
          {hasControls && (
            <div className="ui-quick-composer__properties" role="group" aria-label={controlsLabel}>
              {propertyControls}
              {scheduleControl}
            </div>
          )}
          {submitAction && <div className="ui-quick-composer__submit">{submitAction}</div>}
        </div>
      )}
    </form>
  );
}
