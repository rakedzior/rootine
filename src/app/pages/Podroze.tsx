/**
 * THESIS: Podróże is an operational trip dossier, not a destination gallery; the trip overview stays quiet and action-led.
 * OWN-WORLD: Rootine's graphite workshop, a compact trip rail, dated itinerary bands, quiet ledgers, and precision blue for the active journey.
 * STORY: Scan where and when the trip happens, take the next action, then open details only when a decision needs them.
 * FIRST VIEWPORT: The selected trip overview gives the next step first, the nearest plan second, and one combined reservation/budget summary third.
 * FORM: The sixth grounded structure — a calm trip dashboard with progressive disclosure — selected with seed 46ce9e6f.
 */
import {
  Archive,
  ArchiveRestore,
  BedDouble,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Download,
  Ellipsis,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { HALF_HOUR_TIME_OPTIONS } from "../data/timeOptions";
import { formatLongDate } from "../formatters";
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
  Checkbox,
  ConfirmDialog,
  ContentHeader,
  ContextNavItem,
  DatePicker,
  ModuleSidebar,
  CompletedSection,
  DetailPanel,
  EmptyState,
  Input,
  Modal,
  ModuleMain,
  ModuleShell,
  Menu,
  MenuItem,
  Select,
  Textarea,
  Toast,
  ToastViewport,
  AddToTasksButton,
  TimePicker,
} from "../ui";
import { readSessionDraft, useDraftProtection } from "../ui/hooks/useDraftProtection";
import { TravelDateTimeField } from "../travel/TravelDateTimeField";
import "../../styles/travel.css";

import {
  BUDGET_CATEGORY_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONES,
  EMPTY_DRAFT,
  ITINERARY_KIND_LABELS,
  RESERVATION_STATUS_LABELS,
  SECTION_COPY,
  TRAVEL_SECTION_ITEMS,
  TASK_CATEGORY_LABELS,
  TRANSPORT_ICONS,
  TRANSPORT_MODE_LABELS,
  TRIP_STATUS_LABELS,
  daysUntil,
  buildItineraryDays,
  formatDate,
  formatDateTime,
  isTravelSection,
  nextAction,
  numberFrom,
  readinessParts,
  tripCountdown,
  tripDuration,
  type DeleteState,
  type Draft,
  type EditorKind,
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

function formatTripDateRange(trip: TravelTrip) {
  const start = formatLongDate(trip.startDate).split(" ");
  const end = formatLongDate(trip.endDate).split(" ");
  return start.slice(1).join(" ") === end.slice(1).join(" ")
    ? `${start[0]}–${end[0]} ${end.slice(1).join(" ")}`
    : `${start.join(" ")} — ${end.join(" ")}`;
}

function overviewNextAction(trip: TravelTrip) {
  const openTasks = trip.tasks.filter((task) => !task.completed);
  if (openTasks.length > 1) return `${openTasks.length} otwarte sprawy`;
  if (openTasks.length === 1) return openTasks[0].title;
  const action = nextAction(trip);
  return action === "Plan jest domknięty" ? "Brak pilnych działań" : action;
}

type TripDetailPanel = "summary" | "incomplete";
type TravelItemDetail = {
  kind: Exclude<EditorKind, "trip">;
  id: string;
  title: string;
};

const TRAVEL_ROUTE_SECTION: Record<string, TravelSection> = {
  overview: "overview",
  plan: "itinerary",
  itinerary: "itinerary",
  reservations: "reservations",
  budget: "budget",
  "to-do": "tasks",
  tasks: "tasks",
  documents: "documents",
  packing: "packing",
};

const TRAVEL_SECTION_ROUTE: Partial<Record<TravelSection, string>> = {
  itinerary: "plan",
  tasks: "to-do",
};

export default function Podroze({
  layout,
  embeddedViewSelect,
}: {
  layout?: (content: ReactNode) => ReactNode;
  embeddedViewSelect?: ReactNode;
} = {}) {
  const [workspace, setWorkspace] = useState(loadTravelWorkspace);
  const [statusFilter, setStatusFilter] = useState<"upcoming" | "all" | "completed" | "archived">("upcoming");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editorBaseline, setEditorBaseline] = useState<Draft>(EMPTY_DRAFT);
  const draftSnapshotRef = useRef(draft);
  draftSnapshotRef.current = draft;
  const [editorError, setEditorError] = useState("");
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [tripActionState, setTripActionState] = useState<TripActionState | null>(null);
  const [tripDetailPanel, setTripDetailPanel] = useState<TripDetailPanel | null>(null);
  const [travelItemDetail, setTravelItemDetail] = useState<TravelItemDetail | null>(null);
  const [tripMenuOpen, setTripMenuOpen] = useState(false);
  const tripMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [deletedTripUndo, setDeletedTripUndo] = useState<TravelTrip | null>(null);
  const [storageError, setStorageError] = useState(false);
  const { tripId: routeTripId, travelSection: routeTravelSection } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const embedded = Boolean(layout);
  const tripId = routeTripId ?? searchParams.get("podroz") ?? undefined;
  const selectedTrip = workspace.trips.find((trip) => trip.id === tripId)!;
  const routeSectionParam = routeTravelSection ? TRAVEL_ROUTE_SECTION[routeTravelSection] ?? null : null;
  const sectionParam = searchParams.get("sekcja") ?? routeSectionParam;
  const parsedSection: TravelSection = isTravelSection(sectionParam) ? sectionParam : "overview";
  const activeSection: TravelSection = parsedSection === "preparation" ? "tasks" : parsedSection;
  const isCanonicalTravelRoute = location.pathname.startsWith("/travel/");
  const editorDraftKey = editor
    ? `rootine.travel-editor-draft.${selectedTrip?.id ?? "new-trip"}.${editor.kind}.${editor.mode}.${editor.id ?? "new"}`
    : "";

  useEffect(() => {
    if (!editorDraftKey) return;
    const baseline = draftSnapshotRef.current;
    setEditorBaseline(baseline);
    const recovered = readSessionDraft<Partial<Draft>>(editorDraftKey);
    if (recovered && typeof recovered === "object") setDraft({ ...baseline, ...recovered });
  }, [editorDraftKey]);

  useEffect(() => {
    setStorageError(!saveTravelWorkspace(workspace));
  }, [workspace]);

  useEffect(() => subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, () => {
    setWorkspace(loadTravelWorkspace());
  }), []);

  useEffect(() => {
    if (tripId && !selectedTrip) navigate(embedded ? "/sprawy?widok=travel" : "/podroze", { replace: true });
  }, [embedded, navigate, selectedTrip, tripId]);

  useEffect(() => {
    setTripDetailPanel(null);
    setTravelItemDetail(null);
    setTripMenuOpen(false);
  }, [activeSection, selectedTrip?.id]);

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
      if (statusFilter === "completed") return trip.status === "completed";
      if (statusFilter === "archived") return Boolean(trip.archivedAt);
      return true;
    })
    .sort((a, b) => {
      if (Boolean(a.archivedAt) !== Boolean(b.archivedAt)) return a.archivedAt ? 1 : -1;
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;
      return a.status === "completed"
        ? b.startDate.localeCompare(a.startDate)
        : a.startDate.localeCompare(b.startDate);
    }), [statusFilter, workspace.trips]);
  const nearestTrip = upcomingTrips[0];
  const showNearestTrip = Boolean(nearestTrip && (statusFilter === "upcoming" || statusFilter === "all"));
  const remainingTrips = filteredTrips.filter((trip) => !showNearestTrip || trip.id !== nearestTrip?.id);

  const itineraryDays = useMemo(
    () => selectedTrip ? buildItineraryDays(selectedTrip) : [],
    [selectedTrip],
  );
  const plannedItineraryDays = itineraryDays.filter((day) => day.items.length).length;
  const selectedTripStatusLabel = selectedTrip
    ? selectedTrip.status === "completed" ? TRIP_STATUS_LABELS[selectedTrip.status] : "W toku"
    : "";
  const selectedTripStatusTone = selectedTrip
    ? selectedTrip.status === "completed" ? "neutral" as const : selectedTrip.status === "ready" ? "success" as const : "primary" as const
    : "neutral" as const;
  const tripDateRangeLabel = selectedTrip ? formatTripDateRange(selectedTrip) : "";
  const nextStepTiming = selectedTrip ? tripCountdown(selectedTrip).replace(/^Za /, "za ") : "";

  const reservationSummary = useMemo(() => {
    if (!selectedTrip) return { secured: 0, total: 0 };
    const reservations = [...selectedTrip.stays, ...selectedTrip.transports];
    return {
      secured: reservations.filter((item) => item.status !== "planned").length,
      total: reservations.length,
    };
  }, [selectedTrip]);

  const unfinishedTripItems = useMemo(() => {
    if (!selectedTrip) return 0;
    const openTasks = selectedTrip.tasks.filter((task) => !task.completed).length;
    const emptyPlanDays = Math.max(0, tripDuration(selectedTrip) - plannedItineraryDays);
    const pendingReservations = [...selectedTrip.stays, ...selectedTrip.transports]
      .filter((item) => item.status === "planned").length;
    const pendingDocuments = selectedTrip.documents.filter((document) => document.status !== "ready").length;
    return openTasks + emptyPlanDays + pendingReservations + pendingDocuments;
  }, [plannedItineraryDays, selectedTrip]);

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
    const normalizedSection = section === "preparation" ? "tasks" : section;
    if (isCanonicalTravelRoute && tripId) {
      const routeSection = TRAVEL_SECTION_ROUTE[normalizedSection as TravelSection] ?? normalizedSection;
      navigate(routeSection === "overview" ? `/travel/${tripId}` : `/travel/${tripId}/${routeSection}`);
      return;
    }
    if (embedded) {
      const next = new URLSearchParams();
      next.set("widok", "travel");
      if (tripId) next.set("podroz", tripId);
      if (normalizedSection !== "overview") next.set("sekcja", normalizedSection);
      setSearchParams(next);
      return;
    }
    if (normalizedSection === "overview") setSearchParams({});
    else setSearchParams({ sekcja: normalizedSection });
  };

  const selectTrip = (id: string) => {
    if (embedded) {
      const next = new URLSearchParams(searchParams);
      next.set("widok", "travel");
      next.set("podroz", id);
      navigate(`/sprawy?${next.toString()}`);
      return;
    }
    if (isCanonicalTravelRoute) {
      const routeSection = TRAVEL_SECTION_ROUTE[activeSection] ?? activeSection;
      navigate(`/travel/${id}${activeSection === "overview" ? "" : `/${routeSection}`}`);
    } else {
      navigate(`/podroze/${id}`);
    }
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
    navigate(isCanonicalTravelRoute ? "/travel/overview" : "/podroze");
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

  const openTaskEditor = (task?: TravelTask, defaultCategory: TravelTaskCategory = "other") => {
    setDraft(task ? {
      ...EMPTY_DRAFT,
      name: task.title,
      taskCategory: task.category,
      dueDate: task.dueDate,
    } : { ...EMPTY_DRAFT, taskCategory: defaultCategory });
    setEditorError("");
    setEditor({ kind: "task", mode: task ? "edit" : "add", id: task?.id });
  };

  const closeEditor = () => {
    setEditor(null);
    setEditorError("");
  };
  const editorDraftProtection = useDraftProtection({
    active: Boolean(editor),
    isDirty: Boolean(editor) && JSON.stringify(draft) !== JSON.stringify(editorBaseline),
    draft,
    storageKey: editorDraftKey,
    onDiscard: closeEditor,
  });

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
      editorDraftProtection.clearDraft();
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

    editorDraftProtection.clearDraft();
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

  const openTravelDetail = (detail: TravelItemDetail) => {
    setTravelItemDetail(detail);
  };

  const renderTravelTask = (task: TravelTask) => (
    <article
      key={task.id}
      className={`travel-task-row ${task.completed ? "is-completed" : ""}`}
      role="button"
      tabIndex={0}
      onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) openTravelDetail({ kind: "task", id: task.id, title: task.title }); }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openTravelDetail({ kind: "task", id: task.id, title: task.title }); }}
    >
      <button
        type="button"
        className="travel-check"
        aria-label={task.completed ? `Przywróć ${task.title}` : `Oznacz jako zrobione: ${task.title}`}
        aria-pressed={task.completed}
        onClick={() => toggleTask(task)}
      >
        {task.completed && <Check size={11} />}
      </button>
      <span className="travel-task-row__copy">
        <strong>{task.title}</strong>
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
            href: `/podroze/${encodeURIComponent(selectedTrip?.id ?? "")}?sekcja=${task.category === "packing" ? "packing" : "tasks"}`,
            },
            text: task.title,
            done: task.completed,
            calendarDate: task.dueDate || undefined,
            date: task.dueDate || undefined,
            list: "podroze",
            tags: ["podroze"],
          }}
        />
        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj zadanie „${task.title}”`} onClick={() => openTaskEditor(task)}><Pencil size={13} /></Button>
        <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń zadanie „${task.title}”`} onClick={() => setDeleteState({ kind: "task", id: task.id, label: task.title })}><Trash2 size={13} /></Button>
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
              : `${editor?.mode === "edit" ? "Edytuj" : "Nowe"} zadanie`;

  const editorCreateLabel = editor?.kind === "trip"
    ? "Dodaj podróż"
    : editor?.kind === "itinerary"
      ? "Dodaj punkt planu"
      : editor?.kind === "stay"
        ? "Dodaj nocleg"
        : editor?.kind === "transport"
          ? "Dodaj transport"
          : editor?.kind === "budget"
            ? "Dodaj pozycję budżetu"
            : editor?.kind === "document"
              ? "Dodaj dokument"
              : "Dodaj zadanie";

  const editorSubmitLabel = editor?.mode === "edit"
    ? editorCreateLabel.replace(/^Dodaj /, "Zapisz ")
    : editorCreateLabel;

  const deleteEntityLabel = deleteState?.kind === "itinerary"
    ? "punkt planu"
    : deleteState?.kind === "stay"
      ? "nocleg"
      : deleteState?.kind === "transport"
        ? "transport"
        : deleteState?.kind === "budget"
          ? "pozycję budżetu"
          : deleteState?.kind === "document"
            ? "dokument"
            : "zadanie";

  const renderTripNavigation = (trip: TravelTrip, archived = false) => {
    const expanded = selectedTrip?.id === trip.id || (!selectedTrip && nearestTrip?.id === trip.id);
    const sectionNavigationId = `travel-sections-${trip.id}`;
    return (
      <div key={trip.id} className={`travel-sidebar__trip ${expanded ? "is-expanded" : ""}`}>
        <ContextNavItem
          active={Boolean(selectedTrip?.id === trip.id && activeSection === "overview")}
          aria-expanded={expanded}
          aria-controls={expanded ? sectionNavigationId : undefined}
          icon={archived ? <Check /> : <MapPin />}
          label={trip.name}
          meta={archived ? new Date(`${trip.startDate}T12:00:00`).getFullYear() : formatDate(trip.startDate, false)}
          onClick={() => selectTrip(trip.id)}
        />
        {expanded && (
          <div
            id={sectionNavigationId}
            className="travel-sidebar__sections"
            aria-label={`Sekcje podróży: ${trip.name}`}
          >
            {TRAVEL_SECTION_ITEMS.filter((item) => item.id !== "overview").map((item) => (
              <ContextNavItem
                key={item.id}
                depth={1}
                active={activeSection === item.id}
                label={item.label}
                title={item.label}
                onClick={() => setSection(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const contextSidebar = (
    <ModuleSidebar label="Podróże" className="travel-sidebar">
      <div className="travel-sidebar__nav">
        <p className="travel-sidebar__label">Wyjazdy</p>
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
            {upcomingTrips.map((trip) => renderTripNavigation(trip))}
          </>
        )}
        {completedTrips.length > 0 && (
          <>
            <p className="travel-sidebar__label travel-sidebar__label--spaced">Archiwum</p>
            {completedTrips.map((trip) => renderTripNavigation(trip, true))}
          </>
        )}
      </div>
      <div className="travel-sidebar__footer">
        <MapIcon size={13} aria-hidden="true" />
        <span>Dane zapisują się lokalnie</span>
      </div>
    </ModuleSidebar>
  );

  const primaryTripAction = activeSection === "itinerary"
    ? { label: "Punkt planu", onClick: () => openItineraryEditor() }
    : activeSection === "reservations"
      ? { label: "Rezerwacja", onClick: () => openStayEditor() }
      : activeSection === "budget"
        ? { label: "Pozycja", onClick: () => openBudgetEditor() }
        : activeSection === "documents"
          ? { label: "Dokument", onClick: () => openDocumentEditor() }
          : activeSection === "packing"
            ? { label: "Element", onClick: () => openTaskEditor(undefined, "packing") }
            : { label: "Sprawa", onClick: () => openTaskEditor(undefined, "other") };

  const tripActionsMenu = selectedTrip && (
    <div className="travel-trip-menu">
      <Button
        ref={tripMenuTriggerRef}
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Więcej opcji podróży"
        aria-haspopup="menu"
        aria-expanded={tripMenuOpen}
        aria-controls="travel-trip-actions-menu"
        onClick={() => setTripMenuOpen((open) => !open)}
      >
        <Ellipsis size={16} />
      </Button>
      {tripMenuOpen && (
        <Menu
          id="travel-trip-actions-menu"
          triggerRef={tripMenuTriggerRef}
          onDismiss={() => setTripMenuOpen(false)}
          layer="detail"
          className="travel-trip-menu__panel"
        >
          <MenuItem leadingIcon={<Pencil size={13} />} onClick={() => { setTripMenuOpen(false); openTripEditor(selectedTrip); }}>Edytuj podróż</MenuItem>
          <MenuItem leadingIcon={<Download size={13} />} onClick={() => { setTripMenuOpen(false); exportTrip(selectedTrip); }}>Eksportuj dane</MenuItem>
          {selectedTrip.archivedAt ? (
            <MenuItem leadingIcon={<ArchiveRestore size={13} />} onClick={() => { setTripMenuOpen(false); restoreArchivedTrip(selectedTrip); }}>Przywróć z archiwum</MenuItem>
          ) : (
            <MenuItem leadingIcon={<Archive size={13} />} onClick={() => { setTripMenuOpen(false); setTripActionState({ kind: "archive", trip: selectedTrip }); }}>Archiwizuj podróż</MenuItem>
          )}
          <MenuItem tone="danger" leadingIcon={<Trash2 size={13} />} onClick={() => { setTripMenuOpen(false); setTripActionState({ kind: "delete", trip: selectedTrip }); }}>Usuń podróż</MenuItem>
        </Menu>
      )}
    </div>
  );

  const tripHeaderActions = selectedTrip ? (
    <>
      <Button variant="primary" leadingIcon={<Plus size={13} />} onClick={primaryTripAction.onClick}>{primaryTripAction.label}</Button>
      {tripActionsMenu}
    </>
  ) : (
    <Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openTripEditor()}>
      Dodaj podróż
    </Button>
  );

  const tripDetailPanelContent = selectedTrip && activeSection === "overview" && tripDetailPanel ? (
    <DetailPanel
      label={tripDetailPanel === "summary" ? "Podsumowanie podróży" : "Elementy do uzupełnienia"}
      className="travel-detail-panel"
      onDismiss={() => setTripDetailPanel(null)}
    >
      <header className="travel-detail-panel__header">
        <div>
          <h2>{tripDetailPanel === "summary" ? "Podsumowanie" : "Co zostało do zrobienia"}</h2>
          <p>{selectedTrip.name}</p>
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij szczegóły" onClick={() => setTripDetailPanel(null)}>
          <X size={13} />
        </Button>
      </header>

      {tripDetailPanel === "incomplete" ? (
        <div className="travel-detail-panel__body">
          <p className="travel-detail-panel__intro">Szczegółowy stan elementów podróży. Wybierz kategorię, aby przejść do jej widoku.</p>
          <div className="travel-detail-panel__items">
            {readinessParts(selectedTrip).map((part) => (
              <button
                key={part.id}
                type="button"
                className="travel-detail-panel__item"
                onClick={() => {
                  setTripDetailPanel(null);
                  setSection(part.id);
                }}
              >
                <span>
                  <strong>{part.label}</strong>
                  <small>{part.meta === "0/0" ? "Brak elementów" : part.meta}</small>
                </span>
                <span className={part.value >= 1 ? "travel-detail-panel__status is-ready" : "travel-detail-panel__status"}>
                  {part.value >= 1 ? "Gotowe" : "Do uzupełnienia"}
                </span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="travel-detail-panel__body">
          <dl className="travel-detail-panel__facts">
            <div><dt>Rezerwacje</dt><dd>{reservationSummary.secured}/{reservationSummary.total}</dd></div>
            <div><dt>Wydano</dt><dd><PrivateMoney value={budgetSummary.actual} currency={selectedTrip.baseCurrency} label="Wydano na podróż" /></dd></div>
            <div><dt>Budżet</dt><dd><PrivateMoney value={budgetSummary.planned} currency={selectedTrip.baseCurrency} label="Budżet podróży" /></dd></div>
            <div><dt>Pozostało</dt><dd className={budgetSummary.remaining < 0 ? "is-negative" : ""}><PrivateMoney value={budgetSummary.remaining} currency={selectedTrip.baseCurrency} label="Pozostały budżet" /></dd></div>
          </dl>

          <section className="travel-detail-panel__section">
            <h3>Rezerwacje</h3>
            {[...selectedTrip.stays.map((stay) => ({
              id: stay.id,
              title: stay.name,
              meta: `${stay.city} · ${formatDate(stay.checkIn, false)} — ${formatDate(stay.checkOut, false)}`,
              status: RESERVATION_STATUS_LABELS[stay.status],
            })), ...selectedTrip.transports.map((transport) => ({
              id: transport.id,
              title: transport.title,
              meta: `${transport.from} → ${transport.to} · ${formatDateTime(transport.departure)}`,
              status: RESERVATION_STATUS_LABELS[transport.status],
            }))].map((reservation) => (
              <div key={reservation.id} className="travel-detail-panel__row">
                <span><strong>{reservation.title}</strong><small>{reservation.meta}</small></span>
                <em>{reservation.status}</em>
              </div>
            ))}
            {reservationSummary.total === 0 && <p className="travel-detail-panel__empty">Brak zapisanych rezerwacji.</p>}
          </section>

          <section className="travel-detail-panel__section">
            <h3>Budżet</h3>
            {selectedTrip.budget.map((line) => (
              <div key={line.id} className="travel-detail-panel__row">
                <span><strong>{line.label}</strong><small>{BUDGET_CATEGORY_LABELS[line.category]} · plan</small></span>
                <em><PrivateMoney value={line.planned} currency={selectedTrip.baseCurrency} label={`Plan: ${line.label}`} /></em>
              </div>
            ))}
            {selectedTrip.budget.length === 0 && <p className="travel-detail-panel__empty">Brak pozycji budżetu.</p>}
          </section>

          <div className="travel-detail-panel__footer">
            <Button variant="quiet" onClick={() => { setTripDetailPanel(null); setSection("reservations"); }}>Otwórz rezerwacje</Button>
            <Button variant="quiet" onClick={() => { setTripDetailPanel(null); setSection("budget"); }}>Otwórz budżet</Button>
          </div>
        </div>
      )}
    </DetailPanel>
  ) : undefined;

  const openTravelItemEditor = () => {
    if (!travelItemDetail) return;
    const { kind, id } = travelItemDetail;
    if (kind === "itinerary") openItineraryEditor(selectedTrip?.itinerary.find((item) => item.id === id));
    if (kind === "stay") openStayEditor(selectedTrip?.stays.find((item) => item.id === id));
    if (kind === "transport") openTransportEditor(selectedTrip?.transports.find((item) => item.id === id));
    if (kind === "budget") openBudgetEditor(selectedTrip?.budget.find((item) => item.id === id));
    if (kind === "document") openDocumentEditor(selectedTrip?.documents.find((item) => item.id === id));
    if (kind === "task") openTaskEditor(selectedTrip?.tasks.find((item) => item.id === id));
    setTravelItemDetail(null);
  };

  const travelItemDetailPanelContent = selectedTrip && travelItemDetail ? (() => {
    let meta = "Szczegóły elementu podróży";
    if (travelItemDetail.kind === "itinerary") {
      const item = selectedTrip.itinerary.find((entry) => entry.id === travelItemDetail.id);
      meta = item ? `${formatDate(item.date)} · ${item.time || "Bez godziny"}${item.location ? ` · ${item.location}` : ""}` : meta;
    } else if (travelItemDetail.kind === "stay") {
      const item = selectedTrip.stays.find((entry) => entry.id === travelItemDetail.id);
      meta = item ? `${item.city || "Nocleg"} · ${formatDate(item.checkIn, false)} — ${formatDate(item.checkOut, false)}` : meta;
    } else if (travelItemDetail.kind === "transport") {
      const item = selectedTrip.transports.find((entry) => entry.id === travelItemDetail.id);
      meta = item ? `${item.from || "—"} → ${item.to || "—"} · ${formatDateTime(item.departure)}` : meta;
    } else if (travelItemDetail.kind === "budget") {
      const item = selectedTrip.budget.find((entry) => entry.id === travelItemDetail.id);
      meta = item ? `${BUDGET_CATEGORY_LABELS[item.category]} · Pozycja budżetu` : meta;
    } else if (travelItemDetail.kind === "document") {
      const item = selectedTrip.documents.find((entry) => entry.id === travelItemDetail.id);
      meta = item ? `${item.owner} · ${DOCUMENT_STATUS_LABELS[item.status]}` : meta;
    } else if (travelItemDetail.kind === "task") {
      const item = selectedTrip.tasks.find((entry) => entry.id === travelItemDetail.id);
      meta = item ? `${TASK_CATEGORY_LABELS[item.category]} · ${item.dueDate ? formatDate(item.dueDate) : "Bez terminu"}` : meta;
    }
    return (
      <DetailPanel
        label={`Szczegóły: ${travelItemDetail.title}`}
        className="travel-detail-panel"
        onDismiss={() => setTravelItemDetail(null)}
      >
        <header className="travel-detail-panel__header">
          <div>
            <h2>{travelItemDetail.title}</h2>
            <p>{meta}</p>
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij szczegóły" onClick={() => setTravelItemDetail(null)}>
            <X size={13} />
          </Button>
        </header>
        <div className="travel-detail-panel__body">
          <p className="travel-detail-panel__intro">Szczegóły pozostają w panelu bocznym, żeby główny plan podróży był spokojny i czytelny.</p>
          <div className="travel-detail-panel__footer">
            <Button variant="quiet" onClick={openTravelItemEditor}>Edytuj</Button>
            <Button variant="ghost" onClick={() => {
              setTravelItemDetail(null);
              setDeleteState({ kind: travelItemDetail.kind, id: travelItemDetail.id, label: travelItemDetail.title });
            }}>Usuń</Button>
          </div>
        </div>
      </DetailPanel>
    );
  })() : undefined;

  const detailPanelContent = tripDetailPanelContent ?? travelItemDetailPanelContent;

  const visibleTravelTasks = selectedTrip?.tasks.filter((task) => (
    activeSection === "packing" ? task.category === "packing" : task.category !== "packing"
  )) ?? [];

  const packingGroups = [
    { label: "Dokumenty", tasks: visibleTravelTasks.filter((task) => /dokument|paszport|dowód|bilet|rezerw/i.test(task.title)) },
    { label: "Ubrania", tasks: visibleTravelTasks.filter((task) => /ubran|kurt|but|koszul|spod/i.test(task.title)) },
    { label: "Elektronika", tasks: visibleTravelTasks.filter((task) => /adapter|ładow|kabel|telefon|aparat|elektr/i.test(task.title)) },
    { label: "Pozostałe", tasks: visibleTravelTasks.filter((task) => !/dokument|paszport|dowód|bilet|rezerw|ubran|kurt|but|koszul|spod|adapter|ładow|kabel|telefon|aparat|elektr/i.test(task.title)) },
  ];

  const renderOverviewTripRow = (trip: TravelTrip) => {
    const tripBudget = summarizeTravelBudget(trip);
    const completed = trip.status === "completed" || Boolean(trip.archivedAt);
    return (
      <button
        key={trip.id}
        type="button"
        className={`travel-board__row ${completed ? "is-completed" : ""}`}
        onClick={() => selectTrip(trip.id)}
      >
        <span className="travel-board__trip">
          <i className={`travel-board__status travel-board__status--${trip.status}`} />
          <span>
            <strong>{trip.name}</strong>
            <small>{trip.destination}</small>
          </span>
        </span>
        <span className="travel-board__date">
          <strong>{formatTripDateRange(trip)}</strong>
        </span>
        <span className="travel-board__next">
          {!completed && <strong>{overviewNextAction(trip)}</strong>}
          <small>{completed ? "Zakończona" : tripCountdown(trip)}</small>
        </span>
        <span className="travel-board__money">
          <strong>
            <PrivateMoney value={tripBudget.actual} currency={trip.baseCurrency} label={`Wydano na podróż: ${trip.name}`} />
            <span aria-hidden="true"> / </span>
            <PrivateMoney value={tripBudget.planned} currency={trip.baseCurrency} label={`Budżet podróży: ${trip.name}`} />
          </strong>
        </span>
        <ChevronRight size={13} aria-hidden="true" />
      </button>
    );
  };

  const remainingUpcomingTrips = remainingTrips.filter((trip) => !trip.archivedAt && trip.status !== "completed");
  const remainingCompletedTrips = remainingTrips.filter((trip) => trip.archivedAt || trip.status === "completed");

  const mobileSectionOptions = TRAVEL_SECTION_ITEMS.map((item) => ({ value: item.id, label: item.label }));

  const pageContent = (
    <>
      <ModuleMain>
        <ContentHeader
          headingLevel={1}
          className="travel-toolbar"
          title={selectedTrip?.name ?? "Przegląd"}
          description={selectedTrip
            ? <span className="travel-trip-header__details"><span>{selectedTrip.destination}</span><span><CalendarDays size={13} aria-hidden="true" />{tripDateRangeLabel}</span></span>
            : "Zaplanowane i zakończone wyjazdy"}
          mobileNavigation={embeddedViewSelect}
          meta={<>
            {storageError && <Badge tone="danger">Brak zapisu lokalnego</Badge>}
            {selectedTrip && <Badge tone={selectedTripStatusTone}>{selectedTripStatusLabel}</Badge>}
            {selectedTrip?.archivedAt && <Badge tone="neutral">W archiwum</Badge>}
          </>}
          actions={<>
            {!selectedTrip && <Select
              compact
              aria-label="Filtr podróży"
              value={statusFilter}
              options={[
                { value: "upcoming", label: "Nadchodzące" },
                { value: "all", label: "Wszystkie" },
                { value: "completed", label: "Zakończone" },
                { value: "archived", label: "Archiwum" },
              ]}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            />}
            {tripHeaderActions}
          </>}
          controls={selectedTrip ? <>
            <div className="travel-toolbar__section-select">
              <Select
                compact
                aria-label="Wybierz sekcję podróży"
                value={activeSection}
                options={mobileSectionOptions}
                onChange={(event) => setSection(event.target.value as TravelSection)}
              />
            </div>
          </> : undefined}
        />

        {!selectedTrip ? (
          <section className="travel-overview" aria-label="Przegląd podróży">
            {deletedTripUndo && (
              <ToastViewport>
                <Toast actionLabel="Cofnij" onAction={undoTripDelete} onDismiss={() => setDeletedTripUndo(null)}>
                  Usunięto podróż „{deletedTripUndo.name}”.
                </Toast>
              </ToastViewport>
            )}
            {filteredTrips.length === 0 ? (
              <EmptyState
                icon={<MapIcon size={18} />}
                title="Nie masz jeszcze żadnych podróży"
                description="Zaplanuj pierwszy wyjazd i trzymaj w jednym miejscu plan, rezerwacje, dokumenty oraz budżet."
                action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openTripEditor()}>Dodaj podróż</Button>}
              />
            ) : (
              <>
                {showNearestTrip && nearestTrip && (
                  <button type="button" className="travel-next-departure" onClick={() => selectTrip(nearestTrip.id)}>
                    <span className="travel-next-departure__marker"><Plane size={16} /></span>
                    <span className="travel-next-departure__identity">
                      <small>Najbliższy wyjazd</small>
                      <strong>{nearestTrip.name}</strong>
                      <span>{nearestTrip.destination}</span>
                    </span>
                    <span className="travel-next-departure__date">
                      <small>Termin</small>
                      <strong>{formatTripDateRange(nearestTrip)}</strong>
                    </span>
                    <span className="travel-next-departure__action">
                      <small>Następny krok</small>
                      <strong>{overviewNextAction(nearestTrip)} · {tripCountdown(nearestTrip).replace(/^Za /, "za ")}</strong>
                      <span className="travel-next-departure__open">Otwórz podróż</span>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                )}

                {remainingTrips.length > 0 && (
                  <section className="travel-board" aria-labelledby="travel-remaining-trips-title">
                    <div className="travel-board__heading">
                      <div>
                        <MapIcon size={13} aria-hidden="true" />
                        <h2 id="travel-remaining-trips-title">{showNearestTrip ? "Pozostałe podróże" : "Podróże"}</h2>
                      </div>
                      <span>{remainingTrips.length} {remainingTrips.length === 1 ? "podróż" : "podróże"}</span>
                    </div>
                    {statusFilter === "all" && remainingUpcomingTrips.length > 0 && (
                      <div className="travel-board__group">
                        <h3>Nadchodzące</h3>
                        {remainingUpcomingTrips.map(renderOverviewTripRow)}
                      </div>
                    )}
                    {statusFilter === "all" && remainingCompletedTrips.length > 0 && (
                      <div className="travel-board__group">
                        <h3>Zakończone</h3>
                        {remainingCompletedTrips.map(renderOverviewTripRow)}
                      </div>
                    )}
                    {statusFilter !== "all" && remainingTrips.map(renderOverviewTripRow)}
                  </section>
                )}
              </>
            )}
          </section>
        ) : (
          <section
            id={`travel-panel-${activeSection}`}
            aria-label={SECTION_COPY[activeSection]}
            className="travel-canvas"
          >
            {activeSection === "overview" && (
              <div className="travel-trip-overview">
              <button type="button" className="travel-next-step" onClick={() => setTripDetailPanel("incomplete")}>
                  <span className="travel-next-step__marker"><Check size={15} aria-hidden="true" /></span>
                  <span className="travel-next-step__copy">
                    <small>Następny krok</small>
                    <strong>{nextAction(selectedTrip)} · {nextStepTiming}</strong>
                  </span>
                  {unfinishedTripItems > 0 && (
                    <span className="travel-next-step__pending">
                      <span>{unfinishedTripItems} {unfinishedTripItems === 1 ? "rzecz do uzupełnienia" : "rzeczy do uzupełnienia"}</span>
                      <ChevronRight size={15} aria-hidden="true" />
                    </span>
                  )}
                </button>

                <div className="travel-trip-overview__columns">
                  <section className="travel-panel travel-panel--agenda" aria-labelledby="travel-nearest-points-title">
                    <header>
                      <h2 id="travel-nearest-points-title">Najbliższe punkty</h2>
                      <button type="button" onClick={() => setSection("itinerary")}>Pełny plan</button>
                    </header>
                    <div>
                      {selectedTrip.itinerary
                        .slice()
                        .sort((a, b) => `${a.date}-${a.time || "99:99"}`.localeCompare(`${b.date}-${b.time || "99:99"}`))
                        .slice(0, 4)
                        .map((item) => (
                          <button key={item.id} type="button" className="travel-agenda-row" onClick={() => openTravelDetail({ kind: "itinerary", id: item.id, title: item.title })}>
                            <span className="travel-agenda-row__date">
                              <strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString("pl-PL", { day: "2-digit" })}</strong>
                              <small>{new Date(`${item.date}T12:00:00`).toLocaleDateString("pl-PL", { month: "short" })}</small>
                            </span>
                            <span className={`travel-agenda-row__dot travel-agenda-row__dot--${item.kind}`} aria-hidden="true" />
                            <span className="travel-agenda-row__copy">
                              <strong>{item.title}</strong>
                              <small>{item.time || "Bez godziny"}{item.location ? ` · ${item.location}` : ""}</small>
                            </span>
                          </button>
                        ))}
                      {selectedTrip.itinerary.length === 0 && (
                        <p className="travel-panel__empty">Plan jest pusty. Dodaj pierwszy dzień i atrakcję.</p>
                      )}
                    </div>
                  </section>

                  <button type="button" className="travel-overview-summary" aria-label="Otwórz szczegóły rezerwacji i budżetu" onClick={() => setTripDetailPanel("summary")}>
                    <span className="travel-overview-summary__heading"><h2>Podsumowanie</h2><ChevronRight size={15} aria-hidden="true" /></span>
                    <dl>
                      <div><dt>Rezerwacje</dt><dd>{reservationSummary.secured}/{reservationSummary.total}</dd></div>
                      <div><dt>Wydano</dt><dd><PrivateMoney value={budgetSummary.actual} currency={selectedTrip.baseCurrency} label="Wydano na podróż" /></dd></div>
                      <div><dt>Budżet</dt><dd><PrivateMoney value={budgetSummary.planned} currency={selectedTrip.baseCurrency} label="Budżet podróży" /></dd></div>
                      <div><dt>Pozostało</dt><dd className={budgetSummary.remaining < 0 ? "is-negative" : ""}><PrivateMoney value={budgetSummary.remaining} currency={selectedTrip.baseCurrency} label="Pozostały budżet" /></dd></div>
                    </dl>
                  </button>
                </div>
              </div>
            )}

            {activeSection === "itinerary" && (
              <div className="travel-itinerary">
                <div className="travel-section-intro">
                  <div>
                    <h2>Plan podróży</h2>
                    <p>{plannedItineraryDays} z {tripDuration(selectedTrip)} dni ma już zapisany plan.</p>
                  </div>
                </div>
                {selectedTrip.itinerary.length === 0 ? (
                  <EmptyState
                    icon={<CalendarDays size={18} />}
                    title="Zacznij od pierwszego dnia"
                    description="Dodaj przejazd, atrakcję, posiłek albo czas na odpoczynek."
                    action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openItineraryEditor()}>Dodaj punkt planu</Button>}
                  />
                ) : (
                  <div className="travel-day-list">
                    {itineraryDays.map(({ date, items, dayNumber }) => (
                      <section key={date} className="travel-day">
                        <header>
                          <span><strong>{new Date(date + "T12:00:00").toLocaleDateString("pl-PL", { weekday: "short" })}</strong><small>Dzień {dayNumber}</small></span>
                          <div>
                            <h3>{formatDate(date)}</h3>
                            <p>{items.map((item) => item.location).filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).slice(0, 2).join(" · ") || (items.length ? "Bez lokalizacji" : "Brak punktów planu")}</p>
                          </div>
                          <Button variant="ghost" size="sm" leadingIcon={<Plus size={13} />} onClick={() => {
                            openItineraryEditor();
                            setDraft((current) => ({ ...current, date }));
                          }}>Dodaj</Button>
                        </header>
                        <div>
                          {items.length === 0 && <p className="travel-day__empty">Ten dzień jest jeszcze pusty.</p>}
                          {items.map((item) => (
                            <article
                              key={item.id}
                              className="travel-plan-row"
                              role="button"
                              tabIndex={0}
                              onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) openTravelDetail({ kind: "itinerary", id: item.id, title: item.title }); }}
                              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openTravelDetail({ kind: "itinerary", id: item.id, title: item.title }); }}
                            >
                              <span className="travel-plan-row__time">{item.time || "—"}</span>
                              <span className={`travel-plan-row__signal travel-plan-row__signal--${item.kind}`} />
                              <span className="travel-plan-row__copy">
                                <strong>{item.title}</strong>
                                <small>{item.location || ITINERARY_KIND_LABELS[item.kind]}{item.note ? ` · ${item.note}` : ""}</small>
                              </span>
                              <span className="travel-row-actions">
                                <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj punkt planu „${item.title}”`} onClick={() => openItineraryEditor(item)}><Pencil size={13} /></Button>
                                <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń punkt planu „${item.title}”`} onClick={() => setDeleteState({ kind: "itinerary", id: item.id, label: item.title })}><Trash2 size={13} /></Button>
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
                <div className="travel-section-intro">
                  <div><h2>Rezerwacje</h2><p>Noclegi i transport</p></div>
                </div>
                <section className="travel-register">
                  <div className="travel-register__heading">
                    <div><BedDouble size={16} /><span><h2>Noclegi</h2><p>{selectedTrip.stays.length} zapisanych miejsc</p></span></div>
                    <Button variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={() => openStayEditor()}>Nocleg</Button>
                  </div>
                  {selectedTrip.stays.length === 0 ? (
                    <EmptyState icon={<BedDouble size={18} />} title="Brak noclegów" description="Zapisz miejsce, terminy, adres i numer rezerwacji." />
                  ) : (
                    <div className="travel-stay-list">
                      {selectedTrip.stays
                        .slice()
                        .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
                        .map((stay) => (
                            <article
                              key={stay.id}
                              className="travel-stay-row"
                              role="button"
                              tabIndex={0}
                              onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) openTravelDetail({ kind: "stay", id: stay.id, title: stay.name }); }}
                              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openTravelDetail({ kind: "stay", id: stay.id, title: stay.name }); }}
                            >
                            <span className="travel-reservation-icon"><BedDouble size={16} /></span>
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
                              <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj nocleg „${stay.name}”`} onClick={() => openStayEditor(stay)}><Pencil size={13} /></Button>
                              <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń nocleg „${stay.name}”`} onClick={() => setDeleteState({ kind: "stay", id: stay.id, label: stay.name })}><Trash2 size={13} /></Button>
                            </span>
                          </article>
                        ))}
                    </div>
                  )}
                </section>

                <section className="travel-register">
                  <div className="travel-register__heading">
                    <div><Plane size={16} /><span><h2>Transport</h2><p>{selectedTrip.transports.length} zapisanych odcinków</p></span></div>
                    <Button variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={() => openTransportEditor()}>Transport</Button>
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
                            <article
                              key={transport.id}
                              className="travel-transport-row"
                              role="button"
                              tabIndex={0}
                              onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) openTravelDetail({ kind: "transport", id: transport.id, title: transport.title }); }}
                              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openTravelDetail({ kind: "transport", id: transport.id, title: transport.title }); }}
                            >
                              <span className="travel-reservation-icon"><Icon size={16} /></span>
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
                                <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj transport „${transport.title}”`} onClick={() => openTransportEditor(transport)}><Pencil size={13} /></Button>
                                <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń transport „${transport.title}”`} onClick={() => setDeleteState({ kind: "transport", id: transport.id, label: transport.title })}><Trash2 size={13} /></Button>
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
                <div className="travel-section-intro">
                  <div><h2>Budżet</h2><p>Planowane i rzeczywiste wydatki</p></div>
                </div>
                <section className="travel-budget-summary" aria-label="Podsumowanie budżetu">
                  <div><span>Budżet</span><strong><PrivateMoney value={budgetSummary.planned} currency={selectedTrip.baseCurrency} label="Planowany budżet podróży" /></strong></div>
                  <div><span>Wydano</span><strong><PrivateMoney value={budgetSummary.actual} currency={selectedTrip.baseCurrency} label="Rzeczywiste wydatki podróży" /></strong></div>
                  <div><span>Pozostało</span><strong className={budgetSummary.remaining < 0 ? "is-negative" : ""}><PrivateMoney value={budgetSummary.remaining} currency={selectedTrip.baseCurrency} label="Pozostały budżet" /></strong></div>
                  <div><span>Pozycje</span><strong>{selectedTrip.budget.length}</strong></div>
                </section>
                <section className="travel-budget-register">
                  <div className="travel-budget-register__head">
                    <span>Kategoria</span><span>Plan</span><span>Rzeczywiście</span><span>Pozostało</span><span />
                  </div>
                  {selectedTrip.budget.map((line) => (
                    <article
                      key={line.id}
                      className="travel-budget-row"
                      role="button"
                      tabIndex={0}
                      onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) openTravelDetail({ kind: "budget", id: line.id, title: line.label }); }}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openTravelDetail({ kind: "budget", id: line.id, title: line.label }); }}
                    >
                      <span className="travel-budget-row__identity">
                        <strong>{line.label}</strong>
                        <small>{BUDGET_CATEGORY_LABELS[line.category]}</small>
                      </span>
                      <span className="travel-budget-row__value"><PrivateMoney value={line.planned} currency={selectedTrip.baseCurrency} label={`Planowana kwota: ${line.label}`} /></span>
                      <span className="travel-budget-row__value"><PrivateMoney value={line.actual} currency={selectedTrip.baseCurrency} label={`Rzeczywista kwota: ${line.label}`} /></span>
                      <span className={`travel-budget-row__value ${line.planned - line.actual < 0 ? "is-negative" : ""}`}><PrivateMoney value={line.planned - line.actual} currency={selectedTrip.baseCurrency} label={`Pozostała kwota: ${line.label}`} /></span>
                      <span className="travel-row-actions">
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj pozycję budżetu „${line.label}”`} onClick={() => openBudgetEditor(line)}><Pencil size={13} /></Button>
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń pozycję budżetu „${line.label}”`} onClick={() => setDeleteState({ kind: "budget", id: line.id, label: line.label })}><Trash2 size={13} /></Button>
                      </span>
                    </article>
                  ))}
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
                  <div><h2>Dokumenty</h2><p>Najważniejsze dokumenty na wyjazd</p></div>
                  <Badge tone={selectedTrip.documents.every((item) => item.status === "ready") ? "success" : "warning"}>
                    {selectedTrip.documents.filter((item) => item.status === "ready").length}/{selectedTrip.documents.length} dodanych
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
                      <article
                        key={document.id}
                        className="travel-document-row"
                        role="button"
                        tabIndex={0}
                        onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) openTravelDetail({ kind: "document", id: document.id, title: document.name }); }}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openTravelDetail({ kind: "document", id: document.id, title: document.name }); }}
                      >
                        <span className="travel-document-row__identity">
                          <FileText size={13} />
                          <span><strong>{document.name}</strong><small>{document.note || "Bez dodatkowych uwag"}</small></span>
                        </span>
                        <span className="travel-document-row__owner">{document.owner}</span>
                        <span className={`travel-document-row__date ${document.expiresAt && document.expiresAt < selectedTrip.startDate ? "is-danger" : ""}`}>
                          <strong>{document.expiresAt ? formatDate(document.expiresAt) : "Nie dotyczy"}</strong>
                          {document.expiresAt && document.expiresAt < selectedTrip.startDate && <small>Wygasa przed wyjazdem</small>}
                          {document.expiresAt && document.expiresAt >= selectedTrip.startDate && daysUntil(document.expiresAt) < 30 && <small>Wygasa wkrótce</small>}
                        </span>
                        <button type="button" className="travel-status-button" title="Zmień status dokumentu" onClick={() => cycleDocumentStatus(document)}>
                          <Badge tone={DOCUMENT_STATUS_TONES[document.status]}>{DOCUMENT_STATUS_LABELS[document.status]}</Badge>
                        </button>
                        <span className="travel-row-actions">
                          <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj dokument „${document.name}”`} onClick={() => openDocumentEditor(document)}><Pencil size={13} /></Button>
                          <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń dokument „${document.name}”`} onClick={() => setDeleteState({ kind: "document", id: document.id, label: document.name })}><Trash2 size={13} /></Button>
                        </span>
                      </article>
                    ))}
                  </section>
                )}
              </div>
            )}

            {(activeSection === "tasks" || activeSection === "packing") && (
              <div className="travel-tasks">
                <div className="travel-section-intro">
                  <div>
                    <h2>{activeSection === "packing" ? "Pakowanie" : "Sprawy do załatwienia"}</h2>
                    <p>{activeSection === "packing" ? "Lista rzeczy na 4 dni" : "Rzeczy, które trzeba zrobić przed wyjazdem"}</p>
                  </div>
                  {activeSection === "tasks" && <Badge tone="primary">{visibleTravelTasks.filter((item) => !item.completed).length} otwartych</Badge>}
                </div>
                {visibleTravelTasks.length === 0 && activeSection !== "packing" ? (
                  <EmptyState
                    icon={<ListChecks size={18} />}
                    title="Brak spraw przed wyjazdem"
                    description="Dodaj pierwszą sprawę z kategorią i terminem."
                    action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openTaskEditor(undefined, "other")}>Dodaj sprawę</Button>}
                  />
                ) : activeSection === "packing" ? (
                  <div className="travel-packing-groups">
                    {packingGroups.map((group) => (
                      <section key={group.label} className="travel-packing-group">
                        <h3>{group.label}</h3>
                        {group.tasks.length > 0
                          ? group.tasks
                            .slice()
                            .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
                            .map(renderTravelTask)
                          : <p className="travel-packing-group__empty">Brak elementów</p>}
                      </section>
                    ))}
                  </div>
                ) : (
                  <section className="travel-task-register">
                    {visibleTravelTasks
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
          onClose={editorDraftProtection.requestClose}
          size={editor.kind === "trip" || editor.kind === "transport" ? "md" : "sm"}
          footer={(
            <>
              <Button variant="ghost" onClick={editorDraftProtection.requestClose}>Anuluj</Button>
              <Button variant="primary" type="submit" form="travel-editor-form">
                {editorSubmitLabel}
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
                  <DatePicker label="Data rozpoczęcia" value={draft.startDate} max={draft.endDate || undefined} onChange={(value) => setDraft((current) => ({ ...current, startDate: value }))} />
                  <DatePicker label="Data zakończenia" value={draft.endDate} min={draft.startDate || undefined} onChange={(value) => setDraft((current) => ({ ...current, endDate: value }))} />
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
                  <DatePicker label="Dzień" min={selectedTrip?.startDate} max={selectedTrip?.endDate} value={draft.date} onChange={(value) => setDraft((current) => ({ ...current, date: value }))} />
                  <TimePicker
                    label="Godzina"
                    value={draft.time}
                    options={HALF_HOUR_TIME_OPTIONS}
                    onChange={(value) => setDraft((current) => ({ ...current, time: value }))}
                  />
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
                <Checkbox
                  className="travel-form__check"
                  checked={draft.reserved}
                  label="Wymagana rezerwacja jest gotowa"
                  description="Bilet albo potwierdzenie zostały już zabezpieczone."
                  onChange={(event) => setDraft((current) => ({ ...current, reserved: event.target.checked }))}
                />
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
                  <DatePicker label="Zameldowanie" min={selectedTrip?.startDate} max={draft.endDate || selectedTrip?.endDate} value={draft.startDate} onChange={(value) => setDraft((current) => ({ ...current, startDate: value }))} />
                  <DatePicker label="Wymeldowanie" min={draft.startDate || selectedTrip?.startDate} max={selectedTrip?.endDate} value={draft.endDate} onChange={(value) => setDraft((current) => ({ ...current, endDate: value }))} />
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
                  <TravelDateTimeField
                    label="Odjazd / wylot"
                    min={selectedTrip ? `${selectedTrip.startDate}T00:00` : undefined}
                    max={draft.arrival || (selectedTrip ? `${selectedTrip.endDate}T23:59` : undefined)}
                    value={draft.departure}
                    onChange={(value) => setDraft((current) => ({ ...current, departure: value }))}
                  />
                  <TravelDateTimeField
                    label="Przyjazd / przylot"
                    min={draft.departure || (selectedTrip ? `${selectedTrip.startDate}T00:00` : undefined)}
                    max={selectedTrip ? `${selectedTrip.endDate}T23:59` : undefined}
                    value={draft.arrival}
                    onChange={(value) => setDraft((current) => ({ ...current, arrival: value }))}
                  />
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
                <Checkbox
                  className="travel-form__check"
                  checked={draft.paid}
                  label="Wydatek opłacony"
                  description="Kwota nie pozostaje już do zapłaty."
                  onChange={(event) => setDraft((current) => ({ ...current, paid: event.target.checked }))}
                />
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
                <DatePicker label="Ważny do (opcjonalnie)" value={draft.expiresAt} onChange={(value) => setDraft((current) => ({ ...current, expiresAt: value }))} />
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
                <DatePicker label="Termin" value={draft.dueDate} onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))} />
              </div>
            )}

            {(editor.kind === "trip" || editor.kind === "itinerary" || editor.kind === "document") && (
              <Textarea
                label="Notatka (opcjonalnie)"
                className="travel-textarea"
                value={draft.note}
                placeholder="Ważny kontekst, adres, ograniczenia albo wskazówki"
                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              />
            )}
          </form>
        </Modal>
      )}

      {editorDraftProtection.promptOpen && (
        <ConfirmDialog
          title="Odrzucić niezapisane zmiany?"
          confirmLabel="Odrzuć zmiany"
          cancelLabel="Kontynuuj edycję"
          onCancel={editorDraftProtection.keepEditing}
          onConfirm={editorDraftProtection.confirmDiscard}
        >
          <p className="travel-delete-note">Szkic pozostaje w tej karcie, dopóki go nie zapiszesz albo świadomie odrzucisz.</p>
        </ConfirmDialog>
      )}

      {deleteState && (
        <ConfirmDialog
          title={`Usunąć ${deleteEntityLabel} „${deleteState.label}”?`}
          description="Pozycja zniknie z lokalnego planu podróży."
          confirmLabel={`Usuń ${deleteEntityLabel}`}
          onCancel={() => setDeleteState(null)}
          onConfirm={confirmDelete}
        >
          <p className="travel-delete-note">Tej operacji nie można cofnąć.</p>
        </ConfirmDialog>
      )}

      {tripActionState && (
        <ConfirmDialog
          eyebrow="Podróż"
          title={tripActionState.kind === "archive"
            ? `Archiwizować podróż „${tripActionState.trip.name}”?`
            : `Usunąć podróż „${tripActionState.trip.name}”?`}
          description={tripActionState.kind === "archive"
            ? "Podróż zniknie z listy nadchodzących. Wszystkie rezerwacje, dokumenty i zadania pozostaną zapisane."
            : "Cały dossier podróży zostanie usunięty z lokalnego obszaru. Bezpośrednio po operacji będzie dostępne Cofnij."}
          tone={tripActionState.kind === "archive" ? "primary" : "danger"}
          confirmLabel={tripActionState.kind === "archive" ? "Archiwizuj podróż" : "Usuń podróż"}
          onCancel={() => setTripActionState(null)}
          onConfirm={confirmTripAction}
        >
          <p className="travel-delete-note">
            {tripActionState.kind === "archive"
              ? "Podróż można później przywrócić z archiwum."
              : "Przed usunięciem możesz pobrać eksport JSON z nagłówka podróży."}
          </p>
        </ConfirmDialog>
      )}
    </>
  );

  return layout
    ? layout(<>{pageContent}{detailPanelContent}</>)
    : (
      <ModuleShell
        contextSidebar={contextSidebar}
        detailPanel={detailPanelContent}
        className="travel-module"
        pageWidth="wide"
      >
        {pageContent}
      </ModuleShell>
    );
}
