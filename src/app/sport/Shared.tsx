import type { ReactNode } from "react";
import { Badge, EmptyState as UiEmptyState, Modal as UiModal, SectionHeader, type ModalSize } from "../ui";
import type { Discipline, SessionStatus } from "./model";
import { DISCIPLINE_META, STATUS_META } from "./theme";

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

export function Modal({ title, eyebrow, children, onClose, size = "md" }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; size?: ModalSize }) {
  return <UiModal title={title} eyebrow={eyebrow} onClose={onClose} size={size} bodyClassName="p-0">{children}</UiModal>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <UiEmptyState title={title} description={description} action={action} />;
}
