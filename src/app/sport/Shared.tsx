import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { Discipline, SessionStatus } from "./model";
import { DISCIPLINE_META, SPORT_COLORS as C, STATUS_META } from "./theme";

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.textMuted }}>{children}</p>;
}

export function DisciplineLabel({ discipline, compact = false }: { discipline: Discipline; compact?: boolean }) {
  const meta = DISCIPLINE_META[discipline];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: C.textMuted, fontSize: compact ? 9 : 10 }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export function StatusLabel({ status, compact = false }: { status: SessionStatus; compact?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: meta.color, fontSize: compact ? 9 : 10 }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export function ProgressBar({ value, color = C.blue }: { value: number; color?: string }) {
  return <div className="h-1 overflow-hidden rounded-full" style={{ background: C.border }}><div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>;
}

export function Modal({ title, eyebrow, children, onClose, width = 520 }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; width?: number }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.62)" }} onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[88vh] w-full overflow-y-auto rounded-2xl border shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ maxWidth: width, background: C.cardStrong, borderColor: C.borderStrong }} onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: C.border }}>
          <div>
            {eyebrow && <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.textMuted }}>{eyebrow}</p>}
            <h2 className="text-[16px] font-semibold" style={{ color: C.text }}>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Zamknij" className="flex h-7 w-7 items-center justify-center rounded-md" style={{ color: C.textMuted }}><X size={14} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

export const inputStyle = { background: C.input, borderColor: C.border, color: C.text };

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center" style={{ borderColor: C.border }}><p className="text-[12px] font-medium" style={{ color: C.textSecond }}>{title}</p><p className="mt-1 max-w-sm text-[10px] leading-5" style={{ color: C.textMuted }}>{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
