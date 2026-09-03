import Foundation

enum RootineTelemetryOutcome: String, Codable, Sendable {
    case success
    case failure
    case degraded
    case cancelled
    case unknown
}

struct RootineDiagnosticEvent: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let name: String
    let outcome: RootineTelemetryOutcome
    let at: String
    let durationMilliseconds: Int?
    let correlationID: String?
    let operationID: String?
    let attributes: [String: String]

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case name
        case outcome
        case at
        case durationMilliseconds = "duration_ms"
        case correlationID = "correlation_id"
        case operationID = "operation_id"
        case attributes
    }
}

struct RootineDiagnosticSnapshot: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let generatedAt: String
    let supportID: String
    let counters: [String: Int]
    let events: [RootineDiagnosticEvent]

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case generatedAt = "generated_at"
        case supportID = "support_id"
        case counters
        case events
    }
}

enum RootineHealthCounter: String, CaseIterable, Sendable {
    case authSuccess = "auth_success"
    case authFailure = "auth_failure"
    case syncPullSuccess = "sync_pull_success"
    case syncPullFailure = "sync_pull_failure"
    case syncPushSuccess = "sync_push_success"
    case syncPushFailure = "sync_push_failure"
    case syncRetry = "sync_retry"
    case syncConflict = "sync_conflict"
    case syncCursorExpired = "sync_cursor_expired"
    case syncUnauthorized = "sync_unauthorized"
    case realtimeConnected = "realtime_connected"
    case realtimeReconnect = "realtime_reconnect"
    case realtimeFailure = "realtime_failure"
    case qrDetected = "qr_detected"
    case qrSuccess = "qr_success"
    case qrFailure = "qr_failure"
    case apnsDelivered = "apns_delivered"
    case apnsFailed = "apns_failed"
    case apnsUnregistered = "apns_unregistered"
    case apnsRetry = "apns_retry"
    case materializerQuarantine = "materializer_quarantine"
    case deviceRegistered = "device_registered"
    case deviceRegistrationFailure = "device_registration_failure"
    case crashCaptured = "crash_captured"
}

/// Privacy-safe, vendor-neutral diagnostics. This is an in-process boundary;
/// callers can later provide an adapter without changing feature contracts.
final class RootineObservability: @unchecked Sendable {
    static let shared = RootineObservability()

    static let schemaVersion = 1
    static let maximumEventBytes = 4_096
    static let maximumExportBytes = 64 * 1_024
    static let maximumEvents = 64

    private static let safeAttributeKeys: Set<String> = [
        "action", "endpoint", "environment", "error", "entity", "entity_id", "format",
        "http_status", "permission", "provider", "reason", "source", "status", "trigger",
        "attempt", "batch_size", "change_count", "cursor", "revision", "retry_after_seconds",
        "queue_depth"
    ]

    private let lock = NSLock()
    private let maxEvents: Int
    private let now: () -> Date
    private(set) var supportID: String
    private var counters: [String: Int] = [:]
    private var events: [RootineDiagnosticEvent] = []

    init(
        supportID: String? = nil,
        maxEvents: Int = RootineObservability.maximumEvents,
        now: @escaping () -> Date = Date.init
    ) {
        self.supportID = supportID ?? "ios-\(UUID().uuidString.lowercased())"
        self.maxEvents = max(1, min(RootineObservability.maximumEvents, maxEvents))
        self.now = now
    }

    func increment(_ counter: RootineHealthCounter, amount: Int = 1) {
        guard amount > 0 else { return }
        lock.lock()
        counters[counter.rawValue] = min(Int.max, (counters[counter.rawValue] ?? 0) + min(amount, 1_000))
        lock.unlock()
    }

    @discardableResult
    func record(
        name: String,
        outcome: RootineTelemetryOutcome = .unknown,
        duration: TimeInterval? = nil,
        correlationID: String? = nil,
        operationID: String? = nil,
        attributes: [String: String] = [:]
    ) -> RootineDiagnosticEvent {
        let event = RootineDiagnosticEvent(
            schemaVersion: Self.schemaVersion,
            name: bounded(name, maximum: 64),
            outcome: outcome,
            at: bounded(ISO8601DateFormatter().string(from: now()), maximum: 48),
            durationMilliseconds: duration.map { max(0, Int(($0 * 1_000).rounded())) },
            correlationID: correlationID.map { bounded($0, maximum: 180) },
            operationID: operationID.map { bounded($0, maximum: 180) },
            attributes: safeAttributes(attributes)
        )
        let boundedEvent = boundedEvent(event)
        lock.lock()
        events.append(boundedEvent)
        if events.count > maxEvents { events.removeFirst(events.count - maxEvents) }
        lock.unlock()
        return boundedEvent
    }

    func recordAuth(outcome: RootineTelemetryOutcome, provider: String? = nil, error: String? = nil) {
        increment(outcome == .success ? .authSuccess : .authFailure)
        var attributes = ["provider": provider ?? "unknown"]
        if let error { attributes["error"] = errorCode(error) }
        record(name: "auth_outcome", outcome: outcome, attributes: attributes)
    }

    func recordSync(
        endpoint: String,
        outcome: RootineTelemetryOutcome,
        duration: TimeInterval? = nil,
        status: Int? = nil,
        correlationID: String? = nil,
        operationID: String? = nil,
        trigger: String? = nil,
        error: String? = nil,
        attributes: [String: String] = [:]
    ) {
        let isSuccess = outcome == .success
        if endpoint == "pull" || endpoint == "bootstrap" { increment(isSuccess ? .syncPullSuccess : .syncPullFailure) }
        if endpoint == "push" { increment(isSuccess ? .syncPushSuccess : .syncPushFailure) }
        if outcome == .degraded { increment(.syncRetry) }
        if status == 401 || status == 403 { increment(.syncUnauthorized) }
        if status == 409 { increment(.syncCursorExpired) }
        var eventAttributes = attributes
        eventAttributes["endpoint"] = endpoint
        eventAttributes["status"] = status.map(String.init) ?? eventAttributes["status"] ?? "unknown"
        if let trigger { eventAttributes["trigger"] = trigger }
        if let error { eventAttributes["error"] = errorCode(error) }
        record(name: "sync_operation", outcome: outcome, duration: duration, correlationID: correlationID, operationID: operationID, attributes: eventAttributes)
    }

    func recordQR(outcome: RootineTelemetryOutcome, format: String = "qr", error: String? = nil) {
        increment(.qrDetected)
        switch outcome {
        case .success: increment(.qrSuccess)
        case .failure: increment(.qrFailure)
        default: break
        }
        var attributes = ["format": safeScanFormat(format)]
        if let error { attributes["error"] = errorCode(error) }
        record(name: "qr_scan", outcome: outcome, attributes: attributes)
    }

    func recordQRDetected(format: String) {
        increment(.qrDetected)
        record(name: "qr_scan", outcome: .unknown, attributes: ["format": safeScanFormat(format)])
    }

    func recordNotificationDelivery(status: String, retryable: Bool = false, responseCode: Int? = nil) {
        switch status {
        case "delivered": increment(.apnsDelivered)
        case "unregistered": increment(.apnsUnregistered)
        default: increment(.apnsFailed)
        }
        if retryable { increment(.apnsRetry) }
        var attributes = ["status": status]
        if let responseCode { attributes["http_status"] = String(responseCode) }
        record(name: "notification_delivery", outcome: status == "delivered" ? .success : retryable ? .degraded : .failure, attributes: attributes)
    }

    func recordMaterializerQuarantine(reason: String? = nil) {
        increment(.materializerQuarantine)
        var attributes: [String: String] = [:]
        if let reason { attributes["reason"] = errorCode(reason) }
        record(name: "materializer_quarantine", outcome: .degraded, attributes: attributes)
    }

    func recordDeviceHealth(outcome: RootineTelemetryOutcome, permission: String? = nil, environment: String? = nil, error: String? = nil) {
        increment(outcome == .success ? .deviceRegistered : .deviceRegistrationFailure)
        var attributes: [String: String] = [:]
        if let permission { attributes["permission"] = permission }
        if let environment { attributes["environment"] = environment }
        if let error { attributes["error"] = errorCode(error) }
        record(name: "device_health", outcome: outcome, attributes: attributes)
    }

    func recordCrash(error: String? = nil) {
        increment(.crashCaptured)
        var attributes: [String: String] = [:]
        if let error { attributes["error"] = errorCode(error) }
        record(name: "crash", outcome: .failure, attributes: attributes)
    }

    func installCrashReporter() {
        NSSetUncaughtExceptionHandler { _ in
            RootineObservability.shared.recordCrash(error: "uncaught_exception")
        }
    }

    func snapshot() -> RootineDiagnosticSnapshot {
        lock.lock()
        let snapshot = RootineDiagnosticSnapshot(
            schemaVersion: Self.schemaVersion,
            generatedAt: ISO8601DateFormatter().string(from: now()),
            supportID: supportID,
            counters: counters,
            events: events
        )
        lock.unlock()
        return snapshot
    }

    func exportDiagnostics() -> Data {
        record(name: "support_export", outcome: .success, attributes: ["format": "json"])
        var snapshotValue = snapshot()
        var serialized = encode(snapshotValue)
        while serialized.count > Self.maximumExportBytes && !snapshotValue.events.isEmpty {
            snapshotValue = RootineDiagnosticSnapshot(
                schemaVersion: snapshotValue.schemaVersion,
                generatedAt: snapshotValue.generatedAt,
                supportID: snapshotValue.supportID,
                counters: snapshotValue.counters,
                events: Array(snapshotValue.events.dropFirst())
            )
            serialized = encode(snapshotValue)
        }
        return serialized
    }

    func reset() {
        lock.lock()
        counters.removeAll()
        events.removeAll()
        lock.unlock()
    }

    private func safeAttributes(_ input: [String: String]) -> [String: String] {
        input
            .filter { Self.safeAttributeKeys.contains($0.key) }
            .prefix(24)
            .reduce(into: [String: String]()) { result, item in
                result[item.key] = item.key == "error" || item.key == "reason" ? errorCode(item.value) : bounded(item.value)
            }
    }

    private func boundedEvent(_ event: RootineDiagnosticEvent) -> RootineDiagnosticEvent {
        guard encode(event).count > Self.maximumEventBytes else { return event }
        return RootineDiagnosticEvent(
            schemaVersion: event.schemaVersion,
            name: event.name,
            outcome: event.outcome,
            at: event.at,
            durationMilliseconds: event.durationMilliseconds,
            correlationID: event.correlationID,
            operationID: event.operationID,
            attributes: [:]
        )
    }

    private func errorCode(_ value: String?) -> String {
        let normalized = (value ?? "").lowercased()
        if normalized.contains("unauthor") || normalized.contains("401") { return "unauthorized" }
        if normalized.contains("cursor") && normalized.contains("expir") { return "cursor_expired" }
        if normalized.contains("conflict") || normalized.contains("revision") { return "conflict" }
        if normalized.contains("rate") || normalized.contains("429") { return "rate_limited" }
        if normalized.contains("timeout") || normalized.contains("abort") { return "timeout" }
        if normalized.contains("network") || normalized.contains("fetch") { return "network" }
        if normalized.contains("invalid") || normalized.contains("schema") { return "invalid" }
        if normalized.contains("server") || normalized.contains("500") { return "server" }
        return "unknown"
    }

    private func safeScanFormat(_ value: String) -> String {
        value == "qr" || value == "barcode" ? value : "unknown"
    }

    private func bounded(_ value: String, maximum: Int = 180) -> String {
        let normalized = value.unicodeScalars.map { $0.value < 32 || $0.value == 127 ? " " : String($0) }.joined().trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalized.count > maximum else { return normalized }
        return String(normalized.prefix(maximum - 3)) + "..."
    }

    private func encode<T: Encodable>(_ value: T) -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return (try? encoder.encode(value)) ?? Data("{}".utf8)
    }
}
