import type { AssistantPanelSpec } from "./panel-schemas";

export type AssistantPanelResolver = (entityIds: readonly string[]) => AssistantPanelSpec["data"];

export const TOOL_PANEL_CATALOG: Readonly<Record<string, AssistantPanelSpec["type"]>> = {
  get_today_overview: "today_overview",
  get_priority_tasks: "priority_tasks",
  get_urgent_tasks: "urgent_tasks",
  get_overdue_items: "overdue_items",
  search_tasks: "task_candidates",
  get_calendar_week: "task_candidates",
  get_calendar_conflicts: "task_candidates",
  get_habits_summary: "habits_summary",
  get_nutrition_summary: "nutrition_summary",
  search_food_products: "meal_draft",
  create_meal_draft: "meal_draft",
  get_water_summary: "water_summary",
  get_body_summary: "body_summary",
  get_sport_summary: "sport_summary",
  get_upcoming_workouts: "upcoming_workouts",
  get_work_summary: "work_summary",
  get_goals_summary: "goal_summary",
  get_goal_details: "goal_summary",
  get_matters_summary: "matter_summary",
  search_notes: "note_results",
  get_finance_summary: "finance_summary",
  get_unpaid_items: "finance_summary",
};

export function panelTypeForTool(toolName: string) {
  return TOOL_PANEL_CATALOG[toolName];
}
