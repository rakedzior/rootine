import type { z } from "zod";

export const ASSISTANT_SCOPES = [
  "today",
  "tasks",
  "habits",
  "nutrition",
  "body_data",
  "sport",
  "work",
  "goals",
  "matters",
  "notes",
  "finance",
  "navigation",
  "presentation",
] as const;

export type AssistantScope = (typeof ASSISTANT_SCOPES)[number];

export const ASSISTANT_TOOL_RISKS = [
  "read",
  "reversible_write",
  "confirmed_write",
  "destructive",
] as const;

export type AssistantToolRisk = (typeof ASSISTANT_TOOL_RISKS)[number];

export type AssistantToolFailureCode =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "VALIDATION"
  | "CONFLICT"
  | "PERMISSION"
  | "STORAGE"
  | "CONFIRMATION_REQUIRED"
  | "CONFIRMATION_EXPIRED"
  | "UNAVAILABLE"
  | "UNSUPPORTED";

export type AssistantToolFailure = {
  success: false;
  code: AssistantToolFailureCode;
  message: string;
  candidates?: Array<{ id: string; label: string; context?: string }>;
  confirmationId?: string;
  expiresAt?: string;
};

export type AssistantToolSuccess<TOutput> = {
  success: true;
  data: TOutput;
  message?: string;
};

export type AssistantToolResult<TOutput> =
  | AssistantToolSuccess<TOutput>
  | AssistantToolFailure;

export type AssistantApplicationContext = {
  module: string;
  subview?: string;
  selectedDate?: string;
  selectedEntityId?: string;
  activeFilter?: string;
  timezone: string;
  locale: string;
  privacyMode: boolean;
};

export type AssistantExecutionContext = {
  sessionId: string;
  turnId: string;
  now: Date;
  app: AssistantApplicationContext;
  signal?: AbortSignal;
};

export type AssistantToolDefinition<TInput, TOutput> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  risk: AssistantToolRisk;
  scopes: AssistantScope[];
  /** Recovery controls can opt out because the user already requested the compensating action. */
  confirmationMode?: "policy" | "never";
  describeConfirmation?: (input: TInput) => {
    operation: string;
    record: string;
    previousValue?: string;
    nextValue?: string;
  };
  execute(
    context: AssistantExecutionContext,
    input: TInput,
  ): Promise<AssistantToolResult<TOutput>>;
};

export type AssistantRealtimeTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};
