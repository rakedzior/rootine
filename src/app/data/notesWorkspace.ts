import { readLocalWorkspace, writeLocalWorkspace, type LocalLoadResult } from "./localRepository";

export const NOTES_STORAGE_KEY = "rootine.notes-workspace.v1";
const WORKSPACE_VERSION = 1 as const;

export type NoteColor = "graphite" | "blue" | "green" | "amber" | "violet" | "coral";
export type NoteKind = "text" | "checklist";

export type NoteChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
};

export type NoteList = {
  id: string;
  name: string;
  createdAt: string;
};

export type NoteRecord = {
  id: string;
  title: string;
  body: string;
  kind: NoteKind;
  items: NoteChecklistItem[];
  tags: string[];
  listId: string;
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NotesWorkspace = {
  version: typeof WORKSPACE_VERSION;
  updatedAt: string;
  lists: NoteList[];
  notes: NoteRecord[];
};

const DEFAULT_WORKSPACE: NotesWorkspace = {
  version: WORKSPACE_VERSION,
  updatedAt: new Date(0).toISOString(),
  lists: [
    { id: "list-personal", name: "Osobiste", createdAt: "2026-07-01T08:00:00.000Z" },
    { id: "list-work", name: "Praca", createdAt: "2026-07-01T08:01:00.000Z" },
    { id: "list-ideas", name: "Pomysły", createdAt: "2026-07-01T08:02:00.000Z" },
  ],
  notes: [
    {
      id: "note-week-focus",
      title: "Najważniejsze na ten tydzień",
      body: "Domknąć trzy rzeczy, zanim zacznę kolejne.",
      kind: "checklist",
      items: [
        { id: "item-invoices", text: "Wysłać faktury i potwierdzenia", checked: true },
        { id: "item-doctor", text: "Umówić kontrolę stomatologiczną", checked: false },
        { id: "item-trip", text: "Sprawdzić ubezpieczenie na Japonię", checked: false },
        { id: "item-backup", text: "Zrobić kopię dokumentów", checked: false },
      ],
      tags: ["tydzień", "ważne"],
      listId: "list-personal",
      color: "blue",
      pinned: true,
      archived: false,
      createdAt: "2026-07-24T08:30:00.000Z",
      updatedAt: "2026-07-28T07:45:00.000Z",
    },
    {
      id: "note-product-ideas",
      title: "Pomysły do Rootine",
      body: "• Widok szybkiego przechwytywania z klawiatury\n• Powiązania notatki z celem i podróżą\n• Cotygodniowy przegląd zmian\n• Eksport wybranej listy do PDF",
      kind: "text",
      items: [],
      tags: ["rootine", "produkt"],
      listId: "list-ideas",
      color: "violet",
      pinned: true,
      archived: false,
      createdAt: "2026-07-19T15:10:00.000Z",
      updatedAt: "2026-07-27T19:22:00.000Z",
    },
    {
      id: "note-meeting",
      title: "Rozmowa z Tomkiem",
      body: "Agenda na czwartek:\n• zakres nowej strony\n• materiały wejściowe\n• termin pierwszej wersji\n\nDopytać o osobę akceptującą finalne treści.",
      kind: "text",
      items: [],
      tags: ["spotkanie", "klient"],
      listId: "list-work",
      color: "green",
      pinned: false,
      archived: false,
      createdAt: "2026-07-26T10:00:00.000Z",
      updatedAt: "2026-07-26T16:40:00.000Z",
    },
    {
      id: "note-books",
      title: "Książki na jesień",
      body: "Lista spokojnie, bez celu ilościowego.",
      kind: "checklist",
      items: [
        { id: "item-book-1", text: "Człowiek w poszukiwaniu sensu", checked: true },
        { id: "item-book-2", text: "The Creative Act", checked: false },
        { id: "item-book-3", text: "The Psychology of Money", checked: false },
      ],
      tags: ["książki"],
      listId: "list-personal",
      color: "amber",
      pinned: false,
      archived: false,
      createdAt: "2026-07-16T18:20:00.000Z",
      updatedAt: "2026-07-25T20:14:00.000Z",
    },
    {
      id: "note-oatmeal",
      title: "Owsianka — proporcje",
      body: "50 g płatków owsianych\n30 g białka waniliowego\n150 g skyru\nGarść jagód\nŁyżka masła orzechowego",
      kind: "text",
      items: [],
      tags: ["przepis", "śniadanie"],
      listId: "list-personal",
      color: "coral",
      pinned: false,
      archived: false,
      createdAt: "2026-07-20T07:12:00.000Z",
      updatedAt: "2026-07-22T06:55:00.000Z",
    },
    {
      id: "note-old-concept",
      title: "Stary kierunek strony",
      body: "Zachowane dla kontekstu. Nie wracać do tej wersji bez nowych danych.",
      kind: "text",
      items: [],
      tags: ["archiwum"],
      listId: "list-work",
      color: "graphite",
      pinned: false,
      archived: true,
      createdAt: "2026-06-12T12:00:00.000Z",
      updatedAt: "2026-07-10T09:00:00.000Z",
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isList(value: unknown): value is NoteList {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.createdAt === "string";
}

function isChecklistItem(value: unknown): value is NoteChecklistItem {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.text === "string"
    && typeof value.checked === "boolean";
}

function isNote(value: unknown): value is NoteRecord {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.body === "string"
    && ["text", "checklist"].includes(String(value.kind))
    && Array.isArray(value.items)
    && value.items.every(isChecklistItem)
    && Array.isArray(value.tags)
    && value.tags.every((tag) => typeof tag === "string")
    && typeof value.listId === "string"
    && ["graphite", "blue", "green", "amber", "violet", "coral"].includes(String(value.color))
    && typeof value.pinned === "boolean"
    && typeof value.archived === "boolean"
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string";
}

function isWorkspace(value: unknown): value is NotesWorkspace {
  return isRecord(value)
    && value.version === WORKSPACE_VERSION
    && typeof value.updatedAt === "string"
    && Array.isArray(value.lists)
    && value.lists.every(isList)
    && Array.isArray(value.notes)
    && value.notes.every(isNote);
}

function cloneDefaultWorkspace(): NotesWorkspace {
  return JSON.parse(JSON.stringify(DEFAULT_WORKSPACE)) as NotesWorkspace;
}

export function createNotesId(prefix: "note" | "list" | "item"): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
}

export function loadNotesWorkspaceResult(): LocalLoadResult<NotesWorkspace> {
  return readLocalWorkspace({
    key: NOTES_STORAGE_KEY,
    fallback: cloneDefaultWorkspace,
    validate: isWorkspace,
  });
}

export function loadNotesWorkspace(): NotesWorkspace {
  return loadNotesWorkspaceResult().workspace;
}

export function saveNotesWorkspace(workspace: NotesWorkspace): boolean {
  const next: NotesWorkspace = {
    ...workspace,
    version: WORKSPACE_VERSION,
    updatedAt: new Date().toISOString(),
  };
  return writeLocalWorkspace(NOTES_STORAGE_KEY, next);
}
