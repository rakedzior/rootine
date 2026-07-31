import {
  Building2,
  Car,
  CircleDollarSign,
  CreditCard,
  FileText,
  HeartPulse,
  Home,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  getMonthKey,
  type BudgetLineKind,
  type DocumentCategory,
  type DocumentRecord,
  type MatterCategory,
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
  | "matters"
  | "oneTime"
  | "payments"
  | "subscriptions"
  | "documents"
  | "vehicles"
  | "budget"
  | "jdg";
export type EditorState =
  | { kind: "matter"; mode: "add" | "edit"; id?: string }
  | { kind: "payment"; mode: "add" | "edit"; id?: string }
  | { kind: "oneTime"; mode: "add" | "edit"; id?: string }
  | { kind: "subscription"; mode: "add" | "edit"; id?: string }
  | { kind: "document"; mode: "add" | "edit"; id?: string }
  | { kind: "vehicle"; mode: "add" | "edit"; id?: string }
  | { kind: "vehicleItem"; mode: "add" | "edit"; id?: string; vehicleId: string }
  | { kind: "budget"; mode: "add" };
export type DeleteState = {
  kind: "matter" | "payment" | "oneTime" | "subscription" | "document" | "vehicle" | "vehicleItem" | "budget";
  id: string;
  label: string;
};

export type Draft = {
  title: string;
  category: string;
  priority: MatterPriority;
  status: MatterStatus;
  dueDate: string;
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
  budgetKind: BudgetLineKind;
  planned: string;
  actual: string;
};

export const EMPTY_DRAFT: Draft = {
  title: "",
  category: "urzedy",
  priority: "normal",
  status: "open",
  dueDate: "",
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
  budgetKind: "fixed",
  planned: "",
  actual: "",
};

export const VIEW_COPY: Record<AffairsView, { title: string; description: string }> = {
  overview: { title: "Sprawy", description: "Najbliższe zobowiązania i plan miesiąca" },
  matters: { title: "Sprawy", description: "Prywatne formalności, decyzje i ważne terminy" },
  oneTime: { title: "Sprawy", description: "Jednorazowe rachunki, opłaty i zobowiązania" },
  payments: { title: "Sprawy", description: "Stałe rachunki i płatności cykliczne" },
  subscriptions: { title: "Sprawy", description: "Subskrypcje, członkostwa i kończące się umowy" },
  documents: { title: "Sprawy", description: "Ważność dokumentów, polis, kart i gwarancji" },
  vehicles: { title: "Sprawy", description: "OC, przeglądy, serwis i terminy pojazdów" },
  budget: { title: "Sprawy", description: "Miesięczny plan wpływów, wydatków i oszczędności" },
  jdg: { title: "Sprawy", description: "JDG · Miesięczne dokumenty, podatki i zamknięcie działalności" },
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

export const BUDGET_KIND_LABELS: Record<BudgetLineKind, string> = {
  income: "Wpływy",
  fixed: "Stałe",
  flexible: "Elastyczne",
  savings: "Oszczędności",
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
  items: Array<{ view: AffairsView; label: string; icon: typeof LayoutDashboard }>;
}> = [
  {
    label: "Główne",
    items: [
      { view: "overview", label: "Przegląd", icon: LayoutDashboard },
      { view: "matters", label: "Sprawy", icon: ShieldCheck },
    ],
  },
  {
    label: "Finanse",
    items: [
      { view: "oneTime", label: "Jednorazowe", icon: ReceiptText },
      { view: "payments", label: "Cykliczne", icon: RefreshCw },
      { view: "subscriptions", label: "Subskrypcje", icon: CreditCard },
      { view: "budget", label: "Budżet", icon: WalletCards },
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
    label: "Firma",
    items: [{ view: "jdg", label: "JDG", icon: Building2 }],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
export const AFFAIRS_VIEWS = new Set<AffairsView>(NAV_ITEMS.map((item) => item.view));

export const UPCOMING_ICONS = {
  matter: ShieldCheck,
  oneTime: ReceiptText,
  payment: RefreshCw,
  subscription: CreditCard,
  document: FileText,
  vehicle: Car,
};

export function getInitialView(): AffairsView {
  if (typeof window === "undefined") return "overview";
  const requested = new URLSearchParams(window.location.search).get("widok") as AffairsView | null;
  if (requested && AFFAIRS_VIEWS.has(requested)) return requested;
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
  const days = daysUntil(value);
  if (days < 0) return { text: `${Math.abs(days)} dni po terminie`, tone: "warning" };
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
  if (item.dueDate) return { text: formatDate(item.dueDate), tone: "neutral" };
  return { text: `Przy ${formatMileage(item.dueMileage ?? 0)}`, tone: "neutral" };
}

export function shiftMonthKey(value: string, offset: number): string {
  const date = new Date(`${value}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return getMonthKey(date);
}
