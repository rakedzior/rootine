import { z } from "zod";

export const noteSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(10).default(5),
  includeArchived: z.boolean().default(false),
});

export const createNoteSchema = z.object({
  title: z.string().trim().max(300).default(""),
  body: z.string().max(20_000).default(""),
  listId: z.string().trim().max(200).default(""),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  color: z.enum(["graphite", "blue", "green", "amber", "violet", "coral"]).default("graphite"),
}).refine((value) => Boolean(value.title || value.body.trim()), {
  message: "Notatka wymaga tytułu lub treści.",
});
