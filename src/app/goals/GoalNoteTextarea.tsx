import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Textarea, type TextareaProps } from "../ui";

type GoalNoteTextareaProps = Omit<
  TextareaProps,
  "value" | "defaultValue" | "onChange"
> & {
  value: string;
  onCommit: (value: string) => void;
  delay?: number;
};

export function GoalNoteTextarea({
  value,
  onCommit,
  delay = 250,
  onBlur,
  ...props
}: GoalNoteTextareaProps) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const committedRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    const previousCommitted = committedRef.current;
    committedRef.current = value;
    if (draftRef.current !== previousCommitted) return;
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  const flush = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const next = draftRef.current;
    if (next === committedRef.current) return;
    committedRef.current = next;
    onCommitRef.current(next);
  }, []);

  useEffect(() => {
    const flushPendingNote = () => flush();
    window.addEventListener("pagehide", flushPendingNote);
    window.addEventListener("beforeunload", flushPendingNote);
    return () => {
      window.removeEventListener("pagehide", flushPendingNote);
      window.removeEventListener("beforeunload", flushPendingNote);
      flush();
    };
  }, [flush]);

  return (
    <Textarea
      embedded
      {...props}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        draftRef.current = next;
        setDraft(next);
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(flush, delay);
      }}
      onBlur={(event) => {
        flush();
        onBlur?.(event);
      }}
    />
  );
}
