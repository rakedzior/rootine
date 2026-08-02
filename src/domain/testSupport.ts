import { createBrowserWorkspacePayloadStore } from "../app/data/indexedDbWorkspaceStore";
import { setWorkspacePayloadStoreForTests } from "../app/data/localRepository";
import { domainEventBus } from "../infrastructure/events";
import { domainUndoManager } from "./shared/undoManager";

export function resetDomainTestStorage() {
  window.localStorage.clear();
  setWorkspacePayloadStoreForTests(createBrowserWorkspacePayloadStore(undefined));
  domainUndoManager.clear();
  domainEventBus.clear();
}
