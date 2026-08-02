import {
  NOTES_STORAGE_KEY,
  createNotesId,
  loadNotesWorkspace,
  saveNotesWorkspace,
  type NoteRecord,
  type NotesWorkspace,
} from "../../app/data/notesWorkspace";
import { domainFailure } from "../shared";
import { commitDomainMutation } from "../shared/mutation";
import type { DomainMutationResult } from "../shared/result";
import { createWorkspaceUndo } from "../shared/workspaceUndo";
import { createNoteSchema } from "./noteSchemas";

function replaceNote(workspace: NotesWorkspace, value: NoteRecord | null, id: string): NotesWorkspace {
  return {
    ...workspace,
    updatedAt: new Date().toISOString(),
    notes: value === null
      ? workspace.notes.filter((note) => note.id !== id)
      : workspace.notes.map((note) => note.id === id ? value : note),
  };
}

export async function createNote(input: unknown): Promise<DomainMutationResult<NoteRecord>> {
  const parsed = createNoteSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowa notatka.");
  const workspace = loadNotesWorkspace();
  if (parsed.data.listId && !workspace.lists.some((list) => list.id === parsed.data.listId)) {
    return domainFailure("NOT_FOUND", "Wybrana lista notatek nie istnieje.");
  }
  const now = new Date().toISOString();
  const note: NoteRecord = {
    id: createNotesId("note"),
    title: parsed.data.title,
    body: parsed.data.body,
    kind: "text",
    items: [],
    tags: [...new Set(parsed.data.tags)],
    listId: parsed.data.listId,
    color: parsed.data.color,
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  const next: NotesWorkspace = { ...workspace, updatedAt: now, notes: [...workspace.notes, note] };
  const archived = { ...note, archived: true, updatedAt: now };
  const compensation = createWorkspaceUndo({
    storageKey: NOTES_STORAGE_KEY,
    read: loadNotesWorkspace,
    save: saveNotesWorkspace,
    select: (current) => current.notes.find((candidate) => candidate.id === note.id) ?? null,
    apply: (current, value) => replaceNote(current, value, note.id),
    expected: note,
    restore: archived,
    message: "Cofnięto utworzenie notatki; notatkę zarchiwizowano.",
  });
  return commitDomainMutation({
    entityId: note.id,
    storageKey: NOTES_STORAGE_KEY,
    event: { type: "note.created", domain: "notes", entityId: note.id, payload: { title: note.title, listId: note.listId } },
    save: () => saveNotesWorkspace(next),
    read: loadNotesWorkspace,
    verify: (current) => current.notes.some((candidate) => candidate.id === note.id && !candidate.archived),
    selectSnapshot: (current) => current.notes.find((candidate) => candidate.id === note.id) ?? note,
    message: "Utworzono notatkę.",
    compensation,
  });
}
