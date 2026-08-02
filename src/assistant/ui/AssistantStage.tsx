import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import {
  AudioLines,
  CircleStop,
  Headphones,
  Keyboard as KeyboardIcon,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { AssistantView } from "../panels/panel-schemas";
import type { PendingAssistantConfirmation } from "../confirmations/confirmation-manager";
import { AudioVisualizer } from "./AudioVisualizer";
import { AssistantPanelRenderer, type AssistantPanelInteraction } from "./AssistantPanelRenderer";

export type AssistantStageStatus =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "listening"
  | "user_speaking"
  | "processing"
  | "executing_tool"
  | "awaiting_confirmation"
  | "assistant_speaking"
  | "interrupted"
  | "reconnecting"
  | "error"
  | "closing";

const STATUS_COPY: Record<AssistantStageStatus, string> = {
  idle: "Gotowy",
  requesting_permission: "Czekam na zgodę mikrofonu…",
  connecting: "Łączę…",
  listening: "Słucham…",
  user_speaking: "Słucham…",
  processing: "Sprawdzam…",
  executing_tool: "Wykonuję…",
  awaiting_confirmation: "Czekam na decyzję",
  assistant_speaking: "Odpowiadam…",
  interrupted: "Przerwano",
  reconnecting: "Łączę ponownie…",
  error: "Wymaga uwagi",
  closing: "Kończę sesję…",
};

export function AssistantStage({
  open,
  status,
  transcript,
  partialTranscript,
  assistantText,
  view,
  pendingConfirmation,
  error,
  microphoneEnabled,
  microphoneMode,
  audioEnabled,
  privacyMode,
  analyser,
  onStartVoice,
  onSendText,
  onCancelResponse,
  onToggleAudio,
  onStartPushToTalk,
  onStopPushToTalk,
  onCancelPushToTalk,
  onClose,
  onInteraction,
  onRetry,
}: {
  open: boolean;
  status: AssistantStageStatus;
  transcript: string;
  partialTranscript: string;
  assistantText: string;
  view: AssistantView | null;
  pendingConfirmation: PendingAssistantConfirmation | null;
  error?: string;
  microphoneEnabled: boolean;
  microphoneMode: "conversation" | "push_to_talk";
  audioEnabled: boolean;
  privacyMode: boolean;
  analyser: AnalyserNode | null;
  onStartVoice: () => void;
  onSendText: (text: string) => void;
  onCancelResponse: () => void;
  onToggleAudio: () => void;
  onStartPushToTalk: () => void;
  onStopPushToTalk: () => void;
  onCancelPushToTalk: () => void;
  onClose: () => void;
  onInteraction: (interaction: AssistantPanelInteraction) => void;
  onRetry: () => void;
}) {
  const [text, setText] = useState("");
  const [pushToTalkActive, setPushToTalkActive] = useState(false);
  const pushToTalkActiveRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const visibleTranscript = privacyMode && (partialTranscript || transcript)
    ? "Wypowiedź ukryta przez Privacy Mode"
    : partialTranscript || transcript;
  const microphoneCapturing = microphoneEnabled
    && (microphoneMode === "conversation" || pushToTalkActive);
  const liveText = assistantText
    || visibleTranscript
    || (status === "idle" ? "Możesz mówić albo wpisać polecenie." : STATUS_COPY[status]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      const target = restoreFocusRef.current;
      window.requestAnimationFrame(() => target?.focus());
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (pushToTalkActiveRef.current) {
          pushToTalkActiveRef.current = false;
          setPushToTalkActive(false);
          onCancelPushToTalk();
        } else if (["assistant_speaking", "processing", "user_speaking"].includes(status)) onCancelResponse();
        else onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancelPushToTalk, onCancelResponse, onClose, open, status]);

  useEffect(() => {
    if (!open) return;
    const cancelOnWindowBlur = () => {
      if (!pushToTalkActiveRef.current) return;
      pushToTalkActiveRef.current = false;
      setPushToTalkActive(false);
      onCancelPushToTalk();
    };
    window.addEventListener("blur", cancelOnWindowBlur);
    return () => window.removeEventListener("blur", cancelOnWindowBlur);
  }, [onCancelPushToTalk, open]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSendText(value);
    setText("");
  };

  const handleTextKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const startPushToTalk = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pushToTalkActiveRef.current = true;
    setPushToTalkActive(true);
    onStartPushToTalk();
  };
  const stopPushToTalk = () => {
    if (!pushToTalkActiveRef.current) return;
    pushToTalkActiveRef.current = false;
    setPushToTalkActive(false);
    onStopPushToTalk();
  };
  const cancelPushToTalk = () => {
    if (!pushToTalkActiveRef.current) return;
    pushToTalkActiveRef.current = false;
    setPushToTalkActive(false);
    onCancelPushToTalk();
  };

  return (
    <section
      id="rootine-assistant-stage"
      className={`assistant-stage is-${status}`}
      role="dialog"
      aria-modal="false"
      aria-label="Rootine Assistant"
      aria-busy={["connecting", "processing", "executing_tool", "reconnecting"].includes(status)}
    >
      <header className="assistant-stage__header">
        <div className="assistant-stage__identity">
          <span className="assistant-stage__mark" aria-hidden="true"><AudioLines size={18} /></span>
          <span><strong>Rootine Assistant</strong><small>{STATUS_COPY[status]}</small></span>
        </div>
        <div className="assistant-stage__session-meta">
          {privacyMode && <span><ShieldCheck size={13} aria-hidden="true" /> Privacy Mode</span>}
          <span className={microphoneCapturing ? "is-mic-on" : undefined}>
            {microphoneCapturing ? <Mic size={13} /> : <MicOff size={13} />}
            {microphoneCapturing ? " Mikrofon aktywny" : microphoneEnabled && microphoneMode === "push_to_talk" ? " PTT gotowy" : " Mikrofon wyłączony"}
          </span>
        </div>
        <div className="assistant-stage__header-actions">
          <button type="button" onClick={onToggleAudio} aria-pressed={!audioEnabled} aria-label={audioEnabled ? "Wycisz odpowiedzi głosowe" : "Włącz odpowiedzi głosowe"}>
            {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button type="button" onClick={onClose} aria-label="Zakończ sesję asystenta"><X size={17} /></button>
        </div>
      </header>

      <div className="assistant-stage__workspace">
        <section className="assistant-stage__voice" aria-labelledby="assistant-stage-live-title">
          <div className="assistant-stage__orb" data-active={microphoneCapturing || status === "assistant_speaking"}>
            <Headphones size={24} aria-hidden="true" />
          </div>
          <div className="assistant-stage__voice-copy">
            <h2 id="assistant-stage-live-title">{STATUS_COPY[status]}</h2>
            <p aria-live="polite" aria-atomic="false">{liveText}</p>
            {transcript && assistantText && (
              <small>Ty: {privacyMode ? "wypowiedź ukryta przez Privacy Mode" : transcript}</small>
            )}
          </div>
          <AudioVisualizer
            analyser={analyser}
            active={microphoneCapturing || status === "assistant_speaking"}
            label={microphoneCapturing ? "Mikrofon odbiera dźwięk" : status === "assistant_speaking" ? "Asystent odtwarza odpowiedź" : "Audio nieaktywne"}
          />
          <div className="assistant-stage__voice-actions">
            {!microphoneEnabled ? (
              <button type="button" className="is-primary" onClick={onStartVoice}><Mic size={15} /> Rozpocznij rozmowę</button>
            ) : microphoneMode === "push_to_talk" ? (
              <button
                type="button"
                className={`is-primary${pushToTalkActive ? " is-pressed" : ""}`}
                aria-pressed={pushToTalkActive}
                onPointerDown={startPushToTalk}
                onPointerUp={stopPushToTalk}
                onPointerCancel={cancelPushToTalk}
                onLostPointerCapture={cancelPushToTalk}
                onBlur={cancelPushToTalk}
                onKeyDown={(event) => {
                  if ((event.key === " " || event.key === "Enter") && !pushToTalkActive) {
                    event.preventDefault();
                    pushToTalkActiveRef.current = true;
                    setPushToTalkActive(true);
                    onStartPushToTalk();
                  }
                }}
                onKeyUp={(event) => {
                  if (event.key === " " || event.key === "Enter") stopPushToTalk();
                }}
              >
                <Mic size={15} /> Przytrzymaj i mów
              </button>
            ) : (
              <span className="assistant-stage__conversation-note"><Mic size={14} aria-hidden="true" /> Rozmowa aktywna</span>
            )}
            {["assistant_speaking", "processing", "executing_tool"].includes(status) && (
              <button type="button" onClick={onCancelResponse}><CircleStop size={15} /> Przerwij</button>
            )}
            {status === "error" && <button type="button" onClick={onRetry}>Spróbuj ponownie</button>}
          </div>
          {error && <p className="assistant-stage__error" role="alert">{error}</p>}
        </section>

        <section className="assistant-stage__results" aria-label="Panele odpowiedzi">
          {view?.panels.length ? (
            <div className={`assistant-stage__panels layout-${view.layout}`}>
              <header><h2>{view.title}</h2><span>{view.panels.length} {view.panels.length === 1 ? "panel" : "panele"}</span></header>
              {view.panels.map((panel, index) => (
                <AssistantPanelRenderer key={panel.id} panel={panel} index={index} onInteraction={onInteraction} />
              ))}
            </div>
          ) : (
            <div className="assistant-stage__empty">
              <KeyboardIcon size={20} aria-hidden="true" />
              <h2>Zapytaj o swój dzień</h2>
              <p>Na przykład: „Co jest dziś najpilniejsze?” albo „Pokaż trening na jutro”.</p>
            </div>
          )}
          {pendingConfirmation && !view?.panels.some((panel) => panel.data.confirmationId === pendingConfirmation.id) && (
            <p className="assistant-stage__pending-note">Oczekuje potwierdzenie: {pendingConfirmation.operation}</p>
          )}
        </section>
      </div>

      <form className="assistant-stage__composer" onSubmit={submit}>
        <KeyboardIcon size={16} aria-hidden="true" />
        <label className="sr-only" htmlFor="assistant-text-command">Wpisz polecenie dla asystenta</label>
        <input
          ref={inputRef}
          id="assistant-text-command"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleTextKeyDown}
          placeholder="Wpisz polecenie…"
          autoComplete="off"
        />
        <small>Ctrl/Cmd + Enter</small>
        <button type="submit" disabled={!text.trim()} aria-label="Wyślij polecenie"><Send size={16} /></button>
      </form>
    </section>
  );
}
