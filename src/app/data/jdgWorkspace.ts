export type JdgChecklistGroup = "documents" | "settlements" | "control";

export type JdgChecklistItem = {
  id: string;
  label: string;
  group: JdgChecklistGroup;
  done: boolean;
  doneAt: string;
  required: boolean;
  dueDay: number | null;
};

export type JdgMonth = {
  month: string;
  items: JdgChecklistItem[];
  note: string;
};

export type JdgWorkspace = {
  version: 1;
  months: JdgMonth[];
};

const STORAGE_KEY = "routine.jdg.workspace.v1";

const DEFAULT_ITEMS: Array<Omit<JdgChecklistItem, "done" | "doneAt">> = [
  { id: "documents-zus", label: "Wgrałem dokumenty ZUS", group: "documents", required: true, dueDay: 5 },
  { id: "documents-sales", label: "Wgrałem faktury sprzedażowe", group: "documents", required: true, dueDay: 5 },
  { id: "documents-costs", label: "Wgrałem faktury kosztowe", group: "documents", required: true, dueDay: 5 },
  { id: "documents-bank", label: "Sprawdziłem zgodność dokumentów z kontem firmowym", group: "documents", required: false, dueDay: 7 },
  { id: "settlements-accounting", label: "Opłaciłem księgowość", group: "settlements", required: true, dueDay: 10 },
  { id: "settlements-pit", label: "Opłaciłem PIT-28", group: "settlements", required: true, dueDay: 20 },
  { id: "settlements-zus", label: "Opłaciłem ZUS", group: "settlements", required: true, dueDay: 20 },
  { id: "settlements-vat", label: "Opłaciłem VAT / JPK_V7", group: "settlements", required: true, dueDay: 25 },
  { id: "control-unpaid", label: "Sprawdziłem nieopłacone faktury", group: "control", required: false, dueDay: null },
  { id: "control-upo", label: "Pobrałem UPO wysłanych deklaracji", group: "control", required: false, dueDay: null },
  { id: "control-archive", label: "Zarchiwizowałem dokumenty miesiąca", group: "control", required: false, dueDay: null },
  { id: "control-close", label: "Zamknąłem miesiąc", group: "control", required: true, dueDay: null },
];

export function getJdgMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function createJdgMonth(month: string, source?: JdgMonth): JdgMonth {
  const sourceItems = source?.items ?? DEFAULT_ITEMS;
  return {
    month,
    note: "",
    items: sourceItems.map((item) => ({
      id: item.id.startsWith("custom-") ? `${item.id}-${month}` : item.id,
      label: item.label,
      group: item.group,
      required: item.required,
      dueDay: item.dueDay,
      done: false,
      doneAt: "",
    })),
  };
}

function createDefaultWorkspace(): JdgWorkspace {
  return {
    version: 1,
    months: [createJdgMonth(getJdgMonthKey())],
  };
}

function isItem(value: unknown): value is JdgChecklistItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<JdgChecklistItem>;
  return typeof item.id === "string"
    && typeof item.label === "string"
    && ["documents", "settlements", "control"].includes(String(item.group))
    && typeof item.done === "boolean"
    && typeof item.doneAt === "string"
    && typeof item.required === "boolean"
    && (item.dueDay === null || (typeof item.dueDay === "number" && item.dueDay >= 1 && item.dueDay <= 31));
}

function isMonth(value: unknown): value is JdgMonth {
  if (!value || typeof value !== "object") return false;
  const month = value as Partial<JdgMonth>;
  return typeof month.month === "string"
    && typeof month.note === "string"
    && Array.isArray(month.items)
    && month.items.every(isItem);
}

function isWorkspace(value: unknown): value is JdgWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<JdgWorkspace>;
  return workspace.version === 1
    && Array.isArray(workspace.months)
    && workspace.months.every(isMonth);
}

export function loadJdgWorkspace(): JdgWorkspace {
  if (typeof window === "undefined") return createDefaultWorkspace();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultWorkspace();
    const parsed: unknown = JSON.parse(raw);
    return isWorkspace(parsed) ? parsed : createDefaultWorkspace();
  } catch {
    return createDefaultWorkspace();
  }
}

export function saveJdgWorkspace(workspace: JdgWorkspace): boolean {
  if (typeof window === "undefined") return true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

export function createJdgItemId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
