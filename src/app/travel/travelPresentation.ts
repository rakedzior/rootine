import { Bus, Car, Plane, Route, Ship, Train } from "lucide-react";
import { calendarDaysBetween, todayLocalDateKey } from "../data/localDate";
import {
  normalizeIsoCurrency,
  type BudgetCategory,
  type DocumentStatus,
  type ItineraryKind,
  type ReservationStatus,
  type TransportMode,
  type TravelTaskCategory,
  type TravelTrip,
  type TripStatus,
} from "../data/travelWorkspace";

export type TravelSection = "overview" | "itinerary" | "reservations" | "budget" | "documents" | "tasks";
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
  todo: "Do zdobycia",
  pending: "W toku",
  ready: "Gotowy",
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
  overview: "Pulpit podróży",
  itinerary: "Plan dzień po dniu",
  reservations: "Noclegi i transport",
  budget: "Plan i rzeczywiste wydatki",
  documents: "Dokumenty i formalności",
  tasks: "Sprawy do załatwienia",
};

export const SECTION_TABS = [
  { id: "overview", label: "Pulpit", tabId: "travel-tab-overview", panelId: "travel-panel-overview" },
  { id: "itinerary", label: "Plan podróży", tabId: "travel-tab-itinerary", panelId: "travel-panel-itinerary" },
  { id: "reservations", label: "Rezerwacje", tabId: "travel-tab-reservations", panelId: "travel-panel-reservations" },
  { id: "budget", label: "Budżet", tabId: "travel-tab-budget", panelId: "travel-panel-budget" },
  { id: "documents", label: "Dokumenty", tabId: "travel-tab-documents", panelId: "travel-panel-documents" },
  { id: "tasks", label: "Do zrobienia", tabId: "travel-tab-tasks", panelId: "travel-panel-tasks" },
];

export function isTravelSection(value: string | null): value is TravelSection {
  return SECTION_TABS.some((tab) => tab.id === value);
}

export function formatDate(value: string, withYear = true): string {
  if (!value) return "Bez daty";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function formatDateTime(value: string): string {
  if (!value) return "Nie ustalono";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " · ");
  return date.toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMoney(value: number, currency = "PLN"): string {
  try {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: normalizeIsoCurrency(currency) ?? "PLN",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString("pl-PL")} ${currency}`;
  }
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
  return `Za ${days} dni`;
}

export function readinessParts(trip: TravelTrip) {
  const reservations = [...trip.stays, ...trip.transports];
  const securedReservations = reservations.filter((item) => item.status !== "planned").length;
  const readyDocuments = trip.documents.filter((item) => item.status === "ready").length;
  const completedTasks = trip.tasks.filter((item) => item.completed).length;
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
      meta: budgetReady ? `${trip.budget.length} pozycji` : "Brak planu",
    },
    {
      id: "documents" as TravelSection,
      label: "Dokumenty",
      value: trip.documents.length ? readyDocuments / trip.documents.length : 0,
      meta: `${readyDocuments}/${trip.documents.length}`,
    },
    {
      id: "tasks" as TravelSection,
      label: "Sprawy",
      value: trip.tasks.length ? completedTasks / trip.tasks.length : 1,
      meta: `${completedTasks}/${trip.tasks.length}`,
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
