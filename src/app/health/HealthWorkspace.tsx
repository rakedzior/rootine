import {
  Activity,
  FileCheck2,
  HeartPulse,
  Pencil,
  Pill,
  Plus,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  HEALTH_ENTRY_KIND_LABELS,
  HEALTH_STORAGE_KEY,
  createHealthEntryId,
  loadHealthWorkspace,
  saveHealthWorkspace,
  setHealthEntryCompletionState,
  type HealthEntry,
  type HealthEntryKind,
  type HealthWorkspace,
} from "../data/healthWorkspace";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { formatDate, pluralize } from "../formatters";
import {
  Badge,
  Button,
  Checkbox,
  CompletedSection,
  ConfirmDialog,
  ContentHeader,
  DatePicker,
  EmptyState,
  Input,
  Modal,
  SectionSurface,
  Select,
  SummaryStrip,
  Textarea,
} from "../ui";
import "../../styles/health.css";

type HealthDraft = Omit<HealthEntry, "id" | "createdAt" | "status">;
type HealthDueState = "done" | "overdue" | "today" | "soon" | "planned" | "undated";

type HealthKindCopy = {
  icon: typeof HeartPulse;
  pluralLabel: string;
  description: string;
  newTitle: string;
  addLabel: string;
  titleLabel: string;
  titlePlaceholder: string;
  dateLabel: string;
  dateHint: string;
  noteLabel: string;
  notePlaceholder: string;
  notePrefix: string;
  scheduleFallback: string;
  completeLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  showTimeAndLocation: boolean;
};

const PRIMARY_KINDS = [
  "appointment",
  "examination",
  "prescription",
  "vaccination",
] as const satisfies readonly HealthEntryKind[];

const KIND_COPY: Record<HealthEntryKind, HealthKindCopy> = {
  appointment: {
    icon: Stethoscope,
    pluralLabel: "Wizyty",
    description: "Terminy, miejsca i przygotowanie do wizyt.",
    newTitle: "Nowa wizyta",
    addLabel: "Dodaj wizytę",
    titleLabel: "Nazwa wizyty",
    titlePlaceholder: "np. Kontrola u dentysty",
    dateLabel: "Termin wizyty",
    dateHint: "Możesz zostawić bez daty i uzupełnić termin później.",
    noteLabel: "Przygotowanie",
    notePlaceholder: "Co zabrać lub sprawdzić przed wizytą?",
    notePrefix: "Przygotowanie",
    scheduleFallback: "Termin wizyty",
    completeLabel: "Odbyta",
    emptyTitle: "Brak zaplanowanych wizyt",
    emptyDescription: "Dodaj wizytę, gdy znasz termin albo chcesz zachować ją do późniejszego zaplanowania.",
    showTimeAndLocation: true,
  },
  examination: {
    icon: Activity,
    pluralLabel: "Badania",
    description: "Kontrole, pobrania i zaplanowany odbiór wyników.",
    newTitle: "Nowe badanie",
    addLabel: "Dodaj badanie",
    titleLabel: "Nazwa badania",
    titlePlaceholder: "np. Badanie krwi",
    dateLabel: "Termin badania lub wyniku",
    dateHint: "Wpis może przypominać zarówno o badaniu, jak i o odbiorze wyniku.",
    noteLabel: "Kontrola i przygotowanie",
    notePlaceholder: "Skierowanie, przygotowanie albo sposób odbioru wyniku",
    notePrefix: "Kontrola / przygotowanie",
    scheduleFallback: "Badanie lub odbiór wyniku",
    completeLabel: "Wykonane",
    emptyTitle: "Brak zaplanowanych badań",
    emptyDescription: "Dodaj badanie lub osobny wpis na termin odbioru wyniku.",
    showTimeAndLocation: true,
  },
  prescription: {
    icon: Pill,
    pluralLabel: "Recepty",
    description: "Daty odnowienia i krótkie przypomnienia organizacyjne.",
    newTitle: "Nowa recepta",
    addLabel: "Dodaj receptę",
    titleLabel: "Nazwa recepty",
    titlePlaceholder: "np. Odnowienie recepty",
    dateLabel: "Termin odnowienia",
    dateHint: "Zapisz dzień, przed którym chcesz odnowić receptę.",
    noteLabel: "Notatka organizacyjna",
    notePlaceholder: "np. Skontaktować się z przychodnią",
    notePrefix: "Notatka",
    scheduleFallback: "Termin odnowienia",
    completeLabel: "Odnowiona",
    emptyTitle: "Brak przypomnień o receptach",
    emptyDescription: "Dodaj datę odnowienia, aby recepta pojawiła się w radarze spraw.",
    showTimeAndLocation: false,
  },
  vaccination: {
    icon: Syringe,
    pluralLabel: "Szczepienia",
    description: "Terminy dawek i przypomnienia o kolejnych datach.",
    newTitle: "Nowe szczepienie",
    addLabel: "Dodaj szczepienie",
    titleLabel: "Nazwa szczepienia",
    titlePlaceholder: "np. Kolejna dawka szczepienia",
    dateLabel: "Termin dawki lub przypomnienia",
    dateHint: "Może to być potwierdzony termin albo data, kiedy chcesz wrócić do tematu.",
    noteLabel: "Dawka i przygotowanie",
    notePlaceholder: "Numer dawki lub krótka informacja organizacyjna",
    notePrefix: "Dawka / przygotowanie",
    scheduleFallback: "Dawka lub przypomnienie",
    completeLabel: "Wykonane",
    emptyTitle: "Brak zaplanowanych szczepień",
    emptyDescription: "Dodaj termin dawki albo datę przypomnienia o jej zaplanowaniu.",
    showTimeAndLocation: true,
  },
  other: {
    icon: FileCheck2,
    pluralLabel: "Inne przypomnienia",
    description: "Pozostałe administracyjne terminy związane ze zdrowiem.",
    newTitle: "Nowe przypomnienie",
    addLabel: "Dodaj przypomnienie",
    titleLabel: "Nazwa przypomnienia",
    titlePlaceholder: "np. Odebrać dokumentację",
    dateLabel: "Termin",
    dateHint: "Data jest opcjonalna.",
    noteLabel: "Notatka",
    notePlaceholder: "Co warto pamiętać?",
    notePrefix: "Notatka",
    scheduleFallback: "Przypomnienie zdrowotne",
    completeLabel: "Załatwione",
    emptyTitle: "Brak innych przypomnień",
    emptyDescription: "Dodaj wpis, jeśli nie pasuje do czterech głównych kategorii.",
    showTimeAndLocation: true,
  },
};

const EMPTY_DRAFT: HealthDraft = {
  title: "",
  kind: "appointment",
  dueDate: "",
  time: "",
  location: "",
  note: "",
};

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function entryStatus(entry: HealthEntry, today: string): {
  text: string;
  tone: "neutral" | "success" | "warning" | "danger";
  state: HealthDueState;
} {
  if (entry.status === "done") {
    return { text: KIND_COPY[entry.kind].completeLabel, tone: "success", state: "done" };
  }
  if (!entry.dueDate) return { text: "Bez daty", tone: "neutral", state: "undated" };

  const days = daysBetween(today, entry.dueDate);
  if (!Number.isFinite(days)) return { text: "Bez daty", tone: "neutral", state: "undated" };
  if (days < 0) return { text: "Po terminie", tone: "danger", state: "overdue" };
  if (days === 0) return { text: "Dzisiaj", tone: "warning", state: "today" };
  if (days <= 7) return { text: "Do 7 dni", tone: "warning", state: "soon" };
  return { text: "Zaplanowane", tone: "neutral", state: "planned" };
}

function sortOpenEntries(entries: HealthEntry[]): HealthEntry[] {
  return [...entries].sort((left, right) => {
    const leftDate = left.dueDate || "9999-12-31";
    const rightDate = right.dueDate || "9999-12-31";
    return leftDate.localeCompare(rightDate)
      || left.time.localeCompare(right.time)
      || left.title.localeCompare(right.title, "pl");
  });
}

function sortCompletedEntries(entries: HealthEntry[]): HealthEntry[] {
  return [...entries].sort((left, right) => (
    (right.dueDate || "0000-00-00").localeCompare(left.dueDate || "0000-00-00")
    || left.title.localeCompare(right.title, "pl")
  ));
}

export type HealthWorkspaceProps = {
  mobileNavigation?: ReactNode;
  onWorkspaceChange?: (workspace: HealthWorkspace) => void;
};

export function HealthWorkspace({ mobileNavigation, onWorkspaceChange }: HealthWorkspaceProps) {
  const [workspace, setWorkspace] = useState<HealthWorkspace>(loadHealthWorkspace);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<HealthDraft>(EMPTY_DRAFT);
  const [editorError, setEditorError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const onWorkspaceChangeRef = useRef(onWorkspaceChange);
  const pendingWorkspaceChangeRef = useRef(false);
  const today = localDateKey(new Date());

  useEffect(() => {
    onWorkspaceChangeRef.current = onWorkspaceChange;
  }, [onWorkspaceChange]);

  useEffect(() => {
    setStorageError(!saveHealthWorkspace(workspace));
    if (pendingWorkspaceChangeRef.current) {
      pendingWorkspaceChangeRef.current = false;
      onWorkspaceChangeRef.current?.(workspace);
    }
  }, [workspace]);

  useEffect(() => subscribeToLocalWorkspace(HEALTH_STORAGE_KEY, () => {
    setWorkspace(loadHealthWorkspace());
  }), []);

  const openEntries = useMemo(
    () => workspace.entries.filter((entry) => entry.status !== "done"),
    [workspace.entries],
  );
  const completedEntries = useMemo(
    () => workspace.entries.filter((entry) => entry.status === "done"),
    [workspace.entries],
  );
  const statusCounts = useMemo(() => openEntries.reduce((counts, entry) => {
    const state = entryStatus(entry, today).state;
    counts[state] += 1;
    return counts;
  }, {
    done: 0,
    overdue: 0,
    today: 0,
    soon: 0,
    planned: 0,
    undated: 0,
  } satisfies Record<HealthDueState, number>), [openEntries, today]);
  const attentionCount = statusCounts.overdue + statusCounts.today + statusCounts.soon;

  const updateWorkspace = (updater: (current: HealthWorkspace) => HealthWorkspace) => {
    pendingWorkspaceChangeRef.current = true;
    setWorkspace(updater);
  };

  const openEditor = (entry?: HealthEntry, kind: HealthEntryKind = "appointment") => {
    setEditorId(entry?.id ?? "new");
    setDraft(entry ? {
      title: entry.title,
      kind: entry.kind,
      dueDate: entry.dueDate,
      time: entry.time,
      location: entry.location,
      note: entry.note,
    } : { ...EMPTY_DRAFT, kind });
    setEditorError("");
  };

  const closeEditor = () => {
    setEditorId(null);
    setEditorError("");
  };

  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedDraft: HealthDraft = {
      ...draft,
      title: draft.title.trim(),
      location: draft.location.trim(),
      note: draft.note.trim(),
    };
    if (!normalizedDraft.title) {
      setEditorError(`Uzupełnij pole „${KIND_COPY[draft.kind].titleLabel}”.`);
      return;
    }

    const now = new Date().toISOString();
    updateWorkspace((current) => ({
      ...current,
      entries: editorId && editorId !== "new"
        ? current.entries.map((entry) => entry.id === editorId ? { ...entry, ...normalizedDraft } : entry)
        : [...current.entries, {
          ...normalizedDraft,
          id: createHealthEntryId(),
          status: "open",
          createdAt: now,
        }],
    }));
    closeEditor();
  };

  const toggleEntry = (entry: HealthEntry) => {
    updateWorkspace((current) => setHealthEntryCompletionState(current, entry.id, entry.status !== "done"));
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    updateWorkspace((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== deleteId),
    }));
    setDeleteId(null);
  };

  const renderEntry = (entry: HealthEntry) => {
    const status = entryStatus(entry, today);
    const copy = KIND_COPY[entry.kind];
    const scheduleMeta = [entry.time, entry.location].filter(Boolean).join(" · ");

    return (
      <article
        key={entry.id}
        className={`health-entry-row ${entry.status === "done" ? "is-done" : ""}`}
        data-due-state={status.state}
      >
        <Checkbox
          size="sm"
          checked={entry.status === "done"}
          aria-label={entry.status === "done" ? `Przywróć wpis: ${entry.title}` : `Oznacz jako zakończone: ${entry.title}`}
          onChange={() => toggleEntry(entry)}
        />
        <span className="health-entry-row__copy">
          <strong>{entry.title}</strong>
          {entry.note && <small><span>{copy.notePrefix}:</span> {entry.note}</small>}
        </span>
        <span className="health-entry-row__schedule">
          <strong>{entry.dueDate ? formatDate(entry.dueDate) : "Bez daty"}</strong>
          <small>{scheduleMeta || copy.scheduleFallback}</small>
        </span>
        <Badge tone={status.tone}>{status.text}</Badge>
        <span className="health-entry-row__actions">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Edytuj wpis: ${entry.title}`}
            onClick={() => openEditor(entry)}
          >
            <Pencil size={13} />
          </Button>
          <Button
            variant="ghost"
            className="ui-button--ghost-danger"
            size="sm"
            iconOnly
            aria-label={`Usuń wpis: ${entry.title}`}
            onClick={() => setDeleteId(entry.id)}
          >
            <Trash2 size={13} />
          </Button>
        </span>
      </article>
    );
  };

  const renderCategory = (kind: HealthEntryKind) => {
    const copy = KIND_COPY[kind];
    const Icon = copy.icon;
    const categoryEntries = workspace.entries.filter((entry) => entry.kind === kind);
    const active = sortOpenEntries(categoryEntries.filter((entry) => entry.status !== "done"));
    const completed = sortCompletedEntries(categoryEntries.filter((entry) => entry.status === "done"));
    const urgent = active.filter((entry) => ["overdue", "today", "soon"].includes(entryStatus(entry, today).state)).length;
    const headingId = `health-category-${kind}`;

    return (
      <section key={kind} className="health-category" aria-labelledby={headingId}>
        <header className="health-category__header">
          <div className="health-category__identity">
            <span className="health-category__icon" aria-hidden="true"><Icon size={16} /></span>
            <div>
              <h3 id={headingId}>{copy.pluralLabel}</h3>
              <p>{copy.description}</p>
            </div>
          </div>
          <div className="health-category__actions">
            <Badge
              tone={urgent > 0 ? "warning" : "neutral"}
              aria-label={pluralize(active.length, "otwarty wpis", "otwarte wpisy", "otwartych wpisów")}
            >
              {pluralize(active.length, "otwarty", "otwarte", "otwartych")}
            </Badge>
            <Button
              variant="quiet"
              size="sm"
              leadingIcon={<Plus size={13} />}
              onClick={() => openEditor(undefined, kind)}
            >
              {copy.addLabel}
            </Button>
          </div>
        </header>

        {active.length > 0 ? (
          <div className="health-entry-list">{active.map(renderEntry)}</div>
        ) : (
          <EmptyState
            className="health-category__empty"
            icon={<Icon size={18} />}
            title={copy.emptyTitle}
            description={copy.emptyDescription}
            action={(
              <Button variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={() => openEditor(undefined, kind)}>
                {copy.addLabel}
              </Button>
            )}
          />
        )}

        {completed.length > 0 && (
          <CompletedSection label="Zakończone" count={completed.length} className="health-category__completed">
            <div className="health-entry-list">{completed.map(renderEntry)}</div>
          </CompletedSection>
        )}
      </section>
    );
  };

  const showOther = workspace.entries.some((entry) => entry.kind === "other");
  const editorCopy = KIND_COPY[draft.kind];
  const deletedEntry = workspace.entries.find((entry) => entry.id === deleteId);

  return (
    <>
      <ContentHeader
        headingLevel={1}
        className="affairs-toolbar health-toolbar"
        title="Zdrowie"
        description="Wizyty, badania, recepty i szczepienia w jednym rejestrze terminów"
        meta={(
          <>
            {attentionCount > 0
              ? <Badge tone={statusCounts.overdue > 0 ? "danger" : "warning"}>{attentionCount} wymaga uwagi</Badge>
              : <Badge tone="success">Bez bliskich terminów</Badge>}
            {storageError && <Badge tone="danger">Brak zapisu lokalnego</Badge>}
          </>
        )}
        mobileNavigation={mobileNavigation}
        actions={(
          <Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openEditor()}>
            Dodaj wpis
          </Button>
        )}
      />

      <div className="health-canvas">
        <SummaryStrip
          label="Stan rejestru zdrowia"
          className="health-summary"
          items={[
            { label: "Otwarte", value: openEntries.length, note: "wszystkie kategorie", tone: "neutral" },
            {
              label: "Wymaga uwagi",
              value: attentionCount,
              note: statusCounts.overdue > 0 ? `${statusCounts.overdue} po terminie` : "dzisiaj lub do 7 dni",
              tone: statusCounts.overdue > 0 ? "danger" : attentionCount > 0 ? "warning" : "success",
            },
            { label: "Bez daty", value: statusCounts.undated, note: "do zaplanowania", tone: "neutral" },
            { label: "Zakończone", value: completedEntries.length, note: "można przywrócić", tone: "success" },
          ]}
        />

        <SectionSurface className="health-register" aria-labelledby="health-register-heading">
          <header className="health-register__heading">
            <div>
              <span className="health-register__icon" aria-hidden="true"><HeartPulse size={16} /></span>
              <div>
                <h2 id="health-register-heading">Plan i przypomnienia</h2>
                <p>Terminy z każdej sekcji trafiają też do wspólnego radaru spraw.</p>
              </div>
            </div>
            <Badge tone={openEntries.length > 0 ? "neutral" : "success"}>{pluralize(openEntries.length, "otwarty", "otwarte", "otwartych")}</Badge>
          </header>
          <div className="health-category-list">
            {PRIMARY_KINDS.map(renderCategory)}
            {showOther && renderCategory("other")}
          </div>
        </SectionSurface>

        <div className="health-scope-note">
          <ShieldCheck size={15} aria-hidden="true" />
          <p><strong>Tylko organizacja.</strong> Zapisuj informacje potrzebne do terminu i przygotowania; ten rejestr nie udziela porad medycznych.</p>
        </div>
      </div>

      {editorId && (
        <Modal
          title={editorId === "new" ? editorCopy.newTitle : `Edytuj: ${draft.title || HEALTH_ENTRY_KIND_LABELS[draft.kind]}`}
          description="Zapisz tylko informacje potrzebne do terminu, przypomnienia i przygotowania."
          onClose={closeEditor}
          footer={(
            <>
              <Button variant="ghost" onClick={closeEditor}>Anuluj</Button>
              <Button variant="primary" type="submit" form="health-editor-form">
                {editorId === "new" ? editorCopy.addLabel : "Zapisz zmiany"}
              </Button>
            </>
          )}
        >
          <form id="health-editor-form" className="health-form" onSubmit={submitEditor}>
            <Select
              label="Rodzaj wpisu"
              value={draft.kind}
              options={Object.entries(HEALTH_ENTRY_KIND_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(event) => {
                const kind = event.target.value as HealthEntryKind;
                setDraft((current) => ({
                  ...current,
                  kind,
                  time: kind === "prescription" ? "" : current.time,
                  location: kind === "prescription" ? "" : current.location,
                }));
              }}
            />
            <Input
              label={editorCopy.titleLabel}
              placeholder={editorCopy.titlePlaceholder}
              value={draft.title}
              error={editorError}
              autoFocus
              onChange={(event) => {
                setDraft((current) => ({ ...current, title: event.target.value }));
                if (editorError) setEditorError("");
              }}
            />
            <div className="health-form__grid">
              <DatePicker
                label={editorCopy.dateLabel}
                hint={editorCopy.dateHint}
                value={draft.dueDate}
                onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))}
              />
              {editorCopy.showTimeAndLocation && (
                <>
                  <Input
                    label="Godzina"
                    type="time"
                    value={draft.time}
                    onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))}
                  />
                  <Input
                    label="Miejsce"
                    placeholder="Opcjonalnie"
                    value={draft.location}
                    onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
                  />
                </>
              )}
            </div>
            <Textarea
              label={editorCopy.noteLabel}
              rows={4}
              placeholder={editorCopy.notePlaceholder}
              value={draft.note}
              onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
            />
          </form>
        </Modal>
      )}

      {deleteId && (
        <ConfirmDialog
          title={`Usunąć „${deletedEntry?.title ?? "ten wpis"}”?`}
          description="Wpis zniknie z lokalnego rejestru zdrowia."
          confirmLabel="Usuń wpis"
          onCancel={() => setDeleteId(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}
