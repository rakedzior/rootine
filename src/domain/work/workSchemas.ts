import { z } from "zod";
import { isLocalDateKey } from "../../app/data/localDate";

export const searchWorkItemsSchema = z.object({
  query: z.string().trim().min(1).max(200),
  includeCompleted: z.boolean().default(false),
  limit: z.number().int().min(1).max(20).default(8),
});

export const createWorkItemSchema = z.object({
  projectId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(500),
  priority: z.enum(["none", "low", "medium", "high"]).default("none"),
  dueDate: z.string().refine((value) => value === "" || isLocalDateKey(value), "Nieprawidłowa data.").default(""),
  parentId: z.string().trim().min(1).max(200).nullable().default(null),
});

export const completeWorkItemSchema = z.object({
  taskId: z.string().trim().min(1).max(200),
  completed: z.boolean().default(true),
});
