import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  footer?: ReactNode;
  /**
   * Named width step. The app used sixteen ad-hoc pixel widths for roughly five kinds of
   * dialog, so two forms of the same shape opened at different sizes.
   *
   * - `sm` confirmations and single-field dialogs
   * - `md` single-column forms (default)
   * - `lg` two-column forms and the command centre
   * - `xl` rich editors with their own inner layout
   */
  size?: ModalSize;
  /** Escape hatch for the one dialog that behaves like a full page. Prefer `size`. */
  width?: number | string;
  bodyClassName?: string;
  labelledBy?: string;
  /** Stable invoker used when the element that opened the modal (for example a menu item) unmounts. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export type ModalSize = "sm" | "md" | "lg" | "xl";

const MODAL_WIDTHS: Record<ModalSize, number> = {
  sm: 500,
  md: 680,
  lg: 780,
  xl: 960,
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Modal({ title, description, eyebrow, onClose, children, footer, size = "md", width, bodyClassName = "", labelledBy, returnFocusRef }: ModalProps) {
  const generatedId = useId();
  const titleId = labelledBy ?? `${generatedId}-title`;
  const descriptionId = description ? `${generatedId}-description` : undefined;
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const explicitReturnFocus = returnFocusRef?.current;
    const dialog = dialogRef.current;
    const isTopmostDialog = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>(".ui-modal[role='dialog']"));
      return dialogs.at(-1) === dialog;
    };
    const isOwnedOverlayTarget = (target: EventTarget | null) => target instanceof Element
      && Boolean(target.closest(".ui-date-picker, .ui-select-menu"));
    const initialFocus = dialog?.querySelector<HTMLElement>("[autofocus], [data-autofocus]")
      ?? dialog?.querySelector<HTMLElement>(".ui-modal__body input:not([type='hidden']), .ui-modal__body select, .ui-modal__body textarea, .ui-modal__body button:not([disabled])")
      ?? dialog?.querySelector<HTMLElement>("button:not([disabled])");
    initialFocus?.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isTopmostDialog() || event.defaultPrevented || isOwnedOverlayTarget(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      if (
        !dialog
        || !isTopmostDialog()
        || dialog.contains(event.target as Node)
        || isOwnedOverlayTarget(event.target)
      ) return;
      const fallback = dialog.querySelector<HTMLElement>(focusableSelector) ?? dialog;
      fallback.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      const focusTarget = explicitReturnFocus ?? previousFocus;
      if (focusTarget?.isConnected && !focusTarget.matches(":disabled")) focusTarget.focus();
    };
  }, [returnFocusRef]);

  return createPortal(
    <div className="ui-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseRef.current(); }}>
      <section
        ref={dialogRef}
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        style={{ maxWidth: width === undefined ? `${MODAL_WIDTHS[size]}px` : typeof width === "number" ? `${width}px` : width }}
      >
        <header className="ui-modal__header">
          <div>
            {eyebrow && <p className="ui-modal__eyebrow">{eyebrow}</p>}
            <h2 id={titleId} className="ui-modal__title">{title}</h2>
            {description && <p id={descriptionId} className="ui-modal__description">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij" onClick={() => onCloseRef.current()}>
            <X size={13} />
          </Button>
        </header>
        <div className={`ui-modal__body ${bodyClassName}`.trim()}>{children}</div>
        {footer && <footer className="ui-modal__footer">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
