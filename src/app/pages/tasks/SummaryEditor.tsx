import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeToLocalWorkspace } from "../../data/localRepository";
import {
  isoWeekKey,
  loadSummaryNotes,
  sanitizeSummaryHtml,
  saveSummaryNote,
  SUMMARY_NOTES_STORAGE_KEY,
} from "../../data/summaryNotes";

type Command =
  | { kind: "inline"; command: string }
  | { kind: "block"; block: string }
  | { kind: "link" }
  | { kind: "separator" };

const TOOLBAR: Array<Command & { label: string; title: string; shortcut?: string }> = [
  { kind: "block", block: "h1", label: "H1", title: "Nagłówek 1" },
  { kind: "block", block: "h2", label: "H2", title: "Nagłówek 2" },
  { kind: "block", block: "h3", label: "H3", title: "Nagłówek 3" },
  { kind: "separator", label: "", title: "" },
  { kind: "inline", command: "bold", label: "B", title: "Pogrubienie", shortcut: "Ctrl+B" },
  { kind: "inline", command: "italic", label: "I", title: "Kursywa", shortcut: "Ctrl+I" },
  { kind: "inline", command: "underline", label: "U", title: "Podkreślenie", shortcut: "Ctrl+U" },
  { kind: "inline", command: "strikeThrough", label: "S", title: "Przekreślenie" },
  { kind: "separator", label: "", title: "" },
  { kind: "link", label: "🔗", title: "Wstaw odnośnik" },
  { kind: "block", block: "pre", label: "</>", title: "Blok kodu" },
  { kind: "block", block: "blockquote", label: "«»", title: "Cytat" },
];

/**
 * Rich-text commentary for the weekly summary, stored per ISO week.
 *
 * Uses `document.execCommand`. It is formally deprecated, but it remains the only API every
 * browser implements for toggling formatting inside contenteditable, and the alternative —
 * a full selection/range engine — is far more code than this surface justifies. The stored
 * HTML is sanitised on both read and write, so the deprecation risk is limited to the
 * editing gesture, not to what ends up in storage.
 */
export function SummaryEditor() {
  const weekKey = isoWeekKey();
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const [activeCommands, setActiveCommands] = useState<Set<string>>(new Set());
  const [storageFailed, setStorageFailed] = useState(false);

  /*
   * Payloads live in IndexedDB, so the first synchronous read returns the fallback and the
   * real value arrives later via a workspace-change event. Re-read on that event, but never
   * while the editor has focus — that would overwrite what is being typed.
   */
  useEffect(() => {
    const apply = () => {
      const editor = editorRef.current;
      if (!editor || editor.contains(document.activeElement)) return;
      const stored = loadSummaryNotes().weeks[weekKey] ?? "";
      if (editor.innerHTML !== stored) editor.innerHTML = stored;
    };
    apply();
    return subscribeToLocalWorkspace(SUMMARY_NOTES_STORAGE_KEY, apply);
  }, [weekKey]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const persist = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const html = editorRef.current?.innerHTML ?? "";
      setStorageFailed(!saveSummaryNote(weekKey, html));
    }, 400);
  }, [weekKey]);

  const refreshActiveCommands = useCallback(() => {
    const next = new Set<string>();
    for (const item of TOOLBAR) {
      if (item.kind !== "inline") continue;
      try {
        if (document.queryCommandState(item.command)) next.add(item.command);
      } catch {
        // queryCommandState throws when the selection sits outside the editor.
      }
    }
    setActiveCommands(next);
  }, []);

  const run = useCallback((item: Command) => {
    const editor = editorRef.current;
    if (!editor) return;
    // Focusing an already-focused editor collapses the selection, which would make
    // queryCommandValue read the wrong block and break the heading toggle.
    if (!editor.contains(document.activeElement)) editor.focus();

    if (item.kind === "inline") {
      document.execCommand(item.command);
    } else if (item.kind === "block") {
      // Toggle: applying the same block twice returns the line to a paragraph.
      const current = document.queryCommandValue("formatBlock").toLowerCase();
      const target = current === item.block ? "p" : item.block;
      document.execCommand("formatBlock", false, target);
    } else if (item.kind === "link") {
      const selection = window.getSelection();
      const selected = selection?.toString() ?? "";
      const url = window.prompt("Adres odnośnika", "https://");
      if (!url) return;
      if (selected) document.execCommand("createLink", false, url);
      else document.execCommand("insertHTML", false, `<a href="${url}">${url}</a>`);
    }

    refreshActiveCommands();
    persist();
  }, [persist, refreshActiveCommands]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    const command = key === "b" ? "bold" : key === "i" ? "italic" : key === "u" ? "underline" : null;
    if (!command) return;
    event.preventDefault();
    run({ kind: "inline", command });
  };

  // Paste as plain text: pasted markup would bypass the toolbar's vocabulary.
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    persist();
  };

  const handleBlur = () => {
    const editor = editorRef.current;
    if (!editor) return;
    // Normalise on blur so what is stored is exactly what will be re-rendered.
    const clean = sanitizeSummaryHtml(editor.innerHTML);
    if (clean !== editor.innerHTML) editor.innerHTML = clean;
    window.clearTimeout(saveTimer.current);
    setStorageFailed(!saveSummaryNote(weekKey, clean));
  };

  return (
    <section className="task-doc__editor" aria-label="Notatka do podsumowania tygodnia">
      <div className="task-doc__toolbar" role="toolbar" aria-label="Formatowanie tekstu">
        {TOOLBAR.map((item, index) => item.kind === "separator"
          ? <i key={`sep-${index}`} aria-hidden="true" />
          : (
            <button
              key={item.label}
              type="button"
              title={item.shortcut ? `${item.title} (${item.shortcut})` : item.title}
              aria-label={item.title}
              aria-pressed={item.kind === "inline" ? activeCommands.has(item.command) : undefined}
              className={item.kind === "inline" && activeCommands.has(item.command) ? "is-active" : undefined}
              // Keep the selection: mousedown would move focus out of the editor first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => run(item)}
            >
              {item.label}
            </button>
          ))}
      </div>

      <div
        ref={editorRef}
        className="task-doc__editable"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Treść notatki tygodnia"
        data-placeholder="Dopisz komentarz do tego tygodnia…"
        onInput={persist}
        onKeyUp={refreshActiveCommands}
        onMouseUp={refreshActiveCommands}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
      />

      {storageFailed && (
        <p className="task-doc__save-error" role="alert">
          Nie udało się zapisać notatki lokalnie. Skopiuj treść, zanim zamkniesz kartę.
        </p>
      )}
    </section>
  );
}
