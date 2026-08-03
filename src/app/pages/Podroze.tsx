/**
 * THESIS: Podróże is an operational trip dossier, not a destination gallery; it refuses decorative cards with no planning depth.
 * OWN-WORLD: Rootine's graphite workshop, a compact trip rail, dated itinerary bands, quiet ledgers, and precision blue for the active journey.
 * STORY: Scan every departure, open one trip, then close the gaps across plan, bookings, money, documents, and preparation.
 * FIRST VIEWPORT: The trip rail frames a departure board where readiness, the next action, dates, and committed budget meet in one scan.
 * FORM: The sixth grounded structure — a trip dossier with a readiness ledger — selected with seed 46ce9e6f.
 */
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BedDouble,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Download,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  MapPin,
  Pencil,
  Plane,
  Plus,
  ReceiptText,
  Trash2,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { formatPercent, pluralize } from "../formatters";
import { AnimatedCurrency } from "../experience/MotionValues";
import { SensitiveValue } from "../experience/preferences";
import {
  createTravelId,
  isDateWithinTrip,
  loadTravelWorkspace,
  normalizeIsoCurrency,
  saveTravelWorkspace,
  setTravelTaskCompletionState,
  summarizeTravelBudget,
  TRAVEL_STORAGE_KEY,
  type BudgetCategory,
  type BudgetLine,
  type DocumentStatus,
  type ItineraryItem,
  type ItineraryKind,
  type ReservationStatus,
  type TransportMode,
  type TravelDocument,
  type TravelStay,
  type TravelTask,
  type TravelTaskCategory,
  type TravelTransport,
  type TravelTrip,
  type TripStatus,
} from "../data/travelWorkspace";
import {
  Badge,
  Button,
  ContextNavItem,
  ContextSidebar,
  CompletedSection,
  EmptyState,
  Input,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  Select,
  Tabs,
  WorkspaceToolbar,
  AddToTasksButton,
} from "../ui";
import "../../styles/travel.css";

import {
  BUDGET_CATEGORY_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONES,
  EMPTY_DRAFT,
  ITINERARY_KIND_LABELS,
  RESERVATION_STATUS_LABELS,
  SECTION_COPY,
  SECTION_TABS,
  TASK_CATEGORY_LABELS,
  TRANSPORT_ICONS,
  TRANSPORT_MODE_LABELS,
  TRIP_STATUS_LABELS,
  TRIP_STATUS_TONES,
  daysUntil,
  formatDate,
  formatDateTime,
  isTravelSection,
  nextAction,
  numberFrom,
  readinessParts,
  readinessScore,
  tripCountdown,
  tripDuration,
  type DeleteState,
  type Draft,
  type EditorState,
  type TravelSection,
  type TripActionState,
} from "../travel/travelPresentation";

function PrivateMoney({
  value,
  currency,
  label = "Kwota podróży",
}: {
  value: number;
  currency: string;
  label?: string;
}) {
  return (
    <SensitiveValue label={label}>
      <AnimatedCurrency value={value} currency={currency} />
    </SensitiveValue>
  );
}

export default function Podroze({
  layout,
  embeddedViewSelect,
}: {
  layout?: (header: ReactNode, content: ReactNode) => ReactNode;
  embeddedViewSelect?: ReactNode;
} = {}) {
  const [workspace, setWorkspace] = useState(loadTravelWorkspace);
  const [statusFilter, setStatusFilter] = useState<"upcoming" | "all" | "archived" | TripStatus>("upcoming");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editorError, setEditorError] = useState("");
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [tripActionState, setTripActionState] = useState<TripActionState | null>(null);
  const [deletedTripUndo, setDeletedTripUndo] = useState<TravelTrip | null>(null);
  const [storageError, setStorageError] = useState(false);
  const { tripId: routeTripId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const embedded = Boolean(layout);
  const tripId = routeTripId ?? searchParams.get("podroz") ?? undefined;
  const selectedTrip = workspace.trips.find((trip) => trip.id === tripId)!;
  const sectionParam = searchParams.get("sekcja");
  const activeSection: TravelSection = isTravelSection(sectionParam) ? sectionParam : "overview";

  useEffect(() => {
    setStorageError(!saveTravelWorkspace(workspace));
  }, [workspace]);

  useEffect(() => subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, () => {
    setWorkspace(loadTravelWorkspace());
  }), []);

  useEffect(() => {
    if (tripId && !selectedTrip) navigate(embedded ? "/sprawy?widok=travel" : "/podroze", { replace: true });
  }, [embedded, navigate, selectedTrip, tripId]);

  const upcomingTrips = useMemo(
    () => workspace.trips
      .filter((trip) => !trip.archivedAt && trip.status !== "completed")
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [workspace.trips],
  );

  const completedTrips = useMemo(
    () => workspace.trips
      .filter((trip) => trip.archivedAt || trip.status === "completed")
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [workspace.trips],
  );

  const filteredTrips = useMemo(() => workspace.trips
    .filter((trip) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "upcoming") return !trip.archivedAt && trip.status !== "completed";
      if (statusFilter === "archived") return Boolean(trip.archivedAt);
      return trip.status === statusFilter;
    })
    .sort((a, b) => {
      if (Boolean(a.archivedAt) !== Boolean(b.archivedAt)) return a.archivedAt ? 1 : -1;
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;
      return a.status === "completed"
        ? b.startDate.localeCompare(a.startDate)
        : a.startDate.localeCompare(b.startDate);
    }), [statusFilter, workspace.trips]);

  const itineraryDays = useMemo(() => {
    const groups = new Map<string, ItineraryItem[]>();
    (selectedTrip?.itinerary ?? [])
      .slice()
      .sort((a, b) => `${a.date}-${a.time}`.localeCompare(`${b.date}-${b.time}`))
      .forEach((item) => {
        const bucket = groups.get(item.date) ?? [];
        bucket.push(item);
        groups.set(item.date, bucket);
      });
    return Array.from(groups.entries());
  }, [selectedTrip]);

  const budgetSummary = useMemo(() => {
    if (!selectedTrip) {
      return {
        planned: 0,
        actual: 0,
        paid: 0,
        remaining: 0,
        reservationCommitted: 0,
        unbudgetedReservations: 0,
      };
    }
    return summarizeTravelBudget(selectedTrip);
  }, [selectedTrip]);

  const setSection = (section: TravelSection) => {
    if (embedded) {
      const next = new URLSearchParams();
      next.set("widok", "travel");
      if (tripId) next.set("podroz", tripId);
      if (section !== "overview") next.set("sekcja", section);
      setSearchParams(next);
      return;
    }
    if (section === "overview") setSearchParams({});
    else setSearchParams({ sekcja: section });
  };

  const selectTrip = (id: string) => {
    if (embedded) {
      const next = new URLSearchParams(searchParams);
      next.set("widok", "travel");
      next.set("podroz", id);
      navigate(`/sprawy?${next.toString()}`);
      return;
    }
    navigate(`/podroze/${id}`);
  };
  const showAllTrips = () => {
    if (embedded) {
      const next = new URLSearchParams(searchParams);
      next.set("widok", "travel");
      next.delete("podroz");
      next.delete("sekcja");
      navigate(`/sprawy?${next.toString()}`);
      return;
    }
    navigate("/podroze");
  };

  const updateTrip = (tripIdToUpdate: string, updater: (trip: TravelTrip) => TravelTrip) => {
    setWorkspace((current) => ({
      ...current,
      trips: current.trips.map((trip) => trip.id === tripIdToUpdate ? updater(trip) : trip),
    }));
  };

  const openTripEditor = (trip?: TravelTrip) => {
    setDraft(trip ? {
      ...EMPTY_DRAFT,
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      tripStatus: trip.status,
      travelers: trip.travelers.join(", "),
      currency: trip.baseCurrency,
      note: trip.note,
    } : EMPTY_DRAFT);
    setEditorError("");
    setEditor({ kind: "trip", mode: trip ? "edit" : "add", id: trip?.id });
  };

  const openItineraryEditor = (item?: ItineraryItem) => {
    setDraft(item ? {
      ...EMPTY_DRAFT,
      name: item.title,
      date: item.date,
      time: item.time,
      location: item.location,
      itineraryKind: item.kind,
      note: item.note,
      reserved: item.reserved,
    } : { ...EMPTY_DRAFT, date: selectedTrip?.startDate ?? "" });
    setEditorError("");
    setEditor({ kind: "itinerary", mode: item ? "edit" : "add", id: item?.id });
  };

  const openStayEditor = (stay?: TravelStay) => {
    setDraft(stay ? {
      ...EMPTY_DRAFT,
      name: stay.name,
      city: stay.city,
      address: stay.address,
      startDate: stay.checkIn,
      endDate: stay.checkOut,
      bookingRef: stay.bookingRef,
      reservationStatus: stay.status,
      amount: String(stay.amount),
    } : {
      ...EMPTY_DRAFT,
      startDate: selectedTrip?.startDate ?? "",
      endDate: selectedTrip?.endDate ?? "",
    });
    setEditorError("");
    setEditor({ kind: "stay", mode: stay ? "edit" : "add", id: stay?.id });
  };

  const openTransportEditor = (transport?: TravelTransport) => {
    setDraft(transport ? {
      ...EMPTY_DRAFT,
      name: transport.title,
      transportMode: transport.mode,
      from: transport.from,
      to: transport.to,
      departure: transport.departure,
      arrival: transport.arrival,
      bookingRef: transport.bookingRef,
      reservationStatus: transport.status,
      amount: String(transport.amount),
    } : EMPTY_DRAFT);
    setEditorError("");
    setEditor({ kind: "transport", mode: transport ? "edit" : "add", id: transport?.id });
  };

  const openBudgetEditor = (line?: BudgetLine) => {
    setDraft(line ? {
      ...EMPTY_DRAFT,
      name: line.label,
      budgetCategory: line.category,
      planned: String(line.planned),
      actual: String(line.actual),
      paid: line.paid,
    } : EMPTY_DRAFT);
    setEditorError("");
    setEditor({ kind: "budget", mode: line ? "edit" : "add", id: line?.id });
  };

  const openDocumentEditor = (document?: TravelDocument) => {
    setDraft(document ? {
      ...EMPTY_DRAFT,
      name: document.name,
      owner: document.owner,
      documentStatus: document.status,
      expiresAt: document.expiresAt,
      note: document.note,
    } : EMPTY_DRAFT);
    setEditorError("");
    setEditor({ kind: "document", mode: document ? "edit" : "add", id: document?.id });
  };

  const openTaskEditor = (task?: TravelTask) => {
    setDraft(task ? {
      ...EMPTY_DRAFT,
      name: task.title,
      taskCategory: task.category,
      dueDate: task.dueDate,
    } : EMPTY_DRAFT);
    setEditorError("");
    setEditor({ kind: "task", mode: task ? "edit" : "add", id: task?.id });
  };

  const closeEditor = () => {
    setEditor(null);
    setEditorError("");
  };

  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    const name = draft.name.trim();
    if (!name) {
      setEditorError(editor.kind === "trip" ? "Wpisz nazwę podróży." : "Wpisz nazwę.");
      return;
    }

    if (editor.kind === "trip") {
      if (!draft.startDate || !draft.endDate) {
        setEditorError("Uzupełnij datę rozpoczęcia i zakończenia.");
        return;
      }
      if (draft.endDate < draft.startDate) {
        setEditorError("Data zakończenia nie może być wcześniejsza niż początek.");
        return;
      }
      const currency = normalizeIsoCurrency(draft.currency);
      if (!currency) {
        setEditorError("Podaj prawidłowy kod waluty ISO, np. PLN, EUR lub USD.");
        return;
      }
      const travelers = draft.travelers.split(",").map((item) => item.trim()).filter(Boolean);
      if (editor.mode === "edit" && editor.id) {
        updateTrip(editor.id, (trip) => ({
          ...trip,
          name,
          destination: draft.destination.trim(),
          startDate: draft.startDate,
          endDate: draft.endDate,
          status: draft.tripStatus,
          travelers,
          baseCurrency: currency,
          note: draft.note.trim(),
        }));
      } else {
        const id = createTravelId("trip");
        setWorkspace((current) => ({
          ...current,
          trips: [...current.trips, {
            id,
            name,
            destination: draft.destination.trim(),
            startDate: draft.startDate,
            endDate: draft.endDate,
            status: draft.tripStatus,
            travelers,
            baseCurrency: currency,
            note: draft.note.trim(),
            archivedAt: null,
            stays: [],
            transports: [],
            itinerary: [],
            budget: [],
            documents: [],
            tasks: [],
          }],
        }));
        selectTrip(id);
      }
      closeEditor();
      return;
    }

    if (!selectedTrip) return;

    if (editor.kind === "itinerary") {
      if (!draft.date) {
        setEditorError("Wybierz dzień planu.");
        return;
      }
      if (!isDateWithinTrip(draft.date, selectedTrip)) {
        setEditorError(`Dzień planu musi mieścić się między ${formatDate(selectedTrip.startDate)} a ${formatDate(selectedTrip.endDate)}.`);
        return;
      }
      const value: ItineraryItem = {
        id: editor.id ?? createTravelId("plan"),
        date: draft.date,
        time: draft.time,
        title: name,
        location: draft.location.trim(),
        kind: draft.itineraryKind,
        note: draft.note.trim(),
        reserved: draft.reserved,
      };
      updateTrip(selectedTrip.id, (trip) => ({
        ...trip,
        itinerary: editor.mode === "edit"
          ? trip.itinerary.map((item) => item.id === editor.id ? value : item)
          : [...trip.itinerary, value],
      }));
    }

    if (editor.kind === "stay") {
      if (!draft.startDate || !draft.endDate) {
        setEditorError("Uzupełnij datę zameldowania i wymeldowania.");
        return;
      }
      if (draft.endDate < draft.startDate) {
        setEditorError("Wymeldowanie nie może być wcześniejsze niż zameldowanie.");
        return;
      }
      if (!isDateWithinTrip(draft.startDate, selectedTrip) || !isDateWithinTrip(draft.endDate, selectedTrip)) {
        setEditorError("Daty noclegu muszą mieścić się w terminie podróży.");
        return;
      }
      const amount = numberFrom(draft.amount);
      if (amount === null) {
        setEditorError("Kwota noclegu musi być liczbą nieujemną.");
        return;
      }
      const value: TravelStay = {
        id: editor.id ?? createTravelId("stay"),
        name,
        city: draft.city.trim(),
        address: draft.address.trim(),
        checkIn: draft.startDate,
        checkOut: draft.endDate,
        bookingRef: draft.bookingRef.trim(),
        status: draft.reservationStatus,
        amount,
      };
      updateTrip(selectedTrip.id, (trip) => ({
        ...trip,
        stays: editor.mode === "edit"
          ? trip.stays.map((item) => item.id === editor.id ? value : item)
          : [...trip.stays, value],
      }));
    }

    if (editor.kind === "transport") {
      if ((draft.departure && !draft.arrival) || (!draft.departure && draft.arrival)) {
        setEditorError("Uzupełnij zarówno czas odjazdu, jak i przyjazdu.");
        return;
      }
      if (draft.departure && draft.arrival && draft.arrival < draft.departure) {
        setEditorError("Przyjazd nie może być wcześniejszy niż odjazd.");
        return;
      }
      if (
        (draft.departure && !isDateWithinTrip(draft.departure.slice(0, 10), selectedTrip))
        || (draft.arrival && !isDateWithinTrip(draft.arrival.slice(0, 10), selectedTrip))
      ) {
        setEditorError("Daty transportu muszą mieścić się w terminie podróży.");
        return;
      }
      const amount = numberFrom(draft.amount);
      if (amount === null) {
        setEditorError("Kwota transportu musi być liczbą nieujemną.");
        return;
      }
      const value: TravelTransport = {
        id: editor.id ?? createTravelId("transport"),
        mode: draft.transportMode,
        title: name,
        from: draft.from.trim(),
        to: draft.to.trim(),
        departure: draft.departure,
        arrival: draft.arrival,
        bookingRef: draft.bookingRef.trim(),
        status: draft.reservationStatus,
        amount,
      };
      updateTrip(selectedTrip.id, (trip) => ({
        ...trip,
        transports: editor.mode === "edit"
          ? trip.transports.map((item) => item.id === editor.id ? value : item)
          : [...trip.transports, value],
      }));
    }

    if (editor.kind === "budget") {
      const planned = numberFrom(draft.planned);
      const actual = numberFrom(draft.actual);
      if (planned === null || actual === null) {
        setEditorError("Plan i kwota rzeczywista muszą być liczbami nieujemnymi.");
        return;
      }
      const value: BudgetLine = {
        id: editor.id ?? createTravelId("budget"),
        category: draft.budgetCategory,
        label: name,
        planned,
        actual,
        paid: draft.paid,
      };
      updateTrip(selectedTrip.id, (trip) => ({
        ...trip,
        budget: editor.mode === "edit"
          ? trip.budget.map((item) => item.id === editor.id ? value : item)
          : [...trip.budget, value],
      }));
    }

    if (editor.kind === "document") {
      const value: TravelDocument = {
        id: editor.id ?? createTravelId("document"),
        name,
        owner: draft.owner.trim() || "Wszyscy",
        status: draft.documentStatus,
        expiresAt: draft.expiresAt,
        note: draft.note.trim(),
      };
      updateTrip(selectedTrip.id, (trip) => ({
        ...trip,
        documents: editor.mode === "edit"
          ? trip.documents.map((item) => item.id === editor.id ? value : item)
          : [...trip.documents, value],
      }));
    }

    if (editor.kind === "task") {
      const currentTask = selectedTrip.tasks.find((task) => task.id === editor.id);
      const value: TravelTask = {
        id: editor.id ?? createTravelId("task"),
        title: name,
        category: draft.taskCategory,
        dueDate: draft.dueDate,
        completed: currentTask?.completed ?? false,
      };
      updateTrip(selectedTrip.id, (trip) => ({
        ...trip,
        tasks: editor.mode === "edit"
          ? trip.tasks.map((item) => item.id === editor.id ? value : item)
          : [...trip.tasks, value],
      }));
    }

    closeEditor();
  };

  const confirmDelete = () => {
    if (!deleteState || !selectedTrip) return;
    updateTrip(selectedTrip.id, (trip) => {
      if (deleteState.kind === "itinerary") return { ...trip, itinerary: trip.itinerary.filter((item) => item.id !== deleteState.id) };
      if (deleteState.kind === "stay") return { ...trip, stays: trip.stays.filter((item) => item.id !== deleteState.id) };
      if (deleteState.kind === "transport") return { ...trip, transports: trip.transports.filter((item) => item.id !== deleteState.id) };
      if (deleteState.kind === "budget") return { ...trip, budget: trip.budget.filter((item) => item.id !== deleteState.id) };
      if (deleteState.kind === "document") return { ...trip, documents: trip.documents.filter((item) => item.id !== deleteState.id) };
      return { ...trip, tasks: trip.tasks.filter((item) => item.id !== deleteState.id) };
    });
    setDeleteState(null);
  };

  const exportTrip = (trip: TravelTrip) => {
    const payload = JSON.stringify({
      format: "rootine-trip",
      version: 1,
      exportedAt: new Date().toISOString(),
      trip,
    }, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rootine-podroz-${trip.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const confirmTripAction = () => {
    if (!tripActionState) return;
    if (tripActionState.kind === "archive") {
      updateTrip(tripActionState.trip.id, (trip) => ({ ...trip, archivedAt: new Date().toISOString() }));
    } else {
      setWorkspace((current) => ({
        ...current,
        trips: current.trips.filter((trip) => trip.id !== tripActionState.trip.id),
      }));
      setDeletedTripUndo(tripActionState.trip);
      showAllTrips();
    }
    setTripActionState(null);
  };

  const restoreArchivedTrip = (trip: TravelTrip) => {
    updateTrip(trip.id, (current) => ({ ...current, archivedAt: null }));
  };

  const undoTripDelete = () => {
    if (!deletedTripUndo) return;
    setWorkspace((current) => current.trips.some((trip) => trip.id === deletedTripUndo.id)
      ? current
      : { ...current, trips: [...current.trips, deletedTripUndo] });
    const restoredId = deletedTripUndo.id;
    setDeletedTripUndo(null);
    selectTrip(restoredId);
  };

  const toggleTask = (task: TravelTask) => {
    if (!selectedTrip) return;
    setWorkspace((current) => setTravelTaskCompletionState(
      current,
      selectedTrip.id,
      task.id,
      !task.completed,
    ));
  };

  const renderTravelTask = (task: TravelTask) => (
    <article key={task.id} className={`travel-task-row ${task.completed ? "is-completed" : ""}`}>
      <button
        type="button"
        className="travel-check"
        aria-label={task.completed ? `Przywróć ${task.title}` : `Oznacz jako zrobione: ${task.title}`}
        aria-pressed={task.completed}
        onClick={() => toggleTask(task)}
      >
        {task.completed && <Check size={10} />}
      </button>
      <span className="travel-task-row__copy">
        <strong>{task.title}</strong>
        <small>{TASK_CATEGORY_LABELS[task.category]}</small>
      </span>
      <Badge tone={task.category === "health" ? "warning" : task.category === "documents" ? "violet" : "neutral"}>
        {TASK_CATEGORY_LABELS[task.category]}
      </Badge>
      <span className={`travel-task-row__due ${task.dueDate && daysUntil(task.dueDate) < 0 && !task.completed ? "is-overdue" : ""}`}>
        {task.dueDate ? formatDate(task.dueDate) : "Bez terminu"}
      </span>
      <span className="travel-row-actions">
        <AddToTasksButton
          compact
          input={{
            source: {
              kind: "travel",
              entity: `${encodeURIComponent(selectedTrip?.id ?? "")}/${encodeURIComponent(task.id)}`,
              context: `${selectedTrip?.name ?? "Podróż"} · ${selectedTrip?.destination ?? ""}`,
              href: embedded
                ? `/sprawy?widok=travel&podroz=${encodeURIComponent(selectedTrip?.id ?? "")}&sekcja=tasks`
                : `/podroze/${encodeURIComponent(selectedTrip?.id ?? "")}?sekcja=tasks`,
            },
            text: task.title,
            done: task.completed,
            calendarDate: task.dueDate || undefined,
            date: task.dueDate || undefined,
            list: "podroze",
            tags: ["podroze"],
          }}
        />
        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${task.title}`} onClick={() => openTaskEditor(task)}><Pencil size={12} /></Button>
        <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń ${task.title}`} onClick={() => setDeleteState({ kind: "task", id: task.id, label: task.title })}><Trash2 size={12} /></Button>
      </span>
    </article>
  );

  const cycleDocumentStatus = (document: TravelDocument) => {
    if (!selectedTrip) return;
    const next: Record<DocumentStatus, DocumentStatus> = { todo: "pending", pending: "ready", ready: "todo" };
    updateTrip(selectedTrip.id, (trip) => ({
      ...trip,
      documents: trip.documents.map((item) => item.id === document.id ? { ...item, status: next[item.status] } : item),
    }));
  };

  const editorTitle = editor?.kind === "trip"
    ? `${editor.mode === "edit" ? "Edytuj" : "Nowa"} podróż`
    : editor?.kind === "itinerary"
      ? `${editor.mode === "edit" ? "Edytuj" : "Nowy"} punkt planu`
      : editor?.kind === "stay"
        ? `${editor.mode === "edit" ? "Edytuj" : "Nowy"} nocleg`
        : editor?.kind === "transport"
          ? `${editor.mode === "edit" ? "Edytuj" : "Nowy"} transport`
          : editor?.kind === "budget"
            ? `${editor.mode === "edit" ? "Edytuj" : "Nowa"} pozycja budżetu`
            : editor?.kind === "document"
              ? `${editor.mode === "edit" ? "Edytuj" : "Nowy"} dokument`
              : `${editor?.mode === "edit" ? "Edytuj" : "Nowa"} sprawa`;

  const contextSidebar = (
    <ContextSidebar label="Podróże" className="travel-sidebar">
      <div className="travel-sidebar__nav">
        <p className="travel-sidebar__label">Obszar nadrzędny</p>
        {!embedded && <ContextNavItem icon={<ArrowLeft />} label="Wróć do Spraw" onClick={() => navigate("/sprawy")} />}
        <p className="travel-sidebar__label travel-sidebar__label--spaced">Wyjazdy</p>
        <ContextNavItem
          active={!selectedTrip}
          icon={<LayoutDashboard />}
          label="Przegląd"
          meta={workspace.trips.length}
          onClick={showAllTrips}
        />
        {upcomingTrips.length > 0 && (
          <>
            <p className="travel-sidebar__label travel-sidebar__label--spaced">Nadchodzące</p>
            {upcomingTrips.map((trip) => (
              <ContextNavItem
                key={trip.id}
                active={selectedTrip?.id === trip.id}
                icon={<MapPin />}
                label={trip.name}
                meta={formatDate(trip.startDate, false)}
                onClick={() => selectTrip(trip.id)}
              />
            ))}
          </>
        )}
        {completedTrips.length > 0 && (
          <>
            <p className="travel-sidebar__label travel-sidebar__label--spaced">Archiwum</p>
            {completedTrips.map((trip) => (
              <ContextNavItem
                key={trip.id}
                active={selectedTrip?.id === trip.id}
                icon={<Check />}
                label={trip.name}
                meta={new Date(`${trip.startDate}T12:00:00`).getFullYear()}
                onClick={() => selectTrip(trip.id)}
              />
            ))}
          </>
        )}
      </div>
      <div className="travel-sidebar__footer">
        <MapIcon size={13} aria-hidden="true" />
        <span>Dane zapisują się lokalnie</span>
      </div>
    </ContextSidebar>
  );

  const tripHeaderActions = selectedTrip ? (
    <>
      <Button variant="ghost" size="sm" iconOnly aria-label="Edytuj podróż" title="Edytuj podróż" onClick={() => openTripEditor(selectedTrip)}>
        <Pencil size={13} />
      </Button>
      <Button variant="ghost" size="sm" iconOnly aria-label="Eksportuj podróż" title="Eksportuj JSON" onClick={() => exportTrip(selectedTrip)}>
        <Download size={13} />
      </Button>
      {selectedTrip.archivedAt ? (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Przywróć podróż z archiwum"
          title="Przywróć z archiwum"
          onClick={() => restoreArchivedTrip(selectedTrip)}
        >
          <ArchiveRestore size={13} />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Archiwizuj podróż"
          title="Archiwizuj podróż"
          onClick={() => setTripActionState({ kind: "archive", trip: selectedTrip })}
        >
          <Archive size={13} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Usuń podróż"
        title="Usuń podróż"
        onClick={() => setTripActionState({ kind: "delete", trip: selectedTrip })}
      >
        <Trash2 size={13} />
      </Button>
      {activeSection === "reservations" ? (
        <>
          <Button variant="quiet" leadingIcon={<BedDouble size={13} />} onClick={() => openStayEditor()}>Nocleg</Button>
          <Button variant="primary" leadingIcon={<Plane size={13} />} onClick={() => openTransportEditor()}>Transport</Button>
        </>
      ) : (
        <Button
          variant="primary"
          leadingIcon={<Plus size={13} />}
          onClick={() => {
            if (activeSection === "itinerary") openItineraryEditor();
            else if (activeSection === "budget") openBudgetEditor();
            else if (activeSection === "documents") openDocumentEditor();
            else openTaskEditor();
          }}
        >
          {activeSection === "itinerary"
            ? "Punkt planu"
            : activeSection === "budget"
              ? "Pozycja"
              : activeSection === "documents"
                ? "Dokument"
                : "Zadanie"}
        </Button>
      )}
    </>
  ) : (
    <Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openTripEditor()}>
      Nowa podróż
    </Button>
  );

  const pageHeader = (
    <PageHeader
      title="Podróże"
      description={selectedTrip
        ? `${selectedTrip.name} · ${SECTION_COPY[activeSection]} · ${selectedTrip.destination}`
        : "Przegląd zaplanowanych i zakończonych wyjazdów"}
      meta={(
        <>
          {selectedTrip && <Badge tone={TRIP_STATUS_TONES[selectedTrip.status]}>{TRIP_STATUS_LABELS[selectedTrip.status]}</Badge>}
          {selectedTrip?.archivedAt && <Badge tone="neutral">W archiwum</Badge>}
          {storageError && <Badge tone="danger">Brak zapisu lokalnego</Badge>}
        </>
      )}
      actions={tripHeaderActions}
    />
  );

  const pageContent = (
    <>
      <ModuleMain>
        {embeddedViewSelect && (
          <WorkspaceToolbar className="affairs-toolbar affairs-toolbar--embedded-nav">
            {embeddedViewSelect}
          </WorkspaceToolbar>
        )}

        <WorkspaceToolbar className="travel-toolbar">
          <div className="travel-toolbar__trip-select">
            <Select
              compact
              aria-label="Wybierz podróż"
              value={selectedTrip?.id ?? ""}
              options={[
                { value: "", label: "Przegląd podróży" },
                ...workspace.trips.map((trip) => ({ value: trip.id, label: trip.name })),
              ]}
              onChange={(event) => event.target.value ? selectTrip(event.target.value) : showAllTrips()}
            />
          </div>
          {selectedTrip && (
            <Tabs
              items={SECTION_TABS}
              activeId={activeSection}
              ariaLabel="Obszary podróży"
              onChange={(id) => setSection(id as TravelSection)}
              className="travel-tabs ui-tabs--segmented"
            />
          )}
          {selectedTrip ? (
            <>
              <div className="travel-toolbar__route">
                <CalendarDays size={13} aria-hidden="true" />
                <strong>{formatDate(selectedTrip.startDate)} — {formatDate(selectedTrip.endDate)}</strong>
                <span>{pluralize(tripDuration(selectedTrip), "dzień", "dni", "dni")}</span>
              </div>
              <div className="travel-toolbar__readiness">
                <span>Gotowość</span>
                <i><b style={{ transform: `scaleX(${readinessScore(selectedTrip) / 100})` }} /></i>
                <strong>{formatPercent(readinessScore(selectedTrip))}</strong>
              </div>
            </>
          ) : (
            <>
              <div className="travel-toolbar__summary">
                <span>{upcomingTrips.length} nadchodzące</span>
                <span>{completedTrips.length} zakończone</span>
              </div>
              <Select
                compact
                aria-label="Filtr statusu podróży"
                value={statusFilter}
                options={[
                  { value: "upcoming", label: "Nadchodzące" },
                  { value: "all", label: "Wszystkie" },
                  { value: "idea", label: "Pomysły" },
                  { value: "planning", label: "W planowaniu" },
                  { value: "ready", label: "Gotowe" },
                  { value: "completed", label: "Zakończone" },
                  { value: "archived", label: "Archiwum" },
                ]}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              />
            </>
          )}
        </WorkspaceToolbar>

        {!selectedTrip ? (
          <section className="travel-overview" aria-label="Przegląd podróży">
            {deletedTripUndo && (
              <div className="travel-trip-undo" role="status">
                <span>Usunięto podróż „{deletedTripUndo.name}”.</span>
                <Button variant="quiet" size="sm" onClick={undoTripDelete}>Cofnij</Button>
                <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij komunikat" onClick={() => setDeletedTripUndo(null)}>×</Button>
              </div>
            )}
            {filteredTrips.length === 0 ? (
              <EmptyState
                icon={<MapIcon size={18} />}
                title="Brak podróży w tym widoku"
                description="Zmień filtr albo dodaj pierwszy wyjazd z datami i miejscem docelowym."
                action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openTripEditor()}>Dodaj podróż</Button>}
              />
            ) : (
              <>
                {filteredTrips[0] && !filteredTrips[0].archivedAt && filteredTrips[0].status !== "completed" && (
                  <button type="button" className="travel-next-departure" onClick={() => selectTrip(filteredTrips[0].id)}>
                    <span className="travel-next-departure__marker"><Plane size={15} /></span>
                    <span className="travel-next-departure__identity">
                      <small>Najbliższy wyjazd · {tripCountdown(filteredTrips[0])}</small>
                      <strong>{filteredTrips[0].name}</strong>
                      <span>{filteredTrips[0].destination}</span>
                    </span>
                    <span className="travel-next-departure__date">
                      <small>Termin</small>
                      <strong>{formatDate(filteredTrips[0].startDate)} — {formatDate(filteredTrips[0].endDate, false)}</strong>
                    </span>
                    <span className="travel-next-departure__action">
                      <small>Następny krok</small>
                      <strong>{nextAction(filteredTrips[0])}</strong>
                    </span>
                    <span className="travel-next-departure__progress">
                      <small>Gotowość</small>
                      <span><i style={{ width: `${readinessScore(filteredTrips[0])}%` }} /></span>
                      <strong>{formatPercent(readinessScore(filteredTrips[0]))}</strong>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                )}

                <div className="travel-board">
                  <div className="travel-board__heading">
                    <div>
                      <MapIcon size={14} aria-hidden="true" />
                      <h2>Wszystkie podróże</h2>
                    </div>
                    <span>{filteredTrips.length} w widoku</span>
                  </div>
                  <div className="travel-board__head" aria-hidden="true">
                    <span>Podróż</span>
                    <span>Termin</span>
                    <span>Gotowość</span>
                    <span>Następny krok</span>
                    <span>Budżet</span>
                    <span />
                  </div>
                  {filteredTrips.map((trip) => {
                    const tripBudget = summarizeTravelBudget(trip);
                    const score = readinessScore(trip);
                    return (
                      <button key={trip.id} type="button" className="travel-board__row" onClick={() => selectTrip(trip.id)}>
                        <span className="travel-board__trip">
                          <i className={`travel-board__status travel-board__status--${trip.status}`} />
                          <span>
                            <strong>{trip.name}</strong>
                            <small>{trip.destination} · {TRIP_STATUS_LABELS[trip.status]}</small>
                          </span>
                        </span>
                        <span className="travel-board__date">
                          <strong>{formatDate(trip.startDate)}</strong>
                          <small>{tripDuration(trip)} dni · {trip.travelers.length || 1} os.</small>
                        </span>
                        <span className="travel-board__progress">
                          <span><i style={{ width: `${score}%` }} /></span>
                          <strong>{formatPercent(score)}</strong>
                        </span>
                        <span className="travel-board__next">
                          <strong>{nextAction(trip)}</strong>
                          <small>{tripCountdown(trip)}</small>
                        </span>
                        <span className="travel-board__money">
                          <strong><PrivateMoney value={tripBudget.planned} currency={trip.baseCurrency} label={`Planowany budżet: ${trip.name}`} /></strong>
                          <small>
                            {tripBudget.actual
                              ? <><PrivateMoney value={tripBudget.actual} currency={trip.baseCurrency} label={`Rzeczywiste wydatki: ${trip.name}`} /> rzeczywiście</>
                              : "Brak wydatków"}
                          </small>
                        </span>
                        <ChevronRight size={14} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        ) : (
          <section
            id={`travel-panel-${activeSection}`}
            role="tabpanel"
            aria-labelledby={`travel-tab-${activeSection}`}
            tabIndex={0}
            className="travel-canvas"
          >
            {activeSection === "overview" && (
              <div className="travel-trip-overview">
                <section className="travel-readiness" aria-labelledby="travel-readiness-title">
                  <header>
                    <div>
                      <h2 id="travel-readiness-title">Gotowość do wyjazdu</h2>
                      <p>{tripCountdown(selectedTrip)} · następny krok: {nextAction(selectedTrip)}</p>
                    </div>
                    <strong>{formatPercent(readinessScore(selectedTrip))}</strong>
                  </header>
                  <div className="travel-readiness__track"><span style={{ transform: `scaleX(${readinessScore(selectedTrip) / 100})` }} /></div>
                  <div className="travel-readiness__parts">
                    {readinessParts(selectedTrip).map((part) => (
                      <button key={part.id} type="button" onClick={() => setSection(part.id)}>
                        <span>
                          <strong>{part.label}</strong>
                          <small>{part.meta}</small>
                        </span>
                        <i><b style={{ width: `${Math.round(part.value * 100)}%` }} /></i>
                        <ChevronRight size={13} />
                      </button>
                    ))}
                  </div>
                </section>

                <div className="travel-dashboard-grid">
                  <section className="travel-panel travel-panel--agenda">
                    <header>
                      <div><CalendarDays size={14} /><h3>Najbliższe punkty planu</h3></div>
                      <button type="button" onClick={() => setSection("itinerary")}>Pełny plan</button>
                    </header>
                    <div>
                      {selectedTrip.itinerary
                        .slice()
                        .sort((a, b) => `${a.date}-${a.time}`.localeCompare(`${b.date}-${b.time}`))
                        .slice(0, 5)
                        .map((item) => (
                          <button key={item.id} type="button" className="travel-agenda-row" onClick={() => openItineraryEditor(item)}>
                            <span className="travel-agenda-row__date">
                              <strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString("pl-PL", { day: "2-digit" })}</strong>
                              <small>{new Date(`${item.date}T12:00:00`).toLocaleDateString("pl-PL", { month: "short" })}</small>
                            </span>
                            <span>
                              <strong>{item.title}</strong>
                              <small>{item.time || "Bez godziny"}{item.location ? ` · ${item.location}` : ""}</small>
                            </span>
                            <Badge tone={item.reserved ? "success" : "neutral"}>{ITINERARY_KIND_LABELS[item.kind]}</Badge>
                          </button>
                        ))}
                      {selectedTrip.itinerary.length === 0 && (
                        <p className="travel-panel__empty">Plan jest pusty. Dodaj pierwszy dzień i atrakcję.</p>
                      )}
                    </div>
                  </section>

                  <section className="travel-panel travel-panel--basics">
                    <header>
                      <div><MapPin size={14} /><h3>Podstawy wyjazdu</h3></div>
                      <button type="button" onClick={() => openTripEditor(selectedTrip)}>Edytuj</button>
                    </header>
                    <dl>
                      <div><dt>Termin</dt><dd>{formatDate(selectedTrip.startDate)} — {formatDate(selectedTrip.endDate)}</dd></div>
                      <div><dt>Trasa</dt><dd>{selectedTrip.destination || "Nie ustalono"}</dd></div>
                      <div><dt>Podróżni</dt><dd>{selectedTrip.travelers.join(", ") || "1 osoba"}</dd></div>
                      <div><dt>Waluta bazowa</dt><dd>{selectedTrip.baseCurrency}</dd></div>
                    </dl>
                    {selectedTrip.note && <p>{selectedTrip.note}</p>}
                  </section>

                  <section className="travel-panel travel-panel--bookings">
                    <header>
                      <div><ReceiptText size={14} /><h3>Rezerwacje</h3></div>
                      <button type="button" onClick={() => setSection("reservations")}>Szczegóły</button>
                    </header>
                    <div className="travel-booking-summary">
                      <div>
                        <BedDouble size={14} />
                        <span><strong>{selectedTrip.stays.filter((item) => item.status !== "planned").length}/{selectedTrip.stays.length}</strong><small>noclegi zabezpieczone</small></span>
                      </div>
                      <div>
                        <Plane size={14} />
                        <span><strong>{selectedTrip.transports.filter((item) => item.status !== "planned").length}/{selectedTrip.transports.length}</strong><small>przejazdy zabezpieczone</small></span>
                      </div>
                    </div>
                  </section>

                  <section className="travel-panel travel-panel--money">
                    <header>
                      <div><WalletCards size={14} /><h3>Budżet</h3></div>
                      <button type="button" onClick={() => setSection("budget")}>Szczegóły</button>
                    </header>
                    <div className="travel-money-summary">
                      <span><small>Plan</small><strong><PrivateMoney value={budgetSummary.planned} currency={selectedTrip.baseCurrency} label="Planowany budżet podróży" /></strong></span>
                      <span><small>Rzeczywiste</small><strong><PrivateMoney value={budgetSummary.actual} currency={selectedTrip.baseCurrency} label="Rzeczywiste wydatki podróży" /></strong></span>
                      <span><small>Zostaje</small><strong className={budgetSummary.remaining < 0 ? "is-negative" : ""}><PrivateMoney value={budgetSummary.remaining} currency={selectedTrip.baseCurrency} label="Pozostały budżet podróży" /></strong></span>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {activeSection === "itinerary" && (
              <div className="travel-itinerary">
                <div className="travel-section-intro">
                  <div>
                    <h2>Plan dzień po dniu</h2>
                    <p>{itineraryDays.length} z {tripDuration(selectedTrip)} dni ma już zapisany plan.</p>
                  </div>
                  <Badge tone={itineraryDays.length >= tripDuration(selectedTrip) ? "success" : "warning"}>
                    {selectedTrip.itinerary.length} punktów
                  </Badge>
                </div>
                {itineraryDays.length === 0 ? (
                  <EmptyState
                    icon={<CalendarDays size={18} />}
                    title="Zacznij od pierwszego dnia"
                    description="Dodaj przejazd, atrakcję, posiłek albo czas na odpoczynek."
                    action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openItineraryEditor()}>Dodaj punkt planu</Button>}
                  />
                ) : (
                  <div className="travel-day-list">
                    {itineraryDays.map(([date, items], dayIndex) => (
                      <section key={date} className="travel-day">
                        <header>
                          <span><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("pl-PL", { weekday: "short" })}</strong><small>Dzień {dayIndex + 1}</small></span>
                          <div>
                            <h3>{formatDate(date)}</h3>
                            <p>{items.map((item) => item.location).filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).slice(0, 2).join(" · ") || "Bez lokalizacji"}</p>
                          </div>
                          <Button variant="ghost" size="sm" leadingIcon={<Plus size={12} />} onClick={() => {
                            openItineraryEditor();
                            setDraft((current) => ({ ...current, date }));
                          }}>Dodaj</Button>
                        </header>
                        <div>
                          {items.map((item) => (
                            <article key={item.id} className="travel-plan-row">
                              <span className="travel-plan-row__time">{item.time || "—"}</span>
                              <span className={`travel-plan-row__signal travel-plan-row__signal--${item.kind}`} />
                              <span className="travel-plan-row__copy">
                                <strong>{item.title}</strong>
                                <small>{item.location || ITINERARY_KIND_LABELS[item.kind]}{item.note ? ` · ${item.note}` : ""}</small>
                              </span>
                              <Badge tone={item.reserved ? "success" : "neutral"}>{item.reserved ? "Zarezerwowano" : ITINERARY_KIND_LABELS[item.kind]}</Badge>
                              <span className="travel-row-actions">
                                <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${item.title}`} onClick={() => openItineraryEditor(item)}><Pencil size={12} /></Button>
                                <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń ${item.title}`} onClick={() => setDeleteState({ kind: "itinerary", id: item.id, label: item.title })}><Trash2 size={12} /></Button>
                              </span>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeSection === "reservations" && (
              <div className="travel-reservations">
                <section className="travel-register">
                  <div className="travel-register__heading">
                    <div><BedDouble size={15} /><span><h2>Noclegi</h2><p>{selectedTrip.stays.length} zapisanych miejsc</p></span></div>
                    <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={() => openStayEditor()}>Nocleg</Button>
                  </div>
                  {selectedTrip.stays.length === 0 ? (
                    <EmptyState icon={<BedDouble size={18} />} title="Brak noclegów" description="Zapisz miejsce, terminy, adres i numer rezerwacji." />
                  ) : (
                    <div className="travel-stay-list">
                      {selectedTrip.stays
                        .slice()
                        .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
                        .map((stay) => (
                          <article key={stay.id} className="travel-stay-row">
                            <span className="travel-reservation-icon"><BedDouble size={15} /></span>
                            <span className="travel-reservation-copy">
                              <strong>{stay.name}</strong>
                              <small>{stay.city}{stay.address ? ` · ${stay.address}` : ""}</small>
                            </span>
                            <span className="travel-reservation-dates">
                              <strong>{formatDate(stay.checkIn, false)} — {formatDate(stay.checkOut, false)}</strong>
                              <small>{stay.bookingRef || "Brak numeru rezerwacji"}</small>
                            </span>
                            <span className="travel-reservation-money"><PrivateMoney value={stay.amount} currency={selectedTrip.baseCurrency} label={`Kwota noclegu: ${stay.name}`} /></span>
                            <Badge tone={stay.status === "paid" ? "success" : stay.status === "booked" ? "primary" : "warning"}>{RESERVATION_STATUS_LABELS[stay.status]}</Badge>
                            <span className="travel-row-actions">
                              <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${stay.name}`} onClick={() => openStayEditor(stay)}><Pencil size={12} /></Button>
                              <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń ${stay.name}`} onClick={() => setDeleteState({ kind: "stay", id: stay.id, label: stay.name })}><Trash2 size={12} /></Button>
                            </span>
                          </article>
                        ))}
                    </div>
                  )}
                </section>

                <section className="travel-register">
                  <div className="travel-register__heading">
                    <div><Plane size={15} /><span><h2>Transport</h2><p>{selectedTrip.transports.length} zapisanych odcinków</p></span></div>
                    <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={() => openTransportEditor()}>Transport</Button>
                  </div>
                  {selectedTrip.transports.length === 0 ? (
                    <EmptyState icon={<Plane size={18} />} title="Brak transportu" description="Dodaj lot, pociąg, samochód, autobus lub prom." />
                  ) : (
                    <div className="travel-transport-list">
                      {selectedTrip.transports
                        .slice()
                        .sort((a, b) => a.departure.localeCompare(b.departure))
                        .map((transport) => {
                          const Icon = TRANSPORT_ICONS[transport.mode];
                          return (
                            <article key={transport.id} className="travel-transport-row">
                              <span className="travel-reservation-icon"><Icon size={15} /></span>
                              <span className="travel-reservation-copy">
                                <strong>{transport.title}</strong>
                                <small>{TRANSPORT_MODE_LABELS[transport.mode]} · {transport.bookingRef || "Brak numeru rezerwacji"}</small>
                              </span>
                              <span className="travel-transport-route">
                                <strong>{transport.from || "—"} <ChevronRight size={11} /> {transport.to || "—"}</strong>
                                <small>{formatDateTime(transport.departure)} — {formatDateTime(transport.arrival)}</small>
                              </span>
                              <span className="travel-reservation-money"><PrivateMoney value={transport.amount} currency={selectedTrip.baseCurrency} label={`Kwota transportu: ${transport.title}`} /></span>
                              <Badge tone={transport.status === "paid" ? "success" : transport.status === "booked" ? "primary" : "warning"}>{RESERVATION_STATUS_LABELS[transport.status]}</Badge>
                              <span className="travel-row-actions">
                                <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${transport.title}`} onClick={() => openTransportEditor(transport)}><Pencil size={12} /></Button>
                                <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń ${transport.title}`} onClick={() => setDeleteState({ kind: "transport", id: transport.id, label: transport.title })}><Trash2 size={12} /></Button>
                              </span>
                            </article>
                          );
                        })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeSection === "budget" && (
              <div className="travel-budget">
                <section className="travel-budget-summary" aria-label="Podsumowanie budżetu">
                  <div><span>Plan podróży</span><strong><PrivateMoney value={budgetSummary.planned} currency={selectedTrip.baseCurrency} label="Planowany budżet podróży" /></strong></div>
                  <div><span>Rzeczywiste wydatki</span><strong><PrivateMoney value={budgetSummary.actual} currency={selectedTrip.baseCurrency} label="Rzeczywiste wydatki podróży" /></strong></div>
                  <div><span>Już opłacone</span><strong><PrivateMoney value={budgetSummary.paid} currency={selectedTrip.baseCurrency} label="Opłacona kwota podróży" /></strong></div>
                  <div><span>Do dyspozycji</span><strong className={budgetSummary.remaining < 0 ? "is-negative" : ""}><PrivateMoney value={budgetSummary.remaining} currency={selectedTrip.baseCurrency} label="Kwota do dyspozycji" /></strong></div>
                </section>
                <div className="travel-budget-link-note" role="note">
                  <ReceiptText size={14} aria-hidden="true" />
                  <span>
                    <strong>Rezerwacje są połączone z podsumowaniem</strong>
                    <small>
                      Noclegi i transport wnoszą <PrivateMoney value={budgetSummary.reservationCommitted} currency={selectedTrip.baseCurrency} label="Kwota rezerwacji" />.
                      Dla tych kategorii podsumowanie bierze wyższą z kwot — wpis budżetowy albo rezerwacje — aby ich nie dublować.
                    </small>
                  </span>
                  {budgetSummary.unbudgetedReservations > 0 && (
                    <Badge tone="warning">
                      <PrivateMoney value={budgetSummary.unbudgetedReservations} currency={selectedTrip.baseCurrency} label="Kwota rezerwacji poza planem" /> poza planem
                    </Badge>
                  )}
                </div>
                <section className="travel-budget-register">
                  <div className="travel-budget-register__head">
                    <span>Kategoria</span><span>Plan</span><span>Rzeczywiście</span><span>Realizacja</span><span>Status</span><span />
                  </div>
                  {selectedTrip.budget.map((line) => {
                    const ratio = line.planned ? Math.min(100, Math.round(line.actual / line.planned * 100)) : 0;
                    return (
                      <article key={line.id} className="travel-budget-row">
                        <span className="travel-budget-row__identity">
                          <strong>{line.label}</strong>
                          <small>{BUDGET_CATEGORY_LABELS[line.category]}</small>
                        </span>
                        <span className="travel-budget-row__value"><PrivateMoney value={line.planned} currency={selectedTrip.baseCurrency} label={`Planowana kwota: ${line.label}`} /></span>
                        <span className="travel-budget-row__value"><PrivateMoney value={line.actual} currency={selectedTrip.baseCurrency} label={`Rzeczywista kwota: ${line.label}`} /></span>
                        <span
                          className="travel-budget-row__progress"
                          role="progressbar"
                          aria-label={`Realizacja budżetu: ${line.label}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={ratio}
                        >
                          <i><b style={{ width: `${ratio}%` }} /></i><strong>{formatPercent(ratio)}</strong>
                        </span>
                        <Badge tone={line.paid ? "success" : line.actual > line.planned ? "danger" : "neutral"}>{line.paid ? "Opłacono" : "Plan"}</Badge>
                        <span className="travel-row-actions">
                          <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${line.label}`} onClick={() => openBudgetEditor(line)}><Pencil size={12} /></Button>
                          <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń ${line.label}`} onClick={() => setDeleteState({ kind: "budget", id: line.id, label: line.label })}><Trash2 size={12} /></Button>
                        </span>
                      </article>
                    );
                  })}
                  {selectedTrip.budget.length === 0 && (
                    <EmptyState
                      icon={<WalletCards size={18} />}
                      title="Budżet jest jeszcze pusty"
                      description="Rozpisz transport, noclegi, jedzenie, atrakcje i rezerwę."
                      action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openBudgetEditor()}>Dodaj pozycję</Button>}
                    />
                  )}
                </section>
              </div>
            )}

            {activeSection === "documents" && (
              <div className="travel-documents">
                <div className="travel-section-intro">
                  <div><h2>Dokumenty i formalności</h2><p>Kliknij status, aby przesunąć dokument do kolejnego etapu.</p></div>
                  <Badge tone={selectedTrip.documents.every((item) => item.status === "ready") ? "success" : "warning"}>
                    {selectedTrip.documents.filter((item) => item.status === "ready").length}/{selectedTrip.documents.length} gotowych
                  </Badge>
                </div>
                {selectedTrip.documents.length === 0 ? (
                  <EmptyState
                    icon={<FileText size={18} />}
                    title="Brak dokumentów"
                    description="Dodaj dokumenty tożsamości, polisę, wizy, bilety i wymagane formularze."
                    action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openDocumentEditor()}>Dodaj dokument</Button>}
                  />
                ) : (
                  <section className="travel-document-register">
                    <div className="travel-document-register__head">
                      <span>Dokument</span><span>Właściciel</span><span>Ważność</span><span>Status</span><span />
                    </div>
                    {selectedTrip.documents.map((document) => (
                      <article key={document.id} className="travel-document-row">
                        <span className="travel-document-row__identity">
                          <FileText size={14} />
                          <span><strong>{document.name}</strong><small>{document.note || "Bez dodatkowych uwag"}</small></span>
                        </span>
                        <span className="travel-document-row__owner">{document.owner}</span>
                        <span className="travel-document-row__date">{document.expiresAt ? formatDate(document.expiresAt) : "Nie dotyczy"}</span>
                        <button type="button" className="travel-status-button" onClick={() => cycleDocumentStatus(document)}>
                          <Badge tone={DOCUMENT_STATUS_TONES[document.status]}>{DOCUMENT_STATUS_LABELS[document.status]}</Badge>
                        </button>
                        <span className="travel-row-actions">
                          <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${document.name}`} onClick={() => openDocumentEditor(document)}><Pencil size={12} /></Button>
                          <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń ${document.name}`} onClick={() => setDeleteState({ kind: "document", id: document.id, label: document.name })}><Trash2 size={12} /></Button>
                        </span>
                      </article>
                    ))}
                  </section>
                )}
              </div>
            )}

            {activeSection === "tasks" && (
              <div className="travel-tasks">
                <div className="travel-section-intro">
                  <div><h2>Sprawy do załatwienia</h2><p>Rezerwacje, zdrowie, pieniądze, formalności i pakowanie w jednym miejscu.</p></div>
                  <Badge tone="primary">{selectedTrip.tasks.filter((item) => !item.completed).length} otwartych</Badge>
                </div>
                {selectedTrip.tasks.length === 0 ? (
                  <EmptyState
                    icon={<ListChecks size={18} />}
                    title="Lista przygotowań jest pusta"
                    description="Dodaj pierwszą sprawę z kategorią i terminem."
                    action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openTaskEditor()}>Dodaj sprawę</Button>}
                  />
                ) : (
                  <section className="travel-task-register">
                    {selectedTrip.tasks
                      .slice()
                      .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
                      .map((task, index, sortedTasks) => {
                        if (task.completed) {
                          if (sortedTasks[index - 1]?.completed) return null;
                          const completedTasks = sortedTasks.filter((item) => item.completed);
                          return (
                            <CompletedSection key="completed-travel-tasks" label="Ukończone" count={completedTasks.length} className="travel-completed-section">
                              <div className="travel-task-register">{completedTasks.map(renderTravelTask)}</div>
                            </CompletedSection>
                          );
                        }
                        return renderTravelTask(task);
                        return (
                        <article key={task.id} className={`travel-task-row ${task.completed ? "is-completed" : ""}`}>
                          <button
                            type="button"
                            className="travel-check"
                            aria-label={task.completed ? `Przywróć ${task.title}` : `Oznacz jako zrobione: ${task.title}`}
                            aria-pressed={task.completed}
                            onClick={() => toggleTask(task)}
                          >
                            {task.completed && <Check size={10} />}
                          </button>
                          <span className="travel-task-row__copy">
                            <strong>{task.title}</strong>
                            <small>{TASK_CATEGORY_LABELS[task.category]}</small>
                          </span>
                          <Badge tone={task.category === "health" ? "warning" : task.category === "documents" ? "violet" : "neutral"}>
                            {TASK_CATEGORY_LABELS[task.category]}
                          </Badge>
                          <span className={`travel-task-row__due ${task.dueDate && daysUntil(task.dueDate) < 0 && !task.completed ? "is-overdue" : ""}`}>
                            {task.dueDate ? formatDate(task.dueDate) : "Bez terminu"}
                          </span>
                          <span className="travel-row-actions">
                            <AddToTasksButton
                              compact
                              input={{
                                source: {
                                  kind: "travel",
                                  entity: `${encodeURIComponent(selectedTrip?.id ?? "")}/${encodeURIComponent(task.id)}`,
                                  context: `${selectedTrip.name} · ${selectedTrip.destination}`,
                                  href: embedded
                                    ? `/sprawy?widok=travel&podroz=${encodeURIComponent(selectedTrip?.id ?? "")}&sekcja=tasks`
                                    : `/podroze/${encodeURIComponent(selectedTrip?.id ?? "")}?sekcja=tasks`,
                                },
                                text: task.title,
                                done: task.completed,
                                calendarDate: task.dueDate || undefined,
                                date: task.dueDate || undefined,
                                list: "podroze",
                                tags: ["podroze"],
                              }}
                            />
                            <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${task.title}`} onClick={() => openTaskEditor(task)}><Pencil size={12} /></Button>
                            <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń ${task.title}`} onClick={() => setDeleteState({ kind: "task", id: task.id, label: task.title })}><Trash2 size={12} /></Button>
                          </span>
                        </article>
                      );
                      })}
                  </section>
                )}
              </div>
            )}
          </section>
        )}
      </ModuleMain>

      {editor && (
        <Modal
          eyebrow="Podróże"
          title={editorTitle}
          description={editor.kind === "trip" ? "Najpierw ustal ramy wyjazdu. Szczegóły uzupełnisz w jego zakładkach." : `Element zostanie zapisany w podróży ${selectedTrip?.name ?? ""}.`}
          onClose={closeEditor}
          width={editor.kind === "trip" || editor.kind === "transport" ? 640 : 540}
          footer={(
            <>
              <Button variant="ghost" onClick={closeEditor}>Anuluj</Button>
              <Button variant="primary" type="submit" form="travel-editor-form">
                {editor.mode === "edit" ? "Zapisz zmiany" : "Dodaj"}
              </Button>
            </>
          )}
        >
          <form id="travel-editor-form" className="travel-form" onSubmit={submitEditor}>
            <Input
              label={editor.kind === "trip" ? "Nazwa podróży" : editor.kind === "task" ? "Co trzeba zrobić?" : "Nazwa"}
              placeholder={editor.kind === "trip" ? "np. Japonia jesienią" : "Wpisz nazwę"}
              value={draft.name}
              error={editorError}
              autoFocus
              onChange={(event) => {
                setDraft((current) => ({ ...current, name: event.target.value }));
                if (editorError) setEditorError("");
              }}
            />

            {editor.kind === "trip" && (
              <>
                <Input label="Trasa / kierunek" placeholder="np. Tokio · Kioto · Osaka" value={draft.destination} onChange={(event) => setDraft((current) => ({ ...current, destination: event.target.value }))} />
                <div className="travel-form__grid">
                  <Input type="date" label="Początek" value={draft.startDate} max={draft.endDate || undefined} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
                  <Input type="date" label="Koniec" value={draft.endDate} min={draft.startDate || undefined} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
                </div>
                <div className="travel-form__grid">
                  <Select
                    label="Status"
                    value={draft.tripStatus}
                    options={Object.entries(TRIP_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, tripStatus: event.target.value as TripStatus }))}
                  />
                  <Input label="Waluta budżetu" hint="Trzyliterowy kod ISO, np. PLN lub EUR." minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={draft.currency} onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
                </div>
                <Input label="Podróżni" hint="Oddziel osoby przecinkami." placeholder="Mateusz, Ola" value={draft.travelers} onChange={(event) => setDraft((current) => ({ ...current, travelers: event.target.value }))} />
              </>
            )}

            {editor.kind === "itinerary" && (
              <>
                <div className="travel-form__grid">
                  <Input type="date" label="Dzień" min={selectedTrip?.startDate} max={selectedTrip?.endDate} value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} />
                  <Input type="time" label="Godzina" value={draft.time} onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))} />
                </div>
                <div className="travel-form__grid">
                  <Select
                    label="Rodzaj"
                    value={draft.itineraryKind}
                    options={Object.entries(ITINERARY_KIND_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, itineraryKind: event.target.value as ItineraryKind }))}
                  />
                  <Input label="Miejsce" placeholder="Dzielnica, adres lub punkt" value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} />
                </div>
                <label className="travel-form__check">
                  <input type="checkbox" checked={draft.reserved} onChange={(event) => setDraft((current) => ({ ...current, reserved: event.target.checked }))} />
                  <span><strong>Wymagana rezerwacja jest gotowa</strong><small>Bilet albo potwierdzenie zostały już zabezpieczone.</small></span>
                </label>
              </>
            )}

            {editor.kind === "stay" && (
              <>
                <div className="travel-form__grid">
                  <Input label="Miasto" value={draft.city} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} />
                  <Input label="Kwota" inputMode="decimal" placeholder="0" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} />
                </div>
                <Input label="Adres" value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} />
                <div className="travel-form__grid">
                  <Input type="date" label="Zameldowanie" min={selectedTrip?.startDate} max={draft.endDate || selectedTrip?.endDate} value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
                  <Input type="date" label="Wymeldowanie" min={draft.startDate || selectedTrip?.startDate} max={selectedTrip?.endDate} value={draft.endDate} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
                </div>
                <div className="travel-form__grid">
                  <Input label="Numer rezerwacji" value={draft.bookingRef} onChange={(event) => setDraft((current) => ({ ...current, bookingRef: event.target.value }))} />
                  <Select
                    label="Status"
                    value={draft.reservationStatus}
                    options={Object.entries(RESERVATION_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, reservationStatus: event.target.value as ReservationStatus }))}
                  />
                </div>
              </>
            )}

            {editor.kind === "transport" && (
              <>
                <div className="travel-form__grid">
                  <Select
                    label="Rodzaj"
                    value={draft.transportMode}
                    options={Object.entries(TRANSPORT_MODE_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, transportMode: event.target.value as TransportMode }))}
                  />
                  <Input label="Kwota" inputMode="decimal" placeholder="0" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} />
                </div>
                <div className="travel-form__grid">
                  <Input label="Skąd" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} />
                  <Input label="Dokąd" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} />
                </div>
                <div className="travel-form__grid">
                  <Input type="datetime-local" label="Odjazd / wylot" min={selectedTrip ? `${selectedTrip.startDate}T00:00` : undefined} max={draft.arrival || (selectedTrip ? `${selectedTrip.endDate}T23:59` : undefined)} value={draft.departure} onChange={(event) => setDraft((current) => ({ ...current, departure: event.target.value }))} />
                  <Input type="datetime-local" label="Przyjazd / przylot" min={draft.departure || (selectedTrip ? `${selectedTrip.startDate}T00:00` : undefined)} max={selectedTrip ? `${selectedTrip.endDate}T23:59` : undefined} value={draft.arrival} onChange={(event) => setDraft((current) => ({ ...current, arrival: event.target.value }))} />
                </div>
                <div className="travel-form__grid">
                  <Input label="Numer rezerwacji" value={draft.bookingRef} onChange={(event) => setDraft((current) => ({ ...current, bookingRef: event.target.value }))} />
                  <Select
                    label="Status"
                    value={draft.reservationStatus}
                    options={Object.entries(RESERVATION_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, reservationStatus: event.target.value as ReservationStatus }))}
                  />
                </div>
              </>
            )}

            {editor.kind === "budget" && (
              <>
                <Select
                  label="Kategoria"
                  value={draft.budgetCategory}
                  options={Object.entries(BUDGET_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
                  onChange={(event) => setDraft((current) => ({ ...current, budgetCategory: event.target.value as BudgetCategory }))}
                />
                <div className="travel-form__grid">
                  <Input label="Plan" inputMode="decimal" placeholder="0" value={draft.planned} onChange={(event) => setDraft((current) => ({ ...current, planned: event.target.value }))} />
                  <Input label="Rzeczywiście" inputMode="decimal" placeholder="0" value={draft.actual} onChange={(event) => setDraft((current) => ({ ...current, actual: event.target.value }))} />
                </div>
                <label className="travel-form__check">
                  <input type="checkbox" checked={draft.paid} onChange={(event) => setDraft((current) => ({ ...current, paid: event.target.checked }))} />
                  <span><strong>Wydatek opłacony</strong><small>Kwota nie pozostaje już do zapłaty.</small></span>
                </label>
              </>
            )}

            {editor.kind === "document" && (
              <>
                <div className="travel-form__grid">
                  <Input label="Właściciel" placeholder="np. Mateusz lub Wszyscy" value={draft.owner} onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))} />
                  <Select
                    label="Status"
                    value={draft.documentStatus}
                    options={Object.entries(DOCUMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, documentStatus: event.target.value as DocumentStatus }))}
                  />
                </div>
                <Input type="date" label="Ważny do (opcjonalnie)" value={draft.expiresAt} onChange={(event) => setDraft((current) => ({ ...current, expiresAt: event.target.value }))} />
              </>
            )}

            {editor.kind === "task" && (
              <div className="travel-form__grid">
                <Select
                  label="Kategoria"
                  value={draft.taskCategory}
                  options={Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
                  onChange={(event) => setDraft((current) => ({ ...current, taskCategory: event.target.value as TravelTaskCategory }))}
                />
                <Input type="date" label="Termin" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} />
              </div>
            )}

            {(editor.kind === "trip" || editor.kind === "itinerary" || editor.kind === "document") && (
              <label className="ui-field">
                <span className="ui-field__label">Notatka <span className="travel-optional">opcjonalnie</span></span>
                <textarea
                  className="ui-field__control travel-textarea"
                  value={draft.note}
                  placeholder="Ważny kontekst, adres, ograniczenia albo wskazówki"
                  onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                />
              </label>
            )}
          </form>
        </Modal>
      )}

      {deleteState && (
        <Modal
          eyebrow="Potwierdzenie"
          title={`Usunąć „${deleteState.label}”?`}
          description="Pozycja zniknie z lokalnego planu podróży."
          onClose={() => setDeleteState(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setDeleteState(null)}>Anuluj</Button>
              <Button variant="danger" onClick={confirmDelete}>Usuń</Button>
            </>
          )}
        >
          <p className="travel-delete-note">Tej operacji nie można cofnąć.</p>
        </Modal>
      )}

      {tripActionState && (
        <Modal
          eyebrow="Podróż"
          title={tripActionState.kind === "archive"
            ? `Archiwizować „${tripActionState.trip.name}”?`
            : `Usunąć „${tripActionState.trip.name}”?`}
          description={tripActionState.kind === "archive"
            ? "Podróż zniknie z listy nadchodzących. Wszystkie rezerwacje, dokumenty i zadania pozostaną zapisane."
            : "Cały dossier podróży zostanie usunięty z lokalnego obszaru. Bezpośrednio po operacji będzie dostępne Cofnij."}
          onClose={() => setTripActionState(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setTripActionState(null)}>Anuluj</Button>
              <Button
                variant={tripActionState.kind === "archive" ? "primary" : "danger"}
                onClick={confirmTripAction}
              >
                {tripActionState.kind === "archive" ? "Archiwizuj" : "Usuń podróż"}
              </Button>
            </>
          )}
        >
          <p className="travel-delete-note">
            {tripActionState.kind === "archive"
              ? "Podróż można później przywrócić z archiwum."
              : "Przed usunięciem możesz pobrać eksport JSON z nagłówka podróży."}
          </p>
        </Modal>
      )}
    </>
  );

  return layout
    ? layout(pageHeader, pageContent)
    : (
      <ModuleShell
        contextSidebar={contextSidebar}
        className="travel-module"
        pageWidth="wide"
        ambient={{
          scene: "travel",
          progress: selectedTrip
            ? (selectedTrip.tasks.length
                ? selectedTrip.tasks.filter((task) => task.completed).length / selectedTrip.tasks.length
                : selectedTrip.status === "completed" ? 1 : 0)
            : workspace.trips.length ? completedTrips.length / workspace.trips.length : 0,
          signal: selectedTrip
            ? `${selectedTrip.id}:${selectedTrip.tasks.filter((task) => task.completed).length}`
            : completedTrips.length,
        }}
        header={pageHeader}
      >
        {pageContent}
      </ModuleShell>
    );
}
