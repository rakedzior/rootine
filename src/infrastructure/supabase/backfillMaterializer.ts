/**
 * Deterministic legacy snapshot backfill primitives.
 *
 * This module deliberately has no Supabase/browser dependency. It is shared by
 * the backfill runner, contract tests and the future B06 dual-write bridge.
 * B02/B03 can persist the returned records through the SQL contract documented
 * in `supabase/migrations/20260902120000_rootine_backfill_materializer.sql`.
 */

import { rootineObservability } from "../../app/observability";

export const BACKFILL_CONTRACT_VERSION = 1 as const;

export type BackfillDomain =
  | "tasks"
  | "nutrition"
  | "notes"
  | "sport"
  | "goals"
  | "work"
  | "travel"
  | "health"
  | "affairs"
  | "jdg"
  | "web-only";

export type BackfillAdapterDefinition = {
  storageKey: string;
  domain: BackfillDomain;
  adapterVersion: number;
  currentVersion: number;
  acceptedVersions: readonly number[];
  fixture: string;
  relationalTables: readonly string[];
  /** JSON pointer paths where array order has no domain meaning. */
  unorderedArrayPaths?: readonly string[];
  /** Web-only values are intentionally retained as one opaque record. */
  webOnly?: boolean;
  topLevelFields?: readonly string[];
  collectionFields?: Readonly<Record<string, string>>;
  singletonFields?: Readonly<Record<string, string>>;
}

const DOMAIN_ADAPTERS: readonly BackfillAdapterDefinition[] = [
  {
    storageKey: "rootine.task-workspace.v1",
    domain: "tasks",
    adapterVersion: 1,
    currentVersion: 2,
    acceptedVersions: [1, 2],
    fixture: "fixtures/task-workspace-v2.json",
    relationalTables: ["task_lists", "task_tags", "tasks", "task_schedules", "task_completions", "task_comments", "task_summary_notes"],
    unorderedArrayPaths: ["/tags", "/habits/*/completedDates", "/tasks/*/schedule/completedDates"],
    topLevelFields: ["version", "updatedAt", "tasks", "habits", "lists", "tags"],
    collectionFields: { tasks: "task", habits: "habit", lists: "task_list", tags: "task_tag" },
  },
  {
    storageKey: "rootine.nutrition-workspace.v1",
    domain: "nutrition",
    adapterVersion: 1,
    currentVersion: 6,
    acceptedVersions: [1, 2, 3, 4, 5, 6],
    fixture: "fixtures/nutrition-workspace-v6.json",
    relationalTables: ["nutrition_days", "nutrition_entries", "nutrition_goals", "nutrition_profiles", "nutrition_weight_measurements", "nutrition_custom_meals", "nutrition_custom_meal_ingredients"],
    unorderedArrayPaths: ["/calculatorProfile/activities", "/customMeals/*/ingredients"],
    topLevelFields: ["version", "updatedAt", "goals", "calculatorProfile", "macroConfiguration", "weightMeasurements", "bodyMeasurements", "customMeals", "days"],
    collectionFields: { customMeals: "nutrition_custom_meal", days: "nutrition_day", weightMeasurements: "nutrition_weight_measurement", bodyMeasurements: "nutrition_body_measurement" },
    singletonFields: { goals: "nutrition_goal", calculatorProfile: "nutrition_profile", macroConfiguration: "nutrition_macro_configuration" },
  },
  {
    storageKey: "rootine.notes-workspace.v1",
    domain: "notes",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/notes-workspace-v1.json",
    relationalTables: ["note_lists", "notes", "note_tags", "note_checklist_items"],
    unorderedArrayPaths: ["/notes/*/tags"],
    topLevelFields: ["version", "updatedAt", "lists", "notes"],
    collectionFields: { lists: "note_list", notes: "note" },
  },
  {
    storageKey: "rootine-sport-planner-v1",
    domain: "sport",
    adapterVersion: 1,
    currentVersion: 5,
    acceptedVersions: [1, 2, 3, 4, 5],
    fixture: "fixtures/sport-planner-v5.json",
    relationalTables: ["sport_exercises", "sport_templates", "sport_template_sections", "sport_template_items", "sport_cycles", "sport_cycle_workouts", "sport_sessions", "sport_session_sets", "sport_history", "sport_outcomes"],
    unorderedArrayPaths: ["/exercises", "/history", "/sessions", "/scheduledWorkouts", "/executions"],
    topLevelFields: ["version", "storageSchemaVersion", "templates", "activeCycle", "cycles", "activeCycleId", "history", "sessions", "workoutOutcomes", "exercises", "scheduledWorkouts", "executions"],
    collectionFields: { templates: "sport_template", cycles: "sport_cycle", history: "sport_history", sessions: "sport_session", exercises: "sport_exercise", scheduledWorkouts: "sport_scheduled_workout", executions: "sport_execution", workoutOutcomes: "sport_outcome" },
    singletonFields: { activeCycle: "sport_active_cycle" },
  },
  {
    storageKey: "rootine.goals.v1",
    domain: "goals",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/goals-workspace-v1.json",
    relationalTables: ["goal_categories", "goals", "goal_milestones", "goal_progress_entries", "goal_notes"],
    unorderedArrayPaths: ["/goals/*/linkedTaskIds"],
    topLevelFields: ["version", "goals", "categories"],
    collectionFields: { goals: "goal", categories: "goal_category" },
  },
  {
    storageKey: "rootine.work-workspace.v1",
    domain: "work",
    adapterVersion: 1,
    currentVersion: 3,
    acceptedVersions: [1, 2, 3],
    fixture: "fixtures/work-workspace-v3.json",
    relationalTables: ["work_companies", "work_projects", "work_tasks", "work_focus_sessions"],
    unorderedArrayPaths: ["/companies", "/projects", "/tasks", "/focusSessions"],
    topLevelFields: ["version", "updatedAt", "companies", "projects", "tasks", "activeFocusStartedAt", "focusSessions"],
    collectionFields: { companies: "work_company", projects: "work_project", tasks: "work_task", focusSessions: "work_focus_session" },
  },
  {
    storageKey: "rootine.travel-workspace.v1",
    domain: "travel",
    adapterVersion: 1,
    currentVersion: 2,
    acceptedVersions: [1, 2],
    fixture: "fixtures/travel-workspace-v2.json",
    relationalTables: ["trips", "trip_itinerary_items", "trip_bookings", "trip_budget_items", "trip_documents", "trip_packing_items"],
    unorderedArrayPaths: ["/trips/*/travelers", "/trips/*/transports"],
    topLevelFields: ["version", "updatedAt", "trips"],
    collectionFields: { trips: "trip" },
  },
  {
    storageKey: "rootine.health.workspace.v1",
    domain: "health",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/health-workspace-v1.json",
    relationalTables: ["health_checkins", "health_reminders", "health_visits", "health_tests", "health_prescriptions", "health_vaccinations"],
    unorderedArrayPaths: ["/reminders/*/completedDates"],
    topLevelFields: ["version", "entries", "updatedAt", "checkIns", "reminders"],
    collectionFields: { entries: "health_entry", checkIns: "health_checkin", reminders: "health_reminder" },
  },
  {
    storageKey: "rootine.affairs.workspace.v1",
    domain: "affairs",
    adapterVersion: 1,
    currentVersion: 2,
    acceptedVersions: [1, 2],
    fixture: "fixtures/affairs-workspace-v2.json",
    relationalTables: ["affair_matters", "payments", "subscriptions", "documents", "vehicles", "vehicle_service_items"],
    unorderedArrayPaths: ["/attentionStates"],
    topLevelFields: ["version", "matters", "oneTimePayments", "payments", "subscriptions", "documents", "vehicles", "vehicleItems", "budgets", "attentionStates"],
    collectionFields: { matters: "affair_matter", oneTimePayments: "payment", payments: "payment", subscriptions: "subscription", documents: "document", vehicles: "vehicle", vehicleItems: "vehicle_service_item", budgets: "affair_budget", attentionStates: "affair_attention" },
  },
  {
    storageKey: "rootine.jdg.workspace.v1",
    domain: "jdg",
    adapterVersion: 1,
    currentVersion: 2,
    acceptedVersions: [1, 2],
    fixture: "fixtures/jdg-workspace-v2.json",
    relationalTables: ["jdg_periods", "jdg_checklist_items"],
    unorderedArrayPaths: ["/months/*/items", "/templates/*/items", "/history"],
    topLevelFields: ["version", "months", "taxProfile", "templates", "defaultTemplateId", "history"],
    collectionFields: { months: "jdg_period", templates: "jdg_template", history: "jdg_audit_event" },
    singletonFields: { taxProfile: "jdg_tax_profile" },
  },
];

const WEB_ONLY_ADAPTERS: readonly BackfillAdapterDefinition[] = [
  {
    storageKey: "rootine.task-completion.v1",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 2,
    acceptedVersions: [1, 2],
    fixture: "fixtures/task-completion-v2.json",
    relationalTables: ["task_completions"],
    webOnly: true,
  },
  {
    storageKey: "rootine.task-summary-notes.v1",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/task-summary-notes-v1.json",
    relationalTables: ["task_summary_notes"],
    webOnly: true,
  },
  {
    storageKey: "rootine.sidebar.modules",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 2,
    acceptedVersions: [1, 2],
    fixture: "fixtures/module-preferences-v2.json",
    relationalTables: ["rootine_workspace_web_preferences"],
    webOnly: true,
  },
  {
    storageKey: "rootine.activity-log.v1",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/activity-log-v1.json",
    relationalTables: ["rootine_workspace_web_preferences"],
    webOnly: true,
  },
  {
    storageKey: "rootine.module-memory.v1",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/module-memory-v1.json",
    relationalTables: ["rootine_workspace_web_preferences"],
    webOnly: true,
  },
  {
    storageKey: "rootine.experience.preferences.v1",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/experience-preferences-v1.json",
    relationalTables: ["rootine_workspace_web_preferences"],
    webOnly: true,
  },
  {
    storageKey: "rootine.sidebar.collapsed",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/web-preference-values.json",
    relationalTables: ["rootine_workspace_web_preferences"],
    webOnly: true,
  },
  {
    storageKey: "rootine.goals.layout",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/web-preference-values.json",
    relationalTables: ["rootine_workspace_web_preferences"],
    webOnly: true,
  },
  {
    storageKey: "rootine.goals.sort",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/web-preference-values.json",
    relationalTables: ["rootine_workspace_web_preferences"],
    webOnly: true,
  },
  {
    storageKey: "rootine.goals.next-step-depth",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/web-preference-values.json",
    relationalTables: ["rootine_workspace_web_preferences"],
    webOnly: true,
  },
  {
    storageKey: "rootine.notes.layout",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/web-preference-values.json",
    relationalTables: ["rootine_workspace_web_preferences"],
    webOnly: true,
  },
  {
    storageKey: "rootine.tasks.view-mode.v1",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/web-preference-values.json",
    relationalTables: ["rootine_workspace_web_preferences"],
    webOnly: true,
  },
  {
    storageKey: "rootine.work-sections.v1",
    domain: "web-only",
    adapterVersion: 1,
    currentVersion: 1,
    acceptedVersions: [1],
    fixture: "fixtures/web-preference-values.json",
    relationalTables: ["rootine_workspace_web_preferences"],
    webOnly: true,
  },
];

/**
 * These values are browser-only UI/recovery state. They still get an explicit
 * adapter so a backfill never silently drops an account-scoped `rootine.*`
 * value. They are kept opaque because no iOS/domain table owns them.
 */
const WEB_ONLY_STATE_KEYS = [
  "rootine.goals.sidebar.v1",
  "rootine.notes.sidebar.v1",
  "rootine.notes-tags.v1",
  "rootine.tasks.sidebar.v2",
  "rootine.task-reminder-dismissals.v1",
  "rootine.affairs-reminder-dismissals.v1",
  "rootine.notification-permission-prompt-dismissed.v1",
  "rootine.sport-cycle-draft.v1",
  "rootine.notes-editor-draft.v1",
] as const;

const WEB_ONLY_STATE_ADAPTERS: readonly BackfillAdapterDefinition[] = WEB_ONLY_STATE_KEYS.map((storageKey) => ({
  storageKey,
  domain: "web-only" as const,
  adapterVersion: 1,
  currentVersion: 1,
  acceptedVersions: [1],
  fixture: "fixtures/web-only-state.json",
  relationalTables: ["rootine_workspace_web_preferences"],
  webOnly: true,
}));

export const BACKFILL_ADAPTERS: readonly BackfillAdapterDefinition[] = [
  ...DOMAIN_ADAPTERS,
  ...WEB_ONLY_ADAPTERS,
  ...WEB_ONLY_STATE_ADAPTERS,
];

const ADAPTER_BY_STORAGE_KEY = new Map(BACKFILL_ADAPTERS.map((adapter) => [adapter.storageKey, adapter]));

export function adapterForStorageKey(storageKey: string): BackfillAdapterDefinition | null {
  return ADAPTER_BY_STORAGE_KEY.get(storageKey) ?? null;
}

export type CanonicalizeOptions = {
  unorderedArrayPaths?: readonly string[];
  /** Alias accepted by callers that think in terms of diff rather than JSON. */
  ignoreArrayOrder?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pointerSegment(segment: string | number) {
  return String(segment).replaceAll("~", "~0").replaceAll("/", "~1");
}

function matchesArrayPath(path: string, configured: readonly string[] | undefined) {
  if (!configured?.length) return false;
  return configured.some((candidate) => {
    if (candidate === path) return true;
    const candidateParts = candidate.split("/");
    const pathParts = path.split("/");
    if (candidateParts.length !== pathParts.length) return false;
    return candidateParts.every((part, index) => part === "*" || part === pathParts[index]);
  });
}

function isIdentifierKey(key: string) {
  return /^(?:id|.*Id)$/.test(key);
}

function isDateKey(key: string) {
  return /(?:^|_)(?:date|dueDate|startDate|endDate|nextDueDate|nextBillingDate|expiresAt)$/i.test(key)
    || /Date$/.test(key);
}

function isTimestampKey(key: string) {
  return /(?:At|Timestamp|StartedAt|OccurredAt)$/.test(key);
}

function isCurrencyKey(key: string) {
  return /currency/i.test(key);
}

function isTimezoneKey(key: string) {
  return /timezone/i.test(key);
}

function canonicalString(key: string, value: string): string {
  if (isIdentifierKey(key)) return value.trim();
  if (isCurrencyKey(key)) return value.trim().toUpperCase();
  if (isTimezoneKey(key)) return value.trim() || "UTC";
  if (isDateKey(key) && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  if (isTimestampKey(key)) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return value;
}

/**
 * Stable JSON encoding used for hashes and comparisons. Object key order is
 * always normalized. Arrays preserve order unless their path is explicitly
 * declared unordered by an adapter or diff caller.
 */
export function canonicalize(value: unknown, options: CanonicalizeOptions = {}, path = ""): unknown {
  if (typeof value === "string") return canonicalString("", value);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value.map((item, index) => canonicalize(item, options, `${path}/${index}`));
    if (options.ignoreArrayOrder || matchesArrayPath(path, options.unorderedArrayPaths)) {
      return [...items].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    }
    return items;
  }
  if (!isRecord(value)) return null;
  const result: Record<string, unknown> = {};
  Object.keys(value).sort().forEach((key) => {
    const child = value[key];
    result[key] = typeof child === "string"
      ? canonicalString(key, child)
      : canonicalize(child, options, `${path}/${pointerSegment(key)}`);
  });
  return result;
}

export function canonicalJson(value: unknown, options: CanonicalizeOptions = {}): string {
  return JSON.stringify(canonicalize(value, options)) ?? "null";
}

/** Compact deterministic content hash suitable for revision tables/logs. */
export function canonicalHash(value: unknown, options: CanonicalizeOptions = {}): string {
  const normalized = canonicalJson(value, options);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${normalized.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

export type CanonicalDifference = {
  path: string;
  left: unknown;
  right: unknown;
};

function diffCanonical(left: unknown, right: unknown, path: string, differences: CanonicalDifference[], options: CanonicalizeOptions) {
  if (differences.length >= 100) return;
  if (JSON.stringify(left) === JSON.stringify(right)) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    const leftItems = options.ignoreArrayOrder || matchesArrayPath(path, options.unorderedArrayPaths)
      ? [...left].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : left;
    const rightItems = options.ignoreArrayOrder || matchesArrayPath(path, options.unorderedArrayPaths)
      ? [...right].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : right;
    if (leftItems.length !== rightItems.length) {
      differences.push({ path, left: leftItems, right: rightItems });
      return;
    }
    leftItems.forEach((item, index) => diffCanonical(item, rightItems[index], `${path}/${index}`, differences, options));
    return;
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    keys.forEach((key) => {
      if (!(key in left) || !(key in right)) {
        differences.push({ path: `${path}/${pointerSegment(key)}`, left: left[key], right: right[key] });
      } else {
        diffCanonical(left[key], right[key], `${path}/${pointerSegment(key)}`, differences, options);
      }
    });
    return;
  }
  differences.push({ path: path || "/", left, right });
}

export function canonicalDiff(left: unknown, right: unknown, options: CanonicalizeOptions = {}) {
  const canonicalLeft = canonicalize(left, options);
  const canonicalRight = canonicalize(right, options);
  const differences: CanonicalDifference[] = [];
  diffCanonical(canonicalLeft, canonicalRight, "", differences, options);
  return {
    equal: differences.length === 0,
    left: canonicalLeft,
    right: canonicalRight,
    differences,
  };
}

export type QuarantineReason =
  | "unknown_storage_key"
  | "malformed_payload"
  | "unsupported_version"
  | "unknown_field"
  | "missing_record_id"
  | "duplicate_record_id"
  | "invalid_record";

export type MigrationQuarantineEntry = {
  storageKey: string;
  recordId: string | null;
  reason: QuarantineReason;
  path: string;
  details?: string;
  payload: unknown;
};

export type RelationalBackfillRecord = {
  entity: string;
  entityId: string;
  sourcePath: string;
  payload: Record<string, unknown>;
  deletedAt: string | null;
};

export type AdaptedSnapshot = {
  storageKey: string;
  domain: BackfillDomain;
  adapterVersion: number;
  sourceVersion: number | null;
  canonicalSnapshot: unknown;
  records: RelationalBackfillRecord[];
  quarantine: MigrationQuarantineEntry[];
  status: "migrated" | "quarantined";
};

function versionOf(payload: unknown) {
  return isRecord(payload) && Number.isInteger(payload.version) ? Number(payload.version) : null;
}

function migrateVersion(adapter: BackfillAdapterDefinition, payload: unknown): unknown {
  if (adapter.storageKey === "rootine.task-completion.v1" && isRecord(payload) && isRecord(payload.completion)) {
    return {
      ...payload,
      version: adapter.currentVersion,
      completion: Object.fromEntries(Object.entries(payload.completion).map(([id, record]) => (
        typeof record === "boolean" ? [id, { done: record }] : [id, record]
      ))),
    };
  }
  if (adapter.webOnly || !isRecord(payload)) return payload;
  const result: Record<string, unknown> = { ...payload, version: adapter.currentVersion };
  if (adapter.storageKey === "rootine-sport-planner-v1") result.storageSchemaVersion = adapter.currentVersion;
  // Older workspace versions predate optional collections. Defaulting them is
  // deterministic and keeps all old snapshots representable without inventing
  // user records.
  for (const field of Object.keys(adapter.collectionFields ?? {})) {
    if (result[field] === undefined) result[field] = Array.isArray(result[field]) ? [] : [];
  }
  if (adapter.storageKey === "rootine.jdg.workspace.v1") {
    result.taxProfile ??= {
      taxForm: "unconfigured",
      vatStatus: "unconfigured",
      vatCadence: null,
      zusScheme: "unconfigured",
      accountingMode: "unconfigured",
      updatedAt: new Date(0).toISOString(),
    };
    result.templates ??= [];
    result.defaultTemplateId ??= null;
    result.history ??= [];
  }
  return result;
}

function validateTopLevel(adapter: BackfillAdapterDefinition, payload: unknown, storageKey: string): MigrationQuarantineEntry[] {
  const issues: MigrationQuarantineEntry[] = [];
  if (adapter.webOnly) return issues;
  if (!isRecord(payload)) {
    issues.push({ storageKey, recordId: null, reason: "malformed_payload", path: "/", details: "Payload musi być obiektem JSON.", payload });
    return issues;
  }
  const version = versionOf(payload);
  if (version === null) issues.push({ storageKey, recordId: null, reason: "unsupported_version", path: "/version", details: "Brak całkowitej wersji payloadu.", payload });
  if (version !== null && !adapter.acceptedVersions.includes(version)) {
    issues.push({ storageKey, recordId: null, reason: "unsupported_version", path: "/version", details: `Wersja ${version} nie jest obsługiwana przez adapter ${adapter.adapterVersion}.`, payload });
  }
  const allowed = new Set(adapter.topLevelFields ?? []);
  Object.keys(payload).filter((key) => !allowed.has(key)).forEach((key) => {
    issues.push({ storageKey, recordId: null, reason: "unknown_field", path: `/${pointerSegment(key)}`, details: `Nieznane pole ${key}.`, payload: payload[key] });
  });
  return issues;
}

function recordId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isSafeInteger(id)) return String(id);
  for (const naturalKey of ["key", "month", "date", "week"]) {
    const candidate = value[naturalKey];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function deletedAt(value: Record<string, unknown>): string | null {
  if (typeof value.deletedAt === "string" && value.deletedAt.trim()) return canonicalString("deletedAt", value.deletedAt);
  if (value.deleted === true) {
    const updatedAt = typeof value.updatedAt === "string" ? canonicalString("updatedAt", value.updatedAt) : null;
    return updatedAt || new Date(0).toISOString();
  }
  return null;
}

function canonicalFieldIssue(value: unknown, key: string, _path: string): string | null {
  if (typeof value === "number" && !Number.isFinite(value)) return "Liczba musi być skończona.";
  if (typeof value !== "string") return null;
  // Empty strings are used by the legacy clients for optional date/time and
  // currency fields (for example an unpaid payment's `paidAt`). Preserve the
  // value as-is and let the domain adapter decide whether it is required.
  if (value.trim() === "") return null;
  if (isDateKey(key)) {
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "Data musi mieć format YYYY-MM-DD.";
    const parsed = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) return "Data nie istnieje w kalendarzu.";
  }
  if (isTimestampKey(key) && !isDateKey(key)) {
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
      return "Timestamp musi być ISO 8601 z jawną strefą czasową.";
    }
    const datePart = trimmed.slice(0, 10);
    const parsedDate = new Date(`${datePart}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== datePart) {
      return "Timestamp zawiera nieistniejącą datę.";
    }
    if (!Number.isFinite(Date.parse(trimmed))) return "Timestamp nie jest poprawnym ISO 8601.";
  }
  if (isTimezoneKey(key)) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value.trim() || "UTC" }).format();
    } catch {
      return "Strefa czasowa nie jest obsługiwana.";
    }
  }
  if (isCurrencyKey(key) && !/^[A-Za-z]{3}$/.test(value.trim())) return "Kod waluty musi mieć trzy litery ISO 4217.";
  return null;
}

function findCanonicalFieldIssues(value: unknown, path = "", key = ""): Array<{ path: string; details: string }> {
  const issue = canonicalFieldIssue(value, key, path);
  if (issue) return [{ path: path || "/", details: issue }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findCanonicalFieldIssues(item, `${path}/${index}`, key));
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([childKey, child]) => findCanonicalFieldIssues(child, `${path}/${pointerSegment(childKey)}`, childKey));
  }
  return [];
}

function collectionEntries(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
  if (isRecord(value)) return Object.entries(value);
  return [];
}

function adaptSnapshot(adapter: BackfillAdapterDefinition, sourcePayload: unknown): AdaptedSnapshot {
  const sourceVersion = versionOf(sourcePayload);
  const initialIssues = validateTopLevel(adapter, sourcePayload, adapter.storageKey);
  const migrated = migrateVersion(adapter, sourcePayload);
  const quarantine = [...initialIssues];
  const records: RelationalBackfillRecord[] = [];

  if (!adapter.webOnly && isRecord(migrated)) {
    // Collection and singleton values are validated with their record context
    // below. Validate the remaining known scalar top-level fields here so an
    // invalid workspace timestamp cannot be materialized accidentally.
    const collectionFields = new Set(Object.keys(adapter.collectionFields ?? {}));
    const singletonFields = new Set(Object.keys(adapter.singletonFields ?? {}));
    Object.entries(migrated)
      .filter(([field]) => !collectionFields.has(field) && !singletonFields.has(field))
      .flatMap(([field, value]) => findCanonicalFieldIssues(value, `/${pointerSegment(field)}`, field))
      .forEach((fieldIssue) => quarantine.push({
        storageKey: adapter.storageKey,
        recordId: null,
        reason: "invalid_record",
        path: fieldIssue.path,
        details: fieldIssue.details,
        payload: migrated,
      }));
    const seen = new Map<string, string>();
    Object.entries(adapter.collectionFields ?? {}).forEach(([field, entity]) => {
      const value = migrated[field];
      if (value === undefined) return;
      if (!Array.isArray(value) && !isRecord(value)) {
        quarantine.push({ storageKey: adapter.storageKey, recordId: null, reason: "invalid_record", path: `/${field}`, details: "Kolekcja musi być tablicą lub mapą rekordów.", payload: value });
        return;
      }
      const isMap = isRecord(value) && !Array.isArray(value);
      collectionEntries(value).forEach(([mapKey, candidate]) => {
        const id = recordId(candidate) ?? (isRecord(value) && !Array.isArray(value) ? mapKey.trim() : null);
        const path = `/${pointerSegment(field)}/${pointerSegment(id ?? mapKey)}`;
        if (!id) {
          quarantine.push({ storageKey: adapter.storageKey, recordId: null, reason: "missing_record_id", path, details: "Rekord relacyjny nie ma stabilnego id.", payload: candidate });
          return;
        }
        const key = `${entity}:${id}`;
        if (seen.has(key)) {
          quarantine.push({ storageKey: adapter.storageKey, recordId: id, reason: "duplicate_record_id", path, details: `Id koliduje z ${seen.get(key)}.`, payload: candidate });
          return;
        }
        if (!isRecord(candidate) && !isMap) {
          quarantine.push({ storageKey: adapter.storageKey, recordId: id, reason: "invalid_record", path, details: "Rekord musi być obiektem JSON.", payload: candidate });
          return;
        }
        const fieldIssues = findCanonicalFieldIssues(candidate, path);
        if (fieldIssues.length > 0) {
          fieldIssues.forEach((fieldIssue) => quarantine.push({
            storageKey: adapter.storageKey,
            recordId: id,
            reason: "invalid_record",
            path: fieldIssue.path,
            details: fieldIssue.details,
            payload: candidate,
          }));
          return;
        }
        seen.set(key, path);
        const normalized = canonicalize(isRecord(candidate) ? candidate : { value: candidate }, { unorderedArrayPaths: adapter.unorderedArrayPaths }) as Record<string, unknown>;
        records.push({
          entity,
          entityId: id,
          sourcePath: path,
          payload: normalized,
          deletedAt: deletedAt(normalized),
        });
      });
    });
    Object.entries(adapter.singletonFields ?? {}).forEach(([field, entity]) => {
      const value = migrated[field];
      if (value === null || value === undefined) return;
      if (!isRecord(value)) {
        if (value !== undefined) quarantine.push({ storageKey: adapter.storageKey, recordId: field, reason: "invalid_record", path: `/${pointerSegment(field)}`, details: "Obiekt domenowy ma nieprawidłowy format.", payload: value });
        return;
      }
      const fieldIssues = findCanonicalFieldIssues(value, `/${pointerSegment(field)}`);
      if (fieldIssues.length > 0) {
        fieldIssues.forEach((fieldIssue) => quarantine.push({
          storageKey: adapter.storageKey,
          recordId: "workspace",
          reason: "invalid_record",
          path: fieldIssue.path,
          details: fieldIssue.details,
          payload: value,
        }));
        return;
      }
      records.push({
        entity,
        entityId: "workspace",
        sourcePath: `/${pointerSegment(field)}`,
        payload: canonicalize(value, { unorderedArrayPaths: adapter.unorderedArrayPaths }) as Record<string, unknown>,
        deletedAt: deletedAt(value),
      });
    });
  } else if (adapter.webOnly) {
    records.push({
      entity: "workspace_web_preference",
      entityId: adapter.storageKey,
      sourcePath: "/",
      payload: (canonicalize(migrated) && isRecord(canonicalize(migrated))
        ? canonicalize(migrated) as Record<string, unknown>
        : { value: canonicalize(migrated) }),
      deletedAt: null,
    });
  }

  const canonicalSnapshot = canonicalize(migrated, { unorderedArrayPaths: adapter.unorderedArrayPaths });
  return {
    storageKey: adapter.storageKey,
    domain: adapter.domain,
    adapterVersion: adapter.adapterVersion,
    sourceVersion,
    canonicalSnapshot,
    records: records.sort((left, right) => `${left.entity}:${left.entityId}`.localeCompare(`${right.entity}:${right.entityId}`)),
    quarantine,
    status: quarantine.length > 0 ? "quarantined" : "migrated",
  };
}

export function adaptLegacySnapshot(storageKey: string, sourcePayload: unknown): AdaptedSnapshot {
  const adapter = adapterForStorageKey(storageKey);
  if (!adapter) {
    return {
      storageKey,
      domain: "web-only",
      adapterVersion: 0,
      sourceVersion: versionOf(sourcePayload),
      canonicalSnapshot: null,
      records: [],
      quarantine: [{ storageKey, recordId: null, reason: "unknown_storage_key", path: "/", details: "Brak jawnego adaptera dla storage_key.", payload: sourcePayload }],
      status: "quarantined",
    };
  }
  return adaptSnapshot(adapter, sourcePayload);
}

export type LegacySnapshotInput = {
  storageKey: string;
  payload: unknown;
  sourceRevision: number;
  sourceContentHash?: string;
};

export type BackfillRelationalCommit = {
  userId: string;
  source: LegacySnapshotInput;
  adapted: AdaptedSnapshot;
  canonicalHash: string;
  runId: string;
  status: "migrated" | "quarantined" | "different";
  report: BackfillDomainReport;
};

export type BackfillMaterialization = BackfillRelationalCommit & {
  /** The source snapshot is read-only; this is a generated compatibility copy. */
  generatedPayload: unknown;
};

export type BackfillStore = {
  commitRelational: (commit: BackfillRelationalCommit) => Promise<void>;
  materializeLegacy: (materialization: BackfillMaterialization) => Promise<void>;
  recordQuarantine?: (userId: string, entries: MigrationQuarantineEntry[], runId: string) => Promise<void>;
};

export type BackfillDomainReport = {
  domain: BackfillDomain;
  storageKey: string;
  sourceRevision: number;
  adapterVersion: number;
  migrated: number;
  quarantined: number;
  different: number;
  status: "migrated" | "quarantined" | "different";
  quarantineReasons: Record<QuarantineReason, number>;
  differences: CanonicalDifference[];
};

export type BackfillReport = {
  contractVersion: typeof BACKFILL_CONTRACT_VERSION;
  runId: string;
  userId: string;
  generatedAt: string;
  domains: BackfillDomainReport[];
  totals: { migrated: number; quarantined: number; different: number };
};

function reportFor(input: LegacySnapshotInput, adapted: AdaptedSnapshot, differences: CanonicalDifference[]): BackfillDomainReport {
  const quarantineReasons = {} as Record<QuarantineReason, number>;
  adapted.quarantine.forEach((entry) => {
    quarantineReasons[entry.reason] = (quarantineReasons[entry.reason] ?? 0) + 1;
  });
  const different = differences.length > 0 ? 1 : 0;
  return {
    domain: adapted.domain,
    storageKey: input.storageKey,
    sourceRevision: input.sourceRevision,
    adapterVersion: adapted.adapterVersion,
    migrated: adapted.status === "migrated" ? adapted.records.length : 0,
    quarantined: adapted.quarantine.length,
    different,
    status: different > 0 ? "different" : adapted.status,
    quarantineReasons,
    differences,
  };
}

function runIdFor(userId: string, snapshots: readonly LegacySnapshotInput[]) {
  // Keep the run id bounded even when a profile has many snapshots. The full
  // source list remains in the per-domain manifest/reconciliation rows; this
  // identifier only needs to be deterministic and safe for the SQL varchar
  // constraint.
  return canonicalHash({
    userId,
    snapshots: snapshots
      .map((snapshot) => ({
        storageKey: snapshot.storageKey,
        sourceRevision: snapshot.sourceRevision,
        sourceContentHash: snapshot.sourceContentHash ?? null,
      }))
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
  });
}

/**
 * Backfill one profile. The caller owns the transaction boundary: the store's
 * relational commit must resolve before materializeLegacy is called. Repeating
 * this function is safe when the store keys commits by user/key/source revision
 * and treats the generated payload as an upsert, as the SQL contract does.
 */
export async function backfillUserSnapshots(
  userId: string,
  snapshots: readonly LegacySnapshotInput[],
  store: BackfillStore,
  options: { relationalSnapshots?: ReadonlyMap<string, unknown>; now?: string } = {},
): Promise<BackfillReport> {
  const runId = runIdFor(userId, snapshots);
  const domains: BackfillDomainReport[] = [];
  for (const source of snapshots) {
    const adapted = adaptLegacySnapshot(source.storageKey, source.payload);
    const adapter = adapterForStorageKey(source.storageKey);
    const differences = adapter && options.relationalSnapshots?.has(source.storageKey)
      ? canonicalDiff(adapted.canonicalSnapshot, options.relationalSnapshots.get(source.storageKey), { unorderedArrayPaths: adapter.unorderedArrayPaths }).differences
      : [];
    const domainReport = reportFor(source, adapted, differences);
    const canonicalHash = canonicalHashForAdapter(adapted);
    const commit: BackfillRelationalCommit = {
      userId,
      source,
      adapted,
      canonicalHash,
      runId,
      status: domainReport.status,
      report: domainReport,
    };
    if (adapted.quarantine.length > 0) {
      adapted.quarantine.slice(0, 16).forEach((entry) => rootineObservability.recordMaterializerQuarantine(entry.reason));
      await store.recordQuarantine?.(userId, adapted.quarantine, runId);
    }
    // Unknown/malformed snapshots have no safe generated aggregate. Keep the
    // quarantine entry, but do not create an empty relational revision or a
    // misleading materialization for it.
    if (adapted.canonicalSnapshot === null && adapted.records.length === 0) {
      domains.push(domainReport);
      continue;
    }
    await store.commitRelational(commit);
    // This call is intentionally after the relational commit. If it fails,
    // source snapshots and committed records remain available for retry/recovery.
    // A canonical mismatch is an audit/reconciliation result, not permission
    // to overwrite the legacy aggregate. Leave its generated ledger row
    // pending for an explicit operator/B06 decision.
    if (domainReport.status === "migrated") {
      await store.materializeLegacy({ ...commit, generatedPayload: adapted.canonicalSnapshot });
    }
    domains.push(domainReport);
  }
  return {
    contractVersion: BACKFILL_CONTRACT_VERSION,
    runId,
    userId,
    generatedAt: options.now ?? new Date().toISOString(),
    domains,
    totals: domains.reduce((totals, domain) => ({
      migrated: totals.migrated + domain.migrated,
      quarantined: totals.quarantined + domain.quarantined,
      different: totals.different + domain.different,
    }), { migrated: 0, quarantined: 0, different: 0 }),
  };
}

function canonicalHashForAdapter(adapted: AdaptedSnapshot) {
  const adapter = adapterForStorageKey(adapted.storageKey);
  return canonicalHash(adapted.canonicalSnapshot, { unorderedArrayPaths: adapter?.unorderedArrayPaths });
}
