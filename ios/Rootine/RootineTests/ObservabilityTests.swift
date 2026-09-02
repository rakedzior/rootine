import XCTest

final class ObservabilityTests: XCTestCase {
    func testRedactsPrivateAttributesAndBoundsRing() throws {
        let recorder = RootineObservability(supportID: "ios-test", maxEvents: 2)
        recorder.record(
            name: "sync_operation",
            outcome: .failure,
            correlationID: "rt3_staging_123",
            operationID: "op3_123",
            attributes: [
                "endpoint": "push",
                "error": "database timeout with private notes",
                "payload": "must not be retained"
            ]
        )
        recorder.record(name: "device_health", outcome: .success, attributes: ["status": "registered"])
        recorder.record(name: "qr_scan", outcome: .success, attributes: ["format": "qr"])

        let snapshot = recorder.snapshot()
        XCTAssertEqual(snapshot.supportID, "ios-test")
        XCTAssertEqual(snapshot.events.count, 2)
        XCTAssertEqual(snapshot.events.last?.attributes["format"], "qr")
        XCTAssertFalse(snapshot.events.contains { $0.attributes.values.contains { $0.contains("private") } })
        XCTAssertLessThanOrEqual(recorder.exportDiagnostics().count, RootineObservability.maximumExportBytes)
    }

    func testCountersClassifyHealthSignals() {
        let recorder = RootineObservability(supportID: "ios-test")
        recorder.recordAuth(outcome: .success, provider: "password")
        recorder.recordSync(endpoint: "push", outcome: .degraded, status: 409, error: "cursor expired")
        recorder.recordQR(outcome: .failure, format: "qr", error: "invalid payload")
        recorder.recordNotificationDelivery(status: "unregistered", retryable: true, responseCode: 410)
        recorder.recordMaterializerQuarantine(reason: "schema mismatch")

        let counters = recorder.snapshot().counters
        XCTAssertEqual(counters[RootineHealthCounter.authSuccess.rawValue], 1)
        XCTAssertEqual(counters[RootineHealthCounter.syncCursorExpired.rawValue], 1)
        XCTAssertEqual(counters[RootineHealthCounter.syncRetry.rawValue], 1)
        XCTAssertEqual(counters[RootineHealthCounter.qrFailure.rawValue], 1)
        XCTAssertEqual(counters[RootineHealthCounter.apnsUnregistered.rawValue], 1)
        XCTAssertEqual(counters[RootineHealthCounter.apnsRetry.rawValue], 1)
        XCTAssertEqual(counters[RootineHealthCounter.materializerQuarantine.rawValue], 1)
    }
}
