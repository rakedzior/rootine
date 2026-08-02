import { z } from "zod";
import type { AssistantToolRegistry } from "../tools/tool-registry";
import {
  ASSISTANT_PANEL_TYPES,
  ASSISTANT_VIEW_LAYOUTS,
  assistantPanelSpecSchema,
  assistantViewSchema,
  type AssistantPanelSpec,
} from "../panels/panel-schemas";
import type { AssistantPresentationController } from "./presentation-controller";

const navigationTargets = {
  today: "/dzisiaj",
  tasks: "/zadania",
  calendar: "/kalendarz",
  habits: "/zadania?widok=nawyki",
  nutrition: "/odzywianie",
  sport: "/sport",
  work: "/praca",
  goals: "/cele",
  matters: "/sprawy",
  finance: "/sprawy?widok=payments",
  notes: "/notatki",
  travel: "/podroze",
} as const;

const presentationPanelRequestSchema = z.object({
  id: z.string().min(1).max(160).optional(),
  type: z.enum(ASSISTANT_PANEL_TYPES),
  title: z.string().min(1).max(120).optional(),
  entityIds: z.array(z.string().min(1).max(160)).max(20).default([]),
  emphasis: z.enum(["normal", "primary", "warning", "success"]).optional(),
}).strict();

const panelRequestTypes = new Set<string>([
  "priority_tasks",
  "urgent_tasks",
  "overdue_items",
  "task_candidates",
  "upcoming_workouts",
  "note_results",
]);

function emptyPanel(request: z.infer<typeof presentationPanelRequestSchema>, index: number): AssistantPanelSpec {
  const base = {
    id: request.id ?? `panel-${Date.now().toString(36)}-${index}`,
    title: request.title,
    entityIds: request.entityIds,
    emphasis: request.emphasis,
  };
  if (panelRequestTypes.has(request.type)) {
    return assistantPanelSpecSchema.parse({
      ...base,
      type: request.type,
      data: { items: [], total: request.entityIds.length, emptyMessage: "Dane odświeża właściwe narzędzie odczytu." },
    });
  }
  const summaryType = request.type === "meal_draft"
    || request.type === "confirmation"
    || request.type === "clarification"
    || request.type === "action_result"
    || request.type === "error"
    ? "today_overview"
    : request.type;
  return assistantPanelSpecSchema.parse({
    ...base,
    type: summaryType,
    data: { metrics: [], items: [], summary: "Dane odświeża właściwe narzędzie odczytu." },
  });
}

export function registerPresentationTools(
  registry: AssistantToolRegistry,
  presentation: AssistantPresentationController,
  navigate: (path: string) => void,
) {
  registry.register({
    name: "present_assistant_view",
    description: "Present a Rootine view using only the closed panel catalog and a controlled layout.",
    inputSchema: z.object({
      title: z.string().min(1).max(120),
      layout: z.enum(ASSISTANT_VIEW_LAYOUTS),
      panels: z.array(presentationPanelRequestSchema).min(1).max(6),
      highlightArea: z.string().min(1).max(80).optional(),
    }).strict(),
    outputSchema: assistantViewSchema,
    risk: "read",
    scopes: ["presentation"],
    execute: async (_context, input) => {
      const view = assistantViewSchema.parse({
        id: `view-${Date.now().toString(36)}`,
        title: input.title,
        layout: input.layout,
        panels: input.panels.map(emptyPanel),
        highlightArea: input.highlightArea,
      });
      presentation.present(view);
      return { success: true, data: view };
    },
  });

  registry.register({
    name: "update_assistant_view",
    description: "Update the title or controlled layout of the current Assistant Stage.",
    inputSchema: z.object({
      title: z.string().min(1).max(120).optional(),
      layout: z.enum(ASSISTANT_VIEW_LAYOUTS).optional(),
    }).strict().refine((value) => value.title !== undefined || value.layout !== undefined),
    outputSchema: z.object({ updated: z.boolean() }),
    risk: "read",
    scopes: ["presentation"],
    execute: async (_context, input) => ({ success: true, data: { updated: presentation.update(input) } }),
  });

  registry.register({
    name: "clear_assistant_view",
    description: "Clear the current Assistant Stage panels.",
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ cleared: z.literal(true) }),
    risk: "read",
    scopes: ["presentation"],
    execute: async () => {
      presentation.clear();
      return { success: true, data: { cleared: true as const } };
    },
  });

  registry.register({
    name: "highlight_entities",
    description: "Highlight a small set of entity IDs already returned by a Rootine query.",
    inputSchema: z.object({ entityIds: z.array(z.string().min(1).max(160)).min(1).max(20) }).strict(),
    outputSchema: z.object({ highlighted: z.number().int().nonnegative() }),
    risk: "read",
    scopes: ["presentation"],
    execute: async (_context, { entityIds }) => {
      presentation.highlight(entityIds);
      return { success: true, data: { highlighted: entityIds.length } };
    },
  });

  registry.register({
    name: "navigate_to_module",
    description: "Navigate to a known Rootine module or subview.",
    inputSchema: z.object({ module: z.enum(Object.keys(navigationTargets) as [keyof typeof navigationTargets, ...(keyof typeof navigationTargets)[]]) }).strict(),
    outputSchema: z.object({ path: z.string() }),
    risk: "read",
    scopes: ["navigation"],
    execute: async (_context, { module }) => {
      const path = navigationTargets[module];
      navigate(path);
      return { success: true, data: { path } };
    },
  });

  registry.register({
    name: "open_entity_details",
    description: "Open details for a previously returned goal or trip entity ID.",
    inputSchema: z.object({
      entityType: z.enum(["goal", "trip"]),
      entityId: z.string().min(1).max(160),
    }).strict(),
    outputSchema: z.object({ path: z.string() }),
    risk: "read",
    scopes: ["navigation"],
    execute: async (_context, { entityType, entityId }) => {
      const path = entityType === "goal"
        ? `/cele/${encodeURIComponent(entityId)}`
        : `/podroze/${encodeURIComponent(entityId)}`;
      navigate(path);
      return { success: true, data: { path } };
    },
  });
}
