import { z } from "zod";
import { isLocalDateKey } from "../../app/data/localDate";

const localDateSchema = z.string().refine(isLocalDateKey, "Nieprawidłowa data kalendarzowa.");

export const calendarWeekQuerySchema = z.object({
  startDate: localDateSchema,
  includeCompleted: z.boolean().default(true),
}).strict();

export const calendarConflictsQuerySchema = z.object({
  startDate: localDateSchema,
  includeCompleted: z.boolean().default(false),
}).strict();
