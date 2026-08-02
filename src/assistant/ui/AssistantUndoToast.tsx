import { RotateCcw, X } from "lucide-react";

export type AssistantUndoNotice = {
  token: string;
  message: string;
  expiresAt: string;
};

export function AssistantUndoToast({
  notice,
  onUndo,
  onDismiss,
}: {
  notice: AssistantUndoNotice | null;
  onUndo: (token: string) => void;
  onDismiss: () => void;
}) {
  if (!notice) return null;
  return (
    <div className="assistant-undo-toast" role="status" aria-live="polite">
      <span>{notice.message}</span>
      <button type="button" onClick={() => onUndo(notice.token)}><RotateCcw size={14} aria-hidden="true" /> Cofnij</button>
      <button type="button" className="assistant-undo-toast__close" onClick={onDismiss} aria-label="Zamknij"><X size={14} /></button>
    </div>
  );
}
