import { Bus, Car, Plane, Route, Ship, Train } from "lucide-react";
import { calendarDaysBetween, shiftLocalDateKey, todayLocalDateKey } from "../data/localDate";
import {
  formatCurrency,
  formatDate as formatPolishDate,
  formatShortDate,
  formatTime,
  pluralize,
} from "../formatters";
import {
  normalizeIsoCurrency,
  type BudgetCategory,
  type DocumentStatus,
  type ItineraryItem,
  type ItineraryKind,
  type ReservationStatus,
  type TransportMode,
  type TravelTaskCategory,
  type TravelTrip,
  type TripStatus,
} from "../data/travelWorkspace";

export type TravelSection = "overview" | "itinerary" | "reservations" | "budget" | "preparation" | "documents" | "tasks" | "packing";
export type PreparationSection = "tasks" | "documents" | "packing";
export type EditorKind = "trip" | "itinerary" | "stay" | "transport" | "budget" | "document" | "task";
export type EditorState = { kind: EditorKind; mode: "add" | "edit"; id?: string };
export type DeleteState = {
  kind: Exclude<EditorKind, "trip">;
  id: string;
  label: string;
};
export type TripActionState = {
  kind: "archive" | "delete";
  trip: TravelTrip;
};

export type Draft = {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  tripStatus: TripStatus;
  travelers: string;
  currency: string;
  note: string;
  date: string;
  time: string;
  location: string;
  itineraryKind: ItineraryKind;
  reserved: boolean;
  city: string;
  address: string;
  bookingRef: string;
  reservationStatus: ReservationStatus;
  amount: string;
  transportMode: TransportMode;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  budgetCategory: BudgetCategory;
  planned: string;
  actual: string;
  paid: boolean;
  owner: string;
  documentStatus: DocumentStatus;
  expiresAt: string;
  taskCategory: TravelTaskCategory;
  dueDate: string;
};

export const EMPTY_DRAFT: Draft = {
  name: "",
  destination: "",
  startDate: "",
  endDate: "",
  tripStatus: "planning",
  travelers: "",
  currency: "PLN",
  note: "",
  date: "",
  time: "",
  location: "",
  itineraryKind: "sightseeing",
  reserved: false,
  city: "",
  address: "",
  bookingRef: "",
  reservationStatus: "planned",
  amount: "",
  transportMode: "plane",
  from: "",
  to: "",
  departure: "",
  arrival: "",
  budgetCategory: "other",
  planned: "",
  actual: "",
  paid: false,
  owner: "",
  documentStatus: "todo",
  expiresAt: "",
  taskCategory: "other",
  dueDate: "",
};

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  idea: "Pomysł",
  planning: "W planowaniu",
  ready: "Gotowa",
  completed: "Zakończona",
};

export const TRIP_STATUS_TONES: Record<TripStatus, "neutral" | "primary" | "success" | "warning"> = {
  idea: "neutral",
  planning: "primary",
  ready: "success",
  completed: "neutral",
};

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  planned: "Do rezerwacji",
  booked: "Zarezerwowano",
  paid: "Opłacono",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  todo: "Brak",
  pending: "Sprawdź",
  ready: "Dodany",
};

export const DOCUMENT_STATUS_TONES: Record<DocumentStatus, "danger" | "warning" | "success"> = {
  todo: "danger",
  pending: "warning",
  ready: "success",
};

export const ITINERARY_KIND_LABELS: Record<ItineraryKind, string> = {
  sightseeing: "Zwiedzanie",
  food: "Jedzenie",
  transport: "Przejazd",
  rest: "Odpoczynek",
  activity: "Atrakcja",
};

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  transport: "Transport",
  stay: "Noclegi",
  food: "Jedzenie",
  attractions: "Atrakcje",
  shopping: "Zakupy",
  insurance: "Ubezpieczenie",
  other: "Inne",
};

export const TASK_CATEGORY_LABELS: Record<TravelTaskCategory, string> = {
  booking: "Rezerwacje",
  documents: "Dokumenty",
  health: "Zdrowie",
  packing: "Pakowanie",
  money: "Pieniądze",
  other: "Inne",
};

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  plane: "Samolot",
  train: "Pociąg",
  car: "Samochód",
  bus: "Autobus",
  ferry: "Prom",
  other: "Inny",
};

export const TRANSPORT_ICONS: Record<TransportMode, typeof Plane> = {
  plane: Plane,
  train: Train,
  car: Car,
  bus: Bus,
  ferry: Ship,
  other: Route,
};

export const SECTION_COPY: Record<TravelSection, string> = {
  preparation: "Przygotowanie",
  overview: "Przegląd podróży",
  itinerary: "Plan podróży",
  reservations: "Noclegi i transport",
  budget: "Planowane i rzeczywiste wydatki",
  documents: "Najważniejsze dokumenty na wyjazd",
  tasks: "Rzeczy, które trzeba zrobić przed wyjazdem",
  packing: "Lista rzeczy na 4 dni",
};

export const TRAVEL_SECTION_ITEMS: ReadonlyArray<{ id: TravelSection; label: string }> = [
  { id: "overview", label: "Przegląd" },
  { id: "itinerary", label: "Plan podróży" },
  { id: "reservations", label: "Rezerwacje" },
  { id: "budget", label: "Budżet" },
  { id: "tasks", label: "Do załatwienia" },
  { id: "documents", label: "Dokumenty" },
  { id: "packing", label: "Pakowanie" },
];

export function isTravelSection(value: string | null): value is TravelSection {
  return TRAVEL_SECTION_ITEMS.some((item) => item.id === value)
    || value === "preparation";
}

export function isPreparationSection(value: string | null): value is PreparationSection {
  return value === "tasks" || value === "documents" || value === "packing";
}

export type ItineraryDay = {
  date: string;
  dayNumber: number;
  items: ItineraryItem[];
};

export function buildItineraryDays(trip: TravelTrip): ItineraryDay[] {
  const byDate = new Map<string, ItineraryItem[]>();
  trip.itinerary.forEach((item) => {
    const bucket = byDate.get(item.date) ?? [];
    bucket.push(item);
    byDate.set(item.date, bucket);
  });

  return Array.from({ length: tripDuration(trip) }, (_, dayNumber) => {
    const date = shiftLocalDateKey(trip.startDate, dayNumber);
    return {
      date,
      dayNumber: dayNumber + 1,
      items: (byDate.get(date) ?? []).slice().sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title)),
    };
  });
}

export function formatDate(value: string, withYear = true): string {
  if (!value) return "Bez daty";
  const formatted = withYear ? formatPolishDate(value) : formatShortDate(value);
  return formatted === "—" ? value : formatted;
}

export function formatDateTime(value: string): string {
  if (!value) return "Nie ustalono";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " · ");
  return `${formatShortDate(value)} · ${formatTime(value)}`;
}

export function formatMoney(value: number, currency = "PLN"): string {
  return formatCurrency(value, normalizeIsoCurrency(currency) ?? "PLN");
}

export function tripDuration(trip: TravelTrip): number {
  const days = calendarDaysBetween(trip.startDate, trip.endDate);
  return days === null ? 0 : Math.max(1, days + 1);
}

export function daysUntil(value: string): number {
  return calendarDaysBetween(todayLocalDateKey(), value) ?? 0;
}

export function tripCountdown(trip: TravelTrip): string {
  if (trip.status === "completed") return "Podróż zakończona";
  const days = daysUntil(trip.startDate);
  if (days < 0) return "W trakcie";
  if (days === 0) return "Wyjazd dzisiaj";
  if (days === 1) return "Wyjazd jutro";
  return `Za ${pluralize(days, "dzień", "dni", "dni")}`;
}

export function readinessParts(trip: TravelTrip) {
  const reservations = [...trip.stays, ...trip.transports];
  const securedReservations = reservations.filter((item) => item.status !== "planned").length;
  const readyDocuments = trip.documents.filter((item) => item.status === "ready").length;
  const taskItems = trip.tasks.filter((item) => item.category !== "packing");
  const packingItems = trip.tasks.filter((item) => item.category === "packing");
  const itineraryDays = new Set(trip.itinerary.map((item) => item.date)).size;
  const totalDays = tripDuration(trip);
  const budgetReady = trip.budget.length > 0 || reservations.some((item) => item.amount > 0) ? 1 : 0;

  return [
    {
      id: "reservations" as TravelSection,
      label: "Rezerwacje",
      value: reservations.length ? securedReservations / reservations.length : 0,
      meta: `${securedReservations}/${reservations.length}`,
    },
    {
      id: "itinerary" as TravelSection,
      label: "Plan",
      value: totalDays ? Math.min(1, itineraryDays / totalDays) : 0,
      meta: `${itineraryDays}/${totalDays} dni`,
    },
    {
      id: "budget" as TravelSection,
      label: "Budżet",
      value: budgetReady,
      meta: budgetReady ? pluralize(trip.budget.length, "pozycja", "pozycje", "pozycji") : "Brak planu",
    },
    {
      id: "documents" as TravelSection,
      label: "Dokumenty",
      value: trip.documents.length ? readyDocuments / trip.documents.length : 0,
      meta: `${readyDocuments}/${trip.documents.length}`,
    },
    {
      id: "tasks" as TravelSection,
      label: "Do załatwienia",
      value: taskItems.length ? taskItems.filter((item) => item.completed).length / taskItems.length : 1,
      meta: `${taskItems.filter((item) => item.completed).length}/${taskItems.length}`,
    },
    {
      id: "packing" as TravelSection,
      label: "Pakowanie",
      value: packingItems.length ? packingItems.filter((item) => item.completed).length / packingItems.length : 1,
      meta: `${packingItems.filter((item) => item.completed).length}/${packingItems.length}`,
    },
  ];
}

export function readinessScore(trip: TravelTrip): number {
  const parts = readinessParts(trip);
  return Math.round(parts.reduce((sum, part) => sum + part.value, 0) / parts.length * 100);
}

export function nextAction(trip: TravelTrip): string {
  const task = [...trip.tasks]
    .filter((item) => !item.completed)
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))[0];
  if (task) return task.title;
  const stay = trip.stays.find((item) => item.status === "planned");
  if (stay) return `Zarezerwuj: ${stay.name}`;
  const transport = trip.transports.find((item) => item.status === "planned");
  if (transport) return `Zarezerwuj: ${transport.title}`;
  return "Plan jest domknięty";
}

export function numberFrom(value: string): number | null {
  if (!value.trim()) return 0;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
