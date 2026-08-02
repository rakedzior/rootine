export type DomainFailureCode =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "VALIDATION"
  | "CONFLICT"
  | "PERMISSION"
  | "STORAGE";

export interface DomainCandidate {
  id: string;
  title: string;
  module: string;
  status?: string;
  date?: string;
  context?: string;
}

export interface DomainMutationSuccess<TSnapshot> {
  success: true;
  entityId: string;
  eventId: string;
  undoToken: string;
  updatedSnapshot: TSnapshot;
  message: string;
}

export interface DomainMutationFailure {
  success: false;
  code: DomainFailureCode;
  message: string;
  candidates: DomainCandidate[];
}

export type DomainMutationResult<TSnapshot> =
  | DomainMutationSuccess<TSnapshot>
  | DomainMutationFailure;

export function domainFailure(
  code: DomainFailureCode,
  message: string,
  candidates: DomainCandidate[] = [],
): DomainMutationFailure {
  return { success: false, code, message, candidates };
}
