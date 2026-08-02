import type { DomainEvent, DomainEventInput, DomainEventType } from "./domainEvent";

type DomainEventListener<TType extends DomainEventType = DomainEventType> = (
  event: DomainEvent<TType>,
) => void;

function createEventId() {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `event-${suffix}`;
}

export class DomainEventBus {
  private readonly listeners = new Map<DomainEventType | "*", Set<DomainEventListener>>();

  create<TType extends DomainEventType>(input: DomainEventInput<TType>): DomainEvent<TType> {
    return Object.freeze({
      ...input,
      id: createEventId(),
      occurredAt: new Date().toISOString(),
      payload: Object.freeze({ ...input.payload }),
    }) as DomainEvent<TType>;
  }

  publish<TType extends DomainEventType>(event: DomainEvent<TType>) {
    const typedListeners = this.listeners.get(event.type);
    typedListeners?.forEach((listener) => listener(event as DomainEvent));
    this.listeners.get("*")?.forEach((listener) => listener(event as DomainEvent));
  }

  emit<TType extends DomainEventType>(input: DomainEventInput<TType>) {
    const event = this.create(input);
    this.publish(event);
    return event;
  }

  subscribe<TType extends DomainEventType>(
    type: TType,
    listener: DomainEventListener<TType>,
  ): () => void;
  subscribe(type: "*", listener: DomainEventListener): () => void;
  subscribe(
    type: DomainEventType | "*",
    listener: DomainEventListener,
  ) {
    const listeners = this.listeners.get(type) ?? new Set<DomainEventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(type);
    };
  }

  clear() {
    this.listeners.clear();
  }
}

export const domainEventBus = new DomainEventBus();
