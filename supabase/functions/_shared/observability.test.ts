import { describe, expect, it } from "vitest";
import {
  ROOTINE_DIAGNOSTIC_EVENT_MAX_BYTES,
  ROOTINE_DIAGNOSTIC_EXPORT_MAX_BYTES,
  RootineHealthCounters,
  boundedRootineDiagnosticEvent,
  redactRootineDiagnosticValue,
} from "./observability";

describe("Edge observability boundary", () => {
  it("redacts private nested fields and bounds collections", () => {
    expect(redactRootineDiagnosticValue({
      payload: { note: "private" },
      token: "secret",
      entity: "task",
      values: Array.from({ length: 30 }, (_, index) => index),
    })).toEqual({
      entity: "task",
      values: Array.from({ length: 16 }, (_, index) => index),
    });
  });

  it("retains only technical event attributes and redacts error detail", () => {
    const event = boundedRootineDiagnosticEvent({
      name: "sync_operation",
      outcome: "failure",
      correlation_id: "rt3_staging_123",
      operation_id: "op3_123",
      attributes: {
        endpoint: "push",
        error: "request timed out while handling private notes",
        payload: "do not collect",
        unknown: "do not collect",
      },
    });
    expect(event.attributes.error).toBe("timeout");
    expect(event.attributes).not.toHaveProperty("payload");
    expect(event.attributes).not.toHaveProperty("unknown");
    expect(new TextEncoder().encode(JSON.stringify(event)).byteLength).toBeLessThanOrEqual(ROOTINE_DIAGNOSTIC_EVENT_MAX_BYTES);
  });

  it("keeps bounded counters and export data", () => {
    const counters = new RootineHealthCounters(2);
    for (let index = 0; index < 100; index += 1) {
      counters.increment("sync_push_failure");
      counters.record({ name: "sync_operation", outcome: "failure", attributes: { endpoint: "push", attempt: index } });
    }
    const snapshot = counters.snapshot();
    expect(snapshot.counters.sync_push_failure).toBe(100);
    expect(snapshot.events).toHaveLength(2);
    expect(new TextEncoder().encode(counters.exportDiagnostics()).byteLength).toBeLessThanOrEqual(ROOTINE_DIAGNOSTIC_EXPORT_MAX_BYTES);
  });
});

