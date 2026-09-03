import Foundation

/// A transport-neutral socket boundary keeps Realtime lifecycle behaviour
/// testable without requiring a live Supabase project. The production
/// implementation below uses URLSessionWebSocketTask.
protocol RootineRealtimeSocket: Sendable {
    func connect() async throws
    func send(_ message: Data) async throws
    func receive() async throws -> Data
    func cancel()
}

enum RootineRealtimeSocketError: Error, Equatable, Sendable {
    case unsupportedMessage
    case cancelled
}

final class URLSessionRootineRealtimeSocket: RootineRealtimeSocket, @unchecked Sendable {
    private let task: URLSessionWebSocketTask

    init(request: URLRequest, session: URLSession = .shared) {
        task = session.webSocketTask(with: request)
    }

    func connect() async throws {
        task.resume()
    }

    func send(_ message: Data) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            task.send(.data(message)) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    func receive() async throws -> Data {
        let message = try await task.receive()
        switch message {
        case .data(let data):
            return data
        case .string(let string):
            guard let data = string.data(using: .utf8) else {
                throw RootineRealtimeSocketError.unsupportedMessage
            }
            return data
        @unknown default:
            throw RootineRealtimeSocketError.unsupportedMessage
        }
    }

    func cancel() {
        task.cancel(with: .goingAway, reason: nil)
    }
}

struct RootineRealtimeConfiguration: Sendable, Equatable {
    var supabaseURL: URL?
    var publishableKey: String
    var userID: String
    var accessToken: String
    var topic: String
    var table: String
    var reconnectDelays: [Duration]
    var heartbeatInterval: Duration
    var heartbeatTimeout: Duration

    init(
        supabaseURL: URL?,
        publishableKey: String,
        userID: String,
        accessToken: String,
        topic: String? = nil,
        table: String = "rootine_sync_changes",
        reconnectDelays: [Duration] = [.seconds(1), .seconds(2), .seconds(5), .seconds(15), .seconds(30)],
        heartbeatInterval: Duration = .seconds(25),
        heartbeatTimeout: Duration = .seconds(10)
    ) {
        self.supabaseURL = supabaseURL
        self.publishableKey = publishableKey
        self.userID = userID
        self.accessToken = accessToken
        self.topic = topic ?? "realtime:rootine-sync:\(userID)"
        self.table = table
        self.reconnectDelays = reconnectDelays
        self.heartbeatInterval = heartbeatInterval
        self.heartbeatTimeout = heartbeatTimeout
    }
}

enum RootineRealtimeFailure: String, Equatable, Sendable {
    case invalidConfiguration
    case channelError
    case timedOut
    case heartbeatFailed
    case invalidMessage
    case unauthorized
    case network
}

enum RootineRealtimeStatus: Equatable, Sendable {
    case stopped
    case connecting(attempt: Int)
    case connected
    case reconnecting(attempt: Int, delay: TimeInterval)
    case degraded(RootineRealtimeFailure)
    case failed(RootineRealtimeFailure)
}

struct RootineSyncAvailableEvent: Codable, Equatable, Sendable {
    var type: String
    var userID: String
    var cursor: Int64?
    var workspaceHint: String?

    init(
        type: String = "rootine_sync_available",
        userID: String,
        cursor: Int64?,
        workspaceHint: String? = nil
    ) {
        self.type = type
        self.userID = userID
        self.cursor = cursor
        self.workspaceHint = workspaceHint
    }

    enum CodingKeys: String, CodingKey {
        case type
        case userID = "user_id"
        case cursor
        case workspaceHint = "workspace_hint"
    }
}

/// Alias kept intentionally small so B05/B06 adapters can use either name
/// while their branches are integrated.
typealias RootineSyncAvailable = RootineSyncAvailableEvent

enum RootineRealtimeEvent: Equatable, Sendable {
    case syncAvailable(RootineSyncAvailableEvent)
}

enum RootineRealtimeError: Error, Equatable, Sendable {
    case invalidConfiguration
    case channelError
    case timedOut
    case heartbeatFailed
    case invalidMessage
    case unauthorized
    case network
}

/// A minimal Supabase Realtime channel. It listens for availability signals
/// only; consumers must perform an authoritative cursor pull after receiving
/// `syncAvailable`.
actor RootineRealtimeClient {
    typealias SocketFactory = @Sendable (URLRequest) -> any RootineRealtimeSocket
    typealias Sleep = @Sendable (Duration) async throws -> Void
    typealias EventHandler = @Sendable (RootineRealtimeEvent) async -> Void
    typealias StatusHandler = @Sendable (RootineRealtimeStatus) async -> Void

    private var configuration: RootineRealtimeConfiguration
    private let socketFactory: SocketFactory
    private let sleep: Sleep
    private let onEvent: EventHandler?
    private let onStatus: StatusHandler?
    private let observability: RootineObservability

    private var runTask: Task<Void, Never>?
    private var activeSocket: (any RootineRealtimeSocket)?
    private var heartbeatTask: Task<Void, Never>?
    private var statusValue: RootineRealtimeStatus = .stopped
    private var failureCount = 0
    private var nextReference = 1
    private var pendingHeartbeat: (reference: String, startedAt: Date)?
    private var heartbeatFailure: RootineRealtimeError?
    private var connectedAt: Date?
    private var runIdentifier: UUID?

    /// Realtime is a wake-up path, so a broken channel must not create an
    /// unbounded reconnect/heartbeat loop. The lower bound only applies to
    /// zero/negative values; small positive values remain useful in tests.
    private let minimumTimerInterval: Duration = .milliseconds(100)
    private let maximumReconnectDelay: Duration = .seconds(300)
    private let maximumHeartbeatInterval: Duration = .seconds(300)

    init(
        configuration: RootineRealtimeConfiguration,
        socketFactory: @escaping SocketFactory = { request in
            URLSessionRootineRealtimeSocket(request: request)
        },
        sleep: @escaping Sleep = { duration in
            try await Task.sleep(for: duration)
        },
        onEvent: EventHandler? = nil,
        onStatus: StatusHandler? = nil,
        observability: RootineObservability = .shared
    ) {
        self.configuration = configuration
        self.socketFactory = socketFactory
        self.sleep = sleep
        self.onEvent = onEvent
        self.onStatus = onStatus
        self.observability = observability
    }

    init(
        configuration: RootineConfiguration,
        session: SupabaseSession,
        socketFactory: @escaping SocketFactory = { request in
            URLSessionRootineRealtimeSocket(request: request)
        },
        sleep: @escaping Sleep = { duration in
            try await Task.sleep(for: duration)
        },
        onEvent: EventHandler? = nil,
        onStatus: StatusHandler? = nil,
        observability: RootineObservability = .shared
    ) {
        self.configuration = RootineRealtimeConfiguration(
            supabaseURL: configuration.supabaseURL,
            publishableKey: configuration.supabasePublishableKey,
            userID: session.user.id,
            accessToken: session.accessToken
        )
        self.socketFactory = socketFactory
        self.sleep = sleep
        self.onEvent = onEvent
        self.onStatus = onStatus
        self.observability = observability
    }

    var status: RootineRealtimeStatus {
        statusValue
    }

    func updateAccessToken(_ accessToken: String) {
        configuration.accessToken = accessToken
        activeSocket?.cancel()
    }

    func start() {
        guard runTask == nil else { return }
        let identifier = UUID()
        runIdentifier = identifier
        runTask = Task { [weak self] in
            await self?.runLoop(identifier: identifier)
        }
    }

    func stop() {
        runIdentifier = nil
        runTask?.cancel()
        runTask = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        activeSocket?.cancel()
        activeSocket = nil
        pendingHeartbeat = nil
        heartbeatFailure = nil
        failureCount = 0
        connectedAt = nil
        setStatus(.stopped)
    }

    private func runLoop(identifier: UUID) async {
        guard makeWebSocketRequest() != nil else {
            setStatus(.failed(.invalidConfiguration))
            if runIdentifier == identifier {
                runTask = nil
                runIdentifier = nil
            }
            return
        }

        while !Task.isCancelled, runIdentifier == identifier {
            do {
                try await connectAndListen()
            } catch is CancellationError {
                break
            } catch let error as RootineRealtimeError {
                guard !Task.isCancelled else { break }
                if error == .unauthorized {
                    setStatus(.failed(error.failure))
                    break
                }
                setStatus(.degraded(error.failure))
                await waitBeforeReconnect()
            } catch {
                guard !Task.isCancelled else { break }
                setStatus(.degraded(classify(error).failure))
                await waitBeforeReconnect()
            }
        }

        guard runIdentifier == identifier else { return }
        runTask = nil
        runIdentifier = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        activeSocket?.cancel()
        activeSocket = nil
        pendingHeartbeat = nil
        heartbeatFailure = nil
        connectedAt = nil
        if case .failed = statusValue {
            // Preserve terminal authentication/configuration failures so the
            // owner can surface them and decide when to retry.
        } else if statusValue != .stopped {
            setStatus(.stopped)
        }
    }

    private func connectAndListen() async throws {
        guard let request = makeWebSocketRequest() else {
            throw RootineRealtimeError.invalidConfiguration
        }
        let attempt = failureCount + 1
        setStatus(.connecting(attempt: attempt))
        let socket = socketFactory(request)
        activeSocket = socket
        pendingHeartbeat = nil
        defer {
            // A connection that stayed healthy for at least 30 seconds has
            // earned a fresh backoff window. Short-lived drops keep the
            // failure count so a flapping network cannot spin rapidly.
            if connectedAt.map({ Date().timeIntervalSince($0) >= 30 }) == true {
                failureCount = 0
            }
            heartbeatTask?.cancel()
            heartbeatTask = nil
            socket.cancel()
            activeSocket = nil
            pendingHeartbeat = nil
            heartbeatFailure = nil
            connectedAt = nil
        }

        try await socket.connect()
        try await socket.send(joinMessage())
        connectedAt = Date()
        setStatus(.connected)

        heartbeatTask = Task { [weak self] in
            do {
                try await self?.heartbeatLoop(socket: socket)
            } catch is CancellationError {
                return
            } catch {
                await self?.recordHeartbeatFailure(error)
                socket.cancel()
            }
        }

        do {
            try await receiveLoop(socket: socket)
        } catch {
            socket.cancel()
            throw heartbeatFailure ?? error
        }
    }

    private func receiveLoop(socket: any RootineRealtimeSocket) async throws {
        while !Task.isCancelled {
            let data: Data
            do {
                data = try await socket.receive()
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                throw classify(error)
            }
            try await processMessage(data)
        }
    }

    private func heartbeatLoop(socket: any RootineRealtimeSocket) async throws {
        let heartbeatInterval = configuration.heartbeatInterval.bounded(
            minimum: minimumTimerInterval,
            maximum: maximumHeartbeatInterval
        )
        let heartbeatTimeout = configuration.heartbeatTimeout.bounded(
            minimum: minimumTimerInterval,
            maximum: heartbeatInterval
        )
        var delayUntilNextHeartbeat = heartbeatInterval
        while !Task.isCancelled {
            try await sleep(delayUntilNextHeartbeat)
            try Task.checkCancellation()
            let reference = nextReferenceString()
            pendingHeartbeat = (reference, Date())
            try await socket.send(heartbeatMessage(reference: reference))

            // The ACK deadline is independent from the next send interval:
            // with the default 25 s/10 s settings a dead channel is detected
            // after 10 s, rather than waiting for the following 25 s tick.
            try await sleep(heartbeatTimeout)
            try Task.checkCancellation()
            if pendingHeartbeat?.reference == reference {
                heartbeatFailure = .heartbeatFailed
                throw RootineRealtimeError.heartbeatFailed
            }

            let remaining = heartbeatInterval.timeInterval - heartbeatTimeout.timeInterval
            delayUntilNextHeartbeat = remaining > minimumTimerInterval.timeInterval
                ? .milliseconds(Int64((remaining * 1_000).rounded(.up)))
                : minimumTimerInterval
        }
    }

    private func processMessage(_ data: Data) async throws {
        let decoder = JSONDecoder()
        let envelope: RealtimeEnvelope
        do {
            envelope = try decoder.decode(RealtimeEnvelope.self, from: data)
        } catch {
            throw RootineRealtimeError.invalidMessage
        }

        if envelope.event == "phx_error" || envelope.event == "phx_close" {
            throw envelope.event == "phx_close"
                ? RootineRealtimeError.timedOut
                : RootineRealtimeError.channelError
        }
        if envelope.event == "system" {
            let status = (
                envelope.payload?.stringValue
                ?? envelope.payload?.objectValue?["status"]?.stringValue
            )?.lowercased()
            if status == "timeout" || status == "timed_out" {
                throw RootineRealtimeError.timedOut
            }
            if status == "error" {
                throw RootineRealtimeError.channelError
            }
        }

        if envelope.event == "phx_reply" {
            let status = envelope.payload?.objectValue?["status"]?.stringValue?.lowercased()
            if status == "error" {
                let response = envelope.payload?.objectValue?["response"]
                let reason = (
                    response?.objectValue?["reason"]?.stringValue
                    ?? response?.stringValue
                )?.lowercased()
                if reason?.contains("timeout") == true || reason?.contains("timed_out") == true {
                    throw RootineRealtimeError.timedOut
                }
                if reason?.contains("unauthorized") == true
                    || reason?.contains("invalid token") == true
                    || reason?.contains("invalid jwt") == true
                    || reason?.contains("jwt expired") == true {
                    throw RootineRealtimeError.unauthorized
                }
                throw envelope.ref == pendingHeartbeat?.reference
                    ? RootineRealtimeError.heartbeatFailed
                    : RootineRealtimeError.channelError
            }
            if envelope.ref == pendingHeartbeat?.reference {
                pendingHeartbeat = nil
            }
            return
        }

        guard let signal = signal(from: envelope), signal.userID == configuration.userID else {
            // Join acknowledgements, heartbeats, presence, and signals for a
            // different user are intentionally ignored.
            return
        }
        guard signal.type == "rootine_sync_available" else { return }
        await onEvent?( .syncAvailable(signal) )
    }

    private func signal(from envelope: RealtimeEnvelope) -> RootineSyncAvailableEvent? {
        // A socket should only ever deliver frames for the joined topic. The
        // explicit check protects adapters/tests that feed a frame from a
        // different channel into this client.
        if let topic = envelope.topic, topic != configuration.topic {
            return nil
        }

        let candidate: JSONValue
        let fallbackType: String?
        if envelope.event == "broadcast", let payload = envelope.payload {
            if case .object(let object) = payload,
               case .string(let nestedEvent) = object["event"],
               nestedEvent == "rootine_sync_available",
               let nestedPayload = object["payload"] {
                candidate = nestedPayload
                fallbackType = nestedEvent
            } else {
                candidate = payload
                fallbackType = nil
            }
        } else if envelope.event == "rootine_sync_available", let payload = envelope.payload {
            candidate = payload
            fallbackType = envelope.event
        } else if envelope.event == "postgres_changes", let payload = envelope.payload {
            // Supabase's postgres_changes envelope nests the row under
            // payload.data.record. Accept the direct record form as well so
            // deployments can publish the same minimal signal through either
            // Realtime adapter.
            if let data = payload.objectValue,
               let nested = data["data"]?.objectValue?["record"] {
                candidate = nested
            } else if let record = payload.objectValue?["record"] {
                candidate = record
            } else {
                return nil
            }
            fallbackType = "rootine_sync_available"
        } else if envelope.type == "rootine_sync_available" {
            candidate = .object([
                "type": .string(envelope.type ?? ""),
                "user_id": envelope.userID.map(JSONValue.string) ?? .null,
                "cursor": envelope.cursor.map { .number(Double($0)) } ?? .null,
                "workspace_hint": envelope.workspaceHint.map(JSONValue.string) ?? .null
            ])
            fallbackType = nil
        } else {
            return nil
        }

        guard case .object(let object) = candidate,
              case .string(let userID) = object["user_id"],
              !userID.isEmpty else {
            return nil
        }
        let type: String
        if case .string(let explicitType) = object["type"] {
            type = explicitType
        } else if let fallbackType {
            type = fallbackType
        } else {
            return nil
        }
        let cursor: Int64?
        if case .number(let value) = object["cursor"],
           value.isFinite,
           value.rounded() == value {
            cursor = Int64(exactly: value)
        } else if case .number(let value) = object["change_cursor"],
                  value.isFinite,
                  value.rounded() == value {
            cursor = Int64(exactly: value)
        } else {
            cursor = nil
        }
        let workspaceHint: String?
        if case .string(let value) = object["workspace_hint"] {
            workspaceHint = value
        } else if case .string(let value) = object["storage_key"] {
            workspaceHint = value
        } else if case .string(let value) = object["entity"] {
            workspaceHint = value
        } else {
            workspaceHint = nil
        }
        return RootineSyncAvailableEvent(
            type: type,
            userID: userID,
            cursor: cursor,
            workspaceHint: workspaceHint
        )
    }

    private func waitBeforeReconnect() async {
        guard !Task.isCancelled else { return }
        let configuredDelays = configuration.reconnectDelays.isEmpty ? [.seconds(1)] : configuration.reconnectDelays
        let delays = configuredDelays.map {
            $0.bounded(minimum: minimumTimerInterval, maximum: maximumReconnectDelay)
        }
        let index = min(failureCount, delays.count - 1)
        let delay = delays[index]
        failureCount += 1
        setStatus(.reconnecting(attempt: failureCount, delay: delay.timeInterval))
        do {
            try await sleep(delay)
        } catch {
            // Cancellation is observed by the loop on its next iteration.
        }
    }

    private func makeWebSocketRequest() -> URLRequest? {
        guard let supabaseURL = configuration.supabaseURL,
              !configuration.publishableKey.isEmpty,
              !configuration.userID.isEmpty,
              !configuration.accessToken.isEmpty,
              var components = URLComponents(
                url: supabaseURL.appendingPathComponent("realtime/v1/websocket"),
                resolvingAgainstBaseURL: false
              ) else { return nil }
        guard let scheme = components.scheme?.lowercased(),
              ["http", "https", "ws", "wss"].contains(scheme) else { return nil }
        if scheme == "https" { components.scheme = "wss" }
        if scheme == "http" { components.scheme = "ws" }
        components.queryItems = [
            URLQueryItem(name: "apikey", value: configuration.publishableKey),
            URLQueryItem(name: "vsn", value: "1.0.0")
        ]
        guard let url = components.url else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        return request
    }

    private func joinMessage() -> Data {
        jsonData([
            "topic": configuration.topic,
            "event": "phx_join",
            "payload": [
                "access_token": configuration.accessToken,
                "config": [
                    "broadcast": ["ack": true, "self": false],
                    "presence": ["key": ""],
                    "postgres_changes": [[
                        "event": "INSERT",
                        "schema": "public",
                        "table": configuration.table,
                        "filter": "user_id=eq.\(configuration.userID)"
                    ]]
                ]
            ],
            "ref": nextReferenceString()
        ])
    }

    private func heartbeatMessage(reference: String) -> Data {
        jsonData([
            "topic": "phoenix",
            "event": "heartbeat",
            "payload": [:],
            "ref": reference
        ])
    }

    private func jsonData(_ object: [String: Any]) -> Data {
        (try? JSONSerialization.data(withJSONObject: object, options: [])) ?? Data("{}".utf8)
    }

    private func nextReferenceString() -> String {
        defer { nextReference += 1 }
        return String(nextReference)
    }

    private func recordHeartbeatFailure(_ error: Error) {
        if let error = error as? RootineRealtimeError {
            heartbeatFailure = error
        } else {
            heartbeatFailure = .heartbeatFailed
        }
    }

    private func setStatus(_ status: RootineRealtimeStatus) {
        statusValue = status
        let outcome: RootineTelemetryOutcome
        var attributes: [String: String] = [:]
        switch status {
        case .connected:
            observability.increment(.realtimeConnected)
            outcome = .success
            attributes["status"] = "connected"
        case let .reconnecting(attempt, _):
            observability.increment(.realtimeReconnect)
            outcome = .degraded
            attributes["status"] = "reconnecting"
            attributes["attempt"] = String(attempt)
        case let .degraded(failure):
            observability.increment(.realtimeFailure)
            outcome = .degraded
            attributes["status"] = "degraded"
            attributes["reason"] = failure.rawValue
        case let .failed(failure):
            observability.increment(.realtimeFailure)
            outcome = .failure
            attributes["status"] = "failed"
            attributes["reason"] = failure.rawValue
        case let .connecting(attempt):
            outcome = .unknown
            attributes["status"] = "connecting"
            attributes["attempt"] = String(attempt)
        case .stopped:
            outcome = .unknown
            attributes["status"] = "stopped"
        }
        observability.record(name: "realtime_health", outcome: outcome, attributes: attributes)
        guard let onStatus else { return }
        Task { await onStatus(status) }
    }

    private func classify(_ error: Error) -> RootineRealtimeError {
        if error is CancellationError { return .network }
        if let error = error as? RootineRealtimeError { return error }
        if let error = error as? RootineRealtimeSocketError, error == .cancelled {
            return .network
        }
        return .network
    }

    private struct RealtimeEnvelope: Decodable {
        var topic: String?
        var event: String?
        var ref: String?
        var payload: JSONValue?
        var type: String?
        var userID: String?
        var cursor: Int64?
        var workspaceHint: String?

        enum CodingKeys: String, CodingKey {
            case topic, event, ref, payload, type, cursor
            case userID = "user_id"
            case workspaceHint = "workspace_hint"
        }
    }
}

private extension RootineRealtimeError {
    var failure: RootineRealtimeFailure {
        switch self {
        case .invalidConfiguration: return .invalidConfiguration
        case .channelError: return .channelError
        case .timedOut: return .timedOut
        case .heartbeatFailed: return .heartbeatFailed
        case .invalidMessage: return .invalidMessage
        case .unauthorized: return .unauthorized
        case .network: return .network
        }
    }
}

private extension Duration {
    var timeInterval: TimeInterval {
        let components = components
        return TimeInterval(components.seconds) + TimeInterval(components.attoseconds) / 1_000_000_000_000_000_000
    }

    func bounded(minimum: Duration, maximum: Duration) -> Duration {
        let value = timeInterval
        let lower = minimum.timeInterval
        let upper = maximum.timeInterval
        guard value.isFinite else { return maximum }
        let bounded = Swift.max(lower, Swift.min(value, upper))
        return .milliseconds(Int64((bounded * 1_000).rounded(.up)))
    }
}

private extension JSONValue {
    var stringValue: String? {
        guard case .string(let value) = self else { return nil }
        return value
    }

    var objectValue: [String: JSONValue]? {
        guard case .object(let value) = self else { return nil }
        return value
    }
}
