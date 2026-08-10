import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";

export type ToastTone = "neutral" | "success" | "warning" | "danger";

export interface ToastProps {
  children: ReactNode;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  dismissLabel?: string;
  durationMs?: number | null;
}

const TOAST_HOST_ID = "rootine-toast-viewport";

function getToastHost() {
  let host = document.getElementById(TOAST_HOST_ID);
  if (host) return host;
  host = document.createElement("div");
  host.id = TOAST_HOST_ID;
  host.className = "ui-toast-viewport";
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Powiadomienia");
  document.body.appendChild(host);
  return host;
}

export function ToastViewport({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, getToastHost());
}

/** Shared transient feedback with one timeout, live-region and undo/action contract. */
export function Toast({
  children,
  tone = "neutral",
  actionLabel,
  onAction,
  onDismiss,
  dismissLabel = "Zamknij powiadomienie",
  durationMs = 8_000,
}: ToastProps) {
  const [paused, setPaused] = useState(false);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (paused || durationMs === null || durationMs <= 0) return;
    const timer = window.setTimeout(() => onDismissRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, paused]);

  return (
    <div
      className={`ui-toast ui-toast--${tone}`}
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      aria-atomic="true"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <span className="ui-toast__message">{children}</span>
      {actionLabel && onAction && (
        <Button variant="ghost" size="sm" onClick={onAction}>{actionLabel}</Button>
      )}
      <Button variant="ghost" size="sm" iconOnly aria-label={dismissLabel} onClick={onDismiss}>
        <X size={13} aria-hidden="true" />
      </Button>
    </div>
  );
}
