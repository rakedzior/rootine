/**
 * Vendor-neutral observability boundary for Edge Functions.
 *
 * The recorder only retains aggregate counters and technical identifiers. It
 * never accepts request payloads, APNs tokens, auth headers, or account data.
 * A deployment can later provide a sink without changing the function
 * contracts; no sink or external alert destination is selected here.
 */

export const ROOTINE_OBSERVABILITY_SCHEMA_VERSION = 1 as const;
export const ROOTINE_DIAGNOSTIC_EVENT_MAX_BYTES = 4_096;
export const ROOTINE_DIAGNOSTIC_EXPORT_MAX_BYTES = 64 * 1_024;
export const ROOTINE_DIAGNOSTIC_EVENT_LIMIT = 64;

export type RootineTelemetryOutcome = "success" | "failure" | "degraded" | "cancelled" | "unknown";
export type RootineTelemetryEventName =
  | "auth_outcome"
  | "sync_operation"
  | "realtime_health"
  | "qr_scan"
  | "notification_delivery"
  | "materializer_quarantine"
  | "device_health"
  | "crash"
  | "support_export";

export type RootineHealthCounterName =
  | "auth_success"
  | "auth_failure"
  | "sync_pull_success"
  | "sync_pull_failure"
  | "sync_push_success"
  | "sync_push_failure"
  | "sync_retry"
  | "sync_conflict"
  | "sync_cursor_expired"
  | "sync_unauthorized"
  | "realtime_connected"
  | "realtime_reconnect"
  | "realtime_failure"
  | "qr_detected"
  | "qr_success"
  | "qr_failure"
  | "apns_delivered"
  | "apns_failed"
  | "apns_unregistered"
  | "apns_retry"
  | "materializer_quarantine"
  | "device_registered"
  | "device_registration_failure"
  | "crash_captured";

export type RootineDiagnosticEvent = {
  schema_version: typeof ROOTINE_OBSERVABILITY_SCHEMA_VERSION;
  name: RootineTelemetryEventName;
  outcome: RootineTelemetryOutcome;
  at: string;
  duration_ms?: number;
  correlation_id?: string;
  operation_id?: string;
  attributes: Record<string, string | number | boolean>;
};

export type RootineDiagnosticSnapshot = {
  schema_version: typeof ROOTINE_OBSERVABILITY_SCHEMA_VERSION;
  generated_at: string;
  counters: Partial<Record<RootineHealthCounterName, number>>;
  events: RootineDiagnosticEvent[];
};

const PRIVATE_KEY = /(?:access.?token|authorization|cookie|password|secret|push.?token|token|payload|record|notes?|health|finance|financial|nutrition|content|body|text|title|description|location|latitude|longitude|email)/i;
const SAFE_ATTRIBUTE_KEYS = new Set([
  "action",
  "endpoint",
  "environment",
  "error",
  "entity",
  "entity_id",
  "format",
  "http_status",
  "permission",
  "provider",
  "reason",
  "source",
  "status",
  "trigger",
  "attempt",
  "batch_size",
  "change_count",
  "cursor",
  "revision",
  "retry_after_seconds",
  "queue_depth",
]);

function boundedString(value: string, max = 180) {
  const normalized = [...value].map((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? " " : character;
  }).join("").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

export function classifyRootineDiagnosticError(value: unknown) {
  const normalized = String(value ?? "").toLocaleLowerCase("en-US");
  if (normalized.includes("unauthor") || normalized.includes("401")) return "unauthorized";
  if (normalized.includes("cursor") && normalized.includes("expir")) return "cursor_expired";
  if (normalized.includes("conflict") || normalized.includes("revision")) return "conflict";
  if (normalized.includes("rate") || normalized.includes("429")) return "rate_limited";
  if (normalized.includes("timeout") || normalized.includes("timed out") || normalized.includes("abort")) return "timeout";
  if (normalized.includes("network") || normalized.includes("fetch")) return "network";
  if (normalized.includes("invalid") || normalized.includes("schema")) return "invalid";
  if (normalized.includes("server") || normalized.includes("5")) return "server";
  return "unknown";
}

/** Redacts arbitrary values for tests and future adapter/sink integrations. */
export function redactRootineDiagnosticValue(value: unknown, key?: string): unknown {
  if (key && PRIVATE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return boundedString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 16).map((item) => redactRootineDiagnosticValue(item));
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([entryKey]) => !PRIVATE_KEY.test(entryKey))
      .slice(0, 32)
      .map(([entryKey, entryValue]) => [entryKey, redactRootineDiagnosticValue(entryValue, entryKey)]),
  );
}

function safeAttributes(attributes: Record<string, unknown> | undefined) {
  if (!attributes) return {};
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([key]) => SAFE_ATTRIBUTE_KEYS.has(key))
      .slice(0, 24)
      .map(([key, value]) => {
        if (key === "error" || key === "reason") return [key, classifyRootineDiagnosticError(value)];
        if (typeof value === "number" && Number.isFinite(value)) return [key, Math.round(value)];
        if (typeof value === "boolean") return [key, value];
        return [key, typeof value === "string" ? boundedString(value) : String(redactRootineDiagnosticValue(value, key) ?? "unknown")];
      }),
  ) as Record<string, string | number | boolean>;
}

function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function boundedRootineDiagnosticEvent(input: {
  name: RootineTelemetryEventName;
  outcome?: RootineTelemetryOutcome;
  at?: string;
  duration_ms?: number;
  correlation_id?: string;
  operation_id?: string;
  attributes?: Record<string, unknown>;
}): RootineDiagnosticEvent {
  const event: RootineDiagnosticEvent = {
    schema_version: ROOTINE_OBSERVABILITY_SCHEMA_VERSION,
    name: input.name,
    outcome: input.outcome ?? "unknown",
    at: typeof input.at === "string" ? boundedString(input.at, 48) : new Date().toISOString(),
    ...(Number.isFinite(input.duration_ms) ? { duration_ms: Math.max(0, Math.round(input.duration_ms!)) } : {}),
    ...(typeof input.correlation_id === "string" ? { correlation_id: boundedString(input.correlation_id, 180) } : {}),
    ...(typeof input.operation_id === "string" ? { operation_id: boundedString(input.operation_id, 180) } : {}),
    attributes: safeAttributes(input.attributes),
  };
  if (bytes(event) <= ROOTINE_DIAGNOSTIC_EVENT_MAX_BYTES) return event;
  const trimmed: RootineDiagnosticEvent = { ...event, attributes: {} };
  for (const [key, value] of Object.entries(event.attributes)) {
    const candidate = { ...trimmed, attributes: { ...trimmed.attributes, [key]: value } };
    if (bytes(candidate) > ROOTINE_DIAGNOSTIC_EVENT_MAX_BYTES) break;
    trimmed.attributes = candidate.attributes;
  }
  return trimmed;
}

export class RootineHealthCounters {
  private readonly counterValues = new Map<RootineHealthCounterName, number>();
  private readonly eventValues: RootineDiagnosticEvent[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents = ROOTINE_DIAGNOSTIC_EVENT_LIMIT) {
    const requestedEventLimit = Number.isFinite(maxEvents) ? Math.floor(maxEvents) : ROOTINE_DIAGNOSTIC_EVENT_LIMIT;
    this.maxEvents = Math.max(1, Math.min(ROOTINE_DIAGNOSTIC_EVENT_LIMIT, requestedEventLimit));
  }

  increment(name: RootineHealthCounterName, amount = 1) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const current = this.counterValues.get(name) ?? 0;
    this.counterValues.set(name, Math.min(Number.MAX_SAFE_INTEGER, current + Math.min(1_000, Math.round(amount))));
  }

  record(input: Parameters<typeof boundedRootineDiagnosticEvent>[0]) {
    const event = boundedRootineDiagnosticEvent(input);
    this.eventValues.push(event);
    while (this.eventValues.length > this.maxEvents) this.eventValues.shift();
    return event;
  }

  snapshot() {
    return {
      schema_version: ROOTINE_OBSERVABILITY_SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      counters: Object.fromEntries(this.counterValues.entries()),
      events: this.eventValues.slice(),
    } satisfies RootineDiagnosticSnapshot;
  }

  exportDiagnostics() {
    let snapshot = this.snapshot();
    let serialized = JSON.stringify(snapshot);
    while (bytes(serialized) > ROOTINE_DIAGNOSTIC_EXPORT_MAX_BYTES && snapshot.events.length > 0) {
      snapshot = { ...snapshot, events: snapshot.events.slice(1) };
      serialized = JSON.stringify(snapshot);
    }
    return serialized;
  }
}

/**
 * Optional operational bridge. Logging is opt-in so adding this module does
 * not silently select a vendor or external alert destination.
 */
export function emitRootineDiagnostic(
  event: Parameters<typeof boundedRootineDiagnosticEvent>[0],
  logger?: (message: string, details?: unknown) => void,
) {
  if (!logger) return;
  logger("Rootine diagnostic", boundedRootineDiagnosticEvent(event));
}
