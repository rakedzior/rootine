import {
  flushLocalWorkspaceWrites,
  listLocalPersistenceIssues,
} from "../../app/data/localRepository";
import { domainFailure, type DomainMutationFailure } from "./result";

export type PersistenceResult<TSnapshot> =
  | { ok: true; snapshot: TSnapshot }
  | { ok: false; failure: DomainMutationFailure };

export async function persistAndVerify<TSnapshot>(options: {
  storageKey: string;
  save: () => boolean;
  read: () => TSnapshot;
  verify: (snapshot: TSnapshot) => boolean;
}): Promise<PersistenceResult<TSnapshot>> {
  if (!options.save()) {
    const conflict = listLocalPersistenceIssues().some((issue) => (
      issue.key === options.storageKey && issue.kind === "conflict"
    ));
    return {
      ok: false,
      failure: domainFailure(
        conflict ? "CONFLICT" : "STORAGE",
        conflict
          ? "Dane zmieniły się w innym widoku. Odśwież wynik i spróbuj ponownie."
          : "Nie udało się rozpocząć trwałego zapisu.",
      ),
    };
  }

  await flushLocalWorkspaceWrites();
  const snapshot = options.read();
  if (options.verify(snapshot)) return { ok: true, snapshot };

  const conflict = listLocalPersistenceIssues().some((issue) => (
    issue.key === options.storageKey && issue.kind === "conflict"
  ));
  return {
    ok: false,
    failure: domainFailure(
      conflict ? "CONFLICT" : "STORAGE",
      conflict
        ? "Rekord został równolegle zmieniony. Operacja nie została potwierdzona."
        : "Magazyn nie potwierdził zapisanej zmiany.",
    ),
  };
}
