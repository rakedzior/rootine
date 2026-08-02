import { z } from "zod";
import { isLocalDateKey } from "../../app/data/localDate";

const dateSchema = z.string().refine(isLocalDateKey, "Nieprawidłowa data.");

export const matterCompletionSchema = z.object({
  matterId: z.string().trim().min(1).max(200),
  completed: z.boolean().default(true),
});

export const rescheduleMatterSchema = z.object({
  matterId: z.string().trim().min(1).max(200),
  date: dateSchema,
});

export const paymentPaidSchema = z.object({
  paymentId: z.string().trim().min(1).max(200),
  paid: z.boolean().default(true),
});

export const affairsSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(8),
});

export const financeSummarySchema = z.object({
  includeAmounts: z.boolean().default(true),
  today: dateSchema,
});
