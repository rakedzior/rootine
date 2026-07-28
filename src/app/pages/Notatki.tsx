/**
 * THESIS: Notatki is a capture desk, not a wall of decorative sticky notes; it refuses a card gallery with no filing or editing depth.
 * OWN-WORLD: Routine's graphite workshop, a compact filing rail, restrained color markers, dense note sheets, and a docked writing panel.
 * STORY: Capture quickly, find by list or tag, pin what matters, and turn loose thoughts into text or actionable checklists.
 * FIRST VIEWPORT: The filing rail frames pinned and recent sheets while the selected note opens as a focused editor on the right.
 * FORM: The fifth grounded structure — a pinned desk with a live detail editor — selected with seed de49c24a.
 */
import {
  Archive,
  ArchiveRestore,
  Check,
  CheckSquare,
  ChevronDown,
  Clock3,
  FileText,
  Folder,
  FolderPlus,
  LayoutGrid,
  ListChecks,
  NotebookPen,
  Pin,
  PinOff,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  createNotesId,
  loadNotesWorkspace,
  saveNotesWorkspace,
  type NoteChecklistItem,
  type NoteColor,
  type NoteKind,
  type NoteRecord,
} from "../data/notesWorkspace";
import {
  Badge,
  Button,
  ContextNavItem,
  ContextSidebar,
  DetailPanel,
  EmptyState,
  Input,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  Select,
  WorkspaceToolbar,
} from "../ui";

type NotesView = "all" | "pinned" | "recent" | "archive" | `list:${string}` | `tag:${string}`;
type NotesSort = "updated" | "created" | "title";
type EditorState = { mode: "add" | "edit"; id?: string };

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
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfDate) / 86_400_000);
  if (dayDiff === 0) return `Dziś, ${date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
  if (dayDiff === 1) return "Wczoraj";
  if (dayDiff < 7) return date.toLocaleDateString("pl-PL", { weekday: "long" });
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
}

function normalizedTags(value: string): string[] {
  return Array.from(new Set(
    value
      .split(",")
      .map((tagName) => tagName.trim().replace(/^#/, ""))
      .filter(Boolean),
  ));
}

function textPreviewLines(body: string): Array<{ text: string; bullet: boolean }> {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((line) => ({
      text: line.replace(/^(?:•|-)\s*/, ""),
      bullet: /^(?:•|-)\s+/.test(line),
    }));
}

export default function Notatki() {
  const [workspace, setWorkspace] = useState(loadNotesWorkspace);
  const [view, setView] = useState<NotesView>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<NotesSort>("updated");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<NoteDraft>(EMPTY_DRAFT);
  const [editorError, setEditorError] = useState("");
  const [deleteState, setDeleteState] = useState<NoteRecord | null>(null);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listName, setListName] = useState("");
  const [listError, setListError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [listsExpanded, setListsExpanded] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  useEffect(() => {
    setStorageError(!saveNotesWorkspace(workspace));
  }, [workspace]);

  const activeNotes = useMemo(
    () => workspace.notes.filter((note) => !note.archived),
    [workspace.notes],
  );

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    activeNotes.forEach((note) => note.tags.forEach((tagName) => counts.set(tagName, (counts.get(tagName) ?? 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pl"));
  }, [activeNotes]);

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

    if (view === "recent") return notes.slice(0, 12);
    return notes;
  }, [search, sort, view, workspace.notes]);

  const pinnedNotes = view === "all" ? visibleNotes.filter((note) => note.pinned) : [];
  const regularNotes = view === "all" ? visibleNotes.filter((note) => !note.pinned) : visibleNotes;

  const viewTitle = useMemo(() => {
    if (view === "all") return "Wszystkie notatki";
    if (view === "pinned") return "Przypięte";
    if (view === "recent") return "Ostatnie";
    if (view === "archive") return "Archiwum";
    if (view.startsWith("list:")) return workspace.lists.find((list) => list.id === view.slice(5))?.name ?? "Lista";
    return `#${view.slice(4)}`;
  }, [view, workspace.lists]);

  const viewDescription = view === "archive"
    ? "Notatki odłożone poza aktywny obszar"
    : view === "pinned"
      ? "Najważniejsze treści zawsze pod ręką"
      : view === "recent"
        ? "Ostatnio tworzone i zmieniane"
        : view.startsWith("list:")
          ? "Notatki w wybranej liście"
          : view.startsWith("tag:")
            ? "Notatki oznaczone tym tagiem"
            : "Szybkie zapiski, listy i pomysły";

  const openNewNote = (kind: NoteKind = "text") => {
    const defaultListId = view.startsWith("list:") ? view.slice(5) : workspace.lists[0]?.id ?? "";
    setDraft({
      ...EMPTY_DRAFT,
      kind,
      listId: defaultListId,
      items: kind === "checklist" ? [{ id: createNotesId("item"), text: "", checked: false }] : [],
    });
    setEditorError("");
    setEditor({ mode: "add" });
  };

  const openNote = (note: NoteRecord) => {
    setDraft({
      title: note.title,
      body: note.body,
      kind: note.kind,
      items: note.items.map((item) => ({ ...item })),
      tags: note.tags.join(", "),
      listId: note.listId,
      color: note.color,
      pinned: note.pinned,
      archived: note.archived,
    });
    setEditorError("");
    setEditor({ mode: "edit", id: note.id });
  };

  const closeEditor = () => {
    setEditor(null);
    setEditorError("");
  };

  const updateNote = (noteId: string, updater: (note: NoteRecord) => NoteRecord) => {
    setWorkspace((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === noteId ? updater(note) : note),
    }));
  };

  const saveNote = () => {
    if (!editor) return;
    const title = draft.title.trim();
    const cleanedItems = draft.items
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text);
    const hasContent = draft.body.trim() || (draft.kind === "checklist" && cleanedItems.length > 0);

    if (!title) {
      setEditorError("Wpisz tytuł notatki.");
      return;
    }
    if (!hasContent) {
      setEditorError("Dodaj treść albo przynajmniej jeden punkt listy.");
      return;
    }

    const now = new Date().toISOString();
    const tags = normalizedTags(draft.tags);

    if (editor.mode === "edit" && editor.id) {
      updateNote(editor.id, (note) => ({
        ...note,
        title,
        body: draft.body.trim(),
        kind: draft.kind,
        items: draft.kind === "checklist" ? cleanedItems : [],
        tags,
        listId: draft.listId,
        color: draft.color,
        pinned: draft.pinned,
        archived: draft.archived,
        updatedAt: now,
      }));
    } else {
      const id = createNotesId("note");
      setWorkspace((current) => ({
        ...current,
        notes: [{
          id,
          title,
          body: draft.body.trim(),
          kind: draft.kind,
          items: draft.kind === "checklist" ? cleanedItems : [],
          tags,
          listId: draft.listId,
          color: draft.color,
          pinned: draft.pinned,
          archived: false,
          createdAt: now,
          updatedAt: now,
        }, ...current.notes],
      }));
      setEditor({ mode: "edit", id });
    }
    setEditorError("");
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      saveNote();
    }
  };

  const togglePinned = (note: NoteRecord) => {
    updateNote(note.id, (current) => ({ ...current, pinned: !current.pinned, updatedAt: new Date().toISOString() }));
    if (editor?.id === note.id) setDraft((current) => ({ ...current, pinned: !current.pinned }));
  };

  const toggleArchived = (note: NoteRecord) => {
    updateNote(note.id, (current) => ({
      ...current,
      archived: !current.archived,
      pinned: current.archived ? current.pinned : false,
      updatedAt: new Date().toISOString(),
    }));
    if (editor?.id === note.id) {
      setDraft((current) => ({ ...current, archived: !note.archived, pinned: note.archived ? current.pinned : false }));
    }
  };

  const toggleChecklistItem = (note: NoteRecord, itemId: string) => {
    updateNote(note.id, (current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, checked: !item.checked } : item),
      updatedAt: new Date().toISOString(),
    }));
    if (editor?.id === note.id) {
      setDraft((current) => ({
        ...current,
        items: current.items.map((item) => item.id === itemId ? { ...item, checked: !item.checked } : item),
      }));
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
    if (workspace.lists.some((list) => list.name.toLocaleLowerCase("pl-PL") === name.toLocaleLowerCase("pl-PL"))) {
      setListError("Lista o tej nazwie już istnieje.");
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
    setListModalOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteState) return;
    setWorkspace((current) => ({
      ...current,
      notes: current.notes.filter((note) => note.id !== deleteState.id),
    }));
    if (editor?.id === deleteState.id) closeEditor();
    setDeleteState(null);
  };

  const selectView = (nextView: NotesView) => {
    setView(nextView);
    setSearch("");
  };

  const contextSidebar = (
    <ContextSidebar label="Widoki notatek" className="notes-sidebar">
      <div className="notes-sidebar__heading">
        <div>
          <span>Biblioteka</span>
          <strong>{activeNotes.length} aktywnych</strong>
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Nowa notatka" onClick={() => openNewNote()}>
          <Plus size={13} />
        </Button>
      </div>

      <div className="notes-sidebar__nav">
        <p className="notes-sidebar__label">Główne</p>
        <ContextNavItem active={view === "all"} icon={<LayoutGrid />} label="Wszystkie" meta={activeNotes.length} onClick={() => selectView("all")} />
        <ContextNavItem active={view === "pinned"} icon={<Pin />} label="Przypięte" meta={activeNotes.filter((note) => note.pinned).length} onClick={() => selectView("pinned")} />
        <ContextNavItem active={view === "recent"} icon={<Clock3 />} label="Ostatnie" onClick={() => selectView("recent")} />
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
              <ChevronDown size={12} aria-hidden="true" />
              <span className="notes-sidebar__label">Listy</span>
              <span className="notes-sidebar__group-count">{workspace.lists.length}</span>
            </button>
            <button
              type="button"
              className="notes-sidebar__group-action"
              aria-label="Utwórz listę"
              title="Utwórz listę"
              onClick={() => setListModalOpen(true)}
            >
              <Plus size={12} />
            </button>
          </div>
          {listsExpanded && (
            <div id="notes-lists-panel" className="notes-sidebar__group-items">
              {workspace.lists.map((list) => (
                <ContextNavItem
                  key={list.id}
                  active={view === `list:${list.id}`}
                  icon={<Folder />}
                  label={list.name}
                  meta={activeNotes.filter((note) => note.listId === list.id).length}
                  onClick={() => selectView(`list:${list.id}`)}
                />
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
                <ChevronDown size={12} aria-hidden="true" />
                <span className="notes-sidebar__label">Tagi</span>
                <span className="notes-sidebar__group-count">{tagCounts.length}</span>
              </button>
            </div>
            {tagsExpanded && (
              <div id="notes-tags-panel" className="notes-sidebar__group-items">
                {tagCounts.slice(0, 7).map(([tagName, count]) => (
                  <ContextNavItem
                    key={tagName}
                    active={view === `tag:${tagName}`}
                    icon={<Tag />}
                    label={`#${tagName}`}
                    meta={count}
                    onClick={() => selectView(`tag:${tagName}`)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <div className="notes-sidebar__footer">
        <FileText size={13} />
        <span>Notatki zapisują się lokalnie</span>
      </div>
    </ContextSidebar>
  );

  const renderNoteCard = (note: NoteRecord) => {
    const list = workspace.lists.find((candidate) => candidate.id === note.listId);
    const checkedCount = note.items.filter((item) => item.checked).length;
    const previewLines = textPreviewLines(note.body);

    return (
      <article key={note.id} className={`notes-card notes-card--${note.color}`}>
        <span className="notes-card__color" aria-label={`Kolor: ${COLOR_OPTIONS.find((option) => option.value === note.color)?.label}`} />
        <header className="notes-card__header">
          <button type="button" className="notes-card__title" onClick={() => openNote(note)}>
            {note.title}
          </button>
          <div className="notes-card__actions">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              className={note.pinned ? "is-active" : ""}
              aria-label={note.pinned ? `Odepnij ${note.title}` : `Przypnij ${note.title}`}
              title={note.pinned ? "Odepnij" : "Przypnij"}
              onClick={() => togglePinned(note)}
            >
              {note.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={note.archived ? `Przywróć ${note.title}` : `Archiwizuj ${note.title}`}
              title={note.archived ? "Przywróć" : "Archiwizuj"}
              onClick={() => toggleArchived(note)}
            >
              {note.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={`Usuń ${note.title}`}
              title="Usuń"
              onClick={() => setDeleteState(note)}
            >
              <Trash2 size={12} />
            </Button>
          </div>
        </header>

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
            {note.items.slice(0, 4).map((item) => (
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
            {note.items.length > 4 && <small>+{note.items.length - 4} kolejne</small>}
          </div>
        )}

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

  const renderSection = (title: string, notes: NoteRecord[], pinned = false) => {
    if (!notes.length) return null;
    return (
      <section className="notes-shelf" aria-labelledby={`notes-shelf-${pinned ? "pinned" : "main"}`}>
        <header className="notes-shelf__heading">
          <div>
            {pinned ? <Pin size={13} /> : <FileText size={13} />}
            <h2 id={`notes-shelf-${pinned ? "pinned" : "main"}`}>{title}</h2>
          </div>
          <span>{notes.length}</span>
        </header>
        <div className="notes-grid">{notes.map(renderNoteCard)}</div>
      </section>
    );
  };

  const selectedNote = editor?.id ? workspace.notes.find((note) => note.id === editor.id) : undefined;

  const detailPanel = editor ? (
    <DetailPanel label={editor.mode === "add" ? "Nowa notatka" : `Edytuj ${selectedNote?.title ?? "notatkę"}`} className="notes-detail">
      <form className="notes-editor" onSubmit={(event) => { event.preventDefault(); saveNote(); }} onKeyDown={onEditorKeyDown}>
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
              <X size={14} />
            </Button>
          </div>
        </header>

        <div className="notes-editor__scroll">
          <label className="notes-editor__title-field">
            <span className="sr-only">Tytuł notatki</span>
            <input
              autoFocus
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

          <label className="ui-field">
            <span className="ui-field__label">{draft.kind === "checklist" ? "Wprowadzenie" : "Treść"}</span>
            <textarea
              className="ui-field__control notes-editor__body"
              value={draft.body}
              placeholder={draft.kind === "checklist" ? "Krótki kontekst listy — opcjonalnie" : "Zapisz myśl, szczegóły albo wnioski…"}
              onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
            />
          </label>

          {draft.kind === "text" && (
            <Button
              variant="ghost"
              size="sm"
              className="notes-editor__bullet-action"
              leadingIcon={<ListChecks size={12} />}
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
                      {item.checked && <Check size={10} />}
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
                      <X size={12} />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={addDraftItem}>Dodaj punkt</Button>
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
            <Button variant="danger" size="sm" leadingIcon={<Trash2 size={12} />} onClick={() => setDeleteState(selectedNote)}>
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
    <ModuleShell contextSidebar={contextSidebar} detailPanel={detailPanel} className="notes-module">
      <ModuleMain>
        <PageHeader
          title="Notatki"
          description={`${viewTitle} · ${viewDescription}`}
          meta={storageError ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
          actions={(
            <>
              <Button variant="quiet" leadingIcon={<CheckSquare size={13} />} onClick={() => openNewNote("checklist")}>
                Nowa checklista
              </Button>
              <Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openNewNote()}>
                Nowa notatka
              </Button>
            </>
          )}
        />

        <WorkspaceToolbar className="notes-toolbar">
          <div className="notes-toolbar__mobile">
            <Select
              compact
              aria-label="Widok notatek"
              value={view}
              options={[
                { value: "all", label: "Wszystkie" },
                { value: "pinned", label: "Przypięte" },
                { value: "recent", label: "Ostatnie" },
                { value: "archive", label: "Archiwum" },
                ...workspace.lists.map((list) => ({ value: `list:${list.id}`, label: list.name })),
              ]}
              onChange={(event) => selectView(event.target.value as NotesView)}
            />
          </div>
          <label className="notes-search">
            <Search size={13} aria-hidden="true" />
            <span className="sr-only">Szukaj w notatkach</span>
            <input value={search} placeholder="Szukaj w notatkach" onChange={(event) => setSearch(event.target.value)} />
            {search && (
              <button type="button" aria-label="Wyczyść wyszukiwanie" onClick={() => setSearch("")}>
                <X size={12} />
              </button>
            )}
          </label>
          <span className="notes-toolbar__count">{visibleNotes.length} {visibleNotes.length === 1 ? "notatka" : "notatek"}</span>
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
        </WorkspaceToolbar>

        <div className="notes-canvas">
          <div className="notes-canvas__heading">
            <div>
              <h1>{viewTitle}</h1>
              <p>{viewDescription}</p>
            </div>
            {view.startsWith("list:") && (
              <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={() => openNewNote()}>
                Dodaj do listy
              </Button>
            )}
          </div>

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
                ? <Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openNewNote()}>Nowa notatka</Button>
                : undefined}
            />
          ) : (
            <>
              {renderSection("Przypięte", pinnedNotes, true)}
              {renderSection(view === "all" && pinnedNotes.length ? "Pozostałe notatki" : viewTitle, regularNotes)}
            </>
          )}
        </div>
      </ModuleMain>

      {listModalOpen && (
        <Modal
          eyebrow="Listy notatek"
          title="Nowa lista"
          description="Lista porządkuje notatki według obszaru albo kontekstu."
          onClose={() => {
            setListModalOpen(false);
            setListError("");
          }}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setListModalOpen(false)}>Anuluj</Button>
              <Button variant="primary" type="submit" form="notes-list-form">Utwórz listę</Button>
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
    </ModuleShell>
  );
}
