import { z } from "zod";
import { isLocalDateKey } from "../../app/data/localDate";

const localDateSchema = z.string().refine(isLocalDateKey, "Nieprawidłowa data kalendarzowa.");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Nieprawidłowa godzina.");

export const taskIdSchema = z.number().int().safe();

export const taskSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  includeCompleted: z.boolean().default(false),
  limit: z.number().int().min(1).max(20).default(8),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  date: localDateSchema.optional(),
  time: timeSchema.optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  listId: z.string().trim().min(1).max(100).optional(),
  tagIds: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  notes: z.string().max(10_000).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
}).refine((value) => !value.time || Boolean(value.date), {
  message: "Godzina wymaga daty.",
  path: ["time"],
});

export const taskCompletionSchema = z.object({
  taskId: taskIdSchema,
  occurrenceDate: localDateSchema.optional(),
});

export const rescheduleTaskSchema = z.object({
  taskId: taskIdSchema,
  date: localDateSchema,
  time: timeSchema.optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
});

export const taskPrioritySchema = z.object({
  taskId: taskIdSchema,
  priority: z.enum(["high", "medium", "low"]),
});

export const habitCompletionSchema = z.object({
  habitId: z.number().int().safe(),
  date: localDateSchema,
});
