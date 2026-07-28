/**
 * THESIS: Sprawy is a responsibility register, not another task list; it refuses one undifferentiated inbox.
 * OWN-WORLD: Routine's graphite workshop, compact ledgers, quiet borders, and precision blue for the active register.
 * STORY: See what carries risk, maintain recurring commitments, and give every złoty a place before the month starts.
 * FIRST VIEWPORT: A local register rail frames a dated agenda where private matters, renewals, and budget signals meet.
 * FORM: The seventh grounded structure — a monthly responsibility cockpit — selected with seed 54454916.
 */
import {
  Archive,
  Building2,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  HeartPulse,
  Home,
  Landmark,
  LayoutDashboard,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import {
  AFFAIRS_STORAGE_KEY,
  advancePaymentDateToFuture,
  createAffairsId,
  createBudgetMonth,
  getMonthKey,
  loadAffairsWorkspace,
  saveAffairsWorkspace,
  type BudgetLineKind,
  type DocumentCategory,
  type DocumentRecord,
  type Matter,
  type MatterCategory,
  type MatterPriority,
  type MatterStatus,
  type OneTimePayment,
  type PaymentCadence,
  type Subscription,
  type SubscriptionRenewal,
  type Vehicle,
  type VehicleItem,
  type VehicleItemType,
  monthlyEquivalent,
} from "../data/affairsWorkspace";
import { JdgWorkspace } from "./Jdg";
import {
  Badge,
  Button,
  Card,
  ContextNavItem,
  ContextSidebar,
  DetailPanel,
  EmptyState,
  Input,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  SectionHeader,
  Select,
  WorkspaceToolbar,
} from "../ui";
import "../../styles/affairs.css";

type AffairsView =
  | "overview"
  | "matters"
  | "oneTime"
  | "payments"
  | "subscriptions"
  | "documents"
  | "vehicles"
  | "budget"
  | "jdg";
type EditorState =
  | { kind: "matter"; mode: "add" | "edit"; id?: string }
  | { kind: "payment"; mode: "add" | "edit"; id?: string }
  | { kind: "oneTime"; mode: "add" | "edit"; id?: string }
  | { kind: "subscription"; mode: "add" | "edit"; id?: string }
  | { kind: "document"; mode: "add" | "edit"; id?: string }
  | { kind: "vehicle"; mode: "add" | "edit"; id?: string }
  | { kind: "vehicleItem"; mode: "add" | "edit"; id?: string; vehicleId: string }
  | { kind: "budget"; mode: "add" };
type DeleteState = {
  kind: "matter" | "payment" | "oneTime" | "subscription" | "document" | "vehicle" | "vehicleItem" | "budget";
  id: string;
  label: string;
};

type Draft = {
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

const EMPTY_DRAFT: Draft = {
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

const VIEW_COPY: Record<AffairsView, { title: string; description: string }> = {
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

const CATEGORY_META: Record<MatterCategory, { label: string; icon: typeof Landmark }> = {
  urzedy: { label: "Urzędy", icon: Landmark },
  zdrowie: { label: "Zdrowie", icon: HeartPulse },
  dom: { label: "Dom", icon: Home },
  auto: { label: "Auto", icon: Car },
  finanse: { label: "Finanse", icon: CircleDollarSign },
  dokumenty: { label: "Dokumenty", icon: FileText },
};

const STATUS_LABELS: Record<MatterStatus, string> = {
  open: "Do zrobienia",
  waiting: "Oczekuje",
  done: "Załatwione",
};

const CADENCE_LABELS: Record<PaymentCadence, string> = {
  monthly: "Co miesiąc",
  quarterly: "Co kwartał",
  yearly: "Co rok",
};

const BUDGET_KIND_LABELS: Record<BudgetLineKind, string> = {
  income: "Wpływy",
  fixed: "Stałe",
  flexible: "Elastyczne",
  savings: "Oszczędności",
};

const DOCUMENT_LABELS: Record<DocumentCategory, string> = {
  identity: "Tożsamość",
  driving: "Uprawnienia",
  insurance: "Polisa",
  health: "Zdrowie",
  agreement: "Umowa / gwarancja",
  other: "Inne",
};

const VEHICLE_ITEM_LABELS: Record<VehicleItemType, string> = {
  insurance: "Ubezpieczenie",
  inspection: "Przegląd",
  service: "Serwis",
  tires: "Opony",
  lease: "Leasing",
  warranty: "Gwarancja",
  other: "Inne",
};

const NAV_GROUPS: Array<{
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

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
const AFFAIRS_VIEWS = new Set<AffairsView>(NAV_ITEMS.map((item) => item.view));

const UPCOMING_ICONS = {
  matter: ShieldCheck,
  oneTime: ReceiptText,
  payment: RefreshCw,
  subscription: CreditCard,
  document: FileText,
  vehicle: Car,
};

function getInitialView(): AffairsView {
  if (typeof window === "undefined") return "overview";
  const requested = new URLSearchParams(window.location.search).get("widok") as AffairsView | null;
  if (requested && AFFAIRS_VIEWS.has(requested)) return requested;
  return "overview";
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value || "Bez terminu";
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
}

function formatMonth(value: string): string {
  const date = new Date(`${value}-01T12:00:00`);
  return date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function daysUntil(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return Number.POSITIVE_INFINITY;
  const target = Date.UTC(year, month - 1, day);
  const today = new Date();
  const current = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - current) / 86_400_000);
}

function dueCopy(value: string): { text: string; tone: "neutral" | "warning" | "danger" | "success" } {
  const days = daysUntil(value);
  if (days < 0) return { text: `${Math.abs(days)} dni po terminie`, tone: "danger" };
  if (days === 0) return { text: "Dzisiaj", tone: "danger" };
  if (days === 1) return { text: "Jutro", tone: "warning" };
  if (days <= 7) return { text: `Za ${days} dni`, tone: "warning" };
  return { text: formatDate(value), tone: "neutral" };
}

function documentDueCopy(document: DocumentRecord): { text: string; tone: "neutral" | "warning" | "danger" | "success" } {
  if (!document.expiresAt) return { text: "Bezterminowy", tone: "neutral" };
  const days = daysUntil(document.expiresAt);
  if (days < 0) return { text: `Nieważny od ${Math.abs(days)} dni`, tone: "danger" };
  if (days === 0) return { text: "Wygasa dzisiaj", tone: "danger" };
  if (days <= document.reminderDays) return { text: days === 1 ? "Wygasa jutro" : `Wygasa za ${days} dni`, tone: "warning" };
  return { text: formatDate(document.expiresAt), tone: "neutral" };
}

function formatMileage(value: number): string {
  return `${new Intl.NumberFormat("pl-PL").format(value)} km`;
}

function vehicleItemDueCopy(item: VehicleItem, vehicle: Vehicle): { text: string; tone: "neutral" | "warning" | "danger" | "success" } {
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

function shiftMonthKey(value: string, offset: number): string {
  const date = new Date(`${value}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return getMonthKey(date);
}

export default function Sprawy() {
  const [workspace, setWorkspace] = useState(loadAffairsWorkspace);
  const [view, setView] = useState<AffairsView>(getInitialView);
  const [statusFilter, setStatusFilter] = useState<"active" | MatterStatus>("active");
  const [categoryFilter, setCategoryFilter] = useState<"all" | MatterCategory>("all");
  const [selectedMatterId, setSelectedMatterId] = useState("");
  const [budgetMonthKey, setBudgetMonthKey] = useState(getMonthKey);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editorError, setEditorError] = useState("");
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setStorageError(!saveAffairsWorkspace(workspace));
  }, [workspace]);

  useEffect(() => subscribeToLocalWorkspace(AFFAIRS_STORAGE_KEY, () => {
    setWorkspace(loadAffairsWorkspace());
  }), []);

  useEffect(() => {
    const onPopState = () => setView(getInitialView());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    setWorkspace((current) => {
      let changed = false;
      const payments = current.payments.map((payment) => {
        if (!payment.active || !payment.automatic) return payment;
        const nextDueDate = advancePaymentDateToFuture(payment.nextDueDate, payment.cadence);
        if (nextDueDate === payment.nextDueDate) return payment;
        changed = true;
        return { ...payment, nextDueDate };
      });
      const subscriptions = current.subscriptions.map((subscription) => {
        if (!subscription.active || subscription.renewal !== "automatic") return subscription;
        const nextBillingDate = advancePaymentDateToFuture(subscription.nextBillingDate, subscription.cadence);
        if (nextBillingDate === subscription.nextBillingDate) return subscription;
        changed = true;
        return { ...subscription, nextBillingDate };
      });
      return changed ? { ...current, payments, subscriptions } : current;
    });
  }, []);

  useEffect(() => {
    if (workspace.budgets.some((budget) => budget.month === budgetMonthKey)) return;
    setWorkspace((current) => ({
      ...current,
      budgets: [...current.budgets, createBudgetMonth(budgetMonthKey, current.budgets.at(-1))],
    }));
  }, [budgetMonthKey, workspace.budgets]);

  const activeMatters = workspace.matters.filter((matter) => matter.status !== "done");
  const selectedMatter = workspace.matters.find((matter) => matter.id === selectedMatterId);
  const currentBudget = workspace.budgets.find((budget) => budget.month === budgetMonthKey);

  const filteredMatters = useMemo(() => {
    return workspace.matters
      .filter((matter) => statusFilter === "active" ? matter.status !== "done" : matter.status === statusFilter)
      .filter((matter) => categoryFilter === "all" || matter.category === categoryFilter)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [categoryFilter, statusFilter, workspace.matters]);

  const monthlyPaymentTotal = useMemo(
    () => workspace.payments
      .filter((payment) => payment.active)
      .reduce((sum, payment) => sum + monthlyEquivalent(payment.amount, payment.cadence), 0),
    [workspace.payments],
  );

  const monthlySubscriptionTotal = useMemo(
    () => workspace.subscriptions
      .filter((subscription) => subscription.active)
      .reduce((sum, subscription) => sum + monthlyEquivalent(subscription.amount, subscription.cadence), 0),
    [workspace.subscriptions],
  );

  const unpaidOneTimeTotal = workspace.oneTimePayments
    .filter((payment) => !payment.paid)
    .reduce((sum, payment) => sum + payment.amount, 0);

  const documentAlerts = workspace.documents.filter((document) => (
    document.expiresAt && daysUntil(document.expiresAt) <= document.reminderDays
  )).length;

  const vehicleAlerts = workspace.vehicleItems.filter((item) => {
    if (item.done) return false;
    const vehicle = workspace.vehicles.find((candidate) => candidate.id === item.vehicleId);
    const dateNear = item.dueDate ? daysUntil(item.dueDate) <= 30 : false;
    const mileageNear = item.dueMileage !== null && vehicle
      ? item.dueMileage <= vehicle.mileage + 1_000
      : false;
    return dateNear || mileageNear;
  }).length;

  const budgetSummary = useMemo(() => {
    const lines = currentBudget?.lines ?? [];
    const income = lines.filter((line) => line.kind === "income").reduce((sum, line) => sum + line.planned, 0);
    const plannedOut = lines.filter((line) => line.kind !== "income").reduce((sum, line) => sum + line.planned, 0);
    const actualIncome = lines.filter((line) => line.kind === "income").reduce((sum, line) => sum + line.actual, 0);
    const actualOut = lines.filter((line) => line.kind !== "income").reduce((sum, line) => sum + line.actual, 0);
    return {
      income,
      plannedOut,
      actualIncome,
      actualOut,
      plannedAvailable: income - plannedOut,
      actualAvailable: actualIncome - actualOut,
    };
  }, [currentBudget]);

  const upcoming = useMemo(() => {
    const matters = activeMatters.map((matter) => ({
      id: matter.id,
      view: "matters" as AffairsView,
      kind: "matter",
      title: matter.title,
      meta: CATEGORY_META[matter.category].label,
      dueDate: matter.dueDate,
      amount: null as number | null,
    }));
    const payments = workspace.payments.filter((payment) => payment.active).map((payment) => ({
      id: payment.id,
      view: "payments" as AffairsView,
      kind: "payment",
      title: payment.name,
      meta: payment.automatic ? "Płatność automatyczna" : "Do opłacenia ręcznie",
      dueDate: payment.nextDueDate,
      amount: payment.amount,
    }));
    const oneTime = workspace.oneTimePayments.filter((payment) => !payment.paid).map((payment) => ({
      id: payment.id,
      view: "oneTime" as AffairsView,
      kind: "oneTime",
      title: payment.title,
      meta: `Płatność jednorazowa · ${payment.category}`,
      dueDate: payment.dueDate,
      amount: payment.amount,
    }));
    const subscriptions = workspace.subscriptions.filter((subscription) => subscription.active).map((subscription) => ({
      id: subscription.id,
      view: "subscriptions" as AffairsView,
      kind: "subscription",
      title: subscription.name,
      meta: subscription.renewal === "automatic" ? "Odnowienie automatyczne" : "Odnowienie ręczne",
      dueDate: subscription.nextBillingDate,
      amount: subscription.amount,
    }));
    const documents = workspace.documents.filter((document) => document.expiresAt).map((document) => ({
      id: document.id,
      view: "documents" as AffairsView,
      kind: "document",
      title: document.name,
      meta: `${document.holder} · ${DOCUMENT_LABELS[document.category]}`,
      dueDate: document.expiresAt,
      amount: null as number | null,
    }));
    const vehicleItems = workspace.vehicleItems.filter((item) => !item.done && item.dueDate).map((item) => {
      const vehicle = workspace.vehicles.find((candidate) => candidate.id === item.vehicleId);
      return {
        id: item.id,
        view: "vehicles" as AffairsView,
        kind: "vehicle",
        title: item.title,
        meta: `${vehicle?.name ?? "Pojazd"} · ${VEHICLE_ITEM_LABELS[item.type]}`,
        dueDate: item.dueDate,
        amount: null as number | null,
      };
    });
    return [...matters, ...oneTime, ...payments, ...subscriptions, ...documents, ...vehicleItems]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 10);
  }, [
    activeMatters,
    workspace.documents,
    workspace.oneTimePayments,
    workspace.payments,
    workspace.subscriptions,
    workspace.vehicleItems,
    workspace.vehicles,
  ]);

  const isWithinNext30Days = (date: string) => {
    const days = daysUntil(date);
    return days >= 0 && days <= 30;
  };
  const dueSoon = activeMatters.filter((matter) => isWithinNext30Days(matter.dueDate)).length
    + workspace.oneTimePayments.filter((payment) => !payment.paid && isWithinNext30Days(payment.dueDate)).length
    + workspace.payments.filter((payment) => payment.active && isWithinNext30Days(payment.nextDueDate)).length
    + workspace.subscriptions.filter((subscription) => subscription.active && isWithinNext30Days(subscription.nextBillingDate)).length
    + workspace.documents.filter((document) => document.expiresAt && isWithinNext30Days(document.expiresAt)).length
    + workspace.vehicleItems.filter((item) => !item.done && item.dueDate && isWithinNext30Days(item.dueDate)).length;

  const openMatterEditor = (matter?: Matter) => {
    setDraft(matter ? {
      ...EMPTY_DRAFT,
      title: matter.title,
      category: matter.category,
      priority: matter.priority,
      status: matter.status,
      dueDate: matter.dueDate,
      note: matter.note,
    } : EMPTY_DRAFT);
    setEditorError("");
    setEditor({ kind: "matter", mode: matter ? "edit" : "add", id: matter?.id });
  };

  const openPaymentEditor = (paymentId?: string) => {
    const payment = workspace.payments.find((item) => item.id === paymentId);
    setDraft(payment ? {
      ...EMPTY_DRAFT,
      title: payment.name,
      category: payment.category,
      dueDate: payment.nextDueDate,
      note: payment.note,
      amount: String(payment.amount),
      cadence: payment.cadence,
      automatic: payment.automatic,
    } : { ...EMPTY_DRAFT, category: "Rachunki" });
    setEditorError("");
    setEditor({ kind: "payment", mode: payment ? "edit" : "add", id: payment?.id });
  };

  const openOneTimeEditor = (payment?: OneTimePayment) => {
    setDraft(payment ? {
      ...EMPTY_DRAFT,
      title: payment.title,
      category: payment.category,
      amount: String(payment.amount),
      dueDate: payment.dueDate,
      note: payment.note,
    } : { ...EMPTY_DRAFT, category: "Inne" });
    setEditorError("");
    setEditor({ kind: "oneTime", mode: payment ? "edit" : "add", id: payment?.id });
  };

  const openSubscriptionEditor = (subscription?: Subscription) => {
    setDraft(subscription ? {
      ...EMPTY_DRAFT,
      title: subscription.name,
      category: subscription.category,
      amount: String(subscription.amount),
      cadence: subscription.cadence,
      dueDate: subscription.nextBillingDate,
      secondaryDate: subscription.commitmentEndDate,
      renewal: subscription.renewal,
      note: subscription.note,
    } : { ...EMPTY_DRAFT, category: "Rozrywka", renewal: "automatic" });
    setEditorError("");
    setEditor({ kind: "subscription", mode: subscription ? "edit" : "add", id: subscription?.id });
  };

  const openDocumentEditor = (document?: DocumentRecord) => {
    setDraft(document ? {
      ...EMPTY_DRAFT,
      title: document.name,
      category: document.category,
      holder: document.holder,
      dueDate: document.expiresAt,
      reminderDays: String(document.reminderDays),
      note: document.note,
    } : { ...EMPTY_DRAFT, category: "identity", holder: "Ja", reminderDays: "90" });
    setEditorError("");
    setEditor({ kind: "document", mode: document ? "edit" : "add", id: document?.id });
  };

  const openVehicleEditor = (vehicle?: Vehicle) => {
    setDraft(vehicle ? {
      ...EMPTY_DRAFT,
      title: vehicle.name,
      registration: vehicle.registration,
      mileage: String(vehicle.mileage),
    } : EMPTY_DRAFT);
    setEditorError("");
    setEditor({ kind: "vehicle", mode: vehicle ? "edit" : "add", id: vehicle?.id });
  };

  const openVehicleItemEditor = (vehicleId: string, item?: VehicleItem) => {
    setDraft(item ? {
      ...EMPTY_DRAFT,
      title: item.title,
      vehicleId: item.vehicleId,
      vehicleType: item.type,
      dueDate: item.dueDate,
      dueMileage: item.dueMileage === null ? "" : String(item.dueMileage),
      note: item.note,
    } : { ...EMPTY_DRAFT, vehicleId, vehicleType: "service" });
    setEditorError("");
    setEditor({ kind: "vehicleItem", mode: item ? "edit" : "add", id: item?.id, vehicleId });
  };

  const openBudgetEditor = () => {
    setDraft({ ...EMPTY_DRAFT, category: "", budgetKind: "fixed" });
    setEditorError("");
    setEditor({ kind: "budget", mode: "add" });
  };

  const closeEditor = () => {
    setEditor(null);
    setEditorError("");
  };

  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    const title = draft.title.trim();
    if (!title) {
      setEditorError("Wpisz nazwę.");
      return;
    }

    if (editor.kind === "matter") {
      if (!draft.dueDate) {
        setEditorError("Wybierz termin sprawy.");
        return;
      }
      const matter: Matter = {
        id: editor.id ?? createAffairsId("matter"),
        title,
        category: draft.category as MatterCategory,
        priority: draft.priority,
        status: draft.status,
        dueDate: draft.dueDate,
        note: draft.note.trim(),
        createdAt: workspace.matters.find((item) => item.id === editor.id)?.createdAt ?? new Date().toISOString(),
      };
      setWorkspace((current) => ({
        ...current,
        matters: editor.mode === "edit"
          ? current.matters.map((item) => item.id === editor.id ? matter : item)
          : [...current.matters, matter],
      }));
      setSelectedMatterId(matter.id);
    }

    if (editor.kind === "payment") {
      const amount = Number(draft.amount.replace(",", "."));
      if (!draft.dueDate || !Number.isFinite(amount) || amount < 0) {
        setEditorError("Podaj prawidłową kwotę i najbliższy termin.");
        return;
      }
      const payment = {
        id: editor.id ?? createAffairsId("payment"),
        name: title,
        category: draft.category.trim() || "Inne",
        amount,
        cadence: draft.cadence,
        nextDueDate: draft.dueDate,
        automatic: draft.automatic,
        active: workspace.payments.find((item) => item.id === editor.id)?.active ?? true,
        note: draft.note.trim(),
      };
      setWorkspace((current) => ({
        ...current,
        payments: editor.mode === "edit"
          ? current.payments.map((item) => item.id === editor.id ? payment : item)
          : [...current.payments, payment],
      }));
    }

    if (editor.kind === "oneTime") {
      const amount = Number(draft.amount.replace(",", "."));
      if (!draft.dueDate || !Number.isFinite(amount) || amount < 0) {
        setEditorError("Podaj prawidłową kwotę i termin płatności.");
        return;
      }
      const existing = workspace.oneTimePayments.find((item) => item.id === editor.id);
      const payment: OneTimePayment = {
        id: editor.id ?? createAffairsId("one-time"),
        title,
        category: draft.category.trim() || "Inne",
        amount,
        dueDate: draft.dueDate,
        paid: existing?.paid ?? false,
        paidAt: existing?.paidAt ?? "",
        note: draft.note.trim(),
      };
      setWorkspace((current) => ({
        ...current,
        oneTimePayments: editor.mode === "edit"
          ? current.oneTimePayments.map((item) => item.id === editor.id ? payment : item)
          : [...current.oneTimePayments, payment],
      }));
    }

    if (editor.kind === "subscription") {
      const amount = Number(draft.amount.replace(",", "."));
      if (!draft.dueDate || !Number.isFinite(amount) || amount < 0) {
        setEditorError("Podaj prawidłową kwotę i datę kolejnego rozliczenia.");
        return;
      }
      const subscription: Subscription = {
        id: editor.id ?? createAffairsId("subscription"),
        name: title,
        category: draft.category.trim() || "Inne",
        amount,
        cadence: draft.cadence,
        nextBillingDate: draft.dueDate,
        renewal: draft.renewal,
        commitmentEndDate: draft.secondaryDate,
        active: workspace.subscriptions.find((item) => item.id === editor.id)?.active ?? true,
        note: draft.note.trim(),
      };
      setWorkspace((current) => ({
        ...current,
        subscriptions: editor.mode === "edit"
          ? current.subscriptions.map((item) => item.id === editor.id ? subscription : item)
          : [...current.subscriptions, subscription],
      }));
    }

    if (editor.kind === "document") {
      const reminderDays = Number(draft.reminderDays);
      if (!Number.isInteger(reminderDays) || reminderDays < 0 || reminderDays > 730) {
        setEditorError("Wyprzedzenie przypomnienia musi mieścić się między 0 a 730 dni.");
        return;
      }
      const document: DocumentRecord = {
        id: editor.id ?? createAffairsId("document"),
        name: title,
        category: draft.category as DocumentCategory,
        holder: draft.holder.trim() || "Ja",
        expiresAt: draft.dueDate,
        reminderDays,
        note: draft.note.trim(),
      };
      setWorkspace((current) => ({
        ...current,
        documents: editor.mode === "edit"
          ? current.documents.map((item) => item.id === editor.id ? document : item)
          : [...current.documents, document],
      }));
    }

    if (editor.kind === "vehicle") {
      const mileage = Number(draft.mileage.replace(/\s/g, ""));
      if (!Number.isFinite(mileage) || mileage < 0) {
        setEditorError("Podaj prawidłowy przebieg pojazdu.");
        return;
      }
      const vehicle: Vehicle = {
        id: editor.id ?? createAffairsId("vehicle"),
        name: title,
        registration: draft.registration.trim().toLocaleUpperCase("pl-PL"),
        mileage,
      };
      setWorkspace((current) => ({
        ...current,
        vehicles: editor.mode === "edit"
          ? current.vehicles.map((item) => item.id === editor.id ? vehicle : item)
          : [...current.vehicles, vehicle],
      }));
    }

    if (editor.kind === "vehicleItem") {
      const dueMileage = draft.dueMileage.trim() ? Number(draft.dueMileage.replace(/\s/g, "")) : null;
      if (!draft.dueDate && dueMileage === null) {
        setEditorError("Podaj termin lub przebieg graniczny.");
        return;
      }
      if (dueMileage !== null && (!Number.isFinite(dueMileage) || dueMileage < 0)) {
        setEditorError("Podaj prawidłowy przebieg graniczny.");
        return;
      }
      const existing = workspace.vehicleItems.find((item) => item.id === editor.id);
      const item: VehicleItem = {
        id: editor.id ?? createAffairsId("vehicle-item"),
        vehicleId: draft.vehicleId || editor.vehicleId,
        title,
        type: draft.vehicleType,
        dueDate: draft.dueDate,
        dueMileage,
        done: existing?.done ?? false,
        note: draft.note.trim(),
      };
      setWorkspace((current) => ({
        ...current,
        vehicleItems: editor.mode === "edit"
          ? current.vehicleItems.map((candidate) => candidate.id === editor.id ? item : candidate)
          : [...current.vehicleItems, item],
      }));
    }

    if (editor.kind === "budget") {
      const planned = Number(draft.planned.replace(",", "."));
      const actual = Number(draft.actual.replace(",", ".") || "0");
      if (!Number.isFinite(planned) || planned < 0 || !Number.isFinite(actual) || actual < 0) {
        setEditorError("Podaj prawidłowe kwoty.");
        return;
      }
      setWorkspace((current) => ({
        ...current,
        budgets: current.budgets.map((budget) => budget.month === budgetMonthKey
          ? {
              ...budget,
              lines: [...budget.lines, {
                id: createAffairsId("budget"),
                label: title,
                kind: draft.budgetKind,
                planned,
                actual,
              }],
            }
          : budget),
      }));
    }
    closeEditor();
  };

  const confirmDelete = () => {
    if (!deleteState) return;
    setWorkspace((current) => {
      if (deleteState.kind === "matter") {
        return { ...current, matters: current.matters.filter((item) => item.id !== deleteState.id) };
      }
      if (deleteState.kind === "payment") {
        return { ...current, payments: current.payments.filter((item) => item.id !== deleteState.id) };
      }
      if (deleteState.kind === "oneTime") {
        return { ...current, oneTimePayments: current.oneTimePayments.filter((item) => item.id !== deleteState.id) };
      }
      if (deleteState.kind === "subscription") {
        return { ...current, subscriptions: current.subscriptions.filter((item) => item.id !== deleteState.id) };
      }
      if (deleteState.kind === "document") {
        return { ...current, documents: current.documents.filter((item) => item.id !== deleteState.id) };
      }
      if (deleteState.kind === "vehicle") {
        return {
          ...current,
          vehicles: current.vehicles.filter((item) => item.id !== deleteState.id),
          vehicleItems: current.vehicleItems.filter((item) => item.vehicleId !== deleteState.id),
        };
      }
      if (deleteState.kind === "vehicleItem") {
        return { ...current, vehicleItems: current.vehicleItems.filter((item) => item.id !== deleteState.id) };
      }
      return {
        ...current,
        budgets: current.budgets.map((budget) => budget.month === budgetMonthKey
          ? { ...budget, lines: budget.lines.filter((item) => item.id !== deleteState.id) }
          : budget),
      };
    });
    if (deleteState.id === selectedMatterId) setSelectedMatterId("");
    setDeleteState(null);
  };

  const toggleMatter = (matterId: string) => {
    setWorkspace((current) => ({
      ...current,
      matters: current.matters.map((matter) => matter.id === matterId
        ? { ...matter, status: matter.status === "done" ? "open" : "done" }
        : matter),
    }));
  };

  const budgetDraftKey = (lineId: string, field: "planned" | "actual") => `${lineId}:${field}`;

  const updateBudgetDraft = (lineId: string, field: "planned" | "actual", value: string) => {
    const key = budgetDraftKey(lineId, field);
    setBudgetDrafts((current) => ({ ...current, [key]: value }));
  };

  const commitBudgetValue = (lineId: string, field: "planned" | "actual") => {
    const key = budgetDraftKey(lineId, field);
    const rawValue = budgetDrafts[key];
    if (rawValue === undefined) return;
    const value = Number(rawValue.replace(",", "."));
    setBudgetDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (!rawValue.trim() || !Number.isFinite(value) || value < 0) return;
    setWorkspace((current) => ({
      ...current,
      budgets: current.budgets.map((budget) => budget.month === budgetMonthKey
        ? {
            ...budget,
            lines: budget.lines.map((line) => line.id === lineId ? { ...line, [field]: value } : line),
          }
        : budget),
    }));
  };

  const changeBudgetMonth = (offset: number) => {
    setBudgetMonthKey((current) => shiftMonthKey(current, offset));
  };

  const selectView = (nextView: AffairsView) => {
    setView(nextView);
    if (nextView !== "matters") setSelectedMatterId("");
    const url = new URL(window.location.href);
    if (nextView === "overview") {
      url.searchParams.delete("widok");
    } else {
      url.searchParams.set("widok", nextView);
    }
    if (url.href !== window.location.href) {
      window.history.pushState({}, "", url);
    }
  };

  const renderPrimaryAction = () => {
    if (view === "oneTime") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openOneTimeEditor()}><span className="header-action-label">Dodaj płatność</span></Button>;
    }
    if (view === "payments") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openPaymentEditor()}><span className="header-action-label">Dodaj cykliczną</span></Button>;
    }
    if (view === "subscriptions") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openSubscriptionEditor()}><span className="header-action-label">Dodaj subskrypcję</span></Button>;
    }
    if (view === "documents") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openDocumentEditor()}><span className="header-action-label">Dodaj dokument</span></Button>;
    }
    if (view === "vehicles") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openVehicleEditor()}><span className="header-action-label">Dodaj pojazd</span></Button>;
    }
    if (view === "budget") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={openBudgetEditor}><span className="header-action-label">Dodaj pozycję</span></Button>;
    }
    return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openMatterEditor()}><span className="header-action-label">Dodaj sprawę</span></Button>;
  };

  const navMeta = (itemView: AffairsView) => {
    if (itemView === "matters") return activeMatters.length;
    if (itemView === "oneTime") return workspace.oneTimePayments.filter((item) => !item.paid).length;
    if (itemView === "payments") return workspace.payments.filter((item) => item.active).length;
    if (itemView === "subscriptions") return workspace.subscriptions.filter((item) => item.active).length;
    if (itemView === "documents") return documentAlerts || undefined;
    if (itemView === "vehicles") return vehicleAlerts || undefined;
    return undefined;
  };

  const contextSidebar = (
    <ContextSidebar label="Widoki spraw" className="affairs-sidebar">
      <div className="affairs-sidebar__heading">
        <span>Organizacja</span>
        <strong>Sprawy i JDG</strong>
      </div>
      <nav className="affairs-sidebar__nav">
        {NAV_GROUPS.map((group) => (
          <section key={group.label}>
            <SectionHeader title={group.label} level={3} variant="label" />
            <div>
              {group.items.map(({ view: itemView, label, icon: Icon }) => (
                <ContextNavItem
                  key={itemView}
                  active={view === itemView}
                  icon={<Icon />}
                  label={label}
                  meta={navMeta(itemView)}
                  onClick={() => selectView(itemView)}
                />
              ))}
            </div>
          </section>
        ))}
      </nav>
      <div className="affairs-sidebar__footer">
        <Clock3 size={13} aria-hidden="true" />
        <span>{dueSoon} w ciągu 30 dni</span>
      </div>
    </ContextSidebar>
  );

  const detailPanel = selectedMatter && view === "matters" ? (
    <DetailPanel
      label={`Szczegóły: ${selectedMatter.title}`}
      className="affairs-detail"
      onDismiss={() => setSelectedMatterId("")}
    >
      <header className="affairs-detail__header">
        <div>
          <span>Szczegóły sprawy</span>
          <strong>{selectedMatter.title}</strong>
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij szczegóły" onClick={() => setSelectedMatterId("")}>
          <X size={13} />
        </Button>
      </header>
      <div className="affairs-detail__body">
        <div className="affairs-detail__status">
          <Badge tone={selectedMatter.status === "done" ? "success" : selectedMatter.status === "waiting" ? "warning" : "primary"} dot>
            {STATUS_LABELS[selectedMatter.status]}
          </Badge>
          {selectedMatter.priority === "high" && <Badge tone="danger">Ważna</Badge>}
        </div>
        <dl className="affairs-detail__facts">
          <div><dt>Obszar</dt><dd>{CATEGORY_META[selectedMatter.category].label}</dd></div>
          <div><dt>Termin</dt><dd>{formatDate(selectedMatter.dueDate)}</dd></div>
          <div><dt>Dodano</dt><dd>{new Date(selectedMatter.createdAt).toLocaleDateString("pl-PL")}</dd></div>
        </dl>
        <section className="affairs-detail__note">
          <h3>Kontekst</h3>
          <p>{selectedMatter.note || "Brak dodatkowej notatki."}</p>
        </section>
      </div>
      <footer className="affairs-detail__actions">
        <Button variant="quiet" leadingIcon={<Check size={13} />} onClick={() => toggleMatter(selectedMatter.id)}>
          {selectedMatter.status === "done" ? "Przywróć" : "Oznacz jako załatwione"}
        </Button>
        <Button variant="ghost" size="sm" iconOnly aria-label="Edytuj sprawę" onClick={() => openMatterEditor(selectedMatter)}>
          <Pencil size={13} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Usuń sprawę"
          onClick={() => setDeleteState({ kind: "matter", id: selectedMatter.id, label: selectedMatter.title })}
        >
          <Trash2 size={13} />
        </Button>
      </footer>
    </DetailPanel>
  ) : undefined;

  const editorPresentation = editor ? (() => {
    if (editor.kind === "matter") return {
      eyebrow: "Sprawa prywatna",
      title: editor.mode === "edit" ? "Edytuj sprawę" : "Nowa sprawa",
      description: "Zapisz termin i kontekst, którego nie chcesz później odtwarzać z pamięci.",
      label: "Nazwa sprawy",
      placeholder: "np. Przedłużyć polisę mieszkania",
    };
    if (editor.kind === "payment") return {
      eyebrow: "Płatność cykliczna",
      title: editor.mode === "edit" ? "Edytuj płatność" : "Nowa płatność",
      description: "Pilnuj kolejnego terminu, kwoty i sposobu opłacania stałego rachunku.",
      label: "Nazwa płatności",
      placeholder: "np. Czynsz za mieszkanie",
    };
    if (editor.kind === "oneTime") return {
      eyebrow: "Finanse jednorazowe",
      title: editor.mode === "edit" ? "Edytuj płatność" : "Nowa płatność",
      description: "Zapisz kwotę i termin zobowiązania, które pojawia się tylko raz.",
      label: "Nazwa płatności",
      placeholder: "np. Opłata za wydanie paszportu",
    };
    if (editor.kind === "subscription") return {
      eyebrow: "Subskrypcje",
      title: editor.mode === "edit" ? "Edytuj subskrypcję" : "Nowa subskrypcja",
      description: "Kontroluj koszt, cykl odnowienia oraz ewentualny koniec zobowiązania.",
      label: "Nazwa subskrypcji",
      placeholder: "np. Dysk w chmurze",
    };
    if (editor.kind === "document") return {
      eyebrow: "Rejestr dokumentów",
      title: editor.mode === "edit" ? "Edytuj dokument" : "Nowy dokument",
      description: "Zapisuj tylko informacje potrzebne do pilnowania ważności — bez pełnych numerów dokumentów.",
      label: "Nazwa dokumentu",
      placeholder: "np. Dowód osobisty",
    };
    if (editor.kind === "vehicle") return {
      eyebrow: "Rejestr pojazdów",
      title: editor.mode === "edit" ? "Edytuj pojazd" : "Nowy pojazd",
      description: "Aktualny przebieg pozwala poprawnie ostrzegać o serwisach i wymianach.",
      label: "Nazwa pojazdu",
      placeholder: "np. Samochód rodzinny",
    };
    if (editor.kind === "vehicleItem") return {
      eyebrow: "Termin pojazdu",
      title: editor.mode === "edit" ? "Edytuj termin" : "Nowy termin",
      description: "Ustaw datę, przebieg graniczny albo oba warunki jednocześnie.",
      label: "Nazwa terminu",
      placeholder: "np. Wymiana oleju i filtrów",
    };
    return {
      eyebrow: formatMonth(budgetMonthKey),
      title: "Nowa pozycja budżetu",
      description: "Przydziel pieniądze zanim zaczniesz je wydawać.",
      label: "Nazwa kategorii",
      placeholder: "np. Jedzenie",
    };
  })() : null;

  return (
    <ModuleShell contextSidebar={contextSidebar} detailPanel={detailPanel} className="affairs-module">
      <ModuleMain>
        {view === "jdg" ? <JdgWorkspace /> : (
          <>
        <PageHeader
          title={VIEW_COPY[view].title}
          description={VIEW_COPY[view].description}
          meta={storageError ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
          actions={renderPrimaryAction()}
        />
        <WorkspaceToolbar className="affairs-toolbar">
          <Select
            compact
            fieldClassName="context-mobile-select"
            aria-label="Wybierz widok spraw"
            value={view}
            options={NAV_ITEMS.map((item) => ({ value: item.view, label: item.label }))}
            onChange={(event) => selectView(event.target.value as AffairsView)}
          />
          {view === "matters" && (
            <>
              <Select
                compact
                aria-label="Filtr statusu"
                value={statusFilter}
                options={[
                  { value: "active", label: "Aktywne" },
                  { value: "open", label: "Do zrobienia" },
                  { value: "waiting", label: "Oczekujące" },
                  { value: "done", label: "Załatwione" },
                ]}
                onChange={(event) => setStatusFilter(event.target.value as "active" | MatterStatus)}
              />
              <Select
                compact
                aria-label="Filtr kategorii"
                value={categoryFilter}
                options={[
                  { value: "all", label: "Wszystkie obszary" },
                  ...Object.entries(CATEGORY_META).map(([value, meta]) => ({ value, label: meta.label })),
                ]}
                onChange={(event) => setCategoryFilter(event.target.value as "all" | MatterCategory)}
              />
              <span className="affairs-toolbar__count">{filteredMatters.length} pozycji</span>
            </>
          )}
          {view === "payments" && (
            <span className="affairs-toolbar__context">
              <CreditCard size={13} aria-hidden="true" />
              Szacunkowo {formatMoney(monthlyPaymentTotal)} / mies.
            </span>
          )}
          {view === "oneTime" && (
            <span className="affairs-toolbar__context">
              <ReceiptText size={13} aria-hidden="true" />
              Do opłacenia {formatMoney(unpaidOneTimeTotal)}
            </span>
          )}
          {view === "subscriptions" && (
            <span className="affairs-toolbar__context">
              <CreditCard size={13} aria-hidden="true" />
              Aktywne {formatMoney(monthlySubscriptionTotal)} / mies.
            </span>
          )}
          {view === "documents" && (
            <span className="affairs-toolbar__context">
              <FileText size={13} aria-hidden="true" />
              {documentAlerts ? `${documentAlerts} wymaga uwagi` : "Wszystkie terminy bezpieczne"}
            </span>
          )}
          {view === "vehicles" && (
            <span className="affairs-toolbar__context">
              <Car size={13} aria-hidden="true" />
              {workspace.vehicles.length} {workspace.vehicles.length === 1 ? "pojazd" : "pojazdy"} · {vehicleAlerts} bliskich terminów
            </span>
          )}
          {view === "budget" && (
            <div className="affairs-month-switcher">
              <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni miesiąc" onClick={() => changeBudgetMonth(-1)}><ChevronLeft size={13} /></Button>
              <strong>{formatMonth(budgetMonthKey)}</strong>
              <Button variant="ghost" size="sm" iconOnly aria-label="Następny miesiąc" onClick={() => changeBudgetMonth(1)}><ChevronRight size={13} /></Button>
            </div>
          )}
        </WorkspaceToolbar>

        <div className="affairs-canvas">
          {view === "overview" && (
            <div className="affairs-overview">
              <section className="affairs-overview__summary" aria-label="Podsumowanie miesiąca">
                <div>
                  <span>Najbliższe 30 dni</span>
                  <strong>{dueSoon}</strong>
                  <small>wszystkie zobowiązania na radarze</small>
                </div>
                <div>
                  <span>Płatności jednorazowe</span>
                  <strong>{formatMoney(unpaidOneTimeTotal)}</strong>
                  <small>{workspace.oneTimePayments.filter((payment) => !payment.paid).length} nieopłaconych pozycji</small>
                </div>
                <div>
                  <span>Stałe zobowiązania</span>
                  <strong>{formatMoney(monthlyPaymentTotal + monthlySubscriptionTotal)}</strong>
                  <small>cykliczne i subskrypcje / mies.</small>
                </div>
                <div>
                  <span>Dokumenty i pojazdy</span>
                  <strong className={documentAlerts + vehicleAlerts ? "is-negative" : ""}>{documentAlerts + vehicleAlerts}</strong>
                  <small>wymaga uwagi lub zbliża się</small>
                </div>
              </section>

              <div className="affairs-overview__grid">
                <Card as="section" tone="panel" padding="none" className="affairs-agenda">
                  <header className="affairs-section-heading">
                    <div>
                      <h2>Najbliżej na radarze</h2>
                      <p>Jeden porządek terminów dla spraw i płatności</p>
                    </div>
                    <Button variant="ghost" size="sm" trailingIcon={<ChevronRight size={12} />} onClick={() => selectView("matters")}>Wszystkie</Button>
                  </header>
                  {upcoming.length === 0 ? (
                    <EmptyState icon={<Archive size={18} />} title="Radar jest pusty" description="Dodaj sprawę albo płatność z terminem." />
                  ) : (
                    <div className="affairs-agenda__list">
                      {upcoming.map((item) => {
                        const due = dueCopy(item.dueDate);
                        const UpcomingIcon = UPCOMING_ICONS[item.kind as keyof typeof UPCOMING_ICONS];
                        return (
                          <button
                            key={`${item.kind}-${item.id}`}
                            type="button"
                            className="affairs-agenda-row"
                            onClick={() => {
                              selectView(item.view);
                              if (item.kind === "matter") setSelectedMatterId(item.id);
                            }}
                          >
                            <span className={`affairs-agenda-row__icon affairs-agenda-row__icon--${item.kind}`}>
                              <UpcomingIcon size={14} />
                            </span>
                            <span className="affairs-agenda-row__copy">
                              <strong>{item.title}</strong>
                              <small>{item.meta}</small>
                            </span>
                            {item.amount !== null && <span className="affairs-agenda-row__amount">{formatMoney(item.amount)}</span>}
                            <Badge tone={due.tone}>{due.text}</Badge>
                            <ChevronRight size={13} aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>

                <Card as="section" tone="panel" padding="none" className="affairs-budget-snapshot">
                  <header className="affairs-section-heading">
                    <div>
                      <h2>Koszty stałe</h2>
                      <p>Cykliczne rachunki i aktywne usługi</p>
                    </div>
                    <Button variant="ghost" size="sm" trailingIcon={<ChevronRight size={12} />} onClick={() => selectView("subscriptions")}>Subskrypcje</Button>
                  </header>
                  <div className="affairs-budget-snapshot__body">
                    <div className="affairs-budget-balance">
                      <span>Miesięcznie zarezerwowane</span>
                      <strong>{formatMoney(monthlyPaymentTotal + monthlySubscriptionTotal)}</strong>
                    </div>
                    <div className="affairs-budget-flow" aria-label="Udział stałych zobowiązań w planowanych wpływach">
                      <span style={{ width: `${budgetSummary.income ? Math.min(100, ((monthlyPaymentTotal + monthlySubscriptionTotal) / budgetSummary.income) * 100) : 0}%` }} />
                    </div>
                    <dl>
                      <div><dt>Cykliczne</dt><dd>{formatMoney(monthlyPaymentTotal)}</dd></div>
                      <div><dt>Subskrypcje</dt><dd>{formatMoney(monthlySubscriptionTotal)}</dd></div>
                      <div><dt>Jednorazowe</dt><dd>{formatMoney(unpaidOneTimeTotal)}</dd></div>
                    </dl>
                    <p>Kwoty roczne i kwartalne są przeliczone na miesięczny odpowiednik.</p>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {view === "matters" && (
            <section className="affairs-ledger" aria-label="Lista spraw">
              <div className="affairs-ledger__head affairs-ledger__head--matters">
                <span>Sprawa</span>
                <span>Obszar</span>
                <span>Termin</span>
                <span>Status</span>
                <span />
              </div>
              {filteredMatters.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck size={18} />}
                  title="Brak spraw w tym widoku"
                  description="Zmień filtry albo dodaj nową ważną sprawę."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openMatterEditor()}>Dodaj sprawę</Button>}
                />
              ) : filteredMatters.map((matter) => {
                const CategoryIcon = CATEGORY_META[matter.category].icon;
                const due = dueCopy(matter.dueDate);
                return (
                  <div key={matter.id} className={`affairs-matter-row ${selectedMatterId === matter.id ? "is-selected" : ""} ${matter.status === "done" ? "is-done" : ""}`}>
                    <button
                      type="button"
                      className="affairs-check"
                      aria-pressed={matter.status === "done"}
                      aria-label={matter.status === "done" ? `Przywróć: ${matter.title}` : `Oznacz jako załatwione: ${matter.title}`}
                      onClick={() => toggleMatter(matter.id)}
                    >
                      {matter.status === "done" && <Check size={10} />}
                    </button>
                    <button type="button" className="affairs-matter-row__title" onClick={() => setSelectedMatterId(matter.id)}>
                      <strong>{matter.title}</strong>
                      <small>{matter.note || "Bez dodatkowej notatki"}</small>
                    </button>
                    <span className="affairs-matter-row__category"><CategoryIcon size={12} />{CATEGORY_META[matter.category].label}</span>
                    <Badge tone={due.tone}>{due.text}</Badge>
                    <Badge tone={matter.status === "done" ? "success" : matter.status === "waiting" ? "warning" : matter.priority === "high" ? "danger" : "primary"} dot>
                      {STATUS_LABELS[matter.status]}
                    </Badge>
                    <ChevronRight size={13} aria-hidden="true" />
                  </div>
                );
              })}
            </section>
          )}

          {view === "oneTime" && (
            <section className="affairs-ledger" aria-label="Płatności jednorazowe">
              <div className="affairs-ledger__head affairs-ledger__head--payments">
                <span>Zobowiązanie</span>
                <span>Kategoria</span>
                <span>Termin</span>
                <span>Kwota</span>
                <span />
              </div>
              {workspace.oneTimePayments.length === 0 ? (
                <EmptyState
                  icon={<ReceiptText size={18} />}
                  title="Brak jednorazowych płatności"
                  description="Dodaj opłatę urzędową, ratę, rachunek albo większy zakup z terminem."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openOneTimeEditor()}>Dodaj płatność</Button>}
                />
              ) : workspace.oneTimePayments
                .slice()
                .sort((a, b) => Number(a.paid) - Number(b.paid) || a.dueDate.localeCompare(b.dueDate))
                .map((payment) => {
                  const due = dueCopy(payment.dueDate);
                  return (
                    <div key={payment.id} className={`affairs-payment-row ${payment.paid ? "is-done" : ""}`}>
                      <span className="affairs-payment-row__icon"><ReceiptText size={14} /></span>
                      <span className="affairs-payment-row__title">
                        <strong>{payment.title}</strong>
                        <small>{payment.note || "Jednorazowe zobowiązanie"}</small>
                      </span>
                      <span className="affairs-payment-row__cadence">{payment.category}</span>
                      <Badge tone={payment.paid ? "success" : due.tone}>{payment.paid ? "Opłacone" : due.text}</Badge>
                      <strong className="affairs-payment-row__amount">{formatMoney(payment.amount)}</strong>
                      <span className="affairs-payment-row__actions">
                        <Button
                          variant="quiet"
                          size="sm"
                          leadingIcon={payment.paid ? <RefreshCw size={12} /> : <Check size={12} />}
                          onClick={() => setWorkspace((current) => ({
                            ...current,
                            oneTimePayments: current.oneTimePayments.map((item) => item.id === payment.id
                              ? { ...item, paid: !item.paid, paidAt: item.paid ? "" : new Date().toISOString() }
                              : item),
                          }))}
                        >
                          {payment.paid ? "Przywróć" : "Opłacone"}
                        </Button>
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${payment.title}`} onClick={() => openOneTimeEditor(payment)}><Pencil size={12} /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${payment.title}`}
                          onClick={() => setDeleteState({ kind: "oneTime", id: payment.id, label: payment.title })}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </span>
                    </div>
                  );
                })}
            </section>
          )}

          {view === "payments" && (
            <section className="affairs-ledger" aria-label="Płatności cykliczne">
              <div className="affairs-ledger__head affairs-ledger__head--payments">
                <span>Płatność</span>
                <span>Cykl</span>
                <span>Następna</span>
                <span>Kwota</span>
                <span />
              </div>
              {workspace.payments.length === 0 ? (
                <EmptyState
                  icon={<RefreshCw size={18} />}
                  title="Brak płatności cyklicznych"
                  description="Dodaj czynsz, media, polisę albo inne regularne zobowiązanie."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openPaymentEditor()}>Dodaj płatność</Button>}
                />
              ) : workspace.payments.map((payment) => {
                const due = dueCopy(payment.nextDueDate);
                return (
                  <div key={payment.id} className={`affairs-payment-row ${payment.active ? "" : "is-paused"}`}>
                    <span className="affairs-payment-row__icon"><ReceiptText size={14} /></span>
                    <span className="affairs-payment-row__title">
                      <strong>{payment.name}</strong>
                      <small>{payment.category} · {payment.automatic ? "automatycznie" : "ręcznie"}</small>
                    </span>
                    <span className="affairs-payment-row__cadence">{CADENCE_LABELS[payment.cadence]}</span>
                    <Badge tone={payment.active ? due.tone : "neutral"}>{payment.active ? due.text : "Wstrzymana"}</Badge>
                    <strong className="affairs-payment-row__amount">{formatMoney(payment.amount)}</strong>
                    <span className="affairs-payment-row__actions">
                      {payment.active && !payment.automatic && (
                        <Button
                          variant="quiet"
                          size="sm"
                          leadingIcon={<Check size={12} />}
                          onClick={() => setWorkspace((current) => ({
                            ...current,
                            payments: current.payments.map((item) => item.id === payment.id
                              ? { ...item, nextDueDate: advancePaymentDateToFuture(item.nextDueDate, item.cadence) }
                              : item),
                          }))}
                        >
                          Opłacone
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${payment.name}`} onClick={() => openPaymentEditor(payment.id)}><Pencil size={12} /></Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={payment.active ? `Wstrzymaj ${payment.name}` : `Wznów ${payment.name}`}
                        onClick={() => setWorkspace((current) => ({
                          ...current,
                          payments: current.payments.map((item) => item.id === payment.id ? { ...item, active: !item.active } : item),
                        }))}
                      >
                        {payment.active ? <Archive size={12} /> : <RefreshCw size={12} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={`Usuń ${payment.name}`}
                        onClick={() => setDeleteState({ kind: "payment", id: payment.id, label: payment.name })}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </span>
                  </div>
                );
              })}
            </section>
          )}

          {view === "subscriptions" && (
            <section className="affairs-ledger" aria-label="Subskrypcje i członkostwa">
              <div className="affairs-ledger__head affairs-ledger__head--payments">
                <span>Subskrypcja</span>
                <span>Cykl</span>
                <span>Następna</span>
                <span>Kwota</span>
                <span />
              </div>
              {workspace.subscriptions.length === 0 ? (
                <EmptyState
                  icon={<CreditCard size={18} />}
                  title="Brak subskrypcji"
                  description="Dodaj usługę, członkostwo lub umowę, której koszt i odnowienie chcesz kontrolować."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openSubscriptionEditor()}>Dodaj subskrypcję</Button>}
                />
              ) : workspace.subscriptions
                .slice()
                .sort((a, b) => Number(b.active) - Number(a.active) || a.nextBillingDate.localeCompare(b.nextBillingDate))
                .map((subscription) => {
                  const due = dueCopy(subscription.nextBillingDate);
                  return (
                    <div key={subscription.id} className={`affairs-payment-row ${subscription.active ? "" : "is-paused"}`}>
                      <span className="affairs-payment-row__icon"><CreditCard size={14} /></span>
                      <span className="affairs-payment-row__title">
                        <strong>{subscription.name}</strong>
                        <small>
                          {subscription.category} · {subscription.renewal === "automatic" ? "odnowienie automatyczne" : "odnowienie ręczne"}
                          {subscription.commitmentEndDate ? ` · umowa do ${formatDate(subscription.commitmentEndDate)}` : ""}
                        </small>
                      </span>
                      <span className="affairs-payment-row__cadence">{CADENCE_LABELS[subscription.cadence]}</span>
                      <Badge tone={subscription.active ? due.tone : "neutral"}>{subscription.active ? due.text : "Wstrzymana"}</Badge>
                      <strong className="affairs-payment-row__amount">{formatMoney(subscription.amount)}</strong>
                      <span className="affairs-payment-row__actions">
                        {subscription.active && subscription.renewal === "manual" && (
                          <Button
                            variant="quiet"
                            size="sm"
                            leadingIcon={<Check size={12} />}
                            onClick={() => setWorkspace((current) => ({
                              ...current,
                              subscriptions: current.subscriptions.map((item) => item.id === subscription.id
                                ? { ...item, nextBillingDate: advancePaymentDateToFuture(item.nextBillingDate, item.cadence) }
                                : item),
                            }))}
                          >
                            Odnowione
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${subscription.name}`} onClick={() => openSubscriptionEditor(subscription)}><Pencil size={12} /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={subscription.active ? `Wstrzymaj ${subscription.name}` : `Wznów ${subscription.name}`}
                          onClick={() => setWorkspace((current) => ({
                            ...current,
                            subscriptions: current.subscriptions.map((item) => item.id === subscription.id ? { ...item, active: !item.active } : item),
                          }))}
                        >
                          {subscription.active ? <Archive size={12} /> : <RefreshCw size={12} />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${subscription.name}`}
                          onClick={() => setDeleteState({ kind: "subscription", id: subscription.id, label: subscription.name })}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </span>
                    </div>
                  );
                })}
            </section>
          )}

          {view === "documents" && (
            <section className="affairs-ledger" aria-label="Ważność dokumentów">
              <div className="affairs-ledger__head affairs-ledger__head--payments">
                <span>Dokument</span>
                <span>Typ</span>
                <span>Ważność</span>
                <span>Alarm</span>
                <span />
              </div>
              {workspace.documents.length === 0 ? (
                <EmptyState
                  icon={<FileText size={18} />}
                  title="Brak dokumentów"
                  description="Dodaj dowód, paszport, prawo jazdy, kartę, polisę, umowę lub gwarancję."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openDocumentEditor()}>Dodaj dokument</Button>}
                />
              ) : workspace.documents
                .slice()
                .sort((a, b) => {
                  if (!a.expiresAt) return 1;
                  if (!b.expiresAt) return -1;
                  return a.expiresAt.localeCompare(b.expiresAt);
                })
                .map((document) => {
                  const due = documentDueCopy(document);
                  return (
                    <div key={document.id} className="affairs-payment-row">
                      <span className="affairs-payment-row__icon"><FileText size={14} /></span>
                      <span className="affairs-payment-row__title">
                        <strong>{document.name}</strong>
                        <small>{document.holder} · {document.note || "Bez dodatkowej notatki"}</small>
                      </span>
                      <span className="affairs-payment-row__cadence">{DOCUMENT_LABELS[document.category]}</span>
                      <Badge tone={due.tone}>{due.text}</Badge>
                      <span className="affairs-record-value">
                        {document.expiresAt ? `${document.reminderDays} dni wcześniej` : "—"}
                      </span>
                      <span className="affairs-payment-row__actions">
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${document.name}`} onClick={() => openDocumentEditor(document)}><Pencil size={12} /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${document.name}`}
                          onClick={() => setDeleteState({ kind: "document", id: document.id, label: document.name })}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </span>
                    </div>
                  );
                })}
            </section>
          )}

          {view === "vehicles" && (
            <div className="affairs-vehicle-list">
              {workspace.vehicles.length === 0 ? (
                <EmptyState
                  icon={<Car size={18} />}
                  title="Brak pojazdów"
                  description="Dodaj samochód, motocykl lub inny pojazd, aby pilnować OC, przeglądów i serwisu."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openVehicleEditor()}>Dodaj pojazd</Button>}
                />
              ) : workspace.vehicles.map((vehicle) => {
                const items = workspace.vehicleItems
                  .filter((item) => item.vehicleId === vehicle.id)
                  .sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
                return (
                  <Card key={vehicle.id} as="section" tone="panel" padding="none" className="affairs-vehicle">
                    <header className="affairs-vehicle__header">
                      <span className="affairs-vehicle__mark"><Car size={18} /></span>
                      <div>
                        <h2>{vehicle.name}</h2>
                        <p>{vehicle.registration || "Bez numeru rejestracyjnego"} · {formatMileage(vehicle.mileage)}</p>
                      </div>
                      <span className="affairs-vehicle__actions">
                        <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={() => openVehicleItemEditor(vehicle.id)}>Dodaj termin</Button>
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${vehicle.name}`} onClick={() => openVehicleEditor(vehicle)}><Pencil size={12} /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${vehicle.name}`}
                          onClick={() => setDeleteState({ kind: "vehicle", id: vehicle.id, label: vehicle.name })}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </span>
                    </header>
                    {items.length === 0 ? (
                      <div className="affairs-vehicle__empty">
                        <span>Brak zapisanych terminów dla tego pojazdu.</span>
                        <Button variant="ghost" size="sm" onClick={() => openVehicleItemEditor(vehicle.id)}>Dodaj pierwszy</Button>
                      </div>
                    ) : (
                      <div className="affairs-vehicle__items">
                        {items.map((item) => {
                          const due = vehicleItemDueCopy(item, vehicle);
                          return (
                            <div key={item.id} className={`affairs-vehicle-row ${item.done ? "is-done" : ""}`}>
                              <button
                                type="button"
                                className="affairs-check"
                                aria-pressed={item.done}
                                aria-label={item.done ? `Przywróć ${item.title}` : `Oznacz jako zrobione: ${item.title}`}
                                onClick={() => setWorkspace((current) => ({
                                  ...current,
                                  vehicleItems: current.vehicleItems.map((candidate) => candidate.id === item.id ? { ...candidate, done: !candidate.done } : candidate),
                                }))}
                              >
                                {item.done && <Check size={10} />}
                              </button>
                              <span className="affairs-vehicle-row__title">
                                <strong>{item.title}</strong>
                                <small>{VEHICLE_ITEM_LABELS[item.type]}{item.note ? ` · ${item.note}` : ""}</small>
                              </span>
                              <span className="affairs-vehicle-row__target">
                                {item.dueDate && <span>{formatDate(item.dueDate)}</span>}
                                {item.dueMileage !== null && <span>{formatMileage(item.dueMileage)}</span>}
                              </span>
                              <Badge tone={due.tone}>{due.text}</Badge>
                              <span className="affairs-vehicle-row__actions">
                                <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${item.title}`} onClick={() => openVehicleItemEditor(vehicle.id, item)}><Pencil size={12} /></Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  iconOnly
                                  aria-label={`Usuń ${item.title}`}
                                  onClick={() => setDeleteState({ kind: "vehicleItem", id: item.id, label: item.title })}
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {view === "budget" && (
            <div className="affairs-budget">
              <section className="affairs-budget__summary" aria-label="Podsumowanie budżetu">
                <div><span>Planowane wpływy</span><strong>{formatMoney(budgetSummary.income)}</strong></div>
                <div><span>Przydzielone</span><strong>{formatMoney(budgetSummary.plannedOut)}</strong></div>
                <div><span>Rzeczywiste wydatki</span><strong>{formatMoney(budgetSummary.actualOut)}</strong></div>
                <div><span>Rzeczywiście zostaje</span><strong className={budgetSummary.actualAvailable < 0 ? "is-negative" : ""}>{formatMoney(budgetSummary.actualAvailable)}</strong></div>
              </section>
              <section className="affairs-budget-table">
                <div className="affairs-budget-table__head">
                  <span>Kategoria</span>
                  <span>Typ</span>
                  <span>Plan</span>
                  <span>Rzeczywiście</span>
                  <span />
                </div>
                {(currentBudget?.lines ?? []).map((line) => {
                  const ratio = line.planned > 0 ? Math.min(100, (line.actual / line.planned) * 100) : 0;
                  return (
                    <div key={line.id} className="affairs-budget-row">
                      <span className="affairs-budget-row__identity">
                        <strong>{line.label}</strong>
                        {line.kind !== "income" && (
                          <span className="affairs-budget-row__track"><i style={{ width: `${ratio}%` }} /></span>
                        )}
                      </span>
                      <Badge tone={line.kind === "income" ? "success" : line.kind === "savings" ? "primary" : "neutral"}>
                        {BUDGET_KIND_LABELS[line.kind]}
                      </Badge>
                      <label>
                        <span className="sr-only">Plan dla {line.label}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={budgetDrafts[budgetDraftKey(line.id, "planned")] ?? String(line.planned)}
                          onChange={(event) => updateBudgetDraft(line.id, "planned", event.target.value)}
                          onBlur={() => commitBudgetValue(line.id, "planned")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                        />
                        <span>zł</span>
                      </label>
                      <label>
                        <span className="sr-only">Kwota rzeczywista dla {line.label}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={budgetDrafts[budgetDraftKey(line.id, "actual")] ?? String(line.actual)}
                          onChange={(event) => updateBudgetDraft(line.id, "actual", event.target.value)}
                          onBlur={() => commitBudgetValue(line.id, "actual")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                        />
                        <span>zł</span>
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={`Usuń ${line.label}`}
                        onClick={() => setDeleteState({ kind: "budget", id: line.id, label: line.label })}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  );
                })}
                {!currentBudget?.lines.length && (
                  <EmptyState
                    icon={<WalletCards size={18} />}
                    title="Ten miesiąc nie ma jeszcze planu"
                    description="Dodaj wpływy, koszty stałe, elastyczne i cel oszczędności."
                    action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={openBudgetEditor}>Dodaj pozycję</Button>}
                  />
                )}
              </section>
            </div>
          )}
        </div>
          </>
        )}
      </ModuleMain>

      {editor && (
        <Modal
          eyebrow={editorPresentation?.eyebrow}
          title={editorPresentation?.title ?? ""}
          description={editorPresentation?.description}
          onClose={closeEditor}
          footer={(
            <>
              <Button variant="ghost" onClick={closeEditor}>Anuluj</Button>
              <Button variant="primary" type="submit" form="affairs-editor-form">
                {editor.mode === "edit" ? "Zapisz zmiany" : "Dodaj"}
              </Button>
            </>
          )}
        >
          <form id="affairs-editor-form" className="affairs-form" onSubmit={submitEditor}>
            <Input
              label={editorPresentation?.label}
              placeholder={editorPresentation?.placeholder}
              value={draft.title}
              error={editorError}
              autoFocus
              onChange={(event) => {
                setDraft((current) => ({ ...current, title: event.target.value }));
                if (editorError) setEditorError("");
              }}
            />

            {editor.kind === "matter" && (
              <>
                <div className="affairs-form__grid">
                  <Select
                    label="Obszar"
                    value={draft.category}
                    options={Object.entries(CATEGORY_META).map(([value, meta]) => ({ value, label: meta.label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                  />
                  <Input type="date" label="Termin" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} />
                </div>
                <div className="affairs-form__grid">
                  <Select
                    label="Priorytet"
                    value={draft.priority}
                    options={[
                      { value: "normal", label: "Normalny" },
                      { value: "high", label: "Ważny" },
                    ]}
                    onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as MatterPriority }))}
                  />
                  <Select
                    label="Status"
                    value={draft.status}
                    options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as MatterStatus }))}
                  />
                </div>
              </>
            )}

            {editor.kind === "payment" && (
              <>
                <div className="affairs-form__grid">
                  <Input label="Kategoria" placeholder="np. Mieszkanie" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} />
                  <Input label="Kwota" inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} />
                </div>
                <div className="affairs-form__grid">
                  <Select
                    label="Cykl"
                    value={draft.cadence}
                    options={Object.entries(CADENCE_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, cadence: event.target.value as PaymentCadence }))}
                  />
                  <Input type="date" label="Następna płatność" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} />
                </div>
                <label className="affairs-form__check">
                  <input type="checkbox" checked={draft.automatic} onChange={(event) => setDraft((current) => ({ ...current, automatic: event.target.checked }))} />
                  <span><strong>Płatność automatyczna</strong><small>Nie będzie wymagała ręcznego oznaczania jako opłacona.</small></span>
                </label>
              </>
            )}

            {editor.kind === "oneTime" && (
              <>
                <div className="affairs-form__grid">
                  <Input label="Kategoria" placeholder="np. Dokumenty" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} />
                  <Input label="Kwota" inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} />
                </div>
                <Input type="date" label="Termin płatności" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} />
              </>
            )}

            {editor.kind === "subscription" && (
              <>
                <div className="affairs-form__grid">
                  <Input label="Kategoria" placeholder="np. Rozrywka" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} />
                  <Input label="Kwota" inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} />
                </div>
                <div className="affairs-form__grid">
                  <Select
                    label="Cykl"
                    value={draft.cadence}
                    options={Object.entries(CADENCE_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, cadence: event.target.value as PaymentCadence }))}
                  />
                  <Input type="date" label="Następne rozliczenie" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} />
                </div>
                <div className="affairs-form__grid">
                  <Select
                    label="Odnowienie"
                    value={draft.renewal}
                    options={[
                      { value: "automatic", label: "Automatyczne" },
                      { value: "manual", label: "Ręczne" },
                    ]}
                    onChange={(event) => setDraft((current) => ({ ...current, renewal: event.target.value as SubscriptionRenewal }))}
                  />
                  <Input type="date" label="Koniec zobowiązania (opcjonalnie)" value={draft.secondaryDate} onChange={(event) => setDraft((current) => ({ ...current, secondaryDate: event.target.value }))} />
                </div>
              </>
            )}

            {editor.kind === "document" && (
              <>
                <div className="affairs-form__grid">
                  <Select
                    label="Rodzaj dokumentu"
                    value={draft.category}
                    options={Object.entries(DOCUMENT_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                  />
                  <Input label="Właściciel / obszar" placeholder="np. Ja, Dziecko, Dom" value={draft.holder} onChange={(event) => setDraft((current) => ({ ...current, holder: event.target.value }))} />
                </div>
                <div className="affairs-form__grid">
                  <Input type="date" label="Ważny do (opcjonalnie)" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} />
                  <Input type="number" min="0" max="730" label="Przypomnij wcześniej (dni)" value={draft.reminderDays} onChange={(event) => setDraft((current) => ({ ...current, reminderDays: event.target.value }))} />
                </div>
              </>
            )}

            {editor.kind === "vehicle" && (
              <div className="affairs-form__grid">
                <Input label="Numer rejestracyjny" placeholder="np. KR 0000A" value={draft.registration} onChange={(event) => setDraft((current) => ({ ...current, registration: event.target.value }))} />
                <Input type="number" min="0" label="Aktualny przebieg (km)" placeholder="0" value={draft.mileage} onChange={(event) => setDraft((current) => ({ ...current, mileage: event.target.value }))} />
              </div>
            )}

            {editor.kind === "vehicleItem" && (
              <>
                <div className="affairs-form__grid">
                  <Select
                    label="Pojazd"
                    value={draft.vehicleId}
                    options={workspace.vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.name }))}
                    onChange={(event) => setDraft((current) => ({ ...current, vehicleId: event.target.value }))}
                  />
                  <Select
                    label="Rodzaj terminu"
                    value={draft.vehicleType}
                    options={Object.entries(VEHICLE_ITEM_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(event) => setDraft((current) => ({ ...current, vehicleType: event.target.value as VehicleItemType }))}
                  />
                </div>
                <div className="affairs-form__grid">
                  <Input type="date" label="Termin (opcjonalnie)" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} />
                  <Input type="number" min="0" label="Przebieg graniczny (opcjonalnie)" placeholder="np. 90000" value={draft.dueMileage} onChange={(event) => setDraft((current) => ({ ...current, dueMileage: event.target.value }))} />
                </div>
              </>
            )}

            {editor.kind === "budget" && (
              <>
                <Select
                  label="Typ pozycji"
                  value={draft.budgetKind}
                  options={Object.entries(BUDGET_KIND_LABELS).map(([value, label]) => ({ value, label }))}
                  onChange={(event) => setDraft((current) => ({ ...current, budgetKind: event.target.value as BudgetLineKind }))}
                />
                <div className="affairs-form__grid">
                  <Input label="Kwota planowana" inputMode="decimal" placeholder="0,00" value={draft.planned} onChange={(event) => setDraft((current) => ({ ...current, planned: event.target.value }))} />
                  <Input label="Kwota rzeczywista" inputMode="decimal" placeholder="0,00" value={draft.actual} onChange={(event) => setDraft((current) => ({ ...current, actual: event.target.value }))} />
                </div>
              </>
            )}

            {editor.kind !== "budget" && editor.kind !== "vehicle" && (
              <label className="ui-field">
                <span className="ui-field__label">Notatka <span className="affairs-optional">opcjonalnie</span></span>
                <textarea
                  className="ui-field__control affairs-textarea"
                  placeholder="Dokumenty, decyzje albo kontekst do zachowania"
                  value={draft.note}
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
          description="Ta pozycja zniknie z lokalnego rejestru."
          onClose={() => setDeleteState(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setDeleteState(null)}>Anuluj</Button>
              <Button variant="danger" onClick={confirmDelete}>Usuń</Button>
            </>
          )}
        >
          <p className="affairs-delete-note">Tej operacji nie można cofnąć.</p>
        </Modal>
      )}
    </ModuleShell>
  );
}
