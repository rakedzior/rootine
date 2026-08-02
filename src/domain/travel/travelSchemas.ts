import { z } from "zod";

export const travelSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(8),
});

export const travelTaskCompletionSchema = z.object({
  tripId: z.string().trim().min(1).max(200),
  taskId: z.string().trim().min(1).max(200),
  completed: z.boolean().default(true),
});
