import { z } from "zod";
import type { AssistantSettings } from "../config/assistant-settings";
import type { AssistantToolFailure, AssistantToolResult } from "../core/types";
import { createRootineDomainServices, type RootineDomainServices } from "../../domain";
import type { CalendarOccurrence } from "../../app/data/calendarOccurrences";
import type { DomainMutationResult } from "../../domain/shared/result";
import {
  calendarConflictsQuerySchema,
  calendarWeekQuerySchema,
} from "../../domain/calendar/calendarSchemas";
import {
  createTaskSchema,
  habitCompletionSchema,
  rescheduleTaskSchema,
  taskCompletionSchema,
  taskPrioritySchema,
  taskSearchSchema,
} from "../../domain/tasks/taskSchemas";
import {
  addWaterSchema,
  commitMealDraftSchema,
  createMealDraftSchema,
  foodSearchSchema,
  updateMealDraftSchema,
} from "../../domain/nutrition/nutritionSchemas";
import {
  createWorkoutSchema,
  rescheduleWorkoutSchema,
  searchWorkoutsSchema,
  workoutOccurrenceSchema,
} from "../../domain/sport/sportSchemas";
import {
  completeWorkItemSchema,
  createWorkItemSchema,
  searchWorkItemsSchema,
} from "../../domain/work/workSchemas";
import { completeMilestoneSchema, updateGoalProgressSchema } from "../../domain/goals/goalSchemas";
import {
  affairsSearchSchema,
  financeSummarySchema,
  matterCompletionSchema,
  paymentPaidSchema,
  rescheduleMatterSchema,
} from "../../domain/affairs/affairsSchemas";
import { createNoteSchema, noteSearchSchema } from "../../domain/notes/noteSchemas";
import { travelSearchSchema, travelTaskCompletionSchema } from "../../domain/travel/travelSchemas";
import { todayOverviewSchema } from "../../domain/today/todaySchemas";
import { AssistantToolRegistry } from "./tool-registry";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableDateSchema = dateSchema.nullable();

const entitySummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string().optional(),
  date: nullableDateSchema.optional(),
  time: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  overdue: z.boolean().optional(),
  completed: z.boolean().optional(),
  context: z.string().nullable().optional(),
  value: z.union([z.string(), z.number()]).nullable().optional(),
}).strict();

const entityListSchema = z.object({
  items: z.array(entitySummarySchema).max(30),
  total: z.number().int().nonnegative(),
}).strict();

const calendarSourceSchema = z.enum(["task", "work", "travel", "sport", "affairs", "goals", "notes"]);

const calendarItemSchema = z.object({
  id: z.string().min(1).max(320),
  entityId: z.string().min(1).max(320),
  title: z.string().min(1).max(500),
  date: dateSchema,
  time: z.string().nullable(),
  endTime: z.string().nullable(),
  allDay: z.boolean(),
  recurring: z.boolean(),
  completed: z.boolean(),
  status: z.enum(["scheduled", "in_progress", "completed", "incomplete", "missed", "waiting", "automatic"]),
  source: calendarSourceSchema,
  context: z.string().max(300).nullable(),
  route: z.string().regex(/^\/(?!\/)/).max(500),
}).strict();

const calendarWeekOutputSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  items: z.array(calendarItemSchema).max(70),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
}).strict();

const calendarConflictItemSchema = z.object({
  id: z.string().min(1).max(320),
  title: z.string().min(1).max(500),
  date: dateSchema,
  time: z.string(),
  endTime: z.string().nullable(),
  kind: z.enum(["same_start", "overlap"]),
  entries: z.array(calendarItemSchema).min(2).max(8),
  entryCount: z.number().int().min(2),
  truncatedEntries: z.boolean(),
}).strict();

const calendarConflictsOutputSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  items: z.array(calendarConflictItemSchema).max(30),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
}).strict();

const mutationSnapshotSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  status: z.string().optional(),
  completed: z.boolean().optional(),
  date: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  value: z.union([z.string(), z.number(), z.boolean()]).nullable().optional(),
}).strict();

const mutationOutputSchema = z.object({
  entityId: z.string(),
  eventId: z.string(),
  undoToken: z.string(),
  updatedSnapshot: mutationSnapshotSchema,
  message: z.string(),
}).strict();

const todayOutputSchema = z.object({
  date: dateSchema,
  counts: z.object({
    tasks: z.number().int().nonnegative(),
    habits: z.number().int().nonnegative(),
    work: z.number().int().nonnegative(),
    matters: z.number().int().nonnegative(),
    workouts: z.number().int().nonnegative(),
    overdue: z.number().int().nonnegative(),
  }).strict(),
  priorityItems: z.array(entitySummarySchema).max(3),
}).strict();

const nutritionTotalsSchema = z.object({
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
}).strict();

const nutritionSummaryOutputSchema = z.object({
  date: dateSchema,
  totals: nutritionTotalsSchema,
  remainingCalories: z.number().nonnegative(),
  goals: z.object({
    calories: z.number().positive(),
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
    waterMl: z.number().nonnegative(),
  }).passthrough(),
  waterMl: z.number().nonnegative(),
  closed: z.boolean(),
  sampleDataIgnored: z.boolean(),
}).strict();

const waterSummaryOutputSchema = z.object({
  date: dateSchema,
  waterMl: z.number().nonnegative(),
  goalMl: z.number().nonnegative(),
  remainingMl: z.number().nonnegative(),
  sampleDataIgnored: z.boolean(),
}).strict();

const foodProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().optional(),
  source: z.enum(["usda", "openfoodfacts"]),
  defaultAmount: z.number().positive(),
  unit: z.enum(["g", "ml"]),
  per100g: nutritionTotalsSchema,
}).strict();

const foodSearchOutputSchema = z.object({ items: z.array(foodProductSchema).max(10), total: z.number().int().nonnegative() }).strict();

const mealDraftSchema = z.object({
  id: z.string(),
  date: dateSchema,
  meal: z.enum(["breakfast", "lunch", "snack", "dinner"]),
  ingredients: z.array(z.object({
    catalogId: z.string(),
    name: z.string(),
    brand: z.string().optional(),
    amount: z.number().positive(),
    unit: z.enum(["g", "ml"]),
    source: z.enum(["usda", "openfoodfacts"]),
    nutrition: nutritionTotalsSchema,
  }).strict()).min(1).max(30),
  totals: nutritionTotalsSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict();

const mealDraftOutputSchema = z.object({ draft: mealDraftSchema }).strict();

const bodyOutputSchema = z.object({
  latestWeight: z.object({ date: z.string(), value: z.number(), unit: z.string() }).strict().nullable(),
  latestMeasurements: z.array(z.object({ type: z.string(), date: z.string(), value: z.number(), unit: z.string() }).strict()).max(20),
  sampleDataIgnored: z.boolean(),
}).strict();

const goalsOutputSchema = z.object({
  active: z.array(entitySummarySchema).max(30),
  atRisk: z.array(entitySummarySchema).max(30),
}).strict();

const goalDetailsOutputSchema = z.object({
  goal: entitySummarySchema.extend({
    description: z.string(),
    currentValue: z.number(),
    targetValue: z.number(),
    unit: z.string(),
    milestones: z.array(z.object({ id: z.string(), title: z.string(), dueDate: z.string(), done: z.boolean() }).passthrough()).max(50),
  }).strict().nullable(),
}).strict();

const financeOutputSchema = z.object({
  items: z.array(entitySummarySchema).max(30),
  total: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  totalAmount: z.number().nullable(),
  amountsRedacted: z.boolean(),
}).strict();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function summarizeEntity(value: unknown, fallbackId = "unknown"): z.infer<typeof entitySummarySchema> {
  const record = isRecord(value) ? value : {};
  const id = String(record.id ?? record.entityId ?? fallbackId);
  const title = stringValue(record.title) ?? stringValue(record.text) ?? stringValue(record.name) ?? id;
  const completed = booleanValue(record.completed) ?? booleanValue(record.done) ?? booleanValue(record.paid);
  const explicitStatus = stringValue(record.status) ?? stringValue(record.state);
  return {
    id,
    title,
    status: explicitStatus ?? (completed === undefined ? undefined : completed ? "done" : "open"),
    date: stringValue(record.dueDate) ?? stringValue(record.date) ?? stringValue(record.calendarDate) ?? null,
    time: stringValue(record.time) ?? null,
    priority: stringValue(record.priority) ?? null,
    overdue: booleanValue(record.overdue),
    completed,
    context: stringValue(record.context) ?? stringValue(record.projectName) ?? stringValue(record.companyName) ?? stringValue(record.category) ?? null,
    value: numberValue(record.value) ?? stringValue(record.value) ?? null,
  };
}

function summarizeMutationSnapshot(value: unknown, entityId: string): z.infer<typeof mutationSnapshotSchema> {
  const record = isRecord(value) ? value : {};
  const completed = booleanValue(record.completed) ?? booleanValue(record.done) ?? booleanValue(record.paid);
  return {
    id: String(record.id ?? entityId),
    title: stringValue(record.title) ?? stringValue(record.text) ?? stringValue(record.name),
    status: stringValue(record.status),
    completed,
    date: stringValue(record.date) ?? stringValue(record.dueDate) ?? stringValue(record.calendarDate) ?? null,
    priority: stringValue(record.priority) ?? null,
    value: numberValue(record.value) ?? booleanValue(record.value) ?? stringValue(record.value) ?? null,
  };
}

function mutationResult(
  result: DomainMutationResult<unknown>,
): AssistantToolResult<z.infer<typeof mutationOutputSchema>> {
  if (!result.success) {
    return {
      success: false,
      code: result.code,
      message: result.message,
      candidates: result.candidates.map((candidate) => ({
        id: candidate.id,
        label: candidate.title,
        context: [candidate.date, candidate.context].filter(Boolean).join(" · ") || undefined,
      })),
    };
  }
  return {
    success: true,
    data: {
      entityId: result.entityId,
      eventId: result.eventId,
      undoToken: result.undoToken,
      updatedSnapshot: summarizeMutationSnapshot(result.updatedSnapshot, result.entityId),
      message: result.message,
    },
    message: result.message,
  };
}

function queryError(error: unknown): AssistantToolFailure | null {
  return typeof error === "string" && error
    ? { success: false, code: "VALIDATION", message: error }
    : null;
}

function listOutput(items: readonly unknown[], total = items.length) {
  return { items: items.map((item) => summarizeEntity(item)), total };
}

function calendarOccurrenceScope(occurrence: CalendarOccurrence) {
  if (occurrence.kind === "affair" && occurrence.subtype !== "matter") return "finance" as const;
  switch (occurrence.source.kind) {
    case "work": return "work" as const;
    case "travel":
    case "affairs": return "matters" as const;
    case "sport": return "sport" as const;
    case "goals": return "goals" as const;
    case "notes": return "notes" as const;
    default: return "tasks" as const;
  }
}

function canReadCalendarOccurrence(
  settings: AssistantSettings,
  occurrence: CalendarOccurrence,
  privacyMode: boolean,
) {
  const scope = calendarOccurrenceScope(occurrence);
  if (!settings.permissions[scope].read) return false;
  if (scope === "notes" && !settings.assistantNotesEnabled) return false;
  if (scope === "finance" && !settings.assistantFinanceEnabled) return false;
  return !(scope === "finance" && privacyMode);
}

function calendarEntityId(occurrence: CalendarOccurrence) {
  if (occurrence.kind === "task") {
    return occurrence.task.source?.entity ?? String(occurrence.task.occurrence.sourceTaskId);
  }
  return occurrence.entityId;
}

function boundedCalendarId(value: string) {
  if (value.length <= 160) return value;
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${value.slice(0, 140)}:${(hash >>> 0).toString(36)}`;
}

function summarizeCalendarOccurrence(
  occurrence: CalendarOccurrence,
  privacyMode: boolean,
): z.infer<typeof calendarItemSchema> {
  const redactWork = privacyMode && occurrence.source.kind === "work";
  const redactNote = privacyMode && occurrence.source.kind === "notes";
  const visibleTitle = redactWork ? "Prywatny element pracy" : redactNote ? "Prywatna notatka" : occurrence.title;
  const visibleContext = redactWork || redactNote ? null : occurrence.source.context ?? null;
  return {
    id: boundedCalendarId(occurrence.key),
    entityId: calendarEntityId(occurrence),
    title: (visibleTitle.trim() || "Element kalendarza").slice(0, 200),
    date: occurrence.calendarDate,
    time: occurrence.time ?? null,
    endTime: occurrence.endTime ?? null,
    allDay: !occurrence.time,
    recurring: occurrence.kind === "task" && Boolean(occurrence.task.schedule?.recurrence),
    completed: occurrence.status.completed,
    status: occurrence.status.key,
    source: occurrence.source.kind,
    context: visibleContext?.slice(0, 180) ?? null,
    route: occurrence.source.href,
  };
}

function toolSuccess<T>(data: T): AssistantToolResult<T> {
  return { success: true, data };
}

export function registerRootineDomainTools(
  registry: AssistantToolRegistry,
  getSettings: () => AssistantSettings,
  services: RootineDomainServices = createRootineDomainServices(),
) {
  registry.register({
    name: "get_today_overview",
    description: "Return a minimal, real overview and the three highest-priority items for one local date.",
    inputSchema: todayOverviewSchema,
    outputSchema: todayOutputSchema,
    risk: "read",
    scopes: ["today"],
    execute: async (context, input) => {
      const overview = services.today.getTodayOverview(input);
      if (!overview.date || !overview.counts || !overview.priorityItems) {
        return { success: false, code: "VALIDATION", message: "error" in overview && overview.error ? overview.error : "Nie udało się zbudować podsumowania dnia." };
      }
      const permissions = getSettings().permissions;
      const allowedModules = new Set([
        permissions.tasks.read && "tasks",
        permissions.work.read && "work",
        permissions.matters.read && "affairs",
        permissions.sport.read && "sport",
      ].filter((value): value is string => Boolean(value)));
      const priorityItems = overview.priorityItems
        .filter((item) => allowedModules.has(item.module))
        .map((item) => {
          const summary = summarizeEntity({ ...item, date: item.date });
          return context.app.privacyMode && item.module === "work"
            ? { ...summary, title: "Prywatny element pracy", context: null }
            : summary;
        });
      return toolSuccess({
        date: overview.date,
        counts: {
          tasks: permissions.tasks.read ? overview.counts.tasks : 0,
          habits: permissions.habits.read ? overview.counts.habits : 0,
          work: permissions.work.read ? overview.counts.work : 0,
          matters: permissions.matters.read ? overview.counts.matters : 0,
          workouts: permissions.sport.read ? overview.counts.workouts : 0,
          overdue: priorityItems.filter((item) => item.overdue).length,
        },
        priorityItems,
      });
    },
  });

  registry.register({
    name: "get_priority_tasks",
    description: "Return a limited list of open tasks ordered by actual priority and due date.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5), date: dateSchema.optional() }).strict(),
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["tasks"],
    execute: async (_context, { limit, date }) => toolSuccess(listOutput(services.tasks.getPriorityTasks(limit, date))),
  });

  registry.register({
    name: "get_urgent_tasks",
    description: "Return only open high-priority tasks from real task data.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5), date: dateSchema.optional() }).strict(),
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["tasks"],
    execute: async (_context, { limit, date }) => {
      const items = services.tasks.getPriorityTasks(20, date).filter((task) => task.priority === "high").slice(0, limit);
      return toolSuccess(listOutput(items));
    },
  });

  registry.register({
    name: "get_overdue_items",
    description: "Return open tasks whose stored due date is before the supplied local date.",
    inputSchema: z.object({ date: dateSchema }).strict(),
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["tasks"],
    execute: async (_context, { date }) => toolSuccess(listOutput(services.tasks.getOverdueTasks(date))),
  });

  registry.register({
    name: "search_tasks",
    description: "Search task titles. If total is not exactly one, do not guess an ID.",
    inputSchema: taskSearchSchema,
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["tasks"],
    execute: async (_context, input) => {
      const result = services.tasks.searchTasks(input);
      const error = queryError(result.error);
      return error ?? toolSuccess(listOutput(result.items, result.total));
    },
  });

  registry.register({
    name: "get_tasks_for_date",
    description: "Return actual tasks scheduled on one local date.",
    inputSchema: z.object({ date: dateSchema }).strict(),
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["tasks"],
    execute: async (_context, { date }) => toolSuccess(listOutput(services.tasks.getTasksForDate(date))),
  });

  registry.register({
    name: "get_calendar_week",
    description: "Return a permission-filtered, bounded seven-day calendar window from the supplied local start date, including recurring task occurrences.",
    inputSchema: calendarWeekQuerySchema,
    outputSchema: calendarWeekOutputSchema,
    risk: "read",
    scopes: ["tasks"],
    execute: async (context, { startDate, includeCompleted }) => {
      const week = services.calendar.getCalendarWeek(startDate);
      const settings = getSettings();
      const visible = week.occurrences.filter((occurrence) => (
        (includeCompleted || !occurrence.status.completed)
        && canReadCalendarOccurrence(settings, occurrence, context.app.privacyMode)
      ));
      const items = visible.slice(0, 70).map((occurrence) => summarizeCalendarOccurrence(occurrence, context.app.privacyMode));
      return toolSuccess({
        startDate: week.startDate,
        endDate: week.endDate,
        items,
        total: visible.length,
        truncated: visible.length > items.length,
      });
    },
  });

  registry.register({
    name: "get_calendar_conflicts",
    description: "Return bounded calendar conflicts in a seven-day window. Only equal start times or overlaps backed by explicit times are reported; all-day items are ignored.",
    inputSchema: calendarConflictsQuerySchema,
    outputSchema: calendarConflictsOutputSchema,
    risk: "read",
    scopes: ["tasks"],
    execute: async (context, { startDate, includeCompleted }) => {
      const week = services.calendar.getCalendarWeek(startDate);
      const settings = getSettings();
      const visible = week.occurrences.filter((occurrence) => (
        (includeCompleted || !occurrence.status.completed)
        && canReadCalendarOccurrence(settings, occurrence, context.app.privacyMode)
      ));
      const conflicts = services.calendar.findCalendarConflicts(visible);
      const items = conflicts.slice(0, 30).map((conflict) => {
        const entries = conflict.occurrences
          .slice(0, 8)
          .map((occurrence) => summarizeCalendarOccurrence(occurrence, context.app.privacyMode));
        return {
          id: conflict.id,
          title: entries.slice(0, 3).map((entry) => entry.title).join(" / ").slice(0, 200),
          date: conflict.date,
          time: conflict.startTime,
          endTime: conflict.endTime,
          kind: conflict.kind,
          entries,
          entryCount: conflict.occurrences.length,
          truncatedEntries: conflict.occurrences.length > entries.length,
        };
      });
      return toolSuccess({
        startDate: week.startDate,
        endDate: week.endDate,
        items,
        total: conflicts.length,
        truncated: conflicts.length > items.length,
      });
    },
  });

  registry.register({
    name: "get_habits_summary",
    description: "Return habit state and streak for one date without punitive language.",
    inputSchema: z.object({ date: dateSchema }).strict(),
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["habits"],
    execute: async (_context, { date }) => toolSuccess(listOutput(services.habits.getHabitsForDate(date))),
  });

  registry.register({
    name: "get_nutrition_summary",
    description: "Return source-backed nutrition totals, goals and remaining calories for one date.",
    inputSchema: z.object({ date: dateSchema }).strict(),
    outputSchema: nutritionSummaryOutputSchema,
    risk: "read",
    scopes: ["nutrition"],
    execute: async (_context, { date }) => toolSuccess(services.nutrition.getNutritionSummary(date)),
  });

  registry.register({
    name: "search_food_products",
    description: "Search the existing Rootine food catalog; never invent nutrition values.",
    inputSchema: foodSearchSchema,
    outputSchema: foodSearchOutputSchema,
    risk: "read",
    scopes: ["nutrition"],
    execute: async (_context, input) => {
      const result = services.nutrition.searchFoodProducts(input);
      const error = queryError(result.error);
      return error ?? toolSuccess({ items: result.items, total: result.total });
    },
  });

  registry.register({
    name: "get_recent_meals",
    description: "Return a small list of recent, non-sample meals for reuse and disambiguation.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(10) }).strict(),
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["nutrition"],
    execute: async (_context, { limit }) => toolSuccess(listOutput(services.nutrition.getRecentMeals(limit))),
  });

  registry.register({
    name: "get_water_summary",
    description: "Return actual water intake, goal and remaining amount for one date.",
    inputSchema: z.object({ date: dateSchema }).strict(),
    outputSchema: waterSummaryOutputSchema,
    risk: "read",
    scopes: ["nutrition"],
    execute: async (_context, { date }) => toolSuccess(services.nutrition.getWaterSummary(date)),
  });

  registry.register({
    name: "get_body_summary",
    description: "Return only latest body measurements when the separate sensitive scope is enabled.",
    inputSchema: z.object({}).strict(),
    outputSchema: bodyOutputSchema,
    risk: "read",
    scopes: ["body_data"],
    execute: async () => {
      const result = services.nutrition.getBodySummary();
      const weight = isRecord(result.latestWeight) ? result.latestWeight : null;
      return toolSuccess({
        latestWeight: weight && numberValue(weight.value) !== undefined
          ? { date: stringValue(weight.date) ?? "", value: numberValue(weight.value)!, unit: stringValue(weight.unit) ?? "kg" }
          : null,
        latestMeasurements: result.latestMeasurements.flatMap((item) => {
          const record: Record<string, unknown> = isRecord(item) ? item : {};
          const value = numberValue(record.value);
          if (value === undefined) return [];
          return [{ type: stringValue(record.type) ?? "measurement", date: stringValue(record.date) ?? "", value, unit: stringValue(record.unit) ?? "cm" }];
        }),
        sampleDataIgnored: result.sampleDataIgnored,
      });
    },
  });

  registry.register({
    name: "get_sport_summary",
    description: "Return today's workout and a limited upcoming plan from the active cycle.",
    inputSchema: z.object({ date: dateSchema }).strict(),
    outputSchema: z.object({ today: z.array(entitySummarySchema), upcoming: z.array(entitySummarySchema), activeCycle: entitySummarySchema.nullable() }).strict(),
    risk: "read",
    scopes: ["sport"],
    execute: async (_context, { date }) => {
      const result = services.sport.getSportSummary(date);
      return toolSuccess({
        today: result.today.map((item) => summarizeEntity(item)),
        upcoming: result.upcoming.slice(0, 14).map((item) => summarizeEntity(item)),
        activeCycle: result.activeCycle ? summarizeEntity({ ...result.activeCycle, title: result.activeCycle.name }) : null,
      });
    },
  });

  registry.register({
    name: "get_upcoming_workouts",
    description: "Return workouts scheduled in a bounded date window.",
    inputSchema: z.object({ startDate: dateSchema, days: z.number().int().min(1).max(60).default(14) }).strict(),
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["sport"],
    execute: async (_context, { startDate, days }) => toolSuccess(listOutput(services.sport.getUpcomingWorkouts(startDate, days))),
  });

  registry.register({
    name: "search_workouts",
    description: "Search active-cycle workout titles and return IDs for disambiguation.",
    inputSchema: searchWorkoutsSchema,
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["sport"],
    execute: async (_context, input) => {
      const result = services.sport.searchWorkouts(input);
      const error = queryError(result.error);
      return error ?? toolSuccess(listOutput(result.items, result.total));
    },
  });

  registry.register({
    name: "get_work_summary",
    description: "Return a limited work summary; Privacy Mode redacts private titles before model access.",
    inputSchema: z.object({ date: dateSchema }).strict(),
    outputSchema: z.object({ open: z.array(entitySummarySchema), overdue: z.array(entitySummarySchema), activeProjects: z.number().int().nonnegative() }).strict(),
    risk: "read",
    scopes: ["work"],
    execute: async (_context, { date }) => {
      const result = services.work.getWorkSummary(date);
      return toolSuccess({ open: result.open.slice(0, 10).map((item) => summarizeEntity(item)), overdue: result.overdue.slice(0, 10).map((item) => summarizeEntity(item)), activeProjects: result.activeProjects });
    },
  });

  registry.register({
    name: "search_work_items",
    description: "Search work task titles and return project context for disambiguation.",
    inputSchema: searchWorkItemsSchema,
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["work"],
    execute: async (_context, input) => {
      const result = services.work.searchWorkItems(input);
      const error = queryError(result.error);
      return error ?? toolSuccess(listOutput(result.items, result.total));
    },
  });

  registry.register({
    name: "get_goals_summary",
    description: "Return active and at-risk goals with measured progress.",
    inputSchema: z.object({}).strict(),
    outputSchema: goalsOutputSchema,
    risk: "read",
    scopes: ["goals"],
    execute: async () => {
      const result = services.goals.getGoalsSummary();
      return toolSuccess({ active: result.active.map((item) => summarizeEntity({ ...item, value: item.progress })), atRisk: result.atRisk.map((item) => summarizeEntity(item)) });
    },
  });

  registry.register({
    name: "get_goal_details",
    description: "Return details for an exact goal ID obtained from a goal query.",
    inputSchema: z.object({ goalId: z.string().min(1).max(200) }).strict(),
    outputSchema: goalDetailsOutputSchema,
    risk: "read",
    scopes: ["goals"],
    execute: async (_context, { goalId }) => {
      const goal = services.goals.getGoalDetails(goalId);
      return toolSuccess({ goal: goal ? { ...summarizeEntity({ ...goal, value: goal.progress }), description: goal.description, currentValue: goal.currentValue, targetValue: goal.targetValue, unit: goal.unit, milestones: goal.milestones } : null });
    },
  });

  registry.register({
    name: "get_matters_summary",
    description: "Return open and overdue matters for a local date.",
    inputSchema: z.object({ date: dateSchema }).strict(),
    outputSchema: z.object({ open: z.array(entitySummarySchema), overdue: z.array(entitySummarySchema) }).strict(),
    risk: "read",
    scopes: ["matters"],
    execute: async (_context, { date }) => {
      const result = services.affairs.getMattersSummary(date);
      return toolSuccess({ open: result.open.slice(0, 20).map((item) => summarizeEntity(item)), overdue: result.overdue.slice(0, 20).map((item) => summarizeEntity(item)) });
    },
  });

  registry.register({
    name: "search_matters",
    description: "Search matters and return IDs for disambiguation.",
    inputSchema: affairsSearchSchema,
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["matters"],
    execute: async (_context, input) => {
      const result = services.affairs.searchMatters(input);
      const error = queryError(result.error);
      return error ?? toolSuccess(listOutput(result.items, result.total));
    },
  });

  registry.register({
    name: "search_notes",
    description: "Search notes and return only short plain-text snippets, never the full catalog.",
    inputSchema: noteSearchSchema,
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["notes"],
    execute: async (_context, input) => {
      const result = services.notes.searchNotes(input);
      const error = queryError(result.error);
      return error ?? toolSuccess({
        items: result.items.map((item) => summarizeEntity({ ...item, context: item.snippet })),
        total: result.total,
      });
    },
  });

  registry.register({
    name: "get_finance_summary",
    description: "Return a bounded unpaid-items summary only with the separate finance scope.",
    inputSchema: financeSummarySchema,
    outputSchema: financeOutputSchema,
    risk: "read",
    scopes: ["finance"],
    execute: async (_context, input) => {
      const result = services.finance.getFinanceSummary(input);
      const error = queryError(result.error);
      return error ?? toolSuccess({
        items: result.items.map((item) => summarizeEntity({ ...item, date: item.dueDate, value: item.amount })),
        total: result.total,
        overdue: result.overdue,
        totalAmount: result.totalAmount,
        amountsRedacted: result.amountsRedacted,
      });
    },
  });

  registry.register({
    name: "get_unpaid_items",
    description: "Return unpaid and recurring obligations from real finance data.",
    inputSchema: financeSummarySchema,
    outputSchema: financeOutputSchema,
    risk: "read",
    scopes: ["finance"],
    execute: async (_context, input) => {
      const result = services.finance.getFinanceSummary(input);
      const error = queryError(result.error);
      return error ?? toolSuccess({ items: result.items.map((item) => summarizeEntity({ ...item, date: item.dueDate, value: item.amount })), total: result.total, overdue: result.overdue, totalAmount: result.totalAmount, amountsRedacted: result.amountsRedacted });
    },
  });

  registry.register({
    name: "get_travel_summary",
    description: "Return upcoming trips without exposing detailed travel budgets.",
    inputSchema: z.object({ date: dateSchema }).strict(),
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["matters"],
    execute: async (_context, { date }) => toolSuccess(listOutput(services.travel.getTravelSummary(date).map((trip) => ({ ...trip, title: trip.name, date: trip.startDate, context: trip.destination })))),
  });

  registry.register({
    name: "search_travel_tasks",
    description: "Search trip checklist tasks and return trip context for disambiguation.",
    inputSchema: travelSearchSchema,
    outputSchema: entityListSchema,
    risk: "read",
    scopes: ["matters"],
    execute: async (_context, input) => {
      const result = services.travel.searchTravelTasks(input);
      const error = queryError(result.error);
      return error ?? toolSuccess(listOutput(result.items.map((item) => ({ ...item, context: item.tripName })), result.total));
    },
  });

  const registerMutation = <TInput>(options: {
    name: string;
    description: string;
    schema: z.ZodType<TInput>;
    risk?: "reversible_write" | "confirmed_write";
    scopes: Parameters<AssistantToolRegistry["register"]>[0]["scopes"];
    execute: (input: TInput) => Promise<DomainMutationResult<unknown>>;
    describe?: (input: TInput) => { operation: string; record: string; previousValue?: string; nextValue?: string };
  }) => registry.register({
    name: options.name,
    description: options.description,
    inputSchema: options.schema,
    outputSchema: mutationOutputSchema,
    risk: options.risk ?? "reversible_write",
    scopes: options.scopes,
    describeConfirmation: options.describe,
    execute: async (_context, input) => mutationResult(await options.execute(input)),
  });

  registerMutation({ name: "create_task", description: "Create one task after parsing an exact title and optional date/time.", schema: createTaskSchema, scopes: ["tasks"], execute: services.tasks.createTask });
  registerMutation({ name: "complete_task", description: "Complete one task by exact numeric ID returned by search_tasks.", schema: taskCompletionSchema, scopes: ["tasks"], execute: services.tasks.completeTask });
  registerMutation({ name: "uncomplete_task", description: "Reopen one task by exact numeric ID.", schema: taskCompletionSchema, scopes: ["tasks"], execute: services.tasks.uncompleteTask });
  registerMutation({ name: "reschedule_task", description: "Move one task to an exact local date and optional time.", schema: rescheduleTaskSchema, scopes: ["tasks"], execute: services.tasks.rescheduleTask });
  registerMutation({ name: "set_task_priority", description: "Set priority for one exact task ID.", schema: taskPrioritySchema, scopes: ["tasks"], execute: services.tasks.setTaskPriority });
  registerMutation({ name: "complete_habit", description: "Complete one habit occurrence on an exact date.", schema: habitCompletionSchema, scopes: ["habits"], execute: services.habits.completeHabit });
  registerMutation({ name: "uncomplete_habit", description: "Reopen one habit occurrence on an exact date.", schema: habitCompletionSchema, scopes: ["habits"], execute: services.habits.uncompleteHabit });
  registerMutation({ name: "add_water", description: "Add a positive milliliter amount to one nutrition day.", schema: addWaterSchema, scopes: ["nutrition"], execute: services.nutrition.addWater });

  registry.register({
    name: "create_meal_draft",
    description: "Create an in-memory meal draft only from exact catalog IDs, grams or milliliters and source-backed nutrition.",
    inputSchema: createMealDraftSchema,
    outputSchema: mealDraftOutputSchema,
    risk: "reversible_write",
    scopes: ["nutrition"],
    execute: async (_context, input) => {
      const result = services.nutrition.createMealDraft(input);
      return result.success
        ? toolSuccess({ draft: result.draft })
        : { success: false, code: result.code, message: result.message, candidates: result.candidates.map((candidate) => ({ id: candidate.id, label: candidate.title, context: candidate.context })) };
    },
  });

  registry.register({
    name: "update_meal_draft",
    description: "Update an unexpired meal draft with exact matched catalog ingredients.",
    inputSchema: updateMealDraftSchema,
    outputSchema: mealDraftOutputSchema,
    risk: "reversible_write",
    scopes: ["nutrition"],
    execute: async (_context, input) => {
      const result = services.nutrition.updateMealDraft(input);
      return result.success
        ? toolSuccess({ draft: result.draft })
        : { success: false, code: result.code, message: result.message, candidates: result.candidates.map((candidate) => ({ id: candidate.id, label: candidate.title, context: candidate.context })) };
    },
  });

  registerMutation({
    name: "commit_meal",
    description: "Commit one source-backed meal draft after explicit confirmation.",
    schema: commitMealDraftSchema,
    risk: "confirmed_write",
    scopes: ["nutrition"],
    execute: services.nutrition.commitMealDraft,
    describe: ({ draftId }) => ({ operation: "Zapisz posiłek", record: draftId, nextValue: "Wpis w dzienniku odżywiania" }),
  });

  registerMutation({ name: "complete_workout", description: "Complete one exact workout occurrence.", schema: workoutOccurrenceSchema, scopes: ["sport"], execute: services.sport.completeWorkout });
  registerMutation({ name: "reschedule_workout", description: "Move one exact workout to one date.", schema: rescheduleWorkoutSchema, scopes: ["sport"], execute: services.sport.rescheduleWorkout });
  registerMutation({ name: "create_workout", description: "Create one workout in an exact active cycle.", schema: createWorkoutSchema, scopes: ["sport"], execute: services.sport.createWorkout });
  registerMutation({ name: "create_work_item", description: "Create one work task in an exact project.", schema: createWorkItemSchema, scopes: ["work"], execute: services.work.createWorkItem });
  registerMutation({ name: "complete_work_item", description: "Complete or reopen one exact work task.", schema: completeWorkItemSchema, scopes: ["work"], execute: services.work.setWorkItemCompletion });
  registerMutation({
    name: "update_goal_progress",
    description: "Update measured goal progress. Confirmation is always required because impact depends on the goal scale.",
    schema: updateGoalProgressSchema,
    risk: "confirmed_write",
    scopes: ["goals"],
    execute: services.goals.updateGoalProgress,
    describe: ({ goalId, value, kind }) => ({ operation: "Zaktualizuj postęp celu", record: goalId, nextValue: `${kind === "delta" ? "Zmiana" : "Wartość"}: ${value}` }),
  });
  registerMutation({ name: "complete_milestone", description: "Complete or reopen one milestone in an exact goal.", schema: completeMilestoneSchema, scopes: ["goals"], execute: services.goals.completeMilestone });
  registerMutation({ name: "complete_matter", description: "Complete or reopen one exact matter.", schema: matterCompletionSchema, scopes: ["matters"], execute: services.affairs.setMatterCompletion });
  registerMutation({ name: "reschedule_matter", description: "Move one exact matter deadline to one local date.", schema: rescheduleMatterSchema, scopes: ["matters"], execute: services.affairs.rescheduleMatter });
  registerMutation({ name: "create_note", description: "Create one short local note; full note catalogs are never sent.", schema: createNoteSchema, scopes: ["notes"], execute: services.notes.createNote });
  registerMutation({
    name: "mark_payment_paid",
    description: "Mark one exact one-time payment paid or unpaid after explicit confirmation.",
    schema: paymentPaidSchema,
    risk: "confirmed_write",
    scopes: ["finance"],
    execute: services.finance.markPaymentPaid,
    describe: ({ paymentId, paid }) => ({ operation: paid ? "Oznacz płatność jako opłaconą" : "Oznacz płatność jako nieopłaconą", record: paymentId, nextValue: paid ? "Opłacona" : "Nieopłacona" }),
  });
  registerMutation({ name: "complete_travel_task", description: "Complete or reopen one exact trip checklist item.", schema: travelTaskCompletionSchema, scopes: ["matters"], execute: services.travel.setTravelTaskCompletion });

  registry.register({
    name: "undo_action",
    description: "Undo one unexpired reversible action using the exact undo token returned by that action.",
    inputSchema: z.object({ undoToken: z.string().min(1).max(200) }).strict(),
    outputSchema: mutationOutputSchema,
    risk: "reversible_write",
    scopes: ["presentation"],
    confirmationMode: "never",
    execute: async (_context, { undoToken }) => mutationResult(await services.undo.execute(undoToken)),
  });

  return registry;
}
