import type { AssistantSettings } from "../config/assistant-settings";
import type {
  AssistantExecutionContext,
  AssistantToolFailure,
  AssistantToolResult,
} from "../core/types";
import { AssistantConfirmationManager } from "../confirmations/confirmation-manager";
import { requiresAssistantConfirmation } from "../confirmations/confirmation-policy";
import { canUseAssistantTool } from "../permissions/permissions";
import type { AssistantToolRegistry, RegisteredAssistantTool } from "./tool-registry";

export type AssistantToolCall = {
  callId: string;
  name: string;
  arguments: string;
};

export type AssistantExecutedToolCall = {
  callId: string;
  name: string;
  result: AssistantToolResult<unknown>;
  requiresConfirmation: boolean;
};

function failure(code: AssistantToolFailure["code"], message: string): AssistantToolFailure {
  return { success: false, code, message };
}

export class AssistantToolExecutor {
  private readonly issuedEntityIds = new Map<string, Set<string>>();
  private readonly ambiguousEntityIds = new Map<string, Set<string>>();

  constructor(
    private readonly registry: AssistantToolRegistry,
    private readonly settings: () => AssistantSettings,
    readonly confirmations = new AssistantConfirmationManager(),
  ) {}

  async execute(
    call: AssistantToolCall,
    context: AssistantExecutionContext,
  ): Promise<AssistantExecutedToolCall> {
    const definition = this.registry.get(call.name);
    if (!definition) {
      return this.wrap(call, failure("UNSUPPORTED", "To narzędzie nie jest dostępne w Rootine."));
    }
    const parsedArguments = this.parseArguments(call.arguments);
    if (!parsedArguments.success) return this.wrap(call, parsedArguments);

    const parsedInput = definition.inputSchema.safeParse(parsedArguments.data);
    if (!parsedInput.success) {
      return this.wrap(call, failure(
        "VALIDATION",
        `Nieprawidłowe argumenty narzędzia: ${parsedInput.error.issues.map((issue) => issue.message).join("; ")}`,
      ));
    }

    const settings = this.settings();
    const permission = canUseAssistantTool(settings, definition.scopes, definition.risk);
    if (!permission.allowed) {
      return this.wrap(call, { success: false, code: permission.code, message: permission.message });
    }

    const provenance = this.validateEntityProvenance(definition, parsedInput.data, context);
    if (!provenance.success) return this.wrap(call, provenance);

    const execute = (freshContext: AssistantExecutionContext) => {
      const freshPermission = canUseAssistantTool(this.settings(), definition.scopes, definition.risk);
      if (!freshPermission.allowed) {
        return Promise.resolve(failure(freshPermission.code, freshPermission.message));
      }
      const freshProvenance = this.validateEntityProvenance(definition, parsedInput.data, freshContext);
      if (!freshProvenance.success) return Promise.resolve(freshProvenance);
      return this.executeValidated(definition, parsedInput.data, freshContext);
    };
    if (definition.confirmationMode !== "never" && requiresAssistantConfirmation(definition.risk, settings)) {
      const description = definition.describeConfirmation?.(parsedInput.data) ?? {
        operation: definition.description,
        record: "Wybrany rekord",
      };
      const pending = this.confirmations.enqueue({
        sessionId: context.sessionId,
        turnId: context.turnId,
        toolName: definition.name,
        ...description,
      }, execute, context.now);
      return {
        ...this.wrap(call, {
          success: false,
          code: "CONFIRMATION_REQUIRED",
          message: "Ta operacja wymaga potwierdzenia.",
          confirmationId: pending.id,
          expiresAt: pending.expiresAt,
        }),
        requiresConfirmation: true,
      };
    }

    return this.wrap(call, await execute(context));
  }

  confirm(id: string, context: AssistantExecutionContext) {
    return this.confirmations.confirm(id, context.sessionId, context);
  }

  authorizeEntity(sessionId: string, entityId: string) {
    const normalized = entityId.trim();
    if (!normalized) return false;
    const issued = this.issuedEntityIds.get(sessionId);
    const ambiguous = this.ambiguousEntityIds.get(sessionId);
    if (!issued?.has(normalized) && !ambiguous?.has(normalized)) return false;
    this.entityIdsFor(this.issuedEntityIds, sessionId).add(normalized);
    ambiguous?.delete(normalized);
    return true;
  }

  clearSession(sessionId: string) {
    this.confirmations.clearSession(sessionId);
    this.issuedEntityIds.delete(sessionId);
    this.ambiguousEntityIds.delete(sessionId);
  }

  private async executeValidated(
    definition: RegisteredAssistantTool,
    input: unknown,
    context: AssistantExecutionContext,
  ): Promise<AssistantToolResult<unknown>> {
    if (context.signal?.aborted) return failure("UNAVAILABLE", "Operacja została anulowana.");
    try {
      const result = await definition.execute(context, input);
      if (!result.success) {
        this.rememberResultIds(context.sessionId, definition, result);
        return result;
      }
      const parsedOutput = definition.outputSchema.safeParse(result.data);
      if (!parsedOutput.success) {
        return failure("VALIDATION", "Narzędzie zwróciło nieprawidłowy wynik i zmiana nie została potwierdzona.");
      }
      this.rememberResultIds(context.sessionId, definition, { ...result, data: parsedOutput.data });
      // Keep the validated domain result intact internally. Privacy filtering is
      // applied independently at the model and panel boundaries so eventId and
      // undoToken remain available for local refresh/Undo bookkeeping.
      return { ...result, data: parsedOutput.data };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return failure("UNAVAILABLE", "Operacja została anulowana.");
      }
      return failure("STORAGE", "Nie udało się wykonać operacji. Dane nie zostały potwierdzone jako zapisane.");
    }
  }

  private validateEntityProvenance(
    definition: RegisteredAssistantTool,
    input: unknown,
    context: AssistantExecutionContext,
  ): AssistantToolResult<unknown> {
    if (definition.risk === "read" || definition.name === "undo_action") {
      return { success: true, data: {} };
    }
    const ids = collectEntityIds(input);
    if (context.app.selectedEntityId) {
      this.entityIdsFor(this.issuedEntityIds, context.sessionId).add(context.app.selectedEntityId);
    }
    const issued = this.issuedEntityIds.get(context.sessionId);
    const unknown = ids.find((id) => !issued?.has(id));
    return unknown
      ? failure("VALIDATION", "Najpierw wyszukaj i jednoznacznie wybierz rekord przed zapisem.")
      : { success: true, data: {} };
  }

  private rememberResultIds(
    sessionId: string,
    definition: RegisteredAssistantTool,
    result: AssistantToolResult<unknown>,
  ) {
    if (result.success) {
      const ids = collectEntityIds(result.data);
      if (ids.length === 0) return;
      const issued = this.entityIdsFor(this.issuedEntityIds, sessionId);
      ids.slice(0, 200).forEach((id) => issued.add(id));
      return;
    }
    if (definition.risk !== "read" || result.code !== "AMBIGUOUS") return;
    const ambiguous = this.entityIdsFor(this.ambiguousEntityIds, sessionId);
    result.candidates?.slice(0, 50).forEach((candidate) => ambiguous.add(candidate.id));
  }

  private entityIdsFor(target: Map<string, Set<string>>, sessionId: string) {
    let ids = target.get(sessionId);
    if (!ids) {
      ids = new Set<string>();
      target.set(sessionId, ids);
    }
    return ids;
  }

  private parseArguments(raw: string): AssistantToolResult<unknown> {
    try {
      const value: unknown = JSON.parse(raw || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return failure("VALIDATION", "Argumenty narzędzia muszą być obiektem.");
      }
      return { success: true, data: value };
    } catch {
      return failure("VALIDATION", "Argumenty narzędzia nie są poprawnym JSON-em.");
    }
  }

  private wrap(
    call: AssistantToolCall,
    result: AssistantToolResult<unknown>,
  ): AssistantExecutedToolCall {
    return { callId: call.callId, name: call.name, result, requiresConfirmation: false };
  }
}

const NON_ENTITY_ID_KEYS = new Set([
  "callId",
  "confirmationId",
  "eventId",
  "sessionId",
  "turnId",
]);

function collectEntityIds(value: unknown, key = "", ids = new Set<string>()): string[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectEntityIds(item, key, ids));
    return [...ids];
  }
  if (!value || typeof value !== "object") {
    const isIdKey = key === "id" || key.endsWith("Id");
    if (isIdKey && !NON_ENTITY_ID_KEYS.has(key) && (typeof value === "string" || typeof value === "number")) {
      const normalized = String(value).trim();
      if (normalized) ids.add(normalized);
    }
    return [...ids];
  }
  Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => {
    collectEntityIds(child, childKey, ids);
  });
  return [...ids];
}
