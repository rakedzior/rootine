import { loadNotesWorkspace } from "../../app/data/notesWorkspace";
import { normalizeSearchQuery } from "../shared";
import { noteSearchSchema } from "./noteSchemas";

function decodeBasicEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

export function createSafeNoteSnippet(value: string, maxLength = 120) {
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");
  const plain = decodeBasicEntities(withoutControls
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function searchNotes(input: unknown) {
  const parsed = noteSearchSchema.safeParse(input);
  if (!parsed.success) return { items: [], total: 0, error: parsed.error.issues[0]?.message };
  const query = normalizeSearchQuery(parsed.data.query);
  const matches = loadNotesWorkspace().notes
    .filter((note) => parsed.data.includeArchived || !note.archived)
    .filter((note) => normalizeSearchQuery([
      note.title,
      note.body,
      ...note.items.map((item) => item.text),
      ...note.tags,
    ].join(" ")).includes(query))
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt));
  return {
    items: matches.slice(0, parsed.data.limit).map((note) => ({
      id: note.id,
      title: note.title || "Bez tytułu",
      snippet: createSafeNoteSnippet(note.kind === "checklist"
        ? note.items.map((item) => item.text).join(" · ")
        : note.body),
      listId: note.listId,
      tags: note.tags.slice(0, 5),
      updatedAt: note.updatedAt,
      archived: note.archived,
    })),
    total: matches.length,
  };
}

export function getNoteMetadata(noteId: string) {
  const note = loadNotesWorkspace().notes.find((candidate) => candidate.id === noteId);
  if (!note) return null;
  return {
    id: note.id,
    title: note.title || "Bez tytułu",
    snippet: createSafeNoteSnippet(note.body, 80),
    listId: note.listId,
    tags: note.tags.slice(0, 5),
    kind: note.kind,
    archived: note.archived,
    updatedAt: note.updatedAt,
  };
}
