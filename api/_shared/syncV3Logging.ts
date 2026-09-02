const PRIVATE_KEYS = /(?:payload|record|server[_-]?record|local[_-]?record|notes?|health|finance|financial|nutrition|content|body|text|title|description|push[_-]?token|token|authorization|cookie|password|secret)/i;
const TECHNICAL_KEYS = new Set([
  "contract_version",
  "correlation_id",
  "operation_id",
  "device_id",
  "entity",
  "entity_id",
  "cursor",
  "from_cursor",
  "next_cursor",
  "server_cursor",
  "revision",
  "server_revision",
  "status",
  "error",
  "environment",
  "endpoint",
]);

/**
 * Logging is intentionally allow-list based for technical identifiers. This
 * keeps a new private field from becoming observable just because a caller
 * forgot to add it to PRIVATE_KEYS.
 */
export function redactSyncV3LogValue(value: unknown, key?: string): unknown {
  if (key && PRIVATE_KEYS.test(key)) return "[REDACTED]";
  if (typeof value === "string") return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  if (Array.isArray(value)) return value.map((item) => redactSyncV3LogValue(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([entryKey, entryValue]) => {
      if (!TECHNICAL_KEYS.has(entryKey) && PRIVATE_KEYS.test(entryKey)) return [[entryKey, "[REDACTED]"]];
      if (!TECHNICAL_KEYS.has(entryKey) && typeof entryValue === "object") {
        return [[entryKey, redactSyncV3LogValue(entryValue, entryKey)]];
      }
      if (!TECHNICAL_KEYS.has(entryKey)) return [];
      return [[entryKey, redactSyncV3LogValue(entryValue, entryKey)]];
    }),
  );
}

export function serializeSyncV3Log(event: Record<string, unknown>): string {
  return JSON.stringify(redactSyncV3LogValue(event));
}
