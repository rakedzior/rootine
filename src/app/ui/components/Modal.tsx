import { useEffect, useId, useRef, type ReactNode } from "react";
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
  width?: number | string;
  bodyClassName?: string;
  labelledBy?: string;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Modal({ title, description, eyebrow, onClose, children, footer, width = 520, bodyClassName = "", labelledBy }: ModalProps) {
  const generatedId = useId();
  const titleId = labelledBy ?? `${generatedId}-title`;
  const descriptionId = description ? `${generatedId}-description` : undefined;
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const initialFocus = dialog?.querySelector<HTMLElement>("[autofocus], [data-autofocus]")
      ?? dialog?.querySelector<HTMLElement>(".ui-modal__body input:not([type='hidden']), .ui-modal__body select, .ui-modal__body textarea, .ui-modal__body button:not([disabled])")
      ?? dialog?.querySelector<HTMLElement>("button:not([disabled])");
    initialFocus?.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="ui-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={dialogRef}
        className="ui-modal [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        style={{ maxWidth: typeof width === "number" ? `${width}px` : width }}
      >
        <header className="ui-modal__header">
          <div>
            {eyebrow && <p className="ui-modal__eyebrow">{eyebrow}</p>}
            <h2 id={titleId} className="ui-modal__title">{title}</h2>
            {description && <p id={descriptionId} className="ui-modal__description">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij" onClick={onClose}>
            <X size={14} />
          </Button>
        </header>
        <div className={`ui-modal__body ${bodyClassName}`.trim()}>{children}</div>
        {footer && <footer className="ui-modal__footer">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
