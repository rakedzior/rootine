import { z } from "zod";
import { isLocalDateKey } from "../../app/data/localDate";

export const updateGoalProgressSchema = z.object({
  goalId: z.string().trim().min(1).max(200),
  date: z.string().refine(isLocalDateKey, "Nieprawidłowa data."),
  value: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  kind: z.enum(["absolute", "delta"]).default("absolute"),
  note: z.string().max(4_000).default(""),
});

export const completeMilestoneSchema = z.object({
  goalId: z.string().trim().min(1).max(200),
  milestoneId: z.string().trim().min(1).max(200),
  completed: z.boolean().default(true),
});
