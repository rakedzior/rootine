import { z } from "zod";

export const ASSISTANT_PANEL_TYPES = [
  "today_overview",
  "priority_tasks",
  "urgent_tasks",
  "overdue_items",
  "task_candidates",
  "habits_summary",
  "nutrition_summary",
  "meal_draft",
  "water_summary",
  "body_summary",
  "sport_summary",
  "upcoming_workouts",
  "work_summary",
  "goal_summary",
  "matter_summary",
  "note_results",
  "finance_summary",
  "confirmation",
  "clarification",
  "action_result",
  "error",
] as const;

export const ASSISTANT_VIEW_LAYOUTS = [
  "focus",
  "focus_with_supporting",
  "comparison",
  "list",
  "confirmation",
  "summary_grid",
] as const;

export const assistantPanelActionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(60),
  action: z.enum(["select", "open", "confirm", "cancel", "undo", "retry"]),
  entityId: z.string().min(1).max(160).optional(),
}).strict();

export const assistantPanelItemSchema = z.object({
  id: z.string().min(1).max(160),
  label: z.string().min(1).max(200),
  meta: z.string().max(220).optional(),
  status: z.enum(["open", "done", "overdue", "attention", "scheduled", "draft"]).optional(),
  value: z.string().max(100).optional(),
  sensitive: z.boolean().optional(),
}).strict();

export const assistantPanelMetricSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(100),
  value: z.union([z.string().max(100), z.number().finite()]),
  unit: z.string().max(24).optional(),
  tone: z.enum(["neutral", "primary", "warning", "success", "danger"]).optional(),
  sensitive: z.boolean().optional(),
}).strict();

const ingredientSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  grams: z.number().positive().optional(),
  matched: z.boolean(),
  kcal: z.number().nonnegative().optional(),
  protein: z.number().nonnegative().optional(),
  carbs: z.number().nonnegative().optional(),
  fat: z.number().nonnegative().optional(),
}).strict();

const nutritionTotalsSchema = z.object({
  kcal: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
}).strict();

/*
 * One closed data envelope keeps rendering deterministic while allowing every panel
 * to share the same strongly typed renderer. Fields are still finite and validated;
 * arbitrary HTML, styles, component names and nested model payloads are impossible.
 */
export const assistantPanelDataSchema = z.object({
  metrics: z.array(assistantPanelMetricSchema).max(8).default([]),
  items: z.array(assistantPanelItemSchema).max(12).default([]),
  total: z.number().int().nonnegative().optional(),
  summary: z.string().max(500).optional(),
  emptyMessage: z.string().max(180).optional(),
  draftId: z.string().min(1).max(160).optional(),
  meal: z.string().min(1).max(80).optional(),
  ingredients: z.array(ingredientSchema).max(20).optional(),
  totals: nutritionTotalsSchema.optional(),
  requiresConfirmation: z.boolean().optional(),
  confirmationId: z.string().min(1).max(160).optional(),
  operation: z.string().min(1).max(180).optional(),
  record: z.string().min(1).max(180).optional(),
  previousValue: z.string().max(180).optional(),
  nextValue: z.string().max(180).optional(),
  expiresAt: z.string().datetime().optional(),
  prompt: z.string().min(1).max(300).optional(),
  success: z.boolean().optional(),
  message: z.string().min(1).max(300).optional(),
  undoToken: z.string().min(1).max(200).optional(),
  undoExpiresAt: z.string().datetime().optional(),
  code: z.string().min(1).max(80).optional(),
  recovery: z.string().max(240).optional(),
  retryable: z.boolean().optional(),
}).strict();

export const assistantPanelSpecSchema = z.object({
  id: z.string().min(1).max(160),
  type: z.enum(ASSISTANT_PANEL_TYPES),
  title: z.string().min(1).max(120).optional(),
  entityIds: z.array(z.string().min(1).max(160)).max(20).optional(),
  emphasis: z.enum(["normal", "primary", "warning", "success"]).optional(),
  actions: z.array(assistantPanelActionSchema).max(6).optional(),
  data: assistantPanelDataSchema,
}).strict().superRefine((panel, context) => {
  if (panel.type === "confirmation" && (!panel.data.confirmationId || !panel.data.operation || !panel.data.expiresAt)) {
    context.addIssue({ code: "custom", message: "Panel potwierdzenia wymaga identyfikatora, operacji i czasu wygaśnięcia." });
  }
  if (panel.type === "clarification" && (!panel.data.prompt || panel.data.items.length === 0)) {
    context.addIssue({ code: "custom", message: "Panel doprecyzowania wymaga pytania i kandydatów." });
  }
  if (panel.type === "meal_draft" && (!panel.data.draftId || !panel.data.meal || !panel.data.ingredients?.length)) {
    context.addIssue({ code: "custom", message: "Panel szkicu posiłku wymaga źródłowych składników." });
  }
});

export const assistantViewSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(120),
  layout: z.enum(ASSISTANT_VIEW_LAYOUTS),
  panels: z.array(assistantPanelSpecSchema).max(6),
  highlightArea: z.string().min(1).max(80).optional(),
}).strict();

export type AssistantPanelSpec = z.infer<typeof assistantPanelSpecSchema>;
export type AssistantView = z.infer<typeof assistantViewSchema>;
export type AssistantPanelItem = z.infer<typeof assistantPanelItemSchema>;
export type AssistantPanelMetric = z.infer<typeof assistantPanelMetricSchema>;
