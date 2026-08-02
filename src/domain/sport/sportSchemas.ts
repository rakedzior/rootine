import { z } from "zod";
import { isLocalDateKey } from "../../app/data/localDate";

const dateSchema = z.string().refine(isLocalDateKey, "Nieprawidłowa data.");

export const workoutOccurrenceSchema = z.object({
  workoutId: z.string().trim().min(1).max(200),
  date: dateSchema,
});

export const rescheduleWorkoutSchema = z.object({
  workoutId: z.string().trim().min(1).max(200),
  date: dateSchema,
});

export const createWorkoutSchema = z.object({
  cycleId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  discipline: z.enum(["strength", "running", "rehab", "mobility", "cycling", "custom"]),
  date: dateSchema,
  durationMinutes: z.number().int().min(5).max(720),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  note: z.string().max(4_000).optional(),
});

export const searchWorkoutsSchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(8),
});
