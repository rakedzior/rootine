import {
  domainEventBus,
  type DomainEvent,
  type DomainEventType,
  type RootineDomain,
} from "../../infrastructure/events";
import { createDomainId } from "./ids";
import {
  domainFailure,
  type DomainMutationFailure,
  type DomainMutationResult,
} from "./result";

export type UndoCompensationResult<TSnapshot = unknown> =
  | {
    success: true;
    updatedSnapshot: TSnapshot;
    message: string;
    inverse: UndoCompensation;
  }
  | DomainMutationFailure;

export type UndoCompensation = () => Promise<UndoCompensationResult>;

interface UndoRecord {
  token: string;
  entityId: string;
  domain: RootineDomain;
  eventId: string;
  eventType: DomainEventType;
  expiresAt: number;
  compensate: UndoCompensation;
}

export class UndoManager {
  private readonly records = new Map<string, UndoRecord>();

  constructor(
    private readonly defaultTtlMs = 10_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  register(options: {
    event: DomainEvent;
    compensate: UndoCompensation;
    ttlMs?: number;
  }) {
    this.prune();
    const token = createDomainId("undo");
    this.records.set(token, {
      token,
      entityId: options.event.entityId,
      domain: options.event.domain,
      eventId: options.event.id,
      eventType: options.event.type,
      expiresAt: this.now() + (options.ttlMs ?? this.defaultTtlMs),
      compensate: options.compensate,
    });
    return token;
  }

  has(token: string) {
    this.prune();
    return this.records.has(token);
  }

  async undo(token: string): Promise<DomainMutationResult<unknown>> {
    const record = this.records.get(token);
    if (!record) return domainFailure("NOT_FOUND", "Nie znaleziono działania do cofnięcia.");
    if (record.expiresAt <= this.now()) {
      this.records.delete(token);
      return domainFailure("CONFLICT", "Czas na cofnięcie działania upłynął.");
    }

    this.records.delete(token);
    const result = await record.compensate();
    if (!result.success) {
      if (record.expiresAt > this.now()) this.records.set(token, record);
      return result;
    }

    const undoEvent = domainEventBus.emit({
      type: "undo.applied",
      domain: "undo",
      entityId: record.entityId,
      payload: {
        originalEventId: record.eventId,
        originalEventType: record.eventType,
      },
    });
    const redoToken = this.register({
      event: undoEvent,
      compensate: result.inverse,
    });
    return {
      success: true,
      entityId: record.entityId,
      eventId: undoEvent.id,
      undoToken: redoToken,
      updatedSnapshot: result.updatedSnapshot,
      message: result.message,
    };
  }

  clear() {
    this.records.clear();
  }

  private prune() {
    const now = this.now();
    this.records.forEach((record, token) => {
      if (record.expiresAt <= now) this.records.delete(token);
    });
  }
}

export const domainUndoManager = new UndoManager();
