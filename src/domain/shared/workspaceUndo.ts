import { persistAndVerify } from "./persistence";
import { domainFailure } from "./result";
import type { UndoCompensation } from "./undoManager";

function equalValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createWorkspaceUndo<TWorkspace, TValue>(options: {
  storageKey: string;
  read: () => TWorkspace;
  save: (workspace: TWorkspace) => boolean;
  select: (workspace: TWorkspace) => TValue | null;
  apply: (workspace: TWorkspace, value: TValue | null) => TWorkspace;
  expected: TValue | null;
  restore: TValue | null;
  message: string;
  inverseMessage?: string;
}): UndoCompensation {
  return async () => {
    const current = options.read();
    const selected = options.select(current);
    if (!equalValue(selected, options.expected)) {
      return domainFailure(
        selected === null ? "NOT_FOUND" : "CONFLICT",
        selected === null
          ? "Rekord potrzebny do cofnięcia już nie istnieje."
          : "Rekord zmienił się od czasu operacji. Cofnięcie zostało zatrzymane.",
      );
    }

    const next = options.apply(current, options.restore);
    const persisted = await persistAndVerify({
      storageKey: options.storageKey,
      save: () => options.save(next),
      read: options.read,
      verify: (workspace) => equalValue(options.select(workspace), options.restore),
    });
    if (!persisted.ok) return persisted.failure;

    return {
      success: true as const,
      updatedSnapshot: options.select(persisted.snapshot),
      message: options.message,
      inverse: createWorkspaceUndo({
        ...options,
        expected: options.restore,
        restore: options.expected,
        message: options.inverseMessage ?? "Ponowiono cofniętą zmianę.",
        inverseMessage: options.message,
      }),
    };
  };
}
