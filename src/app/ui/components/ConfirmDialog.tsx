import type { ReactNode, RefObject } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  title: string;
  description?: string;
  eyebrow?: string;
  /** Body copy. Defaults to the standard irreversibility warning. */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  /** Stable invoker for confirmations opened from a menu whose item unmounts. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The single destructive-confirmation dialog. Keeps the button order, wording and tone
 * identical everywhere, so "the dangerous one is on the right" is always true.
 */
export function ConfirmDialog({
  title,
  description,
  eyebrow = "Potwierdzenie",
  children,
  confirmLabel = "Usuń",
  cancelLabel = "Anuluj",
  tone = "danger",
  returnFocusRef,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      eyebrow={eyebrow}
      title={title}
      description={description}
      onClose={onCancel}
      returnFocusRef={returnFocusRef}
      footer={(
        <>
          <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      )}
    >
      {children ?? <p className="ui-confirm-dialog__note">Tej operacji nie można cofnąć.</p>}
    </Modal>
  );
}
