import type { ReactNode } from "react";
import { Badge, EmptyState as UiEmptyState, Modal as UiModal, SectionHeader } from "../ui";
import type { Discipline, SessionStatus } from "./model";
import { DISCIPLINE_META, SPORT_COLORS as C, STATUS_META } from "./theme";

export function SectionLabel({ children }: { children: ReactNode }) {
  return <SectionHeader title={children} level={2} variant="label" />;
}

export function DisciplineLabel({ discipline, compact = false }: { discipline: Discipline; compact?: boolean }) {
  const meta = DISCIPLINE_META[discipline];
  return (
    <Badge appearance="plain" dot style={{ color: meta.color, fontSize: compact ? 9 : 10 }}>
      {meta.label}
    </Badge>
  );
}

export function StatusLabel({ status, compact = false }: { status: SessionStatus; compact?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <Badge appearance="plain" dot style={{ color: meta.color, fontSize: compact ? 9 : 10 }}>
      {meta.label}
    </Badge>
  );
}

export function ProgressBar({ value, color = C.blue }: { value: number; color?: string }) {
  return <div className="h-1 overflow-hidden rounded-full" style={{ background: C.border }}><div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>;
}

export function Modal({ title, eyebrow, children, onClose, width = 520 }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; width?: number }) {
  return <UiModal title={title} eyebrow={eyebrow} onClose={onClose} width={width} bodyClassName="p-0">{children}</UiModal>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <UiEmptyState title={title} description={description} action={action} />;
}
