import { z } from "zod";
import { isLocalDateKey } from "../../app/data/localDate";

export const todayOverviewSchema = z.object({
  date: z.string().refine(isLocalDateKey, "Nieprawidłowa data."),
});
