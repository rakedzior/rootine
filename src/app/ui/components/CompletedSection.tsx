import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface CompletedSectionProps {
  label: string;
  count: number;
  children: ReactNode;
  className?: string;
}

/** A quiet, collapsed-by-default disclosure for completed records. */
export function CompletedSection({ label, count, children, className = "" }: CompletedSectionProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <section className={`ui-completed-section ${open ? "is-open" : ""} ${className}`.trim()}>
      <button
        type="button"
        className="ui-completed-section__toggle"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown size={13} strokeWidth={1.7} aria-hidden="true" />
        <span>{label}</span>
        <span className="ui-completed-section__count">{count}</span>
      </button>
      {open && <div id={contentId} className="ui-completed-section__content">{children}</div>}
    </section>
  );
}
