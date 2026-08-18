import {
  readLocalWorkspace,
  writeLocalWorkspace,
  type LocalLoadResult,
} from "./localRepository";

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

export type JdgTaxForm =
  | "unconfigured"
  | "scale"
  | "linear"
  | "lump-sum"
  | "tax-card"
  | "other";

export type JdgVatStatus = "unconfigured" | "exempt" | "active";
export type JdgVatCadence = "monthly" | "quarterly";

export type JdgZusScheme =
  | "unconfigured"
  | "start-relief"
  | "preferential"
  | "small-business-plus"
  | "standard"
  | "none"
  | "other";

export type JdgAccountingMode =
  | "unconfigured"
  | "self"
  | "accounting-office"
  | "online"
  | "other";

export type JdgTaxProfile = {
  taxForm: JdgTaxForm;
  vatStatus: JdgVatStatus;
  vatCadence: JdgVatCadence | null;
  zusScheme: JdgZusScheme;
  accountingMode: JdgAccountingMode;
  updatedAt: string;
};

export type JdgChecklistTemplateItem = Omit<JdgChecklistItem, "done" | "doneAt">;

export type JdgMonthTemplate = {
  id: string;
  name: string;
  description: string;
  source: "profile" | "custom";
  items: JdgChecklistTemplateItem[];
  createdAt: string;
  updatedAt: string;
};

export type JdgAuditSnapshot =
  | {
      kind: "month";
      monthKey: string;
      month: JdgMonth | null;
    }
  | {
      kind: "profile";
      taxProfile: JdgTaxProfile;
      profileTemplate: JdgMonthTemplate | null;
      defaultTemplateId: string | null;
    }
  | {
      kind: "template";
      templateId: string;
      template: JdgMonthTemplate | null;
      defaultTemplateId: string | null;
    }
  | {
      kind: "default-template";
      defaultTemplateId: string | null;
    };

export type JdgAuditEventType =
  | "workspace-migrated"
  | "profile-updated"
  | "template-created"
  | "template-updated"
  | "template-deleted"
  | "default-template-changed"
  | "template-applied"
  | "month-reset"
  | "item-deleted"
  | "undo";

export type JdgAuditEvent = {
  id: string;
  occurredAt: string;
  type: JdgAuditEventType;
  summary: string;
  targetId?: string;
  snapshot?: JdgAuditSnapshot;
  revertsEventId?: string;
};

export type JdgWorkspace = {
  version: 2;
  months: JdgMonth[];
  taxProfile: JdgTaxProfile;
  templates: JdgMonthTemplate[];
  defaultTemplateId: string | null;
  history: JdgAuditEvent[];
};

type LegacyJdgWorkspace = {
  version: 1;
  months: JdgMonth[];
};

export type JdgTemplateApplyMode = "merge" | "replace";

export type JdgMutationMeta = {
  occurredAt?: string;
  eventId?: string;
};

export const JDG_STORAGE_KEY = "rootine.jdg.workspace.v1";
export const JDG_PROFILE_TEMPLATE_ID = "profile-default";
export const MAX_JDG_HISTORY_EVENTS = 100;

export const DEFAULT_JDG_TAX_PROFILE: Readonly<JdgTaxProfile> = {
  taxForm: "unconfigured",
  vatStatus: "unconfigured",
  vatCadence: null,
  zusScheme: "unconfigured",
  accountingMode: "unconfigured",
  updatedAt: "",
};

export const JDG_TAX_FORM_OPTIONS: Array<{ value: JdgTaxForm; label: string }> = [
  { value: "unconfigured", label: "Nie ustawiono" },
  { value: "scale", label: "Skala podatkowa" },
  { value: "linear", label: "Podatek liniowy" },
  { value: "lump-sum", label: "Ryczałt od przychodów ewidencjonowanych" },
  { value: "tax-card", label: "Karta podatkowa" },
  { value: "other", label: "Inna forma" },
];

export const JDG_VAT_STATUS_OPTIONS: Array<{ value: JdgVatStatus; label: string }> = [
  { value: "unconfigured", label: "Nie ustawiono" },
  { value: "exempt", label: "Zwolnienie z VAT" },
  { value: "active", label: "Czynny podatnik VAT" },
];

export const JDG_VAT_CADENCE_OPTIONS: Array<{ value: JdgVatCadence; label: string }> = [
  { value: "monthly", label: "Miesięcznie" },
  { value: "quarterly", label: "Kwartalnie" },
];

export const JDG_ZUS_SCHEME_OPTIONS: Array<{ value: JdgZusScheme; label: string }> = [
  { value: "unconfigured", label: "Nie ustawiono" },
  { value: "start-relief", label: "Ulga na start" },
  { value: "preferential", label: "Preferencyjny ZUS" },
  { value: "small-business-plus", label: "Mały ZUS Plus" },
  { value: "standard", label: "Pełny ZUS" },
  { value: "none", label: "Bez składek ZUS" },
  { value: "other", label: "Inny schemat" },
];

export const JDG_ACCOUNTING_MODE_OPTIONS: Array<{ value: JdgAccountingMode; label: string }> = [
  { value: "unconfigured", label: "Nie ustawiono" },
  { value: "self", label: "Samodzielnie" },
  { value: "accounting-office", label: "Biuro rachunkowe" },
  { value: "online", label: "Księgowość online" },
  { value: "other", label: "Inny sposób" },
];

const CHECKLIST_GROUPS = new Set<JdgChecklistGroup>(["documents", "settlements", "control"]);
const TAX_FORMS = new Set<JdgTaxForm>(JDG_TAX_FORM_OPTIONS.map((option) => option.value));
const VAT_STATUSES = new Set<JdgVatStatus>(JDG_VAT_STATUS_OPTIONS.map((option) => option.value));
const VAT_CADENCES = new Set<JdgVatCadence>(JDG_VAT_CADENCE_OPTIONS.map((option) => option.value));
const ZUS_SCHEMES = new Set<JdgZusScheme>(JDG_ZUS_SCHEME_OPTIONS.map((option) => option.value));
const ACCOUNTING_MODES = new Set<JdgAccountingMode>(JDG_ACCOUNTING_MODE_OPTIONS.map((option) => option.value));
const TEMPLATE_SOURCES = new Set<JdgMonthTemplate["source"]>(["profile", "custom"]);
const AUDIT_EVENT_TYPES = new Set<JdgAuditEventType>([
  "workspace-migrated",
  "profile-updated",
  "template-created",
  "template-updated",
  "template-deleted",
  "default-template-changed",
  "template-applied",
  "month-reset",
  "item-deleted",
  "undo",
]);

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_MONTHS = 600;
const MAX_ITEMS_PER_MONTH = 500;
const MAX_TEMPLATES = 100;
const MAX_LABEL_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 4_000;
const MAX_NOTE_LENGTH = 100_000;

const BASE_DOCUMENT_ITEMS: JdgChecklistTemplateItem[] = [
  {
    id: "documents-sales",
    label: "Wgrałem faktury sprzedażowe",
    group: "documents",
    required: true,
    dueDay: 5,
  },
  {
    id: "documents-costs",
    label: "Wgrałem faktury kosztowe",
    group: "documents",
    required: true,
    dueDay: 5,
  },
  {
    id: "documents-bank",
    label: "Sprawdziłem zgodność dokumentów z kontem firmowym",
    group: "documents",
    required: false,
    dueDay: 7,
  },
];

const BASE_CONTROL_ITEMS: JdgChecklistTemplateItem[] = [
  {
    id: "control-unpaid",
    label: "Sprawdziłem nieopłacone faktury",
    group: "control",
    required: false,
    dueDay: null,
  },
  {
    id: "control-upo",
    label: "Pobrałem UPO wysłanych deklaracji",
    group: "control",
    required: false,
    dueDay: null,
  },
  {
    id: "control-archive",
    label: "Zarchiwizowałem dokumenty miesiąca",
    group: "control",
    required: false,
    dueDay: null,
  },
  {
    id: "control-close",
    label: "Zamknąłem miesiąc",
    group: "control",
    required: true,
    dueDay: null,
  },
];

function currentTimestamp(): string {
  return new Date().toISOString();
}

function createAuditId(): string {
  return `jdg-event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function eventDetails(meta?: JdgMutationMeta): Required<JdgMutationMeta> {
  return {
    occurredAt: meta?.occurredAt ?? currentTimestamp(),
    eventId: meta?.eventId ?? createAuditId(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return typeof value === "string"
    && value.length <= maxLength
    && (allowEmpty || value.trim().length > 0);
}

function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && MONTH_KEY.test(value);
}

function isTimestamp(value: unknown, allowEmpty = false): value is string {
  if (allowEmpty && value === "") return true;
  return typeof value === "string"
    && value.length <= 40
    && !Number.isNaN(Date.parse(value));
}

function hasUniqueStrings(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function isDueDay(value: unknown): value is number | null {
  return value === null
    || (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 31);
}

function isTemplateItem(value: unknown): value is JdgChecklistTemplateItem {
  if (!isRecord(value)) return false;
  return isBoundedString(value.id, 160)
    && isBoundedString(value.label, MAX_LABEL_LENGTH)
    && CHECKLIST_GROUPS.has(value.group as JdgChecklistGroup)
    && typeof value.required === "boolean"
    && isDueDay(value.dueDay);
}

function isChecklistItem(value: unknown): value is JdgChecklistItem {
  if (!isRecord(value) || !isTemplateItem(value)) return false;
  const item = value as Partial<JdgChecklistItem>;
  return typeof item.done === "boolean"
    && isTimestamp(item.doneAt, true)
    && (item.done || item.doneAt === "");
}

function isMonth(value: unknown): value is JdgMonth {
  if (!isRecord(value)
    || !isMonthKey(value.month)
    || !isBoundedString(value.note, MAX_NOTE_LENGTH, true)
    || !Array.isArray(value.items)
    || value.items.length > MAX_ITEMS_PER_MONTH
    || !value.items.every(isChecklistItem)) {
    return false;
  }
  return hasUniqueStrings(value.items.map((item) => item.id));
}

function isTaxProfile(value: unknown): value is JdgTaxProfile {
  if (!isRecord(value)
    || !TAX_FORMS.has(value.taxForm as JdgTaxForm)
    || !VAT_STATUSES.has(value.vatStatus as JdgVatStatus)
    || !ZUS_SCHEMES.has(value.zusScheme as JdgZusScheme)
    || !ACCOUNTING_MODES.has(value.accountingMode as JdgAccountingMode)
    || !isTimestamp(value.updatedAt, true)) {
    return false;
  }

  if (value.vatStatus === "active") {
    return VAT_CADENCES.has(value.vatCadence as JdgVatCadence);
  }
  return value.vatCadence === null;
}

function isTemplate(value: unknown): value is JdgMonthTemplate {
  if (!isRecord(value)
    || !isBoundedString(value.id, 160)
    || !isBoundedString(value.name, 200)
    || !isBoundedString(value.description, MAX_DESCRIPTION_LENGTH, true)
    || !TEMPLATE_SOURCES.has(value.source as JdgMonthTemplate["source"])
    || !Array.isArray(value.items)
    || value.items.length > MAX_ITEMS_PER_MONTH
    || !value.items.every(isTemplateItem)
    || !isTimestamp(value.createdAt)
    || !isTimestamp(value.updatedAt)) {
    return false;
  }
  return hasUniqueStrings(value.items.map((item) => item.id));
}

function isAuditSnapshot(value: unknown): value is JdgAuditSnapshot {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "month") {
    return isMonthKey(value.monthKey) && (value.month === null || isMonth(value.month));
  }
  if (value.kind === "profile") {
    return isTaxProfile(value.taxProfile)
      && (value.profileTemplate === null || isTemplate(value.profileTemplate))
      && (value.defaultTemplateId === null || isBoundedString(value.defaultTemplateId, 160));
  }
  if (value.kind === "template") {
    return isBoundedString(value.templateId, 160)
      && (value.template === null || isTemplate(value.template))
      && (value.defaultTemplateId === null || isBoundedString(value.defaultTemplateId, 160));
  }
  if (value.kind === "default-template") {
    return value.defaultTemplateId === null || isBoundedString(value.defaultTemplateId, 160);
  }
  return false;
}

function isAuditEvent(value: unknown): value is JdgAuditEvent {
  if (!isRecord(value)
    || !isBoundedString(value.id, 160)
    || !isTimestamp(value.occurredAt)
    || !AUDIT_EVENT_TYPES.has(value.type as JdgAuditEventType)
    || !isBoundedString(value.summary, 1_000)
    || (value.targetId !== undefined && !isBoundedString(value.targetId, 160))
    || (value.revertsEventId !== undefined && !isBoundedString(value.revertsEventId, 160))
    || (value.snapshot !== undefined && !isAuditSnapshot(value.snapshot))) {
    return false;
  }
  if (value.type === "undo") {
    return typeof value.revertsEventId === "string" && value.snapshot === undefined;
  }
  if (value.revertsEventId !== undefined) return false;
  if (value.type === "workspace-migrated") return value.snapshot === undefined;
  if (value.type === "profile-updated") return value.snapshot?.kind === "profile";
  if (["template-created", "template-updated", "template-deleted"].includes(String(value.type))) {
    return value.snapshot?.kind === "template";
  }
  if (value.type === "default-template-changed") {
    return value.snapshot?.kind === "default-template";
  }
  return value.snapshot?.kind === "month";
}

function isLegacyWorkspace(value: unknown): value is LegacyJdgWorkspace {
  if (!isRecord(value)
    || value.version !== 1
    || !Array.isArray(value.months)
    || value.months.length > MAX_MONTHS
    || !value.months.every(isMonth)) {
    return false;
  }
  return hasUniqueStrings(value.months.map((month) => month.month));
}

export function isJdgWorkspace(value: unknown): value is JdgWorkspace {
  if (!isRecord(value)
    || value.version !== 2
    || !Array.isArray(value.months)
    || value.months.length > MAX_MONTHS
    || !value.months.every(isMonth)
    || !isTaxProfile(value.taxProfile)
    || !Array.isArray(value.templates)
    || value.templates.length > MAX_TEMPLATES
    || !value.templates.every(isTemplate)
    || (value.defaultTemplateId !== null && !isBoundedString(value.defaultTemplateId, 160))
    || !Array.isArray(value.history)
    || value.history.length > MAX_JDG_HISTORY_EVENTS
    || !value.history.every(isAuditEvent)) {
    return false;
  }

  const monthKeys = value.months.map((month) => month.month);
  const templateIds = value.templates.map((template) => template.id);
  const historyIds = value.history.map((event) => event.id);
  return hasUniqueStrings(monthKeys)
    && hasUniqueStrings(templateIds)
    && hasUniqueStrings(historyIds)
    && (value.defaultTemplateId === null || templateIds.includes(value.defaultTemplateId));
}

function accountingItem(profile: JdgTaxProfile): JdgChecklistTemplateItem {
  if (profile.accountingMode === "self") {
    return {
      id: "settlements-accounting",
      label: "Uzupełniłem ewidencję księgową",
      group: "settlements",
      required: true,
      dueDay: 10,
    };
  }
  if (profile.accountingMode === "accounting-office") {
    return {
      id: "settlements-accounting",
      label: "Opłaciłem biuro rachunkowe",
      group: "settlements",
      required: true,
      dueDay: 10,
    };
  }
  if (profile.accountingMode === "online") {
    return {
      id: "settlements-accounting",
      label: "Opłaciłem i uzupełniłem księgowość online",
      group: "settlements",
      required: true,
      dueDay: 10,
    };
  }
  if (profile.accountingMode === "other") {
    return {
      id: "settlements-accounting",
      label: "Rozliczyłem obsługę księgową",
      group: "settlements",
      required: true,
      dueDay: 10,
    };
  }
  return {
    id: "settlements-accounting",
    label: "Sprawdziłem sposób prowadzenia księgowości",
    group: "settlements",
    required: false,
    dueDay: 10,
  };
}

function incomeTaxItem(profile: JdgTaxProfile): JdgChecklistTemplateItem {
  const labels: Record<JdgTaxForm, string> = {
    unconfigured: "Sprawdziłem obowiązek podatku dochodowego",
    scale: "Opłaciłem zaliczkę na PIT według skali",
    linear: "Opłaciłem zaliczkę na PIT-36L",
    "lump-sum": "Opłaciłem PIT-28",
    "tax-card": "Opłaciłem podatek w formie karty podatkowej",
    other: "Opłaciłem podatek dochodowy",
  };
  return {
    id: "settlements-income-tax",
    label: labels[profile.taxForm],
    group: "settlements",
    required: profile.taxForm !== "unconfigured",
    dueDay: 20,
  };
}

function zusItems(profile: JdgTaxProfile): JdgChecklistTemplateItem[] {
  if (profile.zusScheme === "none") return [];
  const configured = profile.zusScheme !== "unconfigured";
  return [
    {
      id: "documents-zus",
      label: configured ? "Wgrałem dokumenty ZUS" : "Sprawdziłem obowiązek dokumentów ZUS",
      group: "documents",
      required: configured,
      dueDay: 5,
    },
    {
      id: "settlements-zus",
      label: configured ? "Opłaciłem składki ZUS" : "Sprawdziłem obowiązek składek ZUS",
      group: "settlements",
      required: configured,
      dueDay: 20,
    },
  ];
}

function vatItems(profile: JdgTaxProfile): JdgChecklistTemplateItem[] {
  if (profile.vatStatus === "exempt") {
    return [{
      id: "control-vat-exemption",
      label: "Sprawdziłem limit i warunki zwolnienia z VAT",
      group: "control",
      required: false,
      dueDay: 25,
    }];
  }
  if (profile.vatStatus === "active") {
    return [{
      id: "settlements-vat",
      label: profile.vatCadence === "quarterly"
        ? "Rozliczyłem VAT / JPK_V7K"
        : "Rozliczyłem VAT / JPK_V7M",
      group: "settlements",
      required: true,
      dueDay: 25,
    }];
  }
  return [{
    id: "control-vat-status",
    label: "Sprawdziłem obowiązek VAT i JPK",
    group: "control",
    required: false,
    dueDay: 25,
  }];
}

export function buildJdgProfileTemplate(
  profile: JdgTaxProfile,
  timestamp = currentTimestamp(),
): JdgMonthTemplate {
  return {
    id: JDG_PROFILE_TEMPLATE_ID,
    name: "Checklista z profilu podatkowego",
    description: "Automatycznie dopasowana do zapisanej formy podatku, VAT, ZUS i księgowości.",
    source: "profile",
    items: [
      ...BASE_DOCUMENT_ITEMS,
      ...zusItems(profile),
      accountingItem(profile),
      incomeTaxItem(profile),
      ...vatItems(profile),
      ...BASE_CONTROL_ITEMS,
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function stripMonthSuffix(id: string): string {
  return id.replace(/-\d{4}-(0[1-9]|1[0-2])$/, "");
}

function instantiateItemId(id: string, month: string): string {
  if (!id.startsWith("custom-")) return id;
  return `${stripMonthSuffix(id)}-${month}`;
}

function templateItemsFromMonth(month: JdgMonth): JdgChecklistTemplateItem[] {
  const seen = new Set<string>();
  return month.items.map((item) => {
    const baseId = stripMonthSuffix(item.id);
    let id = baseId;
    let suffix = 2;
    while (seen.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    seen.add(id);
    return {
      id,
      label: item.label,
      group: item.group,
      required: item.required,
      dueDay: item.dueDay,
    };
  });
}

export function getJdgMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function createJdgMonth(
  month: string,
  source?: JdgMonth | JdgMonthTemplate,
): JdgMonth {
  const sourceItems = source?.items
    ?? buildJdgProfileTemplate({ ...DEFAULT_JDG_TAX_PROFILE }).items;
  return {
    month,
    note: "",
    items: sourceItems.map((item) => ({
      id: instantiateItemId(item.id, month),
      label: item.label,
      group: item.group,
      required: item.required,
      dueDay: item.dueDay,
      done: false,
      doneAt: "",
    })),
  };
}

export function createJdgMonthFromTemplate(
  month: string,
  template: JdgMonthTemplate,
): JdgMonth {
  return createJdgMonth(month, template);
}

export function createJdgMonthForWorkspace(
  workspace: JdgWorkspace,
  month: string,
): JdgWorkspace {
  if (
    !isMonthKey(month)
    || workspace.months.length >= MAX_MONTHS
    || workspace.months.some((candidate) => candidate.month === month)
  ) {
    return workspace;
  }
  const template = workspace.templates.find((candidate) => candidate.id === workspace.defaultTemplateId)
    ?? workspace.templates.find((candidate) => candidate.id === JDG_PROFILE_TEMPLATE_ID)
    ?? buildJdgProfileTemplate(workspace.taxProfile);
  return {
    ...workspace,
    months: [...workspace.months, createJdgMonthFromTemplate(month, template)],
  };
}

export function createDefaultJdgWorkspace(date = new Date()): JdgWorkspace {
  const timestamp = date.toISOString();
  const taxProfile: JdgTaxProfile = {
    ...DEFAULT_JDG_TAX_PROFILE,
    updatedAt: timestamp,
  };
  const profileTemplate = buildJdgProfileTemplate(taxProfile, timestamp);
  return {
    version: 2,
    months: [createJdgMonthFromTemplate(getJdgMonthKey(date), profileTemplate)],
    taxProfile,
    templates: [profileTemplate],
    defaultTemplateId: profileTemplate.id,
    history: [],
  };
}

export function createEmptyJdgWorkspace(date = new Date()): JdgWorkspace {
  const timestamp = date.toISOString();
  const taxProfile: JdgTaxProfile = {
    ...DEFAULT_JDG_TAX_PROFILE,
    updatedAt: timestamp,
  };
  const profileTemplate = buildJdgProfileTemplate(taxProfile, timestamp);
  return {
    version: 2,
    months: [],
    taxProfile,
    templates: [profileTemplate],
    defaultTemplateId: profileTemplate.id,
    history: [],
  };
}

function cloneMonth(month: JdgMonth): JdgMonth {
  return {
    ...month,
    items: month.items.map((item) => ({ ...item })),
  };
}

function cloneTemplate(template: JdgMonthTemplate): JdgMonthTemplate {
  return {
    ...template,
    items: template.items.map((item) => ({ ...item })),
  };
}

function appendAuditEvent(workspace: JdgWorkspace, event: JdgAuditEvent): JdgWorkspace {
  const uniqueEvent = workspace.history.some((candidate) => candidate.id === event.id)
    ? { ...event, id: createAuditId() }
    : event;
  return {
    ...workspace,
    history: [...workspace.history, uniqueEvent].slice(-MAX_JDG_HISTORY_EVENTS),
  };
}

function migratedLegacyTemplate(
  legacy: LegacyJdgWorkspace,
  timestamp: string,
): JdgMonthTemplate | null {
  const latest = [...legacy.months]
    .sort((left, right) => right.month.localeCompare(left.month))[0];
  if (!latest || latest.items.length === 0) return null;
  return {
    id: "legacy-monthly",
    name: "Dotychczasowa checklista",
    description: "Zachowana podczas migracji wcześniejszego obszaru JDG.",
    source: "custom",
    items: templateItemsFromMonth(latest),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function migrateJdgWorkspace(value: unknown): JdgWorkspace | null {
  if (!isLegacyWorkspace(value)) return null;
  const timestamp = currentTimestamp();
  const taxProfile: JdgTaxProfile = {
    ...DEFAULT_JDG_TAX_PROFILE,
    updatedAt: timestamp,
  };
  const profileTemplate = buildJdgProfileTemplate(taxProfile, timestamp);
  const legacyTemplate = migratedLegacyTemplate(value, timestamp);
  const event: JdgAuditEvent = {
    id: createAuditId(),
    occurredAt: timestamp,
    type: "workspace-migrated",
    summary: "Przeniesiono obszar JDG do profilu podatkowego i szablonów.",
  };

  return {
    version: 2,
    months: value.months.map(cloneMonth),
    taxProfile,
    templates: legacyTemplate ? [profileTemplate, legacyTemplate] : [profileTemplate],
    defaultTemplateId: legacyTemplate?.id ?? profileTemplate.id,
    history: [event],
  };
}

export function updateJdgTaxProfile(
  workspace: JdgWorkspace,
  patch: Partial<JdgTaxProfile>,
  meta?: JdgMutationMeta,
): JdgWorkspace {
  const details = eventDetails(meta);
  const logicalProfile = {
    ...workspace.taxProfile,
    ...patch,
    updatedAt: details.occurredAt,
  };
  const nextProfile: JdgTaxProfile = {
    ...logicalProfile,
    vatCadence: logicalProfile.vatStatus === "active"
      ? logicalProfile.vatCadence ?? "monthly"
      : null,
  };
  if (!isTaxProfile(nextProfile)) return workspace;

  const currentComparable = { ...workspace.taxProfile, updatedAt: "" };
  const nextComparable = { ...nextProfile, updatedAt: "" };
  if (JSON.stringify(currentComparable) === JSON.stringify(nextComparable)) return workspace;

  const previousProfileTemplate = workspace.templates.find((template) => (
    template.id === JDG_PROFILE_TEMPLATE_ID
  )) ?? null;
  if (!previousProfileTemplate && workspace.templates.length >= MAX_TEMPLATES) return workspace;
  const generatedTemplate = {
    ...buildJdgProfileTemplate(nextProfile, details.occurredAt),
    createdAt: previousProfileTemplate?.createdAt ?? details.occurredAt,
  };
  const templates = previousProfileTemplate
    ? workspace.templates.map((template) => (
        template.id === JDG_PROFILE_TEMPLATE_ID ? generatedTemplate : template
      ))
    : [generatedTemplate, ...workspace.templates];

  return appendAuditEvent({
    ...workspace,
    taxProfile: nextProfile,
    templates,
    defaultTemplateId: JDG_PROFILE_TEMPLATE_ID,
  }, {
    id: details.eventId,
    occurredAt: details.occurredAt,
    type: "profile-updated",
    summary: "Zaktualizowano profil podatkowy i jego checklistę.",
    targetId: JDG_PROFILE_TEMPLATE_ID,
    snapshot: {
      kind: "profile",
      taxProfile: { ...workspace.taxProfile },
      profileTemplate: previousProfileTemplate ? cloneTemplate(previousProfileTemplate) : null,
      defaultTemplateId: workspace.defaultTemplateId,
    },
  });
}

export function upsertJdgMonthTemplate(
  workspace: JdgWorkspace,
  template: JdgMonthTemplate,
  meta?: JdgMutationMeta,
): JdgWorkspace {
  if (!isTemplate(template)) return workspace;
  const existing = workspace.templates.find((candidate) => candidate.id === template.id) ?? null;
  if (existing?.source === "profile" || (template.id === JDG_PROFILE_TEMPLATE_ID && template.source !== "profile")) {
    return workspace;
  }
  if (!existing && workspace.templates.length >= MAX_TEMPLATES) return workspace;
  if (existing && JSON.stringify(existing) === JSON.stringify(template)) return workspace;
  const details = eventDetails(meta);
  const nextTemplate = cloneTemplate({
    ...template,
    source: "custom",
    createdAt: existing?.createdAt ?? template.createdAt,
    updatedAt: details.occurredAt,
  });
  const templates = existing
    ? workspace.templates.map((candidate) => candidate.id === nextTemplate.id ? nextTemplate : candidate)
    : [...workspace.templates, nextTemplate];

  return appendAuditEvent({ ...workspace, templates }, {
    id: details.eventId,
    occurredAt: details.occurredAt,
    type: existing ? "template-updated" : "template-created",
    summary: existing
      ? `Zaktualizowano szablon „${nextTemplate.name}”.`
      : `Utworzono szablon „${nextTemplate.name}”.`,
    targetId: nextTemplate.id,
    snapshot: {
      kind: "template",
      templateId: nextTemplate.id,
      template: existing ? cloneTemplate(existing) : null,
      defaultTemplateId: workspace.defaultTemplateId,
    },
  });
}

export function createJdgTemplateFromMonth(
  workspace: JdgWorkspace,
  monthKey: string,
  input: { id?: string; name: string; description?: string },
  meta?: JdgMutationMeta,
): JdgWorkspace {
  const month = workspace.months.find((candidate) => candidate.month === monthKey);
  const name = input.name.trim();
  if (!month || !isBoundedString(name, 200)) return workspace;
  const details = eventDetails(meta);
  const templateId = input.id?.trim() || createJdgTemplateId();
  const existing = workspace.templates.find((candidate) => candidate.id === templateId);
  const template: JdgMonthTemplate = {
    id: templateId,
    name,
    description: input.description?.trim() ?? "",
    source: "custom",
    items: templateItemsFromMonth(month),
    createdAt: existing?.createdAt ?? details.occurredAt,
    updatedAt: details.occurredAt,
  };
  return upsertJdgMonthTemplate(workspace, template, details);
}

export function deleteJdgMonthTemplate(
  workspace: JdgWorkspace,
  templateId: string,
  meta?: JdgMutationMeta,
): JdgWorkspace {
  const template = workspace.templates.find((candidate) => candidate.id === templateId);
  if (!template || template.source === "profile") return workspace;
  const details = eventDetails(meta);
  const fallbackTemplateId = workspace.templates.some((candidate) => candidate.id === JDG_PROFILE_TEMPLATE_ID)
    ? JDG_PROFILE_TEMPLATE_ID
    : null;
  const defaultTemplateId = workspace.defaultTemplateId === templateId
    ? fallbackTemplateId
    : workspace.defaultTemplateId;

  return appendAuditEvent({
    ...workspace,
    templates: workspace.templates.filter((candidate) => candidate.id !== templateId),
    defaultTemplateId,
  }, {
    id: details.eventId,
    occurredAt: details.occurredAt,
    type: "template-deleted",
    summary: `Usunięto szablon „${template.name}”.`,
    targetId: templateId,
    snapshot: {
      kind: "template",
      templateId,
      template: cloneTemplate(template),
      defaultTemplateId: workspace.defaultTemplateId,
    },
  });
}

export function setJdgDefaultTemplate(
  workspace: JdgWorkspace,
  templateId: string | null,
  meta?: JdgMutationMeta,
): JdgWorkspace {
  if (templateId !== null && !workspace.templates.some((template) => template.id === templateId)) {
    return workspace;
  }
  if (workspace.defaultTemplateId === templateId) return workspace;
  const details = eventDetails(meta);
  return appendAuditEvent({ ...workspace, defaultTemplateId: templateId }, {
    id: details.eventId,
    occurredAt: details.occurredAt,
    type: "default-template-changed",
    summary: templateId
      ? "Zmieniono domyślny szablon miesiąca."
      : "Wyłączono domyślny szablon miesiąca.",
    targetId: templateId ?? undefined,
    snapshot: {
      kind: "default-template",
      defaultTemplateId: workspace.defaultTemplateId,
    },
  });
}

function mergeTemplateItems(
  current: JdgChecklistItem[],
  incoming: JdgChecklistItem[],
  monthKey: string,
): JdgChecklistItem[] {
  const existingIds = new Set(current.map((item) => stripMonthSuffix(item.id)));
  const added = incoming.filter((item) => !existingIds.has(stripMonthSuffix(item.id)));
  return [
    ...current.map((item) => ({ ...item })),
    ...added.map((item) => ({
      ...item,
      id: instantiateItemId(item.id, monthKey),
    })),
  ];
}

export function applyJdgMonthTemplate(
  workspace: JdgWorkspace,
  monthKey: string,
  templateId: string,
  mode: JdgTemplateApplyMode = "merge",
  meta?: JdgMutationMeta,
): JdgWorkspace {
  if (!isMonthKey(monthKey)) return workspace;
  const template = workspace.templates.find((candidate) => candidate.id === templateId);
  if (!template) return workspace;
  const current = workspace.months.find((month) => month.month === monthKey) ?? null;
  if (!current && workspace.months.length >= MAX_MONTHS) return workspace;
  const generated = createJdgMonthFromTemplate(monthKey, template);
  const nextMonth: JdgMonth = current
    ? {
        ...generated,
        note: current.note,
        items: mode === "merge"
          ? mergeTemplateItems(current.items, generated.items, monthKey)
          : generated.items,
      }
    : generated;

  if (current && JSON.stringify(current) === JSON.stringify(nextMonth)) return workspace;
  const details = eventDetails(meta);
  const months = current
    ? workspace.months.map((month) => month.month === monthKey ? nextMonth : month)
    : [...workspace.months, nextMonth];

  return appendAuditEvent({ ...workspace, months }, {
    id: details.eventId,
    occurredAt: details.occurredAt,
    type: "template-applied",
    summary: `${mode === "merge" ? "Dodano punkty z" : "Zastosowano"} szablonu „${template.name}”.`,
    targetId: monthKey,
    snapshot: {
      kind: "month",
      monthKey,
      month: current ? cloneMonth(current) : null,
    },
  });
}

export function resetJdgMonth(
  workspace: JdgWorkspace,
  monthKey: string,
  meta?: JdgMutationMeta,
): JdgWorkspace {
  const current = workspace.months.find((month) => month.month === monthKey);
  if (!current || !current.items.some((item) => item.done || item.doneAt)) return workspace;
  const details = eventDetails(meta);
  const reset: JdgMonth = {
    ...current,
    items: current.items.map((item) => ({ ...item, done: false, doneAt: "" })),
  };
  return appendAuditEvent({
    ...workspace,
    months: workspace.months.map((month) => month.month === monthKey ? reset : month),
  }, {
    id: details.eventId,
    occurredAt: details.occurredAt,
    type: "month-reset",
    summary: `Wyczyszczono potwierdzenia za ${monthKey}.`,
    targetId: monthKey,
    snapshot: {
      kind: "month",
      monthKey,
      month: cloneMonth(current),
    },
  });
}

export function deleteJdgMonthItem(
  workspace: JdgWorkspace,
  monthKey: string,
  itemId: string,
  meta?: JdgMutationMeta,
): JdgWorkspace {
  const current = workspace.months.find((month) => month.month === monthKey);
  const item = current?.items.find((candidate) => candidate.id === itemId);
  if (!current || !item) return workspace;
  const details = eventDetails(meta);
  const nextMonth: JdgMonth = {
    ...current,
    items: current.items.filter((candidate) => candidate.id !== itemId),
  };
  return appendAuditEvent({
    ...workspace,
    months: workspace.months.map((month) => month.month === monthKey ? nextMonth : month),
  }, {
    id: details.eventId,
    occurredAt: details.occurredAt,
    type: "item-deleted",
    summary: `Usunięto punkt „${item.label}”.`,
    targetId: itemId,
    snapshot: {
      kind: "month",
      monthKey,
      month: cloneMonth(current),
    },
  });
}

function restoreMonthSnapshot(
  workspace: JdgWorkspace,
  snapshot: Extract<JdgAuditSnapshot, { kind: "month" }>,
): JdgWorkspace {
  const exists = workspace.months.some((month) => month.month === snapshot.monthKey);
  if (snapshot.month === null) {
    return {
      ...workspace,
      months: workspace.months.filter((month) => month.month !== snapshot.monthKey),
    };
  }
  const restored = cloneMonth(snapshot.month);
  return {
    ...workspace,
    months: exists
      ? workspace.months.map((month) => month.month === snapshot.monthKey ? restored : month)
      : [...workspace.months, restored],
  };
}

function restoreProfileSnapshot(
  workspace: JdgWorkspace,
  snapshot: Extract<JdgAuditSnapshot, { kind: "profile" }>,
): JdgWorkspace {
  const withoutProfileTemplate = workspace.templates.filter((template) => (
    template.id !== JDG_PROFILE_TEMPLATE_ID
  ));
  return {
    ...workspace,
    taxProfile: { ...snapshot.taxProfile },
    templates: snapshot.profileTemplate
      ? [cloneTemplate(snapshot.profileTemplate), ...withoutProfileTemplate]
      : withoutProfileTemplate,
    defaultTemplateId: snapshot.defaultTemplateId,
  };
}

function restoreTemplateSnapshot(
  workspace: JdgWorkspace,
  snapshot: Extract<JdgAuditSnapshot, { kind: "template" }>,
): JdgWorkspace {
  const withoutTemplate = workspace.templates.filter((template) => template.id !== snapshot.templateId);
  return {
    ...workspace,
    templates: snapshot.template
      ? [...withoutTemplate, cloneTemplate(snapshot.template)]
      : withoutTemplate,
    defaultTemplateId: snapshot.defaultTemplateId,
  };
}

export function canUndoJdgAuditEvent(workspace: JdgWorkspace, eventId: string): boolean {
  const event = workspace.history.find((candidate) => candidate.id === eventId);
  if (!event?.snapshot || event.type === "undo") return false;
  return !workspace.history.some((candidate) => (
    candidate.type === "undo" && candidate.revertsEventId === eventId
  ));
}

export function undoJdgAuditEvent(
  workspace: JdgWorkspace,
  eventId: string,
  meta?: JdgMutationMeta,
): JdgWorkspace {
  const event = workspace.history.find((candidate) => candidate.id === eventId);
  if (!event?.snapshot || !canUndoJdgAuditEvent(workspace, eventId)) return workspace;
  let restored = workspace;
  if (event.snapshot.kind === "month") {
    restored = restoreMonthSnapshot(workspace, event.snapshot);
  } else if (event.snapshot.kind === "profile") {
    restored = restoreProfileSnapshot(workspace, event.snapshot);
  } else if (event.snapshot.kind === "template") {
    restored = restoreTemplateSnapshot(workspace, event.snapshot);
  } else if (event.snapshot.kind === "default-template") {
    restored = { ...workspace, defaultTemplateId: event.snapshot.defaultTemplateId };
  }
  const details = eventDetails(meta);
  return appendAuditEvent(restored, {
    id: details.eventId,
    occurredAt: details.occurredAt,
    type: "undo",
    summary: `Cofnięto: ${event.summary}`,
    targetId: event.targetId,
    revertsEventId: event.id,
  });
}

export function loadJdgWorkspaceResult(): LocalLoadResult<JdgWorkspace> {
  return readLocalWorkspace({
    key: JDG_STORAGE_KEY,
    fallback: createEmptyJdgWorkspace,
    validate: isJdgWorkspace,
    migrate: migrateJdgWorkspace,
  });
}

export function loadJdgWorkspace(): JdgWorkspace {
  return loadJdgWorkspaceResult().workspace;
}

export function saveJdgWorkspace(workspace: JdgWorkspace): boolean {
  return isJdgWorkspace(workspace) && writeLocalWorkspace(JDG_STORAGE_KEY, workspace);
}

export function createJdgItemId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createJdgTemplateId(): string {
  return `template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
