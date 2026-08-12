import {
  CalendarDays,
  Building2,
  Car,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  HeartPulse,
  Home,
  Landmark,
  LayoutDashboard,
  Map as MapIcon,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  getMonthKey,
  type DocumentCategory,
  type DocumentRecord,
  type MatterCategory,
  type MatterKind,
  type MatterPriority,
  type MatterStatus,
  type PaymentCadence,
  type SubscriptionRenewal,
  type Vehicle,
  type VehicleItem,
  type VehicleItemType,
} from "../data/affairsWorkspace";
import {
  formatCurrency,
  formatDate as formatPolishDate,
} from "../formatters";

export type AffairsView =
  | "overview"
  | "today"
  | "week"
  | "all"
  | "finances"
  | "finance-one-time"
  | "finance-recurring"
  | "documents"
  | "vehicles"
  | "health"
  | "jdg";

export type AffairsViewArchetype = "agenda" | "register" | "workspace";

/**
 * Every affairs destination is intentionally expressed through one of three stable
 * interaction archetypes. The mapping keeps routing/domain semantics independent
 * from the shell that presents them.
 */
export const AFFAIRS_VIEW_ARCHETYPE: Record<AffairsView, AffairsViewArchetype> = {
  overview: "workspace",
  today: "agenda",
  week: "agenda",
  all: "agenda",
  finances: "register",
  "finance-one-time": "register",
  "finance-recurring": "register",
  documents: "register",
  vehicles: "register",
  health: "workspace",
  jdg: "workspace",
};
export type EditorState =
  | { kind: "matter"; mode: "add" | "edit"; id?: string }
  | { kind: "payment"; mode: "add" | "edit"; id?: string }
  | { kind: "oneTime"; mode: "add" | "edit"; id?: string }
  | { kind: "subscription"; mode: "add" | "edit"; id?: string }
  | { kind: "document"; mode: "add" | "edit"; id?: string }
  | { kind: "vehicle"; mode: "add" | "edit"; id?: string }
  | { kind: "vehicleItem"; mode: "add" | "edit"; id?: string; vehicleId: string };

export function getAffairsEditorDraftKey(editor: EditorState | null): string {
  if (!editor) return "";
  const recordId = "id" in editor ? editor.id ?? "new" : "new";
  const vehicleContext = editor.kind === "vehicleItem" ? `.${editor.vehicleId}` : "";
  return `rootine.affairs-editor-draft.${editor.kind}.${editor.mode}.${recordId}${vehicleContext}`;
}

export type DeleteState = {
  kind: "matter" | "payment" | "oneTime" | "subscription" | "document" | "vehicle" | "vehicleItem";
  id: string;
  label: string;
};

export type Draft = {
  title: string;
  category: string;
  priority: MatterPriority;
  status: MatterStatus;
  dueDate: string;
  matterKind: MatterKind;
  time: string;
  location: string;
  reminderPreset: MatterReminderPreset;
  sourceAttentionKey: string;
  note: string;
  amount: string;
  cadence: PaymentCadence;
  automatic: boolean;
  renewal: SubscriptionRenewal;
  secondaryDate: string;
  holder: string;
  reminderDays: string;
  registration: string;
  mileage: string;
  dueMileage: string;
  vehicleId: string;
  vehicleType: VehicleItemType;
};

export type MatterReminderPreset = "none" | "at-time" | "two-hours" | "day-and-two-hours";

export const MATTER_REMINDER_LABELS: Record<MatterReminderPreset, string> = {
  none: "Bez powiadomień",
  "at-time": "O godzinie wizyty",
  "two-hours": "2 godziny wcześniej",
  "day-and-two-hours": "24 godziny i 2 godziny wcześniej",
};

export function reminderMinutesFromPreset(preset: MatterReminderPreset): number[] {
  if (preset === "at-time") return [0];
  if (preset === "two-hours") return [120];
  if (preset === "day-and-two-hours") return [1_440, 120];
  return [];
}

export function reminderPresetFromMinutes(minutes: readonly number[] | undefined): MatterReminderPreset {
  if (!minutes?.length) return "none";
  if (minutes.includes(1_440) && minutes.includes(120)) return "day-and-two-hours";
  if (minutes.includes(120)) return "two-hours";
  if (minutes.includes(0)) return "at-time";
  return "none";
}

export const EMPTY_DRAFT: Draft = {
  title: "",
  category: "urzedy",
  priority: "normal",
  status: "open",
  dueDate: "",
  matterKind: "task",
  time: "",
  location: "",
  reminderPreset: "none",
  sourceAttentionKey: "",
  note: "",
  amount: "",
  cadence: "monthly",
  automatic: false,
  renewal: "automatic",
  secondaryDate: "",
  holder: "Ja",
  reminderDays: "90",
  registration: "",
  mileage: "",
  dueMileage: "",
  vehicleId: "",
  vehicleType: "service",
};

export const VIEW_COPY: Record<AffairsView, { title: string; description: string }> = {
  overview: { title: "Przegląd", description: "Najważniejsze zobowiązania, rejestry i obszary w jednym miejscu" },
  today: { title: "Dzisiaj", description: "Sprawy wymagające uwagi dzisiaj" },
  week: { title: "Ten tydzień", description: "Terminy i zobowiązania na najbliższe dni" },
  all: { title: "Wszystkie", description: "Pełny horyzont aktywnych spraw i zobowiązań" },
  finances: { title: "Przegląd finansów", description: "Jednorazowe i cykliczne zobowiązania w jednym rejestrze" },
  "finance-one-time": { title: "Jednorazowe", description: "Opłaty i zobowiązania z jednym terminem" },
  "finance-recurring": { title: "Cykliczne", description: "Stałe opłaty, subskrypcje i terminy odnowień" },
  documents: { title: "Dokumenty", description: "Ważność dokumentów, polis, kart i gwarancji" },
  vehicles: { title: "Pojazdy", description: "OC, przeglądy, serwis i terminy pojazdów" },
  health: { title: "Zdrowie", description: "Wizyty, badania i przypomnienia zdrowotne w jednym rejestrze" },
  jdg: { title: "JDG", description: "Sześć kroków do zamknięcia poprzedniego miesiąca" },
};

export const CATEGORY_META: Record<MatterCategory, { label: string; icon: typeof Landmark }> = {
  urzedy: { label: "Urzędy", icon: Landmark },
  zdrowie: { label: "Zdrowie", icon: HeartPulse },
  dom: { label: "Dom", icon: Home },
  auto: { label: "Auto", icon: Car },
  finanse: { label: "Finanse", icon: CircleDollarSign },
  dokumenty: { label: "Dokumenty", icon: FileText },
};

export const STATUS_LABELS: Record<MatterStatus, string> = {
  open: "Do zrobienia",
  waiting: "Oczekuje",
  done: "Załatwione",
};

export const CADENCE_LABELS: Record<PaymentCadence, string> = {
  monthly: "Co miesiąc",
  quarterly: "Co kwartał",
  yearly: "Co rok",
};

export const DOCUMENT_LABELS: Record<DocumentCategory, string> = {
  identity: "Tożsamość",
  driving: "Uprawnienia",
  insurance: "Polisa",
  health: "Zdrowie",
  agreement: "Umowa / gwarancja",
  other: "Inne",
};

export const VEHICLE_ITEM_LABELS: Record<VehicleItemType, string> = {
  insurance: "Ubezpieczenie",
  inspection: "Przegląd",
  service: "Serwis",
  tires: "Opony",
  lease: "Leasing",
  warranty: "Gwarancja",
  other: "Inne",
};

export const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ view: AffairsView; label: string; icon: typeof LayoutDashboard; depth?: 0 | 1 }>;
}> = [
  {
    label: "Centrum",
    items: [
      { view: "overview", label: "Przegląd", icon: LayoutDashboard },
    ],
  },
  {
    label: "Sprawy",
    items: [
      { view: "today", label: "Dzisiaj", icon: Clock3 },
      { view: "week", label: "Ten tydzień", icon: CalendarDays },
      { view: "all", label: "Wszystkie", icon: LayoutDashboard },
    ],
  },
  {
    label: "Finanse",
    items: [
      { view: "finances", label: "Przegląd", icon: CreditCard },
      { view: "finance-one-time", label: "Jednorazowe", icon: ReceiptText, depth: 1 },
      { view: "finance-recurring", label: "Cykliczne", icon: RefreshCw, depth: 1 },
    ],
  },
  {
    label: "Rejestry",
    items: [
      { view: "documents", label: "Dokumenty", icon: FileText },
      { view: "vehicles", label: "Pojazdy", icon: Car },
    ],
  },
  {
    label: "Pozostałe",
    items: [
      { view: "health", label: "Zdrowie", icon: HeartPulse },
      { view: "jdg", label: "JDG", icon: Building2 },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
export const AFFAIRS_VIEWS = new Set<AffairsView>(NAV_ITEMS.map((item) => item.view));

/**
 * One name per view. The sidebar used to hard-code its own labels, so a view could be called
 * one thing in the navigation and another in the page title it opened.
 */
export const NAV_LABELS = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.view, item.label]),
) as Record<AffairsView, string>;

export const UPCOMING_ICONS = {
  matter: ShieldCheck,
  oneTime: ReceiptText,
  payment: RefreshCw,
  subscription: CreditCard,
  document: FileText,
  vehicle: Car,
  health: HeartPulse,
  jdg: Building2,
  travel: MapIcon,
};

const LEGACY_VIEW_ALIASES: Record<string, AffairsView> = {
  dashboard: "overview",
  matters: "all",
  oneTime: "finance-one-time",
  payments: "finance-recurring",
  subscriptions: "finance-recurring",
  budget: "finances",
};

export function getInitialView(): AffairsView {
  if (typeof window === "undefined") return "overview";
  const requested = new URLSearchParams(window.location.search).get("widok");
  if (requested && LEGACY_VIEW_ALIASES[requested]) return LEGACY_VIEW_ALIASES[requested];
  if (requested && AFFAIRS_VIEWS.has(requested as AffairsView)) return requested as AffairsView;
  return "overview";
}

export function formatDate(value: string): string {
  if (!value) return "Bez terminu";
  const formatted = formatPolishDate(value);
  return formatted === "—" ? value : formatted;
}

export function formatMonth(value: string): string {
  const date = new Date(`${value}-01T12:00:00`);
  return date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}

export type EditorPresentation = {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  createLabel: string;
};

export function getEditorPresentation(editor: EditorState | null): EditorPresentation | null {
  if (!editor) return null;
  if (editor.kind === "matter") return {
    title: editor.mode === "edit" ? "Edytuj sprawę" : "Nowa sprawa",
    description: "Zapisz termin i kontekst, którego nie chcesz później odtwarzać z pamięci.",
    label: "Nazwa sprawy",
    placeholder: "np. Przedłużyć polisę mieszkania",
    createLabel: "Dodaj sprawę",
  };
  if (editor.kind === "payment") return {
    title: editor.mode === "edit" ? "Edytuj płatność" : "Nowa płatność",
    description: "Pilnuj kolejnego terminu, kwoty i sposobu opłacania stałego rachunku.",
    label: "Nazwa płatności",
    placeholder: "np. Czynsz za mieszkanie",
    createLabel: "Dodaj płatność",
  };
  if (editor.kind === "oneTime") return {
    title: editor.mode === "edit" ? "Edytuj płatność" : "Nowa płatność",
    description: "Zapisz kwotę i termin zobowiązania, które pojawia się tylko raz.",
    label: "Nazwa płatności",
    placeholder: "np. Opłata za wydanie paszportu",
    createLabel: "Dodaj płatność",
  };
  if (editor.kind === "subscription") return {
    title: editor.mode === "edit" ? "Edytuj subskrypcję" : "Nowa subskrypcja",
    description: "Kontroluj koszt, cykl odnowienia oraz ewentualny koniec zobowiązania.",
    label: "Nazwa subskrypcji",
    placeholder: "np. Dysk w chmurze",
    createLabel: "Dodaj subskrypcję",
  };
  if (editor.kind === "document") return {
    title: editor.mode === "edit" ? "Edytuj dokument" : "Nowy dokument",
    description: "Zapisuj tylko informacje potrzebne do pilnowania ważności — bez pełnych numerów dokumentów.",
    label: "Nazwa dokumentu",
    placeholder: "np. Dowód osobisty",
    createLabel: "Dodaj dokument",
  };
  if (editor.kind === "vehicle") return {
    title: editor.mode === "edit" ? "Edytuj pojazd" : "Nowy pojazd",
    description: "Aktualny przebieg pozwala poprawnie ostrzegać o serwisach i wymianach.",
    label: "Nazwa pojazdu",
    placeholder: "np. Samochód rodzinny",
    createLabel: "Dodaj pojazd",
  };
  return {
    title: editor.mode === "edit" ? "Edytuj termin" : "Nowy termin",
    description: "Ustaw datę, przebieg graniczny albo oba warunki jednocześnie.",
    label: "Nazwa terminu",
    placeholder: "np. Wymiana oleju i filtrów",
    createLabel: "Dodaj termin",
  };
}

export function formatMoney(value: number): string {
  return formatCurrency(value);
}

export function daysUntil(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return Number.POSITIVE_INFINITY;
  const target = Date.UTC(year, month - 1, day);
  const today = new Date();
  const current = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - current) / 86_400_000);
}

export function dueCopy(value: string): { text: string; tone: "neutral" | "warning" | "danger" | "success" } {
  if (!value) return { text: "Bez terminu", tone: "neutral" };
  const days = daysUntil(value);
  if (days < 0) return { text: `${Math.abs(days)} dni po terminie`, tone: "danger" };
  if (days === 0) return { text: "Dzisiaj", tone: "warning" };
  if (days === 1) return { text: "Jutro", tone: "warning" };
  if (days <= 7) return { text: `Za ${days} dni`, tone: "warning" };
  return { text: formatDate(value), tone: "neutral" };
}

export function documentDueCopy(document: DocumentRecord): { text: string; tone: "neutral" | "warning" | "danger" | "success" } {
  if (!document.expiresAt) return { text: "Bezterminowy", tone: "neutral" };
  const days = daysUntil(document.expiresAt);
  if (days < 0) return { text: `Nieważny od ${Math.abs(days)} dni`, tone: "danger" };
  if (days === 0) return { text: "Wygasa dzisiaj", tone: "danger" };
  if (days <= document.reminderDays) return { text: days === 1 ? "Wygasa jutro" : `Wygasa za ${days} dni`, tone: "warning" };
  return { text: formatDate(document.expiresAt), tone: "neutral" };
}

export function formatMileage(value: number): string {
  return `${new Intl.NumberFormat("pl-PL").format(value)} km`;
}

export function vehicleItemDueCopy(item: VehicleItem, vehicle: Vehicle): { text: string; tone: "neutral" | "warning" | "danger" | "success" } {
  if (item.done) return { text: "Zrobione", tone: "success" };
  const dateDays = item.dueDate ? daysUntil(item.dueDate) : Number.POSITIVE_INFINITY;
  const mileageLeft = item.dueMileage === null ? Number.POSITIVE_INFINITY : item.dueMileage - vehicle.mileage;

  if (dateDays < 0) return { text: `${Math.abs(dateDays)} dni po terminie`, tone: "danger" };
  if (mileageLeft <= 0) return { text: "Przebieg przekroczony", tone: "danger" };
  if (dateDays <= 30) return dueCopy(item.dueDate);
  if (mileageLeft <= 1_000) return { text: `Za ${formatMileage(mileageLeft)}`, tone: "warning" };
  // The row already prints the due date and the due mileage in its own column. Repeating either
  // one here rendered the same value twice side by side; the badge carries the status instead.
  return { text: "W terminie", tone: "neutral" };
}

export function shiftMonthKey(value: string, offset: number): string {
  const date = new Date(`${value}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return getMonthKey(date);
}
