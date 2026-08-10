/**
 * THESIS: Notatki is a capture desk, not a wall of decorative sticky notes; it refuses a card gallery with no filing or editing depth.
 * OWN-WORLD: Rootine's graphite workshop, a compact filing rail, restrained color markers, dense note sheets, and a docked writing panel.
 * STORY: Capture quickly, find by list or tag, pin what matters, and turn loose thoughts into text or actionable checklists.
 * FIRST VIEWPORT: The filing rail frames equal-height note sheets while the selected note opens as a focused editor on the right.
 * FORM: Object cards with a fixed header and footer, a locally scrollable body, and one flat register in list mode.
 */
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  FileText,
  Folder,
  LayoutGrid,
  ListChecks,
  NotebookPen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Rows3,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { calendarDaysBetween, todayLocalDateKey, toLocalDateKey } from "../data/localDate";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { recordActivity } from "../experience/activityLog";
import {
  POLISH_TIME_ZONE,
  formatDate,
  formatTime,
} from "../formatters";
import {
  createNotesId,
  loadNotesWorkspace,
  NOTES_STORAGE_KEY,
  saveNotesWorkspace,
  type NoteChecklistItem,
  type NoteColor,
  type NoteKind,
  type NoteRecord,
} from "../data/notesWorkspace";
import {
  Badge,
  Button,
  ContentHeader,
  ContextNavItem,
  ModuleSidebar,
  DetailPanel,
  EmptyState,
  Input,
  Modal,
  ModuleMain,
  ModuleShell,
  Select,
  Textarea,
  Toast,
  ToastViewport,
  AddToTasksButton,
} from "../ui";
import "../../styles/notes.css";

type NotesView = "all" | "pinned" | "archive" | `list:${string}` | `tag:${string}`;
type NotesSort = "updated" | "created" | "title";
type NotesLayout = "cards" | "list";
type EditorState = { mode: "add" | "edit"; id?: string };
type ListEditorState = { mode: "add" | "edit"; id?: string };

type NoteDraft = {
  title: string;
  body: string;
  kind: NoteKind;
  items: NoteChecklistItem[];
  tags: string;
  listId: string;
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
};

const EMPTY_DRAFT: NoteDraft = {
  title: "",
  body: "",
  kind: "text",
  items: [],
  tags: "",
  listId: "",
  color: "graphite",
  pinned: false,
  archived: false,
};

const NOTE_DRAFT_STORAGE_KEY = "rootine.notes-editor-draft.v1";
const NOTE_DRAFT_SAVE_DELAY_MS = 250;
const NOTES_VIEWS = new Set<NotesView>(["all", "pinned", "archive"]);

type StoredDraftSession = {
  editor: EditorState;
  draft: NoteDraft;
  baseline: string;
};

function serializeDraft(draft: NoteDraft): string {
  return JSON.stringify(draft);
}

function updateDraftBaseline(
  baseline: string,
  updater: (baselineDraft: NoteDraft) => NoteDraft,
): string {
  try {
    return serializeDraft(updater(JSON.parse(baseline) as NoteDraft));
  } catch {
    return baseline;
  }
}

function loadStoredDraftSession(): StoredDraftSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(NOTE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredDraftSession>;
    if (
      !value.editor
      || (value.editor.mode !== "add" && value.editor.mode !== "edit")
      || !value.draft
      || typeof value.draft.title !== "string"
      || typeof value.draft.body !== "string"
      || !Array.isArray(value.draft.items)
      || typeof value.baseline !== "string"
    ) {
      window.sessionStorage.removeItem(NOTE_DRAFT_STORAGE_KEY);
      return null;
    }
    return value as StoredDraftSession;
  } catch {
    window.sessionStorage.removeItem(NOTE_DRAFT_STORAGE_KEY);
    return null;
  }
}

function getInitialNotesUrlState(): { view: NotesView; search: string; sort: NotesSort } {
  if (typeof window === "undefined") return { view: "all", search: "", sort: "updated" };
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get("widok") ?? "all";
  const view = NOTES_VIEWS.has(requestedView as NotesView)
    || requestedView.startsWith("list:")
    || requestedView.startsWith("tag:")
    ? requestedView as NotesView
    : "all";
  const requestedSort = params.get("sort");
  const sort: NotesSort = requestedSort === "created" || requestedSort === "title" ? requestedSort : "updated";
  return { view, search: params.get("q") ?? "", sort };
}

const COLOR_OPTIONS: Array<{ value: NoteColor; label: string }> = [
  { value: "graphite", label: "Grafitowa" },
  { value: "blue", label: "Niebieska" },
  { value: "green", label: "Zielona" },
  { value: "amber", label: "Bursztynowa" },
  { value: "violet", label: "Fioletowa" },
  { value: "coral", label: "Koralowa" },
];

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nieznana data";
  const dayDiff = calendarDaysBetween(toLocalDateKey(date), todayLocalDateKey()) ?? 0;
  if (dayDiff === 0) return `Dziś, ${formatTime(date)}`;
  if (dayDiff === 1) return "Wczoraj";
  if (dayDiff < 7) {
    return new Intl.DateTimeFormat("pl-PL", {
      weekday: "long",
      timeZone: POLISH_TIME_ZONE,
    }).format(date);
  }
  return formatDate(date);
}

function normalizedTags(value: string): string[] {
  return Array.from(new Set(
    value
      .split(",")
      .map((tagName) => tagName.trim().replace(/^#/, "").toLocaleLowerCase("pl-PL"))
      .filter(Boolean),
  ));
}

function textPreviewLines(body: string): Array<{ text: string; bullet: boolean }> {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      text: line.replace(/^(?:•|-)\s*/, ""),
      bullet: /^(?:•|-)\s+/.test(line),
    }));
}

export default function Notatki() {
  const [initialUrlState] = useState(getInitialNotesUrlState);
  const [storedDraftSession] = useState(loadStoredDraftSession);
  const [workspace, setWorkspace] = useState(loadNotesWorkspace);
  const quickAddRequested = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("akcja") === "nowa-notatka";
  const quickAddTitle = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("tytul") ?? ""
    : "";
  const quickAddDraft: NoteDraft = {
    ...EMPTY_DRAFT,
    title: quickAddTitle,
    listId: workspace.lists[0]?.id ?? "",
  };
  const [view, setView] = useState<NotesView>(initialUrlState.view);
  const [search, setSearch] = useState(initialUrlState.search);
  const [sort, setSort] = useState<NotesSort>(initialUrlState.sort);
  const [layout, setLayout] = useState<NotesLayout>(() => {
    try {
      return window.localStorage.getItem("rootine.notes.layout") === "list" ? "list" : "cards";
    } catch {
      return "cards";
    }
  });
  const [editor, setEditor] = useState<EditorState | null>(storedDraftSession?.editor ?? (quickAddRequested ? { mode: "add" } : null));
  const [draft, setDraft] = useState<NoteDraft>(storedDraftSession?.draft ?? (quickAddRequested ? quickAddDraft : EMPTY_DRAFT));
  const [draftBaseline, setDraftBaseline] = useState(storedDraftSession?.baseline ?? serializeDraft(quickAddRequested ? quickAddDraft : EMPTY_DRAFT));
  const [editorError, setEditorError] = useState("");
  const [deleteState, setDeleteState] = useState<NoteRecord | null>(null);
  const [deletedNoteUndo, setDeletedNoteUndo] = useState<{ note: NoteRecord; index: number } | null>(null);
  const [listEditor, setListEditor] = useState<ListEditorState | null>(null);
  const [listDeleteState, setListDeleteState] = useState<{ id: string; name: string } | null>(null);
  const [listName, setListName] = useState("");
  const [listError, setListError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [listsExpanded, setListsExpanded] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [dirtyPromptOpen, setDirtyPromptOpen] = useState(false);
  const pendingEditorActionRef = useRef<null | (() => void)>(null);
  const draftPersistenceTimerRef = useRef<number | null>(null);
  const draftSessionRef = useRef<StoredDraftSession | null>(storedDraftSession);
  const isEditorDirty = Boolean(editor) && serializeDraft(draft) !== draftBaseline;

  useEffect(() => {
    if (!quickAddRequested) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("akcja");
    url.searchParams.delete("tytul");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [quickAddRequested]);

  const flushDraftSession = useCallback(() => {
    if (draftPersistenceTimerRef.current !== null) {
      window.clearTimeout(draftPersistenceTimerRef.current);
      draftPersistenceTimerRef.current = null;
    }
    try {
      const session = draftSessionRef.current;
      if (session) {
        window.sessionStorage.setItem(NOTE_DRAFT_STORAGE_KEY, JSON.stringify(session));
      } else {
        window.sessionStorage.removeItem(NOTE_DRAFT_STORAGE_KEY);
      }
    } catch {
      // The editor remains dirty and the unload guard stays active if session storage is unavailable.
    }
  }, []);

  const clearDraftSession = useCallback(() => {
    draftSessionRef.current = null;
    if (draftPersistenceTimerRef.current !== null) {
      window.clearTimeout(draftPersistenceTimerRef.current);
      draftPersistenceTimerRef.current = null;
    }
    try {
      window.sessionStorage.removeItem(NOTE_DRAFT_STORAGE_KEY);
    } catch {
      // A failed cleanup must not block saving or closing the note itself.
    }
  }, []);

  useEffect(() => {
    setStorageError(!saveNotesWorkspace(workspace));
  }, [workspace]);

  useEffect(() => subscribeToLocalWorkspace(NOTES_STORAGE_KEY, () => {
    setWorkspace(loadNotesWorkspace());
  }), []);

  useEffect(() => {
    if (!editor || !isEditorDirty) {
      clearDraftSession();
      return;
    }
    draftSessionRef.current = {
      editor,
      draft,
      baseline: draftBaseline,
    };
    if (draftPersistenceTimerRef.current !== null) {
      window.clearTimeout(draftPersistenceTimerRef.current);
    }
    draftPersistenceTimerRef.current = window.setTimeout(
      flushDraftSession,
      NOTE_DRAFT_SAVE_DELAY_MS,
    );
  }, [clearDraftSession, draft, draftBaseline, editor, flushDraftSession, isEditorDirty]);

  useEffect(() => {
    const onPageHide = () => flushDraftSession();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flushDraftSession();
    };
  }, [flushDraftSession]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isEditorDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isEditorDirty]);

  useEffect(() => {
    const syncFromUrl = () => {
      const next = getInitialNotesUrlState();
      setView(next.view);
      setSearch(next.search);
      setSort(next.sort);
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === "all") url.searchParams.delete("widok");
    else url.searchParams.set("widok", view);
    if (search.trim()) url.searchParams.set("q", search);
    else url.searchParams.delete("q");
    if (sort === "updated") url.searchParams.delete("sort");
    else url.searchParams.set("sort", sort);
    if (url.href !== window.location.href) window.history.replaceState({}, "", url);
  }, [search, sort, view]);

  useEffect(() => {
    try {
      window.localStorage.setItem("rootine.notes.layout", layout);
    } catch {
      // The layout preference is optional.
    }
  }, [layout]);

  const activeNotes = useMemo(
    () => workspace.notes.filter((note) => !note.archived),
    [workspace.notes],
  );

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    activeNotes.forEach((note) => note.tags.forEach((tagName) => counts.set(tagName, (counts.get(tagName) ?? 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pl"));
  }, [activeNotes]);
  const visibleTagCounts = useMemo(() => {
    const query = tagSearch.trim().toLocaleLowerCase("pl-PL");
    return query ? tagCounts.filter(([tagName]) => tagName.toLocaleLowerCase("pl-PL").includes(query)) : tagCounts;
  }, [tagCounts, tagSearch]);

  const visibleNotes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pl-PL");
    let notes = workspace.notes.filter((note) => view === "archive" ? note.archived : !note.archived);

    if (view === "pinned") notes = notes.filter((note) => note.pinned);
    if (view.startsWith("list:")) notes = notes.filter((note) => note.listId === view.slice(5));
    if (view.startsWith("tag:")) notes = notes.filter((note) => note.tags.includes(view.slice(4)));

    if (query) {
      notes = notes.filter((note) => [
        note.title,
        note.body,
        note.tags.join(" "),
        note.items.map((item) => item.text).join(" "),
      ].join(" ").toLocaleLowerCase("pl-PL").includes(query));
    }

    notes = notes.slice().sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "pl");
      if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    return notes;
  }, [search, sort, view, workspace.notes]);

  const pinnedNotes = view === "all" ? visibleNotes.filter((note) => note.pinned) : [];
  const regularNotes = view === "all" ? visibleNotes.filter((note) => !note.pinned) : visibleNotes;

  const viewTitle = useMemo(() => {
    if (view === "all") return "Wszystkie notatki";
    if (view === "pinned") return "Przypięte";
    if (view === "archive") return "Archiwum";
    if (view.startsWith("list:")) return workspace.lists.find((list) => list.id === view.slice(5))?.name ?? "Lista";
    return `#${view.slice(4)}`;
  }, [view, workspace.lists]);

  const viewDescription = view === "archive"
    ? "Notatki odłożone poza aktywny obszar"
    : view === "pinned"
      ? "Najważniejsze treści zawsze pod ręką"
      : view.startsWith("list:")
          ? "Notatki w wybranej liście"
          : view.startsWith("tag:")
            ? "Notatki oznaczone tym tagiem"
            : "Szybkie zapiski, listy i pomysły";

  const closeEditorDirectly = () => {
    clearDraftSession();
    setEditor(null);
    setEditorError("");
    setDraftBaseline(serializeDraft(EMPTY_DRAFT));
  };

  const runWithEditorGuard = (action: () => void) => {
    if (!isEditorDirty) {
      action();
      return;
    }
    pendingEditorActionRef.current = action;
    setDirtyPromptOpen(true);
  };

  const openNewNoteDirectly = (kind: NoteKind = "text") => {
    const defaultListId = view.startsWith("list:") ? view.slice(5) : workspace.lists[0]?.id ?? "";
    const nextDraft: NoteDraft = {
      ...EMPTY_DRAFT,
      kind,
      listId: defaultListId,
      items: kind === "checklist" ? [{ id: createNotesId("item"), text: "", checked: false }] : [],
    };
    setDraft(nextDraft);
    setDraftBaseline(serializeDraft(nextDraft));
    setEditorError("");
    setEditor({ mode: "add" });
  };

  const openNewNote = (kind: NoteKind = "text") => {
    runWithEditorGuard(() => openNewNoteDirectly(kind));
  };

  const openNoteDirectly = (note: NoteRecord) => {
    const nextDraft: NoteDraft = {
      title: note.title,
      body: note.body,
      kind: note.kind,
      items: note.items.map((item) => ({ ...item })),
      tags: note.tags.join(", "),
      listId: note.listId,
      color: note.color,
      pinned: note.pinned,
      archived: note.archived,
    };
    setDraft(nextDraft);
    setDraftBaseline(serializeDraft(nextDraft));
    setEditorError("");
    setEditor({ mode: "edit", id: note.id });
  };

  const openNote = (note: NoteRecord) => {
    if (editor?.id === note.id) return;
    runWithEditorGuard(() => openNoteDirectly(note));
  };

  const closeEditor = () => {
    runWithEditorGuard(closeEditorDirectly);
  };

  const updateNote = (noteId: string, updater: (note: NoteRecord) => NoteRecord) => {
    setWorkspace((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === noteId ? updater(note) : note),
    }));
  };

  const saveNote = (): boolean => {
    if (!editor) return false;
    const title = draft.title.trim();
    const cleanedItems = draft.items
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text);
    const hasContent = draft.body.trim() || (draft.kind === "checklist" && cleanedItems.length > 0);

    if (!title) {
      setEditorError("Wpisz tytuł notatki.");
      return false;
    }
    if (!hasContent) {
      setEditorError("Dodaj treść albo przynajmniej jeden punkt listy.");
      return false;
    }

    const now = new Date().toISOString();
    const tags = normalizedTags(draft.tags);
    const savedDraft: NoteDraft = {
      ...draft,
      title,
      body: draft.body.trim(),
      items: draft.kind === "checklist" ? cleanedItems : [],
      tags: tags.join(", "),
    };

    if (editor.mode === "edit" && editor.id) {
      updateNote(editor.id, (note) => ({
        ...note,
        title: savedDraft.title,
        body: savedDraft.body,
        kind: savedDraft.kind,
        items: savedDraft.items,
        tags,
        listId: savedDraft.listId,
        color: savedDraft.color,
        pinned: savedDraft.pinned,
        archived: savedDraft.archived,
        updatedAt: now,
      }));
      recordActivity({ moduleId: "notes", kind: "save", title: savedDraft.title, detail: "Zapisano notatkę" });
    } else {
      const id = createNotesId("note");
      setWorkspace((current) => ({
        ...current,
        notes: [{
          id,
          title: savedDraft.title,
          body: savedDraft.body,
          kind: savedDraft.kind,
          items: savedDraft.items,
          tags,
          listId: savedDraft.listId,
          color: savedDraft.color,
          pinned: savedDraft.pinned,
          archived: false,
          createdAt: now,
          updatedAt: now,
        }, ...current.notes],
      }));
      recordActivity({ moduleId: "notes", kind: "create", title: savedDraft.title, detail: "Utworzono notatkę" });
      setEditor({ mode: "edit", id });
    }
    setDraft(savedDraft);
    setDraftBaseline(serializeDraft(savedDraft));
    clearDraftSession();
    setEditorError("");
    return true;
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      saveNote();
    }
  };

  const togglePinned = (note: NoteRecord) => {
    const nextPinned = !note.pinned;
    updateNote(note.id, (current) => ({ ...current, pinned: nextPinned, updatedAt: new Date().toISOString() }));
    if (editor?.id === note.id) {
      setDraft((current) => ({ ...current, pinned: nextPinned }));
      setDraftBaseline((current) => updateDraftBaseline(current, (baselineDraft) => ({
        ...baselineDraft,
        pinned: nextPinned,
      })));
    }
  };

  const toggleArchived = (note: NoteRecord) => {
    const nextArchived = !note.archived;
    const nextPinned = note.archived ? note.pinned : false;
    updateNote(note.id, (current) => ({
      ...current,
      archived: nextArchived,
      pinned: nextPinned,
      updatedAt: new Date().toISOString(),
    }));
    if (editor?.id === note.id) {
      setDraft((current) => ({ ...current, archived: nextArchived, pinned: nextPinned }));
      setDraftBaseline((current) => updateDraftBaseline(current, (baselineDraft) => ({
        ...baselineDraft,
        archived: nextArchived,
        pinned: nextPinned,
      })));
    }
  };

  const toggleChecklistItem = (note: NoteRecord, itemId: string) => {
    const nextChecked = !note.items.find((item) => item.id === itemId)?.checked;
    updateNote(note.id, (current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, checked: nextChecked } : item),
      updatedAt: new Date().toISOString(),
    }));
    if (editor?.id === note.id) {
      setDraft((current) => ({
        ...current,
        items: current.items.map((item) => item.id === itemId ? { ...item, checked: nextChecked } : item),
      }));
      setDraftBaseline((current) => updateDraftBaseline(current, (baselineDraft) => ({
        ...baselineDraft,
        items: baselineDraft.items.map((item) => item.id === itemId ? { ...item, checked: nextChecked } : item),
      })));
    }
  };

  const addDraftItem = () => {
    setDraft((current) => ({
      ...current,
      items: [...current.items, { id: createNotesId("item"), text: "", checked: false }],
    }));
  };

  const saveList = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = listName.trim();
    if (!name) {
      setListError("Wpisz nazwę listy.");
      return;
    }
    if (workspace.lists.some((list) => (
      list.id !== listEditor?.id
      && list.name.toLocaleLowerCase("pl-PL") === name.toLocaleLowerCase("pl-PL")
    ))) {
      setListError("Lista o tej nazwie już istnieje.");
      return;
    }
    if (listEditor?.mode === "edit" && listEditor.id) {
      setWorkspace((current) => ({
        ...current,
        lists: current.lists.map((list) => list.id === listEditor.id ? { ...list, name } : list),
      }));
      setListName("");
      setListError("");
      setListEditor(null);
      return;
    }
    const id = createNotesId("list");
    setWorkspace((current) => ({
      ...current,
      lists: [...current.lists, { id, name, createdAt: new Date().toISOString() }],
    }));
    setView(`list:${id}`);
    setListName("");
    setListError("");
    setListEditor(null);
  };

  const openListEditor = (list?: { id: string; name: string }) => {
    setListName(list?.name ?? "");
    setListError("");
    setListEditor(list ? { mode: "edit", id: list.id } : { mode: "add" });
  };

  const closeListEditor = () => {
    setListEditor(null);
    setListName("");
    setListError("");
  };

  const confirmListDelete = () => {
    if (!listDeleteState) return;
    setWorkspace((current) => ({
      ...current,
      lists: current.lists.filter((list) => list.id !== listDeleteState.id),
      notes: current.notes.map((note) => note.listId === listDeleteState.id ? { ...note, listId: "" } : note),
    }));
    if (draft.listId === listDeleteState.id) {
      setDraft((current) => ({ ...current, listId: "" }));
    }
    if (view === `list:${listDeleteState.id}`) {
      setView("all");
    }
    setListDeleteState(null);
  };

  const confirmDelete = () => {
    if (!deleteState) return;
    setDeletedNoteUndo({
      note: deleteState,
      index: Math.max(0, workspace.notes.findIndex((note) => note.id === deleteState.id)),
    });
    setWorkspace((current) => ({
      ...current,
      notes: current.notes.filter((note) => note.id !== deleteState.id),
    }));
    if (editor?.id === deleteState.id) closeEditorDirectly();
    setDeleteState(null);
  };

  const undoNoteDelete = () => {
    if (!deletedNoteUndo) return;
    setWorkspace((current) => {
      if (current.notes.some((note) => note.id === deletedNoteUndo.note.id)) return current;
      const notes = [...current.notes];
      notes.splice(Math.min(deletedNoteUndo.index, notes.length), 0, deletedNoteUndo.note);
      return { ...current, notes };
    });
    setDeletedNoteUndo(null);
  };

  const selectView = (nextView: NotesView) => {
    runWithEditorGuard(() => {
      closeEditorDirectly();
      setView(nextView);
      setSearch("");
      const url = new URL(window.location.href);
      if (nextView === "all") url.searchParams.delete("widok");
      else url.searchParams.set("widok", nextView);
      url.searchParams.delete("q");
      window.history.pushState({}, "", url);
    });
  };

  const cancelDirtyTransition = () => {
    pendingEditorActionRef.current = null;
    setDirtyPromptOpen(false);
  };

  const continueAfterDiscard = () => {
    const action = pendingEditorActionRef.current;
    pendingEditorActionRef.current = null;
    setDirtyPromptOpen(false);
    closeEditorDirectly();
    action?.();
  };

  const continueAfterSave = () => {
    if (!saveNote()) {
      setDirtyPromptOpen(false);
      return;
    }
    const action = pendingEditorActionRef.current;
    pendingEditorActionRef.current = null;
    setDirtyPromptOpen(false);
    action?.();
  };

  const contextSidebar = (
    <ModuleSidebar label="Widoki notatek" className="notes-sidebar">
      <div className="notes-sidebar__nav">
        <p className="notes-sidebar__label">Główne</p>
        <ContextNavItem active={view === "all"} icon={<LayoutGrid />} label="Wszystkie" meta={activeNotes.length} onClick={() => selectView("all")} />
        <ContextNavItem active={view === "pinned"} icon={<Pin />} label="Przypięte" meta={activeNotes.filter((note) => note.pinned).length} onClick={() => selectView("pinned")} />
        <ContextNavItem active={view === "archive"} icon={<Archive />} label="Archiwum" meta={workspace.notes.filter((note) => note.archived).length} onClick={() => selectView("archive")} />

        <section className="notes-sidebar__group" aria-labelledby="notes-lists-heading">
          <div className="notes-sidebar__group-heading">
            <button
              type="button"
              id="notes-lists-heading"
              className={`notes-sidebar__group-toggle ${listsExpanded ? "is-expanded" : ""}`}
              aria-expanded={listsExpanded}
              aria-controls="notes-lists-panel"
              onClick={() => setListsExpanded((current) => !current)}
            >
              <ChevronDown size={13} aria-hidden="true" />
              <span className="notes-sidebar__label">Listy</span>
              <span className="notes-sidebar__group-count">{workspace.lists.length}</span>
            </button>
            <button
              type="button"
              className="notes-sidebar__group-action"
              aria-label="Dodaj listę"
              title="Utwórz listę"
              onClick={() => openListEditor()}
            >
              <Plus size={13} />
            </button>
          </div>
          {listsExpanded && (
            <div id="notes-lists-panel" className="notes-sidebar__group-items">
              {workspace.lists.map((list) => (
                <div key={list.id} className="notes-sidebar__list-row">
                  <ContextNavItem
                    active={view === `list:${list.id}`}
                    icon={<Folder />}
                    label={list.name}
                    meta={activeNotes.filter((note) => note.listId === list.id).length}
                    onClick={() => selectView(`list:${list.id}`)}
                  />
                  <span className="notes-sidebar__list-actions">
                    <button
                      type="button"
                      aria-label={`Zmień nazwę listy ${list.name}`}
                      title="Zmień nazwę"
                      onClick={() => openListEditor(list)}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Usuń listę ${list.name}`}
                      title="Usuń listę"
                      onClick={() => setListDeleteState({ id: list.id, name: list.name })}
                    >
                      <Trash2 size={11} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {tagCounts.length > 0 && (
          <section className="notes-sidebar__group" aria-labelledby="notes-tags-heading">
            <div className="notes-sidebar__group-heading">
              <button
                type="button"
                id="notes-tags-heading"
                className={`notes-sidebar__group-toggle ${tagsExpanded ? "is-expanded" : ""}`}
                aria-expanded={tagsExpanded}
                aria-controls="notes-tags-panel"
                onClick={() => setTagsExpanded((current) => !current)}
              >
                <ChevronDown size={13} aria-hidden="true" />
                <span className="notes-sidebar__label">Tagi</span>
                <span className="notes-sidebar__group-count">{tagCounts.length}</span>
              </button>
            </div>
            {tagsExpanded && (
              <div id="notes-tags-panel" className="notes-sidebar__group-items">
                {tagCounts.length > 7 && (
                  <label className="notes-sidebar__tag-search">
                    <Search size={11} aria-hidden="true" />
                    <span className="ui-sr-only">Filtruj wszystkie tagi</span>
                    <input
                      value={tagSearch}
                      placeholder="Filtruj tagi"
                      onChange={(event) => setTagSearch(event.target.value)}
                    />
                  </label>
                )}
                {visibleTagCounts.map(([tagName, count]) => (
                  <ContextNavItem
                    key={tagName}
                    active={view === `tag:${tagName}`}
                    icon={<Tag />}
                    label={`#${tagName}`}
                    meta={count}
                    onClick={() => selectView(`tag:${tagName}`)}
                  />
                ))}
                {tagSearch && visibleTagCounts.length === 0 && (
                  <p className="notes-sidebar__tag-empty">Brak pasujących tagów</p>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      <div className="notes-sidebar__footer">
        <FileText size={13} />
        <span>Notatki zapisują się lokalnie</span>
      </div>
    </ModuleSidebar>
  );

  const renderNoteCard = (note: NoteRecord) => {
    const list = workspace.lists.find((candidate) => candidate.id === note.listId);
    const checkedCount = note.items.filter((item) => item.checked).length;
    const previewLines = textPreviewLines(note.body);
    const visibleChecklistItems = layout === "cards" ? note.items : note.items.slice(0, 2);

    return (
      <article key={note.id} className={`notes-card notes-card--${note.color}`}>
        <span
          className="notes-card__color"
          role="img"
          aria-label={`Kolor: ${COLOR_OPTIONS.find((option) => option.value === note.color)?.label}`}
        />
        <header className="notes-card__header">
          <button type="button" className="notes-card__title" onClick={() => openNote(note)}>
            {note.title}
          </button>
          <div className="notes-card__actions">
            <AddToTasksButton
              compact
              input={{
                source: {
                  kind: "notes",
                  entity: `${encodeURIComponent(note.id)}/note`,
                  context: list?.name ?? "Notatki",
                  href: `/notatki?notatka=${encodeURIComponent(note.id)}`,
                },
                text: note.title,
                done: false,
                list: "notatki",
                tags: note.tags,
                notes: note.body,
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              className={note.pinned ? "is-active" : ""}
              aria-label={note.pinned ? `Odepnij ${note.title}` : `Przypnij ${note.title}`}
              title={note.pinned ? "Odepnij" : "Przypnij"}
              onClick={() => togglePinned(note)}
            >
              {note.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={note.archived ? `Przywróć ${note.title}` : `Archiwizuj ${note.title}`}
              title={note.archived ? "Przywróć" : "Archiwizuj"}
              onClick={() => toggleArchived(note)}
            >
              {note.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={`Usuń ${note.title}`}
              title="Usuń"
              onClick={() => setDeleteState(note)}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        </header>

        <div
          className="notes-card__content-scroll"
          tabIndex={layout === "cards" ? 0 : undefined}
          role={layout === "cards" ? "group" : undefined}
          aria-label={layout === "cards" ? `Treść notatki ${note.title}` : undefined}
        >
          {note.body && (
            <button type="button" className="notes-card__body" onClick={() => openNote(note)}>
              {note.kind === "text" && previewLines.some((line) => line.bullet) ? (
                <ul>
                  {previewLines.map((line, index) => <li key={`${line.text}-${index}`}>{line.text}</li>)}
                </ul>
              ) : (
                <p>{note.body}</p>
              )}
            </button>
          )}

          {note.kind === "checklist" && note.items.length > 0 && (
            <div className="notes-card__checklist" aria-label={`Lista w notatce ${note.title}`}>
              {visibleChecklistItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.checked ? "is-checked" : ""}
                  aria-pressed={item.checked}
                  onClick={() => toggleChecklistItem(note, item.id)}
                >
                  <span>{item.checked && <Check size={9} />}</span>
                  <strong>{item.text}</strong>
                </button>
              ))}
              {note.items.length > visibleChecklistItems.length && (
                <small>+{note.items.length - visibleChecklistItems.length} kolejne</small>
              )}
            </div>
          )}
        </div>

        <footer className="notes-card__footer">
          <div className="notes-card__tags">
            {note.tags.slice(0, 3).map((tagName) => (
              <button key={tagName} type="button" onClick={() => selectView(`tag:${tagName}`)}>#{tagName}</button>
            ))}
          </div>
          <div className="notes-card__meta">
            {note.kind === "checklist" && <span>{checkedCount}/{note.items.length}</span>}
            {list && <span>{list.name}</span>}
            <time dateTime={note.updatedAt}>{formatUpdatedAt(note.updatedAt)}</time>
          </div>
        </footer>
      </article>
    );
  };

  const renderSection = (title: string | undefined, notes: NoteRecord[], pinned = false) => {
    if (!notes.length) return null;
    return (
      <section className="notes-shelf" aria-labelledby={title ? `notes-shelf-${pinned ? "pinned" : "main"}` : undefined} aria-label={title ? undefined : viewTitle}>
        {title && <header className="notes-shelf__heading">
          <div>
            {pinned ? <Pin size={13} /> : <FileText size={13} />}
            <h2 id={`notes-shelf-${pinned ? "pinned" : "main"}`}>{title}</h2>
          </div>
          <span>{notes.length}</span>
        </header>}
        <div className={`notes-grid notes-grid--${layout}`}>{notes.map(renderNoteCard)}</div>
      </section>
    );
  };

  const selectedNote = editor?.id ? workspace.notes.find((note) => note.id === editor.id) : undefined;

  const detailPanel = editor ? (
    <DetailPanel
      label={editor.mode === "add" ? "Nowa notatka" : `Edytuj ${selectedNote?.title ?? "notatkę"}`}
      className="notes-detail"
      onDismiss={closeEditor}
    >
      <form
        className="notes-editor"
        onSubmit={(event) => { event.preventDefault(); saveNote(); }}
        onKeyDown={onEditorKeyDown}
        onBlur={flushDraftSession}
      >
        <header className="notes-editor__header">
          <div>
            <span>{editor.mode === "add" ? "Nowa notatka" : "Edycja notatki"}</span>
            <Badge tone={draft.kind === "checklist" ? "violet" : "neutral"}>
              {draft.kind === "checklist" ? "Lista" : "Tekst"}
            </Badge>
          </div>
          <div>
            {editor.mode === "edit" && selectedNote && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={draft.pinned ? "Odepnij notatkę" : "Przypnij notatkę"}
                  title={draft.pinned ? "Odepnij" : "Przypnij"}
                  onClick={() => togglePinned(selectedNote)}
                >
                  {draft.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={draft.archived ? "Przywróć notatkę" : "Archiwizuj notatkę"}
                  title={draft.archived ? "Przywróć" : "Archiwizuj"}
                  onClick={() => toggleArchived(selectedNote)}
                >
                  {draft.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij edytor" onClick={closeEditor}>
              <X size={13} />
            </Button>
          </div>
        </header>

        <div className="notes-editor__scroll">
          <label className="notes-editor__title-field">
            <span className="ui-sr-only">Tytuł notatki</span>
            <input
              autoFocus
              data-autofocus
              value={draft.title}
              placeholder="Tytuł notatki"
              onChange={(event) => {
                setDraft((current) => ({ ...current, title: event.target.value }));
                if (editorError) setEditorError("");
              }}
            />
          </label>
          {editorError && <p className="notes-editor__error" role="alert">{editorError}</p>}

          <div className="notes-editor__kind" role="group" aria-label="Format notatki">
            <button
              type="button"
              className={draft.kind === "text" ? "is-active" : ""}
              aria-pressed={draft.kind === "text"}
              onClick={() => setDraft((current) => ({ ...current, kind: "text" }))}
            >
              <FileText size={13} /> Tekst
            </button>
            <button
              type="button"
              className={draft.kind === "checklist" ? "is-active" : ""}
              aria-pressed={draft.kind === "checklist"}
              onClick={() => setDraft((current) => ({
                ...current,
                kind: "checklist",
                items: current.items.length ? current.items : [{ id: createNotesId("item"), text: "", checked: false }],
              }))}
            >
              <ListChecks size={13} /> Lista punktowana
            </button>
          </div>

          <Textarea
            label={draft.kind === "checklist" ? "Wprowadzenie" : "Treść"}
            className="notes-editor__body"
            value={draft.body}
            placeholder={draft.kind === "checklist" ? "Krótki kontekst listy — opcjonalnie" : "Zapisz myśl, szczegóły albo wnioski…"}
            onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
          />

          {draft.kind === "text" && (
            <Button
              variant="ghost"
              size="sm"
              className="notes-editor__bullet-action"
              leadingIcon={<ListChecks size={13} />}
              onClick={() => setDraft((current) => ({
                ...current,
                body: `${current.body}${current.body && !current.body.endsWith("\n") ? "\n" : ""}• `,
              }))}
            >
              Dodaj punkt
            </Button>
          )}

          {draft.kind === "checklist" && (
            <section className="notes-editor__items" aria-labelledby="notes-editor-items-title">
              <div className="notes-editor__section-heading">
                <h3 id="notes-editor-items-title">Punkty listy</h3>
                <span>{draft.items.filter((item) => item.checked).length}/{draft.items.length}</span>
              </div>
              <div>
                {draft.items.map((item, index) => (
                  <div key={item.id} className="notes-editor__item">
                    <button
                      type="button"
                      className={item.checked ? "is-checked" : ""}
                      aria-label={item.checked ? "Oznacz punkt jako niezrobiony" : "Oznacz punkt jako zrobiony"}
                      aria-pressed={item.checked}
                      onClick={() => setDraft((current) => ({
                        ...current,
                        items: current.items.map((candidate) => candidate.id === item.id ? { ...candidate, checked: !candidate.checked } : candidate),
                      }))}
                    >
                      {item.checked && <Check size={11} />}
                    </button>
                    <input
                      value={item.text}
                      aria-label={`Punkt ${index + 1}`}
                      placeholder={`Punkt ${index + 1}`}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        items: current.items.map((candidate) => candidate.id === item.id ? { ...candidate, text: event.target.value } : candidate),
                      }))}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={`Usuń punkt ${index + 1}`}
                      onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((candidate) => candidate.id !== item.id) }))}
                    >
                      <X size={13} />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={addDraftItem}>Dodaj punkt</Button>
            </section>
          )}

          <div className="notes-editor__meta-grid">
            <Select
              label="Lista"
              value={draft.listId}
              options={[
                { value: "", label: "Bez listy" },
                ...workspace.lists.map((list) => ({ value: list.id, label: list.name })),
              ]}
              onChange={(event) => setDraft((current) => ({ ...current, listId: event.target.value }))}
            />
            <Input
              label="Tagi"
              hint="Oddziel tagi przecinkami."
              placeholder="np. pomysł, ważne"
              value={draft.tags}
              onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
            />
          </div>

          {tagCounts.length > 0 && (
            <div className="notes-editor__tag-suggestions">
              <span>Podpowiedzi</span>
              <div>
                {tagCounts.slice(0, 6).map(([tagName]) => (
                  <button
                    key={tagName}
                    type="button"
                    onClick={() => {
                      const currentTags = normalizedTags(draft.tags);
                      if (!currentTags.includes(tagName)) currentTags.push(tagName);
                      setDraft((current) => ({ ...current, tags: currentTags.join(", ") }));
                    }}
                  >
                    #{tagName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <fieldset className="notes-editor__colors">
            <legend>Kolor notatki</legend>
            <div>
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`notes-color notes-color--${option.value} ${draft.color === option.value ? "is-selected" : ""}`}
                  aria-label={option.label}
                  aria-pressed={draft.color === option.value}
                  title={option.label}
                  onClick={() => setDraft((current) => ({ ...current, color: option.value }))}
                >
                  {draft.color === option.value && <Check size={11} />}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <footer className="notes-editor__footer">
          {editor.mode === "edit" && selectedNote ? (
            <Button variant="danger" size="sm" leadingIcon={<Trash2 size={13} />} onClick={() => setDeleteState(selectedNote)}>
              Usuń
            </Button>
          ) : <span />}
          <div>
            <span>Ctrl + Enter</span>
            <Button variant="primary" type="submit">Zapisz</Button>
          </div>
        </footer>
      </form>
    </DetailPanel>
  ) : undefined;

  return (
    <ModuleShell
      contextSidebar={contextSidebar}
      detailPanel={detailPanel}
      className="notes-module"
      pageWidth="standard"
    >
      <ModuleMain transitionKey={view}>
        <ContentHeader
          headingLevel={1}
          className="notes-toolbar"
          title={viewTitle}
          description={viewDescription}
          mobileNavigation={<Select
              compact
              aria-label="Widok notatek"
              value={view}
              options={[
                { value: "all", label: "Wszystkie" },
                { value: "pinned", label: "Przypięte" },
                { value: "archive", label: "Archiwum" },
                ...workspace.lists.map((list) => ({ value: `list:${list.id}`, label: list.name })),
              ]}
              onChange={(event) => selectView(event.target.value as NotesView)}
            />}
          meta={<>
            {storageError && <Badge tone="danger">Brak zapisu lokalnego</Badge>}
            <span className="notes-toolbar__count">{visibleNotes.length} {visibleNotes.length === 1 ? "notatka" : "notatek"}</span>
          </>}
          actions={<>
          <label className="notes-search">
            <Search size={13} aria-hidden="true" />
            <span className="ui-sr-only">Szukaj w notatkach</span>
            <input value={search} placeholder="Szukaj w notatkach" onChange={(event) => setSearch(event.target.value)} />
            {search && (
              <button type="button" aria-label="Wyczyść wyszukiwanie" onClick={() => setSearch("")}>
                <X size={13} />
              </button>
            )}
          </label>
          <Select
            compact
            aria-label="Sortowanie notatek"
            value={sort}
            options={[
              { value: "updated", label: "Ostatnio zmieniane" },
              { value: "created", label: "Najnowsze" },
              { value: "title", label: "Alfabetycznie" },
            ]}
            onChange={(event) => setSort(event.target.value as NotesSort)}
          />
          <div className="ui-view-switch" aria-label="Sposób wyświetlania notatek">
            <Button variant="ghost" size="sm" iconOnly aria-label="Widok listy" aria-pressed={layout === "list"} onClick={() => setLayout("list")}>
              <Rows3 size={13} />
            </Button>
            <Button variant="ghost" size="sm" iconOnly aria-label="Widok kart" aria-pressed={layout === "cards"} onClick={() => setLayout("cards")}>
              <LayoutGrid size={13} />
            </Button>
          </div>
          {view.startsWith("list:") && (
            <Button variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={() => openNewNote()}>
              Dodaj do listy
            </Button>
          )}
          <Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openNewNote()}>
            Dodaj notatkę
          </Button>
          </>}
        />

        {deletedNoteUndo && (
          <ToastViewport>
            <Toast actionLabel="Cofnij" onAction={undoNoteDelete} onDismiss={() => setDeletedNoteUndo(null)}>
              Usunięto „{deletedNoteUndo.note.title}”.
            </Toast>
          </ToastViewport>
        )}

        <div className="notes-canvas">
          {visibleNotes.length === 0 ? (
            <EmptyState
              icon={search ? <Search size={18} /> : view === "archive" ? <Archive size={18} /> : <NotebookPen size={18} />}
              title={search ? "Brak pasujących notatek" : view === "archive" ? "Archiwum jest puste" : "Zapisz pierwszą notatkę"}
              description={search
                ? "Zmień wyszukiwaną frazę albo wyczyść pole."
                : view === "archive"
                  ? "Zarchiwizowane notatki pojawią się tutaj i będzie można je przywrócić."
                  : "Dodaj szybki tekst albo listę punktowaną, a potem przypisz kolor, listę i tagi."}
              action={!search && view !== "archive"
                ? <Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openNewNote()}>Dodaj notatkę</Button>
                : undefined}
            />
          ) : (
            <>
              {renderSection("Przypięte", pinnedNotes, true)}
              {renderSection(view === "all" && pinnedNotes.length ? "Pozostałe notatki" : undefined, regularNotes)}
            </>
          )}
        </div>
      </ModuleMain>

      {listEditor && (
        <Modal
          eyebrow="Listy notatek"
          title={listEditor.mode === "edit" ? "Zmień nazwę listy" : "Nowa lista"}
          description={listEditor.mode === "edit"
            ? "Nowa nazwa pojawi się przy wszystkich przypisanych notatkach."
            : "Lista porządkuje notatki według obszaru albo kontekstu."}
          onClose={closeListEditor}
          footer={(
            <>
              <Button variant="ghost" onClick={closeListEditor}>Anuluj</Button>
              <Button variant="primary" type="submit" form="notes-list-form">
                {listEditor.mode === "edit" ? "Zapisz nazwę" : "Utwórz listę"}
              </Button>
            </>
          )}
        >
          <form id="notes-list-form" onSubmit={saveList}>
            <Input
              label="Nazwa listy"
              placeholder="np. Dom, Nauka, Inspiracje"
              value={listName}
              error={listError}
              autoFocus
              onChange={(event) => {
                setListName(event.target.value);
                if (listError) setListError("");
              }}
            />
          </form>
        </Modal>
      )}

      {listDeleteState && (
        <Modal
          eyebrow="Listy notatek"
          title={`Usunąć listę „${listDeleteState.name}”?`}
          description="Notatki pozostaną w bibliotece i zostaną przeniesione do „Bez listy”."
          onClose={() => setListDeleteState(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setListDeleteState(null)}>Anuluj</Button>
              <Button variant="danger" onClick={confirmListDelete}>Usuń listę</Button>
            </>
          )}
        >
          <p className="notes-delete-note">
            Dotyczy {workspace.notes.filter((note) => note.listId === listDeleteState.id).length} notatek.
          </p>
        </Modal>
      )}

      {deleteState && (
        <Modal
          eyebrow="Potwierdzenie"
          title={`Usunąć „${deleteState.title}”?`}
          description="Notatka zostanie trwale usunięta z lokalnej biblioteki."
          onClose={() => setDeleteState(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setDeleteState(null)}>Anuluj</Button>
              <Button variant="danger" onClick={confirmDelete}>Usuń notatkę</Button>
            </>
          )}
        >
          <p className="notes-delete-note">Jeśli chcesz zachować treść poza głównym widokiem, użyj archiwizacji zamiast usuwania.</p>
        </Modal>
      )}

      {dirtyPromptOpen && (
        <Modal
          eyebrow="Niezapisane zmiany"
          title="Co zrobić z edytowaną notatką?"
          description="Możesz zapisać zmiany, odrzucić je albo wrócić do edycji. Kopia robocza jest zachowana w tej sesji."
          onClose={cancelDirtyTransition}
          footer={(
            <>
              <Button variant="ghost" onClick={cancelDirtyTransition}>Wróć do edycji</Button>
              <Button variant="danger" onClick={continueAfterDiscard}>Odrzuć zmiany</Button>
              <Button variant="primary" onClick={continueAfterSave}>Zapisz i kontynuuj</Button>
            </>
          )}
        >
          <p className="notes-delete-note">Niezapisana treść nie zostanie utracona bez Twojej decyzji.</p>
        </Modal>
      )}
    </ModuleShell>
  );
}
