import type { AssistantExecutionContext, AssistantToolResult } from "../core/types";

export type PendingAssistantConfirmation = {
  id: string;
  sessionId: string;
  turnId: string;
  toolName: string;
  operation: string;
  record: string;
  previousValue?: string;
  nextValue?: string;
  createdAt: string;
  expiresAt: string;
};

type QueuedConfirmation = {
  pending: PendingAssistantConfirmation;
  execute: (context: AssistantExecutionContext) => Promise<AssistantToolResult<unknown>>;
};

export type ConfirmationResolution =
  | { status: "executed"; pending: PendingAssistantConfirmation; result: AssistantToolResult<unknown> }
  | { status: "cancelled" | "expired" | "missing"; pending?: PendingAssistantConfirmation };

function createConfirmationId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `confirm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export class AssistantConfirmationManager {
  private readonly queue = new Map<string, QueuedConfirmation>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly ttlMs = 45_000) {}

  enqueue(
    input: Omit<PendingAssistantConfirmation, "id" | "createdAt" | "expiresAt">,
    execute: (context: AssistantExecutionContext) => Promise<AssistantToolResult<unknown>>,
    now = new Date(),
  ) {
    this.removeExpired(now);
    const pending: PendingAssistantConfirmation = {
      ...input,
      id: createConfirmationId(),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
    };
    this.queue.set(pending.id, { pending, execute });
    this.emit();
    return pending;
  }

  list(sessionId?: string, now = new Date()) {
    this.removeExpired(now);
    return [...this.queue.values()]
      .map(({ pending }) => pending)
      .filter((pending) => !sessionId || pending.sessionId === sessionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async confirm(
    id: string,
    sessionId: string,
    context: AssistantExecutionContext,
    now = context.now,
  ): Promise<ConfirmationResolution> {
    const queued = this.queue.get(id);
    if (!queued || queued.pending.sessionId !== sessionId) return { status: "missing" };
    this.queue.delete(id);
    this.emit();
    if (new Date(queued.pending.expiresAt).getTime() <= now.getTime()) {
      return { status: "expired", pending: queued.pending };
    }
    const result = await queued.execute(context);
    return { status: "executed", pending: queued.pending, result };
  }

  cancel(id: string, sessionId: string): ConfirmationResolution {
    const queued = this.queue.get(id);
    if (!queued || queued.pending.sessionId !== sessionId) return { status: "missing" };
    this.queue.delete(id);
    this.emit();
    return { status: "cancelled", pending: queued.pending };
  }

  clearSession(sessionId: string) {
    let changed = false;
    this.queue.forEach((queued, id) => {
      if (queued.pending.sessionId !== sessionId) return;
      this.queue.delete(id);
      changed = true;
    });
    if (changed) this.emit();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private removeExpired(now: Date) {
    let changed = false;
    this.queue.forEach((queued, id) => {
      if (new Date(queued.pending.expiresAt).getTime() > now.getTime()) return;
      this.queue.delete(id);
      changed = true;
    });
    if (changed) this.emit();
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}
