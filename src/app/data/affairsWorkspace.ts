export type MatterCategory = "urzedy" | "zdrowie" | "dom" | "auto" | "finanse" | "dokumenty";
export type MatterPriority = "normal" | "high";
export type MatterStatus = "open" | "waiting" | "done";
export type PaymentCadence = "monthly" | "quarterly" | "yearly";
export type BudgetLineKind = "income" | "fixed" | "flexible" | "savings";
export type SubscriptionRenewal = "automatic" | "manual";
export type DocumentCategory = "identity" | "driving" | "insurance" | "health" | "agreement" | "other";
export type VehicleItemType = "insurance" | "inspection" | "service" | "tires" | "lease" | "warranty" | "other";

export type Matter = {
  id: string;
  title: string;
  category: MatterCategory;
  priority: MatterPriority;
  status: MatterStatus;
  dueDate: string;
  note: string;
  createdAt: string;
};

export type OneTimePayment = {
  id: string;
  title: string;
  category: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAt: string;
  note: string;
};

export type RecurringPayment = {
  id: string;
  name: string;
  category: string;
  amount: number;
  cadence: PaymentCadence;
  nextDueDate: string;
  automatic: boolean;
  active: boolean;
  note: string;
};

export type Subscription = {
  id: string;
  name: string;
  category: string;
  amount: number;
  cadence: PaymentCadence;
  nextBillingDate: string;
  renewal: SubscriptionRenewal;
  commitmentEndDate: string;
  active: boolean;
  note: string;
};

export type DocumentRecord = {
  id: string;
  name: string;
  category: DocumentCategory;
  holder: string;
  expiresAt: string;
  reminderDays: number;
  note: string;
};

export type Vehicle = {
  id: string;
  name: string;
  registration: string;
  mileage: number;
};

export type VehicleItem = {
  id: string;
  vehicleId: string;
  title: string;
  type: VehicleItemType;
  dueDate: string;
  dueMileage: number | null;
  done: boolean;
  note: string;
};

export type BudgetLine = {
  id: string;
  label: string;
  kind: BudgetLineKind;
  planned: number;
  actual: number;
};

export type BudgetMonth = {
  month: string;
  lines: BudgetLine[];
};

export type AffairsWorkspace = {
  version: 2;
  matters: Matter[];
  oneTimePayments: OneTimePayment[];
  payments: RecurringPayment[];
  subscriptions: Subscription[];
  documents: DocumentRecord[];
  vehicles: Vehicle[];
  vehicleItems: VehicleItem[];
  budgets: BudgetMonth[];
};

type LegacyAffairsWorkspace = {
  version: 1;
  matters: Matter[];
  payments: RecurringPayment[];
  budgets: BudgetMonth[];
};

export const AFFAIRS_STORAGE_KEY = "rootine.affairs.workspace.v1";

function isoDateOffset(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function createExpansionDefaults() {
  const vehicleId = "vehicle-family";
  return {
    oneTimePayments: [
      {
        id: "one-time-policy",
        title: "Dopłata do polisy mieszkania",
        category: "Mieszkanie",
        amount: 245,
        dueDate: isoDateOffset(9),
        paid: false,
        paidAt: "",
        note: "Ostatnia rata bieżącej polisy.",
      },
      {
        id: "one-time-passport",
        title: "Opłata za wydanie paszportu",
        category: "Dokumenty",
        amount: 140,
        dueDate: isoDateOffset(24),
        paid: false,
        paidAt: "",
        note: "",
      },
    ] satisfies OneTimePayment[],
    subscriptions: [
      {
        id: "subscription-music",
        name: "Muzyka",
        category: "Rozrywka",
        amount: 23.99,
        cadence: "monthly",
        nextBillingDate: isoDateOffset(5),
        renewal: "automatic",
        commitmentEndDate: "",
        active: true,
        note: "",
      },
      {
        id: "subscription-cloud",
        name: "Dysk w chmurze",
        category: "Narzędzia",
        amount: 119.99,
        cadence: "yearly",
        nextBillingDate: isoDateOffset(36),
        renewal: "automatic",
        commitmentEndDate: "",
        active: true,
        note: "Plan roczny.",
      },
      {
        id: "subscription-gym",
        name: "Karnet sportowy",
        category: "Zdrowie",
        amount: 129,
        cadence: "monthly",
        nextBillingDate: isoDateOffset(11),
        renewal: "manual",
        commitmentEndDate: isoDateOffset(184),
        active: true,
        note: "Sprawdzić warunki wypowiedzenia przed końcem umowy.",
      },
    ] satisfies Subscription[],
    documents: [
      {
        id: "document-id",
        name: "Dowód osobisty",
        category: "identity",
        holder: "Ja",
        expiresAt: isoDateOffset(740),
        reminderDays: 90,
        note: "Nie zapisuj pełnego numeru dokumentu w notatce.",
      },
      {
        id: "document-passport",
        name: "Paszport",
        category: "identity",
        holder: "Ja",
        expiresAt: isoDateOffset(1180),
        reminderDays: 180,
        note: "",
      },
      {
        id: "document-driving",
        name: "Prawo jazdy",
        category: "driving",
        holder: "Ja",
        expiresAt: isoDateOffset(1460),
        reminderDays: 90,
        note: "",
      },
      {
        id: "document-ehic",
        name: "Europejska Karta Ubezpieczenia Zdrowotnego",
        category: "health",
        holder: "Ja",
        expiresAt: isoDateOffset(70),
        reminderDays: 30,
        note: "Odnowić przed kolejnym wyjazdem.",
      },
      {
        id: "document-laptop",
        name: "Gwarancja laptopa",
        category: "agreement",
        holder: "Dom",
        expiresAt: isoDateOffset(310),
        reminderDays: 30,
        note: "Dowód zakupu w folderze Dokumenty.",
      },
    ] satisfies DocumentRecord[],
    vehicles: [
      {
        id: vehicleId,
        name: "Samochód rodzinny",
        registration: "KR 0000A",
        mileage: 84_200,
      },
    ] satisfies Vehicle[],
    vehicleItems: [
      {
        id: "vehicle-oc",
        vehicleId,
        title: "Odnowienie OC",
        type: "insurance",
        dueDate: isoDateOffset(120),
        dueMileage: null,
        done: false,
        note: "Porównać assistance i NNW.",
      },
      {
        id: "vehicle-inspection",
        vehicleId,
        title: "Badanie techniczne",
        type: "inspection",
        dueDate: isoDateOffset(74),
        dueMileage: null,
        done: false,
        note: "",
      },
      {
        id: "vehicle-service",
        vehicleId,
        title: "Serwis olejowy i filtry",
        type: "service",
        dueDate: isoDateOffset(32),
        dueMileage: 85_000,
        done: false,
        note: "Wykonać po dacie albo przebiegu — zależnie co nastąpi wcześniej.",
      },
      {
        id: "vehicle-tires",
        vehicleId,
        title: "Zmiana opon",
        type: "tires",
        dueDate: isoDateOffset(58),
        dueMileage: null,
        done: false,
        note: "",
      },
    ] satisfies VehicleItem[],
  };
}

export function createDefaultAffairsWorkspace(): AffairsWorkspace {
  const expansion = createExpansionDefaults();
  return {
    version: 2,
    matters: [
      {
        id: "matter-oc",
        title: "Porównać oferty ubezpieczenia mieszkania",
        category: "dom",
        priority: "high",
        status: "open",
        dueDate: isoDateOffset(12),
        note: "Sprawdzić odpowiedzialność cywilną i zalanie.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "matter-office",
        title: "Umówić wizytę w urzędzie",
        category: "urzedy",
        priority: "normal",
        status: "waiting",
        dueDate: isoDateOffset(20),
        note: "Sprawdzić listę dokumentów przed rezerwacją terminu.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "matter-medical",
        title: "Umówić badanie kontrolne",
        category: "zdrowie",
        priority: "normal",
        status: "open",
        dueDate: isoDateOffset(44),
        note: "",
        createdAt: new Date().toISOString(),
      },
    ],
    oneTimePayments: expansion.oneTimePayments,
    payments: [
      {
        id: "payment-rent",
        name: "Czynsz i administracja",
        category: "Mieszkanie",
        amount: 890,
        cadence: "monthly",
        nextDueDate: isoDateOffset(4),
        automatic: false,
        active: true,
        note: "Opłata do 10. dnia miesiąca.",
      },
      {
        id: "payment-energy",
        name: "Energia elektryczna",
        category: "Rachunki",
        amount: 186,
        cadence: "monthly",
        nextDueDate: isoDateOffset(16),
        automatic: true,
        active: true,
        note: "Kwota orientacyjna.",
      },
      {
        id: "payment-accounting",
        name: "Księgowość",
        category: "JDG",
        amount: 369,
        cadence: "monthly",
        nextDueDate: isoDateOffset(8),
        automatic: true,
        active: true,
        note: "",
      },
    ],
    subscriptions: expansion.subscriptions,
    documents: expansion.documents,
    vehicles: expansion.vehicles,
    vehicleItems: expansion.vehicleItems,
    budgets: [
      {
        month: getMonthKey(),
        lines: [
          { id: "budget-income", label: "Wpływy netto", kind: "income", planned: 9500, actual: 9500 },
          { id: "budget-home", label: "Mieszkanie i rachunki", kind: "fixed", planned: 2600, actual: 2470 },
          { id: "budget-food", label: "Jedzenie", kind: "flexible", planned: 1400, actual: 980 },
          { id: "budget-transport", label: "Transport", kind: "flexible", planned: 500, actual: 340 },
          { id: "budget-life", label: "Zdrowie i życie", kind: "flexible", planned: 700, actual: 390 },
          { id: "budget-buffer", label: "Poduszka finansowa", kind: "savings", planned: 1800, actual: 1800 },
        ],
      },
    ],
  };
}

function isMatter(value: unknown): value is Matter {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Matter>;
  return typeof item.id === "string"
    && typeof item.title === "string"
    && ["urzedy", "zdrowie", "dom", "auto", "finanse", "dokumenty"].includes(String(item.category))
    && ["normal", "high"].includes(String(item.priority))
    && ["open", "waiting", "done"].includes(String(item.status))
    && typeof item.dueDate === "string"
    && typeof item.note === "string"
    && typeof item.createdAt === "string";
}

function isOneTimePayment(value: unknown): value is OneTimePayment {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<OneTimePayment>;
  return typeof item.id === "string"
    && typeof item.title === "string"
    && typeof item.category === "string"
    && typeof item.amount === "number"
    && Number.isFinite(item.amount)
    && typeof item.dueDate === "string"
    && typeof item.paid === "boolean"
    && typeof item.paidAt === "string"
    && typeof item.note === "string";
}

function isPayment(value: unknown): value is RecurringPayment {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RecurringPayment>;
  return typeof item.id === "string"
    && typeof item.name === "string"
    && typeof item.category === "string"
    && typeof item.amount === "number"
    && Number.isFinite(item.amount)
    && ["monthly", "quarterly", "yearly"].includes(String(item.cadence))
    && typeof item.nextDueDate === "string"
    && typeof item.automatic === "boolean"
    && typeof item.active === "boolean"
    && typeof item.note === "string";
}

function isSubscription(value: unknown): value is Subscription {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Subscription>;
  return typeof item.id === "string"
    && typeof item.name === "string"
    && typeof item.category === "string"
    && typeof item.amount === "number"
    && Number.isFinite(item.amount)
    && ["monthly", "quarterly", "yearly"].includes(String(item.cadence))
    && typeof item.nextBillingDate === "string"
    && ["automatic", "manual"].includes(String(item.renewal))
    && typeof item.commitmentEndDate === "string"
    && typeof item.active === "boolean"
    && typeof item.note === "string";
}

function isDocument(value: unknown): value is DocumentRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DocumentRecord>;
  return typeof item.id === "string"
    && typeof item.name === "string"
    && ["identity", "driving", "insurance", "health", "agreement", "other"].includes(String(item.category))
    && typeof item.holder === "string"
    && typeof item.expiresAt === "string"
    && typeof item.reminderDays === "number"
    && Number.isFinite(item.reminderDays)
    && typeof item.note === "string";
}

function isVehicle(value: unknown): value is Vehicle {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Vehicle>;
  return typeof item.id === "string"
    && typeof item.name === "string"
    && typeof item.registration === "string"
    && typeof item.mileage === "number"
    && Number.isFinite(item.mileage);
}

function isVehicleItem(value: unknown): value is VehicleItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<VehicleItem>;
  return typeof item.id === "string"
    && typeof item.vehicleId === "string"
    && typeof item.title === "string"
    && ["insurance", "inspection", "service", "tires", "lease", "warranty", "other"].includes(String(item.type))
    && typeof item.dueDate === "string"
    && (item.dueMileage === null || (typeof item.dueMileage === "number" && Number.isFinite(item.dueMileage)))
    && typeof item.done === "boolean"
    && typeof item.note === "string";
}

function isBudgetLine(value: unknown): value is BudgetLine {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BudgetLine>;
  return typeof item.id === "string"
    && typeof item.label === "string"
    && ["income", "fixed", "flexible", "savings"].includes(String(item.kind))
    && typeof item.planned === "number"
    && Number.isFinite(item.planned)
    && typeof item.actual === "number"
    && Number.isFinite(item.actual);
}

function isBudgetMonth(value: unknown): value is BudgetMonth {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BudgetMonth>;
  return typeof item.month === "string"
    && Array.isArray(item.lines)
    && item.lines.every(isBudgetLine);
}

function hasLegacyCollections(value: unknown): value is LegacyAffairsWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<LegacyAffairsWorkspace>;
  return workspace.version === 1
    && Array.isArray(workspace.matters)
    && workspace.matters.every(isMatter)
    && Array.isArray(workspace.payments)
    && workspace.payments.every(isPayment)
    && Array.isArray(workspace.budgets)
    && workspace.budgets.every(isBudgetMonth);
}

function isWorkspace(value: unknown): value is AffairsWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<AffairsWorkspace>;
  return workspace.version === 2
    && Array.isArray(workspace.matters)
    && workspace.matters.every(isMatter)
    && Array.isArray(workspace.oneTimePayments)
    && workspace.oneTimePayments.every(isOneTimePayment)
    && Array.isArray(workspace.payments)
    && workspace.payments.every(isPayment)
    && Array.isArray(workspace.subscriptions)
    && workspace.subscriptions.every(isSubscription)
    && Array.isArray(workspace.documents)
    && workspace.documents.every(isDocument)
    && Array.isArray(workspace.vehicles)
    && workspace.vehicles.every(isVehicle)
    && Array.isArray(workspace.vehicleItems)
    && workspace.vehicleItems.every(isVehicleItem)
    && Array.isArray(workspace.budgets)
    && workspace.budgets.every(isBudgetMonth);
}

function migrateLegacyWorkspace(workspace: LegacyAffairsWorkspace): AffairsWorkspace {
  const isDemo = workspace.matters.some((item) => item.id === "matter-oc")
    && workspace.payments.some((item) => item.id === "payment-rent");
  const expansion = isDemo
    ? createExpansionDefaults()
    : { oneTimePayments: [], subscriptions: [], documents: [], vehicles: [], vehicleItems: [] };
  return {
    version: 2,
    matters: workspace.matters,
    oneTimePayments: expansion.oneTimePayments,
    payments: workspace.payments,
    subscriptions: expansion.subscriptions,
    documents: expansion.documents,
    vehicles: expansion.vehicles,
    vehicleItems: expansion.vehicleItems,
    budgets: workspace.budgets,
  };
}

export function loadAffairsWorkspaceResult(): LocalLoadResult<AffairsWorkspace> {
  return readLocalWorkspace({
    key: AFFAIRS_STORAGE_KEY,
    fallback: createDefaultAffairsWorkspace,
    validate: isWorkspace,
    migrate: (value) => hasLegacyCollections(value) ? migrateLegacyWorkspace(value) : null,
  });
}

export function loadAffairsWorkspace(): AffairsWorkspace {
  return loadAffairsWorkspaceResult().workspace;
}

export function saveAffairsWorkspace(workspace: AffairsWorkspace): boolean {
  return writeLocalWorkspace(AFFAIRS_STORAGE_KEY, workspace);
}

export function createAffairsId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function setMatterCompletionState(
  workspace: AffairsWorkspace,
  matterId: string,
  completed: boolean,
): AffairsWorkspace {
  return {
    ...workspace,
    matters: workspace.matters.map((matter) => matter.id === matterId
      ? { ...matter, status: completed ? "done" : "open" }
      : matter),
  };
}

export function setOneTimePaymentPaidState(
  workspace: AffairsWorkspace,
  paymentId: string,
  paid: boolean,
  paidAt = paid ? new Date().toISOString() : "",
): AffairsWorkspace {
  return {
    ...workspace,
    oneTimePayments: workspace.oneTimePayments.map((payment) => payment.id === paymentId
      ? { ...payment, paid, paidAt: paid ? paidAt : "" }
      : payment),
  };
}

export function createBudgetMonth(month: string, source?: BudgetMonth): BudgetMonth {
  return {
    month,
    lines: source
      ? source.lines.map((line) => ({
          ...line,
          id: createAffairsId("budget"),
          actual: 0,
        }))
      : [],
  };
}

export function advancePaymentDate(value: string, cadence: PaymentCadence): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  const months = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0, 12).getDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function advancePaymentDateToFuture(
  value: string,
  cadence: PaymentCadence,
  referenceDate = new Date(),
): string {
  const referenceKey = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}-${String(referenceDate.getDate()).padStart(2, "0")}`;
  let next = value;
  for (let guard = 0; guard < 240 && next <= referenceKey; guard += 1) {
    const advanced = advancePaymentDate(next, cadence);
    if (advanced === next) break;
    next = advanced;
  }
  return next;
}

export function monthlyEquivalent(amount: number, cadence: PaymentCadence): number {
  return amount / (cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12);
}
import { readLocalWorkspace, writeLocalWorkspace, type LocalLoadResult } from "./localRepository";
