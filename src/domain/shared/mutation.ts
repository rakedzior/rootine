import {
  domainEventBus,
  type DomainEventInput,
  type DomainEventType,
} from "../../infrastructure/events";
import { persistAndVerify } from "./persistence";
import type { DomainMutationResult } from "./result";
import {
  domainUndoManager,
  type UndoCompensation,
} from "./undoManager";

export async function commitDomainMutation<TWorkspace, TSnapshot, TType extends DomainEventType>(options: {
  entityId: string;
  storageKey: string;
  event: DomainEventInput<TType>;
  save: () => boolean;
  read: () => TWorkspace;
  verify: (workspace: TWorkspace) => boolean;
  selectSnapshot: (workspace: TWorkspace) => TSnapshot;
  message: string;
  compensation: UndoCompensation;
}): Promise<DomainMutationResult<TSnapshot>> {
  const persisted = await persistAndVerify({
    storageKey: options.storageKey,
    save: options.save,
    read: options.read,
    verify: options.verify,
  });
  if (!persisted.ok) return persisted.failure;

  const event = domainEventBus.emit(options.event);
  const undoToken = domainUndoManager.register({
    event,
    compensate: options.compensation,
  });
  return {
    success: true,
    entityId: options.entityId,
    eventId: event.id,
    undoToken,
    updatedSnapshot: options.selectSnapshot(persisted.snapshot),
    message: options.message,
  };
}
