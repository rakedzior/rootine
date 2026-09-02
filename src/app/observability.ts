/**
 * Vendor-neutral diagnostics for the web client.
 *
 * This module is deliberately a local boundary. It does not send anything,
 * read workspace data, or decide consent/retention. A future approved sink can
 * consume the already-redacted event shape without receiving raw exceptions,
 * request bodies, or account identifiers.
 */

export const ROOTINE_OBSERVABILITY_SCHEMA_VERSION = 1 as const;
export const ROOTINE_DIAGNOSTIC_EVENT_MAX_BYTES = 4_096;
export const ROOTINE_DIAGNOSTIC_EXPORT_MAX_BYTES = 64 * 1_024;
export const ROOTINE_DIAGNOSTIC_EVENT_LIMIT = 64;

export const ROOTINE_TELEMETRY_EVENT_NAMES = [
  "auth_outcome",
  "sync_operation",
  "realtime_health",
  "qr_scan",
  "notification_delivery",
  "materializer_quarantine",
  "device_health",
  "crash",
  "support_export",
] as const;
export type RootineTelemetryEventName = (typeof ROOTINE_TELEMETRY_EVENT_NAMES)[number];

export const ROOTINE_HEALTH_COUNTER_NAMES = [
  "auth_success",
  "auth_failure",
  "sync_pull_success",
  "sync_pull_failure",
  "sync_push_success",
  "sync_push_failure",
  "sync_retry",
  "sync_conflict",
  "sync_cursor_expired",
  "sync_unauthorized",
  "realtime_connected",
  "realtime_reconnect",
  "realtime_failure",
  "qr_detected",
  "qr_success",
  "qr_failure",
  "apns_delivered",
  "apns_failed",
  "apns_unregistered",
  "apns_retry",
  "materializer_quarantine",
  "device_registered",
  "device_registration_failure",
  "crash_captured",
] as const;
export type RootineHealthCounterName = (typeof ROOTINE_HEALTH_COUNTER_NAMES)[number];

export type RootineTelemetryOutcome = "success" | "failure" | "degraded" | "cancelled" | "unknown";

export type RootineDiagnosticEvent = {
  schemaVersion: typeof ROOTINE_OBSERVABILITY_SCHEMA_VERSION;
  name: RootineTelemetryEventName;
  outcome: RootineTelemetryOutcome;
  at: string;
  durationMs?: number;
  correlationId?: string;
  operationId?: string;
  attributes: Record<string, string | number | boolean>;
};

export type RootineDiagnosticSnapshot = {
  schemaVersion: typeof ROOTINE_OBSERVABILITY_SCHEMA_VERSION;
  generatedAt: string;
  supportId: string;
  counters: Partial<Record<RootineHealthCounterName, number>>;
  events: RootineDiagnosticEvent[];
};

export type RootineTelemetrySink = {
  record: (event: RootineDiagnosticEvent) => void;
};

const PRIVATE_KEY = /(?:access.?token|authorization|cookie|password|secret|push.?token|token|payload|record|notes?|health|finance|financial|nutrition|content|body|text|title|description|location|latitude|longitude|email)/i;
const SAFE_ATTRIBUTE_KEYS = new Set([
  "action",
  "endpoint",
  "environment",
  "error",
  "entity",
  "entityId",
  "format",
  "httpStatus",
  "permission",
  "provider",
  "reason",
  "source",
  "status",
  "trigger",
  "attempt",
  "batchSize",
  "changeCount",
  "cursor",
  "revision",
  "retryAfterSeconds",
  "queueDepth",
  "sampleRate",
]);

function boundedString(value: string, max = 180) {
  const normalized = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function errorCode(value: unknown) {
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

function safeIdentifier(value: unknown, max = 180) {
  return typeof value === "string" && value.trim() ? boundedString(value, max) : undefined;
}

/** Redacts arbitrary diagnostic values before they can reach a future sink. */
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
        if (key === "error" || key === "reason") return [key, errorCode(value)];
        if (typeof value === "number" && Number.isFinite(value)) return [key, Math.round(value)];
        if (typeof value === "boolean") return [key, value];
        if (typeof value === "string") return [key, boundedString(value)];
        return [key, String(redactRootineDiagnosticValue(value, key) ?? "unknown")];
      }),
  ) as Record<string, string | number | boolean>;
}

function serializedBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function fallbackSupportId() {
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newSupportId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `web-${crypto.randomUUID()}`;
    }
  } catch {
    // A diagnostic identifier must never make an app flow fail.
  }
  return fallbackSupportId();
}

function boundedEvent(input: {
  name: RootineTelemetryEventName;
  outcome?: RootineTelemetryOutcome;
  at?: string;
  durationMs?: number;
  correlationId?: string;
  operationId?: string;
  attributes?: Record<string, unknown>;
}): RootineDiagnosticEvent {
  const event: RootineDiagnosticEvent = {
    schemaVersion: ROOTINE_OBSERVABILITY_SCHEMA_VERSION,
    name: input.name,
    outcome: input.outcome ?? "unknown",
    at: typeof input.at === "string" ? boundedString(input.at, 48) : new Date().toISOString(),
    ...(Number.isFinite(input.durationMs) ? { durationMs: Math.max(0, Math.round(input.durationMs!)) } : {}),
    ...(safeIdentifier(input.correlationId) ? { correlationId: safeIdentifier(input.correlationId) } : {}),
    ...(safeIdentifier(input.operationId) ? { operationId: safeIdentifier(input.operationId) } : {}),
    attributes: safeAttributes(input.attributes),
  };
  if (serializedBytes(event) <= ROOTINE_DIAGNOSTIC_EVENT_MAX_BYTES) return event;
  const trimmed = { ...event, attributes: {} };
  for (const [key, value] of Object.entries(event.attributes)) {
    const candidate = { ...trimmed, attributes: { ...trimmed.attributes, [key]: value } };
    if (serializedBytes(candidate) > ROOTINE_DIAGNOSTIC_EVENT_MAX_BYTES) break;
    trimmed.attributes = candidate.attributes;
  }
  return trimmed;
}

export class RootineObservability {
  static readonly shared = new RootineObservability();

  private readonly sink?: RootineTelemetrySink;
  private readonly now: () => Date;
  private readonly maxEvents: number;
  private readonly supportId: string;
  private readonly counters = new Map<RootineHealthCounterName, number>();
  private events: RootineDiagnosticEvent[] = [];

  constructor(options: {
    sink?: RootineTelemetrySink;
    now?: () => Date;
    supportId?: string;
    maxEvents?: number;
  } = {}) {
    this.sink = options.sink;
    this.now = options.now ?? (() => new Date());
    const requestedEventLimit = Number.isFinite(options.maxEvents) ? Math.floor(options.maxEvents!) : ROOTINE_DIAGNOSTIC_EVENT_LIMIT;
    this.maxEvents = Math.max(1, Math.min(ROOTINE_DIAGNOSTIC_EVENT_LIMIT, requestedEventLimit));
    this.supportId = safeIdentifier(options.supportId, 96) ?? newSupportId();
  }

  get identifier() {
    return this.supportId;
  }

  record(input: Omit<Parameters<typeof boundedEvent>[0], "at"> & { at?: string }) {
    const event = boundedEvent({ ...input, at: input.at ?? this.now().toISOString() });
    this.events = [...this.events, event].slice(-this.maxEvents);
    try {
      this.sink?.record(event);
    } catch {
      // A future sink is optional and must never break a product flow.
    }
    return event;
  }

  increment(name: RootineHealthCounterName, amount = 1) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const next = (this.counters.get(name) ?? 0) + Math.min(1_000, Math.round(amount));
    this.counters.set(name, Math.min(Number.MAX_SAFE_INTEGER, next));
  }

  recordAuthOutcome(input: { action: string; outcome: RootineTelemetryOutcome; provider?: string; error?: unknown }) {
    this.increment(input.outcome === "success" ? "auth_success" : "auth_failure");
    const attributes = {
      action: input.action,
      provider: input.provider ?? "password",
      ...(input.error === undefined ? {} : { error: input.error }),
    };
    return this.record({
      name: "auth_outcome",
      outcome: input.outcome,
      attributes,
    });
  }

  recordSyncOperation(input: {
    endpoint: "bootstrap" | "pull" | "push" | "register_device" | string;
    outcome: RootineTelemetryOutcome;
    status?: string;
    durationMs?: number;
    correlationId?: string;
    operationId?: string;
    error?: unknown;
    attributes?: Record<string, unknown>;
  }) {
    const prefix = input.endpoint === "pull" ? "sync_pull" : input.endpoint === "push" ? "sync_push" : undefined;
    if (prefix) this.increment(`${prefix}_${input.outcome === "success" ? "success" : "failure"}` as RootineHealthCounterName);
    const status = String(input.status ?? "").toLocaleLowerCase("en-US");
    if (status === "conflict") this.increment("sync_conflict");
    if (status === "cursor_expired") this.increment("sync_cursor_expired");
    if (status === "unauthorized") this.increment("sync_unauthorized");
    if (status === "retry" || status === "rate_limited") this.increment("sync_retry");
    return this.record({
      name: "sync_operation",
      outcome: input.outcome,
      durationMs: input.durationMs,
      correlationId: input.correlationId,
      operationId: input.operationId,
      attributes: { endpoint: input.endpoint, status: input.status, error: input.error, ...input.attributes },
    });
  }

  recordQrScan(input: { outcome: "detected" | "success" | "failure"; format?: "qr" | "barcode" | string; error?: unknown }) {
    this.increment(input.outcome === "detected" ? "qr_detected" : input.outcome === "success" ? "qr_success" : "qr_failure");
    const attributes = {
      format: input.format === "qr" || input.format === "barcode" ? input.format : "unknown",
      ...(input.error === undefined ? {} : { error: input.error }),
    };
    return this.record({
      name: "qr_scan",
      outcome: input.outcome === "failure" ? "failure" : "success",
      attributes,
    });
  }

  recordNotificationDelivery(input: { status: "delivered" | "failed" | "unregistered" | "retry"; environment?: string; error?: unknown }) {
    const counter = input.status === "delivered" ? "apns_delivered" : input.status === "unregistered" ? "apns_unregistered" : input.status === "retry" ? "apns_retry" : "apns_failed";
    this.increment(counter);
    return this.record({ name: "notification_delivery", outcome: input.status === "delivered" ? "success" : input.status === "retry" ? "degraded" : "failure", attributes: {
      status: input.status,
      ...(input.environment === undefined ? {} : { environment: input.environment }),
      ...(input.error === undefined ? {} : { error: input.error }),
    } });
  }

  recordMaterializerQuarantine(reason?: string) {
    this.increment("materializer_quarantine");
    return this.record({ name: "materializer_quarantine", outcome: "degraded", attributes: reason === undefined ? {} : { reason } });
  }

  recordCrash(error?: unknown) {
    this.increment("crash_captured");
    return this.record({ name: "crash", outcome: "failure", attributes: error === undefined ? {} : { error } });
  }

  snapshot(): RootineDiagnosticSnapshot {
    return {
      schemaVersion: ROOTINE_OBSERVABILITY_SCHEMA_VERSION,
      generatedAt: this.now().toISOString(),
      supportId: this.supportId,
      counters: Object.fromEntries(this.counters.entries()),
      events: this.events.slice(),
    };
  }

  exportDiagnostics() {
    this.record({ name: "support_export", outcome: "success", attributes: { source: "local" } });
    let snapshot = this.snapshot();
    let serialized = JSON.stringify(snapshot);
    while (serializedBytes(serialized) > ROOTINE_DIAGNOSTIC_EXPORT_MAX_BYTES && snapshot.events.length > 0) {
      snapshot = { ...snapshot, events: snapshot.events.slice(1) };
      serialized = JSON.stringify(snapshot);
    }
    return serialized;
  }

  reset() {
    this.events = [];
    this.counters.clear();
  }
}

export const rootineObservability = RootineObservability.shared;
