import { AudioLines } from "lucide-react";

export function AssistantEntryButton({
  enabled,
  active,
  reason,
  onClick,
  compact = false,
}: {
  enabled: boolean;
  active: boolean;
  reason?: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`assistant-entry${active ? " is-active" : ""}${compact ? " is-compact" : ""}`}
      disabled={!enabled}
      title={enabled ? "Asystent · Ctrl/Cmd + Space" : reason ?? "Asystent jest niedostępny"}
      aria-label={active ? "Wróć do Assistant Stage" : "Otwórz asystenta"}
      aria-expanded={active}
      aria-controls="rootine-assistant-stage"
      onClick={onClick}
    >
      <AudioLines size={16} strokeWidth={1.8} aria-hidden="true" />
      {!compact && <span>Asystent</span>}
      {!compact && <kbd>⌃ Space</kbd>}
    </button>
  );
}
