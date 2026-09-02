import Foundation

protocol RootineSyncRemoteClientProtocol: Sendable {
    func bootstrap(deviceID: String, accessToken: String) async throws -> RootineSyncBootstrapResponse
    func pull(cursor: Int64?, limit: Int, deviceID: String, accessToken: String) async throws -> RootineSyncPullResponse
    func push(deviceID: String, commands: [PendingSyncCommand], accessToken: String) async throws -> RootineSyncPushResponse
    func registerDevice(
        deviceID: String,
        platform: String,
        appVersion: String,
        environment: RootineSyncEnvironment,
        apnsEnvironment: String?,
        pushToken: String?,
        accessToken: String
    ) async throws -> RootineSyncDeviceRegistration
}

/// Thin HTTP client for `supabase/functions/v1/mobile-sync`. It only knows
/// the versioned sync envelope; domain mapping remains in the app and RPC.
final class RootineSyncRemoteClient: RootineSyncRemoteClientProtocol, @unchecked Sendable {
    typealias SessionRefresher = @Sendable (String) async throws -> SupabaseSession

    private let endpoint: URL
    private let session: URLSession
    private let requestTimeout: TimeInterval
    private let sessionRefresher: SessionRefresher?
    private let apiKey: String?
    private let environment: RootineSyncEnvironment
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    convenience init(
        configuration: RootineConfiguration,
        session: URLSession = RootineSecureURLSession.make(),
        requestTimeout: TimeInterval = 20,
        sessionRefresher: SessionRefresher? = nil,
        apiKey: String? = nil,
        environment: RootineSyncEnvironment = .fromBundle()
    ) throws {
        guard let baseURL = configuration.supabaseURL ?? configuration.backendURL else {
            throw RootineAPIError.missingConfiguration
        }
        self.init(
            endpoint: baseURL.appendingPathComponent("functions/v1/mobile-sync"),
            session: session,
            requestTimeout: requestTimeout,
            sessionRefresher: sessionRefresher,
            apiKey: apiKey ?? configuration.supabasePublishableKey,
            environment: environment
        )
    }

    init(
        endpoint: URL,
        session: URLSession = RootineSecureURLSession.make(),
        requestTimeout: TimeInterval = 20,
        sessionRefresher: SessionRefresher? = nil,
        apiKey: String? = nil,
        environment: RootineSyncEnvironment = .development
    ) {
        self.endpoint = endpoint
        self.session = session
        self.requestTimeout = max(0.1, requestTimeout)
        self.sessionRefresher = sessionRefresher
        self.apiKey = apiKey?.isEmpty == false ? apiKey : nil
        self.environment = environment
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func bootstrap(deviceID: String, accessToken: String) async throws -> RootineSyncBootstrapResponse {
        let body: [String: JSONValue] = [
            "device_id": .string(deviceID)
        ]
        return try await send(action: "bootstrap", body: body, accessToken: accessToken)
    }

    func pull(cursor: Int64?, limit: Int = 500, deviceID: String, accessToken: String) async throws -> RootineSyncPullResponse {
        guard (1...500).contains(limit) else {
            throw RootineSyncRemoteError.invalidRequest("Limit synchronizacji musi mieścić się w zakresie 1–500.")
        }
        var body: [String: JSONValue] = [
            "device_id": .string(deviceID),
            "limit": .number(Double(limit))
        ]
        body["cursor"] = cursor.map { .number(Double($0)) } ?? .null
        return try await send(action: "pull", body: body, accessToken: accessToken)
    }

    func push(deviceID: String, commands: [PendingSyncCommand], accessToken: String) async throws -> RootineSyncPushResponse {
        guard !commands.isEmpty else { return RootineSyncPushResponse(results: []) }
        guard commands.count <= 100 else {
            throw RootineSyncRemoteError.invalidRequest("Batch synchronizacji może zawierać najwyżej 100 komend.")
        }
        guard !deviceID.isEmpty,
              commands.allSatisfy({
                  !$0.operationID.isEmpty
                      && $0.deviceID == deviceID
                      && !$0.entity.isEmpty
                      && !$0.entityID.isEmpty
                      && ($0.kind == .upsert || $0.kind == .delete)
                      && $0.baseRevision >= 0
              }) else {
            throw RootineSyncRemoteError.invalidRequest("Komenda synchronizacji ma nieprawidłowe dane.")
        }
        let commandValues = commands.map(Self.wireValue(for:))
        let body: [String: JSONValue] = [
            "device_id": .string(deviceID),
            "commands": .array(commandValues)
        ]
        return try await send(action: "push", body: body, accessToken: accessToken)
    }

    func registerDevice(
        deviceID: String,
        platform: String = "ios",
        appVersion: String,
        environment: RootineSyncEnvironment,
        apnsEnvironment: String? = nil,
        pushToken: String? = nil,
        accessToken: String
    ) async throws -> RootineSyncDeviceRegistration {
        guard deviceID.hasPrefix("ios_"), platform == "ios", !appVersion.isEmpty, appVersion.count <= 40 else {
            throw RootineSyncRemoteError.invalidRequest("Rejestracja wymaga poprawnych pól urządzenia iOS.")
        }
        guard (apnsEnvironment == nil) == (pushToken == nil) else {
            throw RootineSyncRemoteError.invalidRequest("Środowisko APNs i token muszą być podane razem.")
        }
        if let apnsEnvironment, apnsEnvironment != "sandbox" && apnsEnvironment != "production" {
            throw RootineSyncRemoteError.invalidRequest("Nieprawidłowe środowisko APNs.")
        }
        if let pushToken, (pushToken.isEmpty || pushToken.count > 512) {
            throw RootineSyncRemoteError.invalidRequest("Nieprawidłowy token APNs.")
        }
        var body: [String: JSONValue] = [
            "device_id": .string(deviceID),
            "platform": .string(platform),
            "app_version": .string(appVersion),
            "environment": .string(environment.rawValue)
        ]
        if let apnsEnvironment { body["apns_environment"] = .string(apnsEnvironment) }
        if let pushToken { body["push_token"] = .string(pushToken) }
        return try await send(action: "register_device", body: body, accessToken: accessToken)
    }

    /// Compatibility overload for callers that rely on the environment
    /// selected when the client was configured.
    func registerDevice(
        deviceID: String,
        platform: String = "ios",
        appVersion: String,
        apnsEnvironment: String? = nil,
        pushToken: String? = nil,
        accessToken: String
    ) async throws -> RootineSyncDeviceRegistration {
        try await registerDevice(
            deviceID: deviceID,
            platform: platform,
            appVersion: appVersion,
            environment: environment,
            apnsEnvironment: apnsEnvironment,
            pushToken: pushToken,
            accessToken: accessToken
        )
    }

    func bootstrap(accessToken: String, deviceID: String) async throws -> RootineSyncBootstrapResponse {
        try await bootstrap(deviceID: deviceID, accessToken: accessToken)
    }

    func pull(accessToken: String, cursor: Int64?, limit: Int = 500, deviceID: String) async throws -> RootineSyncPullResponse {
        try await pull(cursor: cursor, limit: limit, deviceID: deviceID, accessToken: accessToken)
    }

    func push(commands: [PendingSyncCommand], deviceID: String, accessToken: String) async throws -> RootineSyncPushResponse {
        try await push(deviceID: deviceID, commands: commands, accessToken: accessToken)
    }

    private func send<T: Decodable>(
        action: String,
        body: [String: JSONValue],
        accessToken: String,
        didRefresh: Bool = false
    ) async throws -> T {
        var body = body
        let correlationID: String
        if case let .string(existing)? = body["correlation_id"] {
            correlationID = existing
        } else {
            correlationID = RootineSyncIdentifiers.correlationID(environment: environment)
        }
        body = Self.requestEnvelope(fields: body, action: action, correlationID: correlationID)

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = requestTimeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        if let apiKey { request.setValue(apiKey, forHTTPHeaderField: "apikey") }
        request.httpBody = try encoder.encode(JSONValue.object(body))

        do {
            let data = try await sendRaw(request, expectedCorrelationID: correlationID)
            do {
                let value = try decoder.decode(T.self, from: data)
                if let versioned = value as? any RootineSyncContractVersioned,
                   versioned.contractVersion != 3 {
                    throw RootineSyncRemoteError.schemaMismatch
                }
                if let versioned = value as? any RootineSyncContractVersioned,
                   versioned.correlationID != correlationID {
                    throw RootineSyncRemoteError.invalidResponse
                }
                return value
            } catch let error as RootineSyncRemoteError {
                throw error
            } catch {
                throw RootineSyncRemoteError.invalidResponse
            }
        } catch RootineSyncRemoteError.unauthorized where !didRefresh {
            guard let sessionRefresher else { throw RootineSyncRemoteError.unauthorized }
            do {
                let refreshed = try await sessionRefresher(accessToken)
                return try await send(action: action, body: body, accessToken: refreshed.accessToken, didRefresh: true)
            } catch RootineSyncRemoteError.unauthorized {
                throw RootineSyncRemoteError.unauthorized
            } catch {
                throw RootineSyncRemoteError.unauthorized
            }
        }
    }

    private func sendRaw(_ request: URLRequest, expectedCorrelationID: String? = nil) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw RootineSyncRemoteError.cancelled
        } catch let error as URLError where error.code == .timedOut {
            throw RootineSyncRemoteError.timeout
        } catch {
            throw RootineSyncRemoteError.network
        }

        guard let http = response as? HTTPURLResponse else {
            throw RootineSyncRemoteError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            throw mapError(
                status: http.statusCode,
                data: data,
                response: http,
                expectedCorrelationID: expectedCorrelationID
            )
        }
        return data
    }

    private func mapError(
        status: Int,
        data: Data,
        response: HTTPURLResponse,
        expectedCorrelationID: String?
    ) -> RootineSyncRemoteError {
        struct ErrorPayload: Decodable {
            var contractVersion: Int?
            var correlationID: String?
            var error: String?
            var code: String?
            var message: String?
            var retryAfterSeconds: Double?
            var oldestCursor: Int64?

            enum CodingKeys: String, CodingKey {
                case contractVersion = "contract_version"
                case correlationID = "correlation_id"
                case error, code, message
                case retryAfterSeconds = "retry_after_seconds"
                case oldestCursor = "oldest_cursor"
            }
        }
        let payload = try? decoder.decode(ErrorPayload.self, from: data)
        if let contractVersion = payload?.contractVersion, contractVersion != 3 {
            return .schemaMismatch
        }
        if let correlationID = payload?.correlationID,
           let expectedCorrelationID,
           correlationID != expectedCorrelationID {
            return .invalidResponse
        }
        let code = [payload?.code, payload?.error, payload?.message]
            .compactMap { $0?.lowercased() }
            .joined(separator: " ")
        if code.contains("cursor_expired") || status == 410 {
            return .cursorExpired(oldestCursor: payload?.oldestCursor)
        }
        if status == 401 || status == 403 { return .unauthorized }
        if status == 408 { return .timeout }
        if status == 429 {
            let retryAfter = payload?.retryAfterSeconds
                ?? response.value(forHTTPHeaderField: "Retry-After").flatMap(Double.init)
            return .rateLimited(retryAfter: retryAfter)
        }
        if status >= 500 { return .server(status: status) }
        if code.contains("schema") || code.contains("contract") { return .schemaMismatch }
        return .invalidRequest("Żądanie synchronizacji zostało odrzucone.")
    }

    static func wireValue(for command: PendingSyncCommand) -> JSONValue {
        // Retry scheduling, creation time and device scope are local durable
        // metadata. The B03 RPC receives the device once at the envelope
        // level and validates only this normalized command shape.
        var value: [String: JSONValue] = [
            "operation_id": .string(command.operationID),
            "entity": .string(command.entity),
            "entity_id": .string(command.entityID),
            "kind": .string(command.kind.rawValue),
            "base_revision": .number(Double(command.baseRevision))
        ]
        if case .upsert = command.kind { value["payload"] = command.payload }
        return .object(value)
    }

    static func requestEnvelope(
        fields: [String: JSONValue],
        action: String? = nil,
        correlationID: String
    ) -> [String: JSONValue] {
        var envelope = fields
        envelope["contract_version"] = .number(3)
        envelope["correlation_id"] = .string(correlationID)
        if let action { envelope["action"] = .string(action) }
        return envelope
    }
}

typealias RootineSyncClient = RootineSyncRemoteClient

/// In-memory remote for XCTest and previews. The actor models server-side
/// idempotency and CAS without depending on B03 being merged yet.
actor MockRootineSyncRemoteClient: RootineSyncRemoteClientProtocol {
    private(set) var bootstrapResponse: RootineSyncBootstrapResponse
    private var pullResponses: [RootineSyncPullResponse]
    private var nextPushResponse: RootineSyncPushResponse?
    private var registeredDevices: [String: RootineSyncDeviceRegistration] = [:]
    private var appliedOperationIDs: Set<String> = []
    private(set) var pushedBatches: [[PendingSyncCommand]] = []
    private(set) var accessTokens: [String] = []
    private var queuedErrors: [RootineSyncRemoteError] = []

    init(
        bootstrapResponse: RootineSyncBootstrapResponse = .init(cursor: 0, changes: []),
        pullResponses: [RootineSyncPullResponse] = []
    ) {
        self.bootstrapResponse = bootstrapResponse
        self.pullResponses = pullResponses
    }

    func queue(error: RootineSyncRemoteError) { queuedErrors.append(error) }

    func setPushResponse(_ response: RootineSyncPushResponse?) { nextPushResponse = response }

    func bootstrap(deviceID: String, accessToken: String) async throws -> RootineSyncBootstrapResponse {
        accessTokens.append(accessToken)
        try consumeQueuedError()
        return bootstrapResponse
    }

    func pull(cursor: Int64?, limit: Int, deviceID: String, accessToken: String) async throws -> RootineSyncPullResponse {
        accessTokens.append(accessToken)
        try consumeQueuedError()
        guard let response = pullResponses.isEmpty ? nil : pullResponses.removeFirst() else {
            return RootineSyncPullResponse(fromCursor: cursor, nextCursor: cursor ?? 0, changes: [])
        }
        return response
    }

    func push(deviceID: String, commands: [PendingSyncCommand], accessToken: String) async throws -> RootineSyncPushResponse {
        accessTokens.append(accessToken)
        try consumeQueuedError()
        pushedBatches.append(commands)
        if let nextPushResponse {
            self.nextPushResponse = nil
            return nextPushResponse
        }
        return RootineSyncPushResponse(results: commands.map { command in
            if appliedOperationIDs.contains(command.operationID) {
                return RootineSyncCommandResult(operationID: command.operationID, status: .alreadyApplied, entity: command.entity, entityID: command.entityID, revision: command.baseRevision)
            }
            appliedOperationIDs.insert(command.operationID)
            return RootineSyncCommandResult(operationID: command.operationID, status: .applied, entity: command.entity, entityID: command.entityID, revision: command.baseRevision + 1)
        })
    }

    func registerDevice(
        deviceID: String,
        platform: String,
        appVersion: String,
        environment: RootineSyncEnvironment,
        apnsEnvironment: String?,
        pushToken: String?,
        accessToken: String
    ) async throws -> RootineSyncDeviceRegistration {
        accessTokens.append(accessToken)
        try consumeQueuedError()
        let registration = RootineSyncDeviceRegistration(deviceID: deviceID, platform: platform, appVersion: appVersion, environment: environment, apnsEnvironment: apnsEnvironment, registeredAt: RootineDate.isoTimestamp())
        registeredDevices[deviceID] = registration
        return registration
    }

    func registerDevice(
        deviceID: String,
        platform: String,
        appVersion: String,
        apnsEnvironment: String?,
        pushToken: String?,
        accessToken: String
    ) async throws -> RootineSyncDeviceRegistration {
        try await registerDevice(
            deviceID: deviceID,
            platform: platform,
            appVersion: appVersion,
            environment: .development,
            apnsEnvironment: apnsEnvironment,
            pushToken: pushToken,
            accessToken: accessToken
        )
    }

    func registeredDevice(_ deviceID: String) -> RootineSyncDeviceRegistration? { registeredDevices[deviceID] }

    private func consumeQueuedError() throws {
        guard !queuedErrors.isEmpty else { return }
        throw queuedErrors.removeFirst()
    }
}
