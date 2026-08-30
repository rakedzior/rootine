import { readLocalWorkspace, writeLocalWorkspace, type LocalLoadResult } from "./localRepository";

export const TRAVEL_STORAGE_KEY = "rootine.travel-workspace.v1";
const WORKSPACE_VERSION = 2 as const;

export type TripStatus = "idea" | "planning" | "ready" | "completed";
export type ReservationStatus = "planned" | "booked" | "paid";
export type TransportMode = "plane" | "train" | "car" | "bus" | "ferry" | "other";
export type ItineraryKind = "sightseeing" | "food" | "transport" | "rest" | "activity";
export type DocumentStatus = "todo" | "pending" | "ready";
export type TravelTaskCategory = "booking" | "documents" | "health" | "packing" | "money" | "other";
export type BudgetCategory = "transport" | "stay" | "food" | "attractions" | "shopping" | "insurance" | "other";

export type TravelStay = {
  id: string;
  name: string;
  city: string;
  address: string;
  checkIn: string;
  checkOut: string;
  bookingRef: string;
  status: ReservationStatus;
  amount: number;
};

export type TravelTransport = {
  id: string;
  mode: TransportMode;
  title: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  bookingRef: string;
  status: ReservationStatus;
  amount: number;
};

export type ItineraryItem = {
  id: string;
  date: string;
  time: string;
  title: string;
  location: string;
  kind: ItineraryKind;
  note: string;
  reserved: boolean;
};

export type BudgetLine = {
  id: string;
  category: BudgetCategory;
  label: string;
  planned: number;
  actual: number;
  paid: boolean;
};

export type TravelDocument = {
  id: string;
  name: string;
  owner: string;
  status: DocumentStatus;
  expiresAt: string;
  note: string;
};

export type TravelTask = {
  id: string;
  title: string;
  category: TravelTaskCategory;
  dueDate: string;
  completed: boolean;
  linkedTask?: {
    originTaskId: number;
    view: string;
  };
};

export type TravelTrip = {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  travelers: string[];
  baseCurrency: string;
  note: string;
  archivedAt: string | null;
  stays: TravelStay[];
  transports: TravelTransport[];
  itinerary: ItineraryItem[];
  budget: BudgetLine[];
  documents: TravelDocument[];
  tasks: TravelTask[];
};

export type TravelWorkspace = {
  version: typeof WORKSPACE_VERSION;
  updatedAt: string;
  trips: TravelTrip[];
};

type LegacyTravelTrip = Omit<TravelTrip, "archivedAt">;
type LegacyTravelWorkspace = Omit<TravelWorkspace, "version" | "trips"> & {
  version: 1;
  trips: LegacyTravelTrip[];
};

export type TravelBudgetSummary = {
  planned: number;
  actual: number;
  paid: number;
  remaining: number;
  reservationCommitted: number;
  unbudgetedReservations: number;
};

const DEFAULT_WORKSPACE: TravelWorkspace = {
  version: WORKSPACE_VERSION,
  updatedAt: new Date(0).toISOString(),
  trips: [
    {
      id: "trip-japan-2026",
      name: "Japonia jesienią",
      destination: "Tokio · Kioto · Osaka",
      startDate: "2026-10-03",
      endDate: "2026-10-15",
      status: "planning",
      travelers: ["Mateusz", "Ola"],
      baseCurrency: "PLN",
      note: "Spokojne tempo, połączenie dużych miast z jednodniowym wypadem do Nary.",
      archivedAt: null,
      stays: [
        {
          id: "stay-tokyo",
          name: "Hotel Gracery Shinjuku",
          city: "Tokio",
          address: "1-19-1 Kabukicho, Shinjuku",
          checkIn: "2026-10-04",
          checkOut: "2026-10-08",
          bookingRef: "TYO-8P4K2",
          status: "booked",
          amount: 2860,
        },
        {
          id: "stay-kyoto",
          name: "The Gate Hotel Kyoto",
          city: "Kioto",
          address: "310-2 Shimizucho, Nakagyo",
          checkIn: "2026-10-08",
          checkOut: "2026-10-12",
          bookingRef: "KYO-19FH7",
          status: "paid",
          amount: 3240,
        },
        {
          id: "stay-osaka",
          name: "Namba Oriental Hotel",
          city: "Osaka",
          address: "2-8-17 Sennichimae, Chuo",
          checkIn: "2026-10-12",
          checkOut: "2026-10-15",
          bookingRef: "",
          status: "planned",
          amount: 1780,
        },
      ],
      transports: [
        {
          id: "transport-waw-tyo",
          mode: "plane",
          title: "Lot do Tokio",
          from: "WAW",
          to: "NRT",
          departure: "2026-10-03T13:10",
          arrival: "2026-10-04T09:05",
          bookingRef: "LO-7H4KQ",
          status: "paid",
          amount: 6150,
        },
        {
          id: "transport-tokyo-kyoto",
          mode: "train",
          title: "Shinkansen Hikari",
          from: "Tokyo Station",
          to: "Kyoto Station",
          departure: "2026-10-08T09:03",
          arrival: "2026-10-08T11:37",
          bookingRef: "",
          status: "planned",
          amount: 760,
        },
        {
          id: "transport-kix-waw",
          mode: "plane",
          title: "Powrót do Warszawy",
          from: "KIX",
          to: "WAW",
          departure: "2026-10-15T11:45",
          arrival: "2026-10-15T21:10",
          bookingRef: "LO-7H4KQ",
          status: "paid",
          amount: 0,
        },
      ],
      itinerary: [
        {
          id: "plan-arrival",
          date: "2026-10-04",
          time: "11:30",
          title: "Dojazd do Shinjuku i zameldowanie",
          location: "Shinjuku",
          kind: "transport",
          note: "Narita Express, bilety kupić po przylocie.",
          reserved: false,
        },
        {
          id: "plan-tokyo-east",
          date: "2026-10-05",
          time: "08:30",
          title: "Asakusa i świątynia Sensō-ji",
          location: "Asakusa",
          kind: "sightseeing",
          note: "Przyjechać przed największym ruchem.",
          reserved: false,
        },
        {
          id: "plan-teamlab",
          date: "2026-10-05",
          time: "17:00",
          title: "teamLab Borderless",
          location: "Azabudai Hills",
          kind: "activity",
          note: "Bilet w telefonie.",
          reserved: true,
        },
        {
          id: "plan-tsukiji",
          date: "2026-10-06",
          time: "09:00",
          title: "Śniadanie na targu Tsukiji",
          location: "Tsukiji Outer Market",
          kind: "food",
          note: "Bez rezerwacji, zabrać gotówkę.",
          reserved: false,
        },
        {
          id: "plan-fushimi",
          date: "2026-10-09",
          time: "07:00",
          title: "Fushimi Inari",
          location: "Kioto",
          kind: "sightseeing",
          note: "Pełna pętla zajmuje około 3 godziny.",
          reserved: false,
        },
        {
          id: "plan-nara",
          date: "2026-10-10",
          time: "08:15",
          title: "Jednodniowy wyjazd do Nary",
          location: "Nara",
          kind: "activity",
          note: "Kōfuku-ji, park i Tōdai-ji.",
          reserved: false,
        },
      ],
      budget: [
        { id: "budget-flights", category: "transport", label: "Loty międzynarodowe", planned: 6500, actual: 6150, paid: true },
        { id: "budget-local", category: "transport", label: "Pociągi i komunikacja", planned: 1900, actual: 760, paid: false },
        { id: "budget-stays", category: "stay", label: "Noclegi", planned: 8200, actual: 6100, paid: false },
        { id: "budget-food", category: "food", label: "Jedzenie", planned: 3200, actual: 0, paid: false },
        { id: "budget-attractions", category: "attractions", label: "Atrakcje i bilety", planned: 1400, actual: 340, paid: false },
        { id: "budget-insurance", category: "insurance", label: "Ubezpieczenie", planned: 420, actual: 0, paid: false },
        { id: "budget-other", category: "other", label: "Rezerwa", planned: 1500, actual: 0, paid: false },
      ],
      documents: [
        { id: "doc-passport-m", name: "Paszport", owner: "Mateusz", status: "ready", expiresAt: "2031-04-18", note: "Skan zapisany offline." },
        { id: "doc-passport-o", name: "Paszport", owner: "Ola", status: "ready", expiresAt: "2028-09-02", note: "" },
        { id: "doc-insurance", name: "Polisa turystyczna", owner: "Wszyscy", status: "todo", expiresAt: "", note: "Koszty leczenia min. 500 000 zł." },
        { id: "doc-flight", name: "Bilety lotnicze", owner: "Wszyscy", status: "ready", expiresAt: "", note: "Numery rezerwacji w transporcie." },
        { id: "doc-customs", name: "Visit Japan Web", owner: "Wszyscy", status: "pending", expiresAt: "", note: "Uzupełnić tydzień przed wylotem." },
      ],
      tasks: [
        { id: "task-osaka", title: "Zarezerwować nocleg w Osace", category: "booking", dueDate: "2026-08-10", completed: false },
        { id: "task-insurance", title: "Kupić ubezpieczenie podróżne", category: "documents", dueDate: "2026-09-20", completed: false },
        { id: "task-esim", title: "Wybrać eSIM z pakietem danych", category: "other", dueDate: "2026-09-28", completed: false },
        { id: "task-medicine", title: "Uzupełnić apteczkę podróżną", category: "health", dueDate: "2026-09-25", completed: false },
        { id: "task-cash", title: "Zamówić część gotówki w jenach", category: "money", dueDate: "2026-09-29", completed: false },
        { id: "task-adapter", title: "Spakować adapter typu A", category: "packing", dueDate: "2026-10-02", completed: false },
        { id: "task-teamlab", title: "Kupić bilety do teamLab", category: "booking", dueDate: "2026-08-01", completed: true },
      ],
    },
    {
      id: "trip-lisbon-2026",
      name: "Lizbona na długi weekend",
      destination: "Lizbona · Sintra",
      startDate: "2026-09-10",
      endDate: "2026-09-13",
      status: "ready",
      travelers: ["Mateusz"],
      baseCurrency: "PLN",
      note: "Krótki wyjazd z jednym pełnym dniem w Sintrze.",
      archivedAt: null,
      stays: [
        {
          id: "stay-lisbon",
          name: "Hotel Santa Justa",
          city: "Lizbona",
          address: "Rua dos Correeiros 204",
          checkIn: "2026-09-10",
          checkOut: "2026-09-13",
          bookingRef: "LSB-44910",
          status: "paid",
          amount: 1860,
        },
      ],
      transports: [
        {
          id: "transport-lisbon",
          mode: "plane",
          title: "Lot Warszawa — Lizbona",
          from: "WAW",
          to: "LIS",
          departure: "2026-09-10T07:20",
          arrival: "2026-09-10T10:25",
          bookingRef: "TP-23JQ9",
          status: "paid",
          amount: 1180,
        },
      ],
      itinerary: [
        { id: "lisbon-alfama", date: "2026-09-10", time: "15:00", title: "Spacer po Alfamie", location: "Alfama", kind: "sightseeing", note: "", reserved: false },
        { id: "lisbon-sintra", date: "2026-09-11", time: "08:00", title: "Pociąg do Sintry", location: "Rossio", kind: "transport", note: "Pałac Pena o 10:30.", reserved: true },
        { id: "lisbon-belem", date: "2026-09-12", time: "09:30", title: "Belém i MAAT", location: "Belém", kind: "sightseeing", note: "", reserved: false },
      ],
      budget: [
        { id: "lisbon-flight", category: "transport", label: "Lot i komunikacja", planned: 1500, actual: 1320, paid: true },
        { id: "lisbon-stay", category: "stay", label: "Nocleg", planned: 1900, actual: 1860, paid: true },
        { id: "lisbon-food", category: "food", label: "Jedzenie", planned: 900, actual: 0, paid: false },
        { id: "lisbon-activities", category: "attractions", label: "Atrakcje", planned: 450, actual: 190, paid: false },
      ],
      documents: [
        { id: "lisbon-id", name: "Dowód osobisty", owner: "Mateusz", status: "ready", expiresAt: "2029-11-12", note: "" },
        { id: "lisbon-insurance", name: "EKUZ", owner: "Mateusz", status: "ready", expiresAt: "2027-02-28", note: "" },
      ],
      tasks: [
        { id: "lisbon-checkin", title: "Odprawić się online", category: "booking", dueDate: "2026-09-09", completed: false },
        { id: "lisbon-pena", title: "Pobrać bilety do Pena Palace", category: "documents", dueDate: "2026-09-08", completed: true },
      ],
    },
    {
      id: "trip-dolomites-2026",
      name: "Dolomity",
      destination: "Cortina d’Ampezzo",
      startDate: "2026-06-12",
      endDate: "2026-06-18",
      status: "completed",
      travelers: ["Mateusz", "Ola"],
      baseCurrency: "PLN",
      note: "Zakończona podróż samochodowa.",
      archivedAt: "2026-06-19T12:00:00.000Z",
      stays: [],
      transports: [],
      itinerary: [],
      budget: [
        { id: "dolomites-total", category: "other", label: "Koszt całkowity", planned: 7200, actual: 6980, paid: true },
      ],
      documents: [],
      tasks: [],
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStay(value: unknown): value is TravelStay {
  return isRecord(value)
    && ["id", "name", "city", "address", "checkIn", "checkOut", "bookingRef"].every((key) => typeof value[key] === "string")
    && ["planned", "booked", "paid"].includes(String(value.status))
    && typeof value.amount === "number"
    && Number.isFinite(value.amount);
}

function isTransport(value: unknown): value is TravelTransport {
  return isRecord(value)
    && ["id", "title", "from", "to", "departure", "arrival", "bookingRef"].every((key) => typeof value[key] === "string")
    && ["plane", "train", "car", "bus", "ferry", "other"].includes(String(value.mode))
    && ["planned", "booked", "paid"].includes(String(value.status))
    && typeof value.amount === "number"
    && Number.isFinite(value.amount);
}

function isItineraryItem(value: unknown): value is ItineraryItem {
  return isRecord(value)
    && ["id", "date", "time", "title", "location", "note"].every((key) => typeof value[key] === "string")
    && ["sightseeing", "food", "transport", "rest", "activity"].includes(String(value.kind))
    && typeof value.reserved === "boolean";
}

function isBudgetLine(value: unknown): value is BudgetLine {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.label === "string"
    && ["transport", "stay", "food", "attractions", "shopping", "insurance", "other"].includes(String(value.category))
    && typeof value.planned === "number"
    && Number.isFinite(value.planned)
    && typeof value.actual === "number"
    && Number.isFinite(value.actual)
    && typeof value.paid === "boolean";
}

function isDocument(value: unknown): value is TravelDocument {
  return isRecord(value)
    && ["id", "name", "owner", "expiresAt", "note"].every((key) => typeof value[key] === "string")
    && ["todo", "pending", "ready"].includes(String(value.status));
}

function isTask(value: unknown): value is TravelTask {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && ["booking", "documents", "health", "packing", "money", "other"].includes(String(value.category))
    && typeof value.dueDate === "string"
    && typeof value.completed === "boolean"
    && (value.linkedTask === undefined
      || (isRecord(value.linkedTask)
        && typeof value.linkedTask.originTaskId === "number"
        && Number.isSafeInteger(value.linkedTask.originTaskId)
        && typeof value.linkedTask.view === "string"));
}

function isTrip(value: unknown): value is TravelTrip {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.destination === "string"
    && typeof value.startDate === "string"
    && typeof value.endDate === "string"
    && ["idea", "planning", "ready", "completed"].includes(String(value.status))
    && Array.isArray(value.travelers)
    && value.travelers.every((traveler) => typeof traveler === "string")
    && typeof value.baseCurrency === "string"
    && typeof value.note === "string"
    && (value.archivedAt === null || typeof value.archivedAt === "string")
    && Array.isArray(value.stays)
    && value.stays.every(isStay)
    && Array.isArray(value.transports)
    && value.transports.every(isTransport)
    && Array.isArray(value.itinerary)
    && value.itinerary.every(isItineraryItem)
    && Array.isArray(value.budget)
    && value.budget.every(isBudgetLine)
    && Array.isArray(value.documents)
    && value.documents.every(isDocument)
    && Array.isArray(value.tasks)
    && value.tasks.every(isTask);
}

function isWorkspace(value: unknown): value is TravelWorkspace {
  return isRecord(value)
    && value.version === WORKSPACE_VERSION
    && typeof value.updatedAt === "string"
    && Array.isArray(value.trips)
    && value.trips.every(isTrip);
}

export const isTravelWorkspace = isWorkspace;

export function createDefaultTravelWorkspace(): TravelWorkspace {
  return JSON.parse(JSON.stringify(DEFAULT_WORKSPACE)) as TravelWorkspace;
}

export function createEmptyTravelWorkspace(): TravelWorkspace {
  return {
    version: WORKSPACE_VERSION,
    updatedAt: new Date(0).toISOString(),
    trips: [],
  };
}

function migrateLegacyWorkspace(value: unknown): TravelWorkspace | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.updatedAt !== "string" || !Array.isArray(value.trips)) {
    return null;
  }
  const migratedAt = value.updatedAt;
  const candidate: TravelWorkspace = {
    ...(value as LegacyTravelWorkspace),
    version: WORKSPACE_VERSION,
    trips: value.trips.map((trip) => {
      const legacyTrip = isRecord(trip) ? trip as LegacyTravelTrip : {} as LegacyTravelTrip;
      return {
        ...legacyTrip,
        archivedAt: legacyTrip.status === "completed" ? migratedAt : null,
      };
    }),
  };
  return isWorkspace(candidate) ? candidate : null;
}

export function createTravelId(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
}

export function normalizeIsoCurrency(value: string): string | null {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  const supportedValuesOf = (Intl as unknown as {
    supportedValuesOf?: (key: "currency") => string[];
  }).supportedValuesOf;
  if (supportedValuesOf) {
    try {
      if (!supportedValuesOf("currency").includes(code)) return null;
    } catch {
      return null;
    }
  }
  try {
    new Intl.NumberFormat("pl-PL", { style: "currency", currency: code }).format(0);
    return code;
  } catch {
    return null;
  }
}

export function isDateWithinTrip(date: string, trip: Pick<TravelTrip, "startDate" | "endDate">): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    && date >= trip.startDate
    && date <= trip.endDate;
}

export function summarizeTravelBudget(trip: TravelTrip): TravelBudgetSummary {
  const categories: BudgetCategory[] = [
    "transport",
    "stay",
    "food",
    "attractions",
    "shopping",
    "insurance",
    "other",
  ];
  const reservationByCategory: Partial<Record<BudgetCategory, { total: number; paid: number }>> = {
    stay: {
      total: trip.stays.reduce((sum, stay) => sum + stay.amount, 0),
      paid: trip.stays.filter((stay) => stay.status === "paid").reduce((sum, stay) => sum + stay.amount, 0),
    },
    transport: {
      total: trip.transports.reduce((sum, transport) => sum + transport.amount, 0),
      paid: trip.transports.filter((transport) => transport.status === "paid").reduce((sum, transport) => sum + transport.amount, 0),
    },
  };

  let planned = 0;
  let actual = 0;
  let paid = 0;
  let unbudgetedReservations = 0;

  categories.forEach((category) => {
    const lines = trip.budget.filter((line) => line.category === category);
    const categoryPlanned = lines.reduce((sum, line) => sum + line.planned, 0);
    const categoryActual = lines.reduce((sum, line) => sum + line.actual, 0);
    const categoryPaid = lines.filter((line) => line.paid).reduce((sum, line) => sum + line.actual, 0);
    const reservations = reservationByCategory[category];
    const reservationTotal = reservations?.total ?? 0;
    const reservationPaid = reservations?.paid ?? 0;

    planned += Math.max(categoryPlanned, reservationTotal);
    actual += Math.max(categoryActual, reservationTotal);
    paid += Math.max(categoryPaid, reservationPaid);
    unbudgetedReservations += Math.max(0, reservationTotal - categoryPlanned);
  });

  const reservationCommitted = (reservationByCategory.stay?.total ?? 0)
    + (reservationByCategory.transport?.total ?? 0);
  return {
    planned,
    actual,
    paid,
    remaining: planned - actual,
    reservationCommitted,
    unbudgetedReservations,
  };
}

export function setTravelTaskCompletionState(
  workspace: TravelWorkspace,
  tripId: string,
  taskId: string,
  completed: boolean,
): TravelWorkspace {
  return {
    ...workspace,
    trips: workspace.trips.map((trip) => trip.id !== tripId ? trip : {
      ...trip,
      tasks: trip.tasks.map((task) => task.id === taskId
        ? { ...task, completed }
        : task),
    }),
  };
}

export function loadTravelWorkspaceResult(): LocalLoadResult<TravelWorkspace> {
  return readLocalWorkspace({
    key: TRAVEL_STORAGE_KEY,
    fallback: createEmptyTravelWorkspace,
    validate: isWorkspace,
    migrate: migrateLegacyWorkspace,
  });
}

export function loadTravelWorkspace(): TravelWorkspace {
  return loadTravelWorkspaceResult().workspace;
}

export function saveTravelWorkspace(workspace: TravelWorkspace): boolean {
  const next: TravelWorkspace = {
    ...workspace,
    version: WORKSPACE_VERSION,
    updatedAt: new Date().toISOString(),
  };
  return writeLocalWorkspace(TRAVEL_STORAGE_KEY, next);
}
