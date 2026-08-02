import { z } from "zod";
import type {
  AssistantRealtimeTool,
  AssistantToolDefinition,
  AssistantToolResult,
  AssistantExecutionContext,
} from "../core/types";

export type RegisteredAssistantTool = AssistantToolDefinition<unknown, unknown>;

export class AssistantToolRegistry {
  private readonly definitions = new Map<string, RegisteredAssistantTool>();

  register<TInput, TOutput>(definition: AssistantToolDefinition<TInput, TOutput>) {
    if (definition.risk === "destructive") {
      throw new Error(`Destructive assistant tool "${definition.name}" cannot be registered.`);
    }
    if (this.definitions.has(definition.name)) {
      throw new Error(`Assistant tool "${definition.name}" is already registered.`);
    }
    const registered: RegisteredAssistantTool = {
      ...definition,
      inputSchema: definition.inputSchema as z.ZodType<unknown>,
      outputSchema: definition.outputSchema as z.ZodType<unknown>,
      describeConfirmation: definition.describeConfirmation
        ? (input) => definition.describeConfirmation?.(input as TInput) ?? {
          operation: definition.description,
          record: definition.name,
        }
        : undefined,
      execute: (context: AssistantExecutionContext, input: unknown): Promise<AssistantToolResult<unknown>> => (
        definition.execute(context, input as TInput)
      ),
    };
    this.definitions.set(definition.name, registered);
    return this;
  }

  get(name: string) {
    return this.definitions.get(name);
  }

  list() {
    return [...this.definitions.values()];
  }

  toRealtimeTools(): AssistantRealtimeTool[] {
    return this.list().map((definition) => {
      const schema = z.toJSONSchema(definition.inputSchema, { target: "draft-7" });
      const { $schema: _schema, ...parameters } = schema;
      return {
        type: "function",
        name: definition.name,
        description: definition.description,
        parameters,
      };
    });
  }
}
