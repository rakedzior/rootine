import { describe, expect, it } from "vitest";
import {
  ROOTINE_DIAGNOSTIC_EVENT_MAX_BYTES,
  ROOTINE_DIAGNOSTIC_EXPORT_MAX_BYTES,
  RootineObservability,
  redactRootineDiagnosticValue,
} from "./observability";

describe("RootineObservability", () => {
  it("redacts private values and bounds arbitrary diagnostic values", () => {
    expect(redactRootineDiagnosticValue({
      notes: "do not export",
      authorization: "Bearer secret",
      technical: "ok",
      nested: { health: { pulse: 72 }, status: "ok" },
      items: Array.from({ length: 30 }, (_, index) => index),
    })).toEqual({
      technical: "ok",
      nested: { status: "ok" },
      items: Array.from({ length: 16 }, (_, index) => index),
    });
  });

  it("keeps a bounded ring buffer and only emits allow-listed attributes", () => {
    const seen: unknown[] = [];
    const diagnostics = new RootineObservability({
      supportId: "support-test",
      maxEvents: 2,
      sink: { record: (event) => seen.push(event) },
    });
    diagnostics.record({
      name: "sync_operation",
      outcome: "failure",
      attributes: {
        endpoint: "push",
        error: "database timeout with private notes",
        payload: "never keep",
        unknown: "never keep",
      },
    });
    diagnostics.recordQrScan({ outcome: "failure", format: "qr", error: "camera denied" });
    diagnostics.recordNotificationDelivery({ status: "delivered", environment: "sandbox" });

    const snapshot = diagnostics.snapshot();
    expect(snapshot.supportId).toBe("support-test");
    expect(snapshot.events).toHaveLength(2);
    const firstEvent = seen[0] as { attributes: Record<string, unknown> };
    expect(firstEvent.attributes.error).toBe("timeout");
    expect(snapshot.events[0]?.attributes).not.toHaveProperty("payload");
    expect(snapshot.events[0]?.attributes).not.toHaveProperty("unknown");
    expect(snapshot.counters.qr_failure).toBe(1);
    expect(snapshot.counters.apns_delivered).toBe(1);
    expect(seen).toHaveLength(3);
    expect(JSON.stringify(snapshot).length).toBeLessThan(ROOTINE_DIAGNOSTIC_EXPORT_MAX_BYTES);
  });

  it("records technical sync health and caps event/export sizes", () => {
    const diagnostics = new RootineObservability({ maxEvents: 64 });
    for (let index = 0; index < 100; index += 1) {
      diagnostics.recordSyncOperation({
        endpoint: "push",
        outcome: "failure",
        operationId: `op-${index}`,
        correlationId: `corr-${index}`,
        status: "cursor_expired",
        error: "timeout",
        attributes: { entity: "task", entityId: `task-${index}`, queueDepth: index },
      });
    }
    const event = diagnostics.snapshot().events.at(-1);
    expect(event).toBeDefined();
    expect(new TextEncoder().encode(JSON.stringify(event)).byteLength).toBeLessThanOrEqual(ROOTINE_DIAGNOSTIC_EVENT_MAX_BYTES);
    expect(diagnostics.snapshot().counters.sync_push_failure).toBe(100);
    expect(diagnostics.snapshot().counters.sync_cursor_expired).toBe(100);
    expect(new TextEncoder().encode(diagnostics.exportDiagnostics()).byteLength).toBeLessThanOrEqual(ROOTINE_DIAGNOSTIC_EXPORT_MAX_BYTES);
  });
});
