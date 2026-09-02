import Foundation

/// Transitional command sum type. `legacySnapshot` remains available for
/// aggregate reconcile/export while `normalizedCommand` is used by sync-v3.
enum WorkspaceSyncCommand: Codable, Equatable, Sendable {
    case legacySnapshot(storageKey: String, payload: JSONValue, expectedRevision: Int64)
    case normalizedCommand(PendingSyncCommand)
}

enum RootineSyncEnvironment: String, Codable, Equatable, Sendable {
    case development
    case staging
    case production

    static func fromBundle(_ bundle: Bundle = .main) -> RootineSyncEnvironment {
        guard let raw = bundle.object(forInfoDictionaryKey: "ROOTINE_ENVIRONMENT") as? String,
              let environment = RootineSyncEnvironment(rawValue: raw.lowercased()) else {
            return .development
        }
        return environment
    }
}

enum RootineSyncIdentifiers {
    static func correlationID(
        environment: RootineSyncEnvironment,
        uuid: UUID = UUID()
    ) -> String {
        "rt3_\(environment.rawValue)_\(uuid.uuidString.lowercased())"
    }

    static func operationID(uuid: UUID = UUID()) -> String {
        "op3_\(uuid.uuidString.lowercased())"
    }

    static func deviceID(uuid: UUID = UUID()) -> String {
        "ios_\(uuid.uuidString.lowercased())"
    }
}

/// The normalized command vocabulary shared by the iOS client and the
/// mobile-sync endpoint. Keeping these values strings makes the on-disk log
/// forward compatible with an entity added by the server before this app is
/// updated.
enum RootineSyncCommandKind: Codable, Equatable, Sendable {
    case upsert
    case delete
    case custom(String)

    var rawValue: String {
        switch self {
        case .upsert: return "upsert"
        case .delete: return "delete"
        case .custom(let value): return value
        }
    }

    init(rawValue: String) {
        switch rawValue {
        case "upsert": self = .upsert
        case "delete": self = .delete
        default: self = .custom(rawValue)
        }
    }

    init(from decoder: Decoder) throws {
        self.init(rawValue: try decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

enum RootineSyncChangeOperation: Codable, Equatable, Sendable {
    case upsert
    case delete
    case custom(String)

    var rawValue: String {
        switch self {
        case .upsert: return "upsert"
        case .delete: return "delete"
        case .custom(let value): return value
        }
    }

    init(rawValue: String) {
        switch rawValue {
        case "upsert": self = .upsert
        case "delete": self = .delete
        default: self = .custom(rawValue)
        }
    }

    init(from decoder: Decoder) throws {
        self.init(rawValue: try decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

enum RootineSyncCommandResultStatus: Codable, Equatable, Sendable {
    case applied
    case alreadyApplied
    case conflict
    case invalid
    case unauthorized
    case custom(String)

    var rawValue: String {
        switch self {
        case .applied: return "applied"
        case .alreadyApplied: return "already_applied"
        case .conflict: return "conflict"
        case .invalid: return "invalid"
        case .unauthorized: return "unauthorized"
        case .custom(let value): return value
        }
    }

    init(rawValue: String) {
        switch rawValue {
        case "applied": self = .applied
        case "already_applied": self = .alreadyApplied
        case "conflict": self = .conflict
        case "invalid": self = .invalid
        case "unauthorized": self = .unauthorized
        default: self = .custom(rawValue)
        }
    }

    init(from decoder: Decoder) throws {
        self.init(rawValue: try decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

struct SyncRetryMetadata: Codable, Equatable, Sendable {
    var attemptCount: Int
    var nextAttemptAt: Date?
    var lastAttemptAt: Date?
    var lastError: String?

    init(
        attemptCount: Int = 0,
        nextAttemptAt: Date? = nil,
        lastAttemptAt: Date? = nil,
        lastError: String? = nil
    ) {
        self.attemptCount = max(0, attemptCount)
        self.nextAttemptAt = nextAttemptAt
        self.lastAttemptAt = lastAttemptAt
        self.lastError = lastError
    }
}

/// A single normalized mutation. This is deliberately independent of the
/// aggregate snapshot queue (`PendingWorkspaceMutation`) so that a v3 command
/// can update one record without rewriting unrelated web-only fields.
struct PendingSyncCommand: Codable, Equatable, Identifiable, Sendable {
    var operationID: String
    var deviceID: String
    var entity: String
    var entityID: String
    var kind: RootineSyncCommandKind
    var baseRevision: Int64
    var payload: JSONValue
    var createdAt: Date
    var retry: SyncRetryMetadata

    var id: String { operationID }

    init(
        operationID: String = RootineSyncIdentifiers.operationID(),
        deviceID: String,
        entity: String,
        entityID: String,
        kind: RootineSyncCommandKind = .upsert,
        baseRevision: Int64,
        payload: JSONValue,
        createdAt: Date = Date(),
        retry: SyncRetryMetadata = SyncRetryMetadata()
    ) {
        self.operationID = operationID
        self.deviceID = deviceID
        self.entity = entity
        self.entityID = entityID
        self.kind = kind
        self.baseRevision = baseRevision
        self.payload = payload
        self.createdAt = createdAt
        self.retry = retry
    }

    /// Contract-friendly spelling for callers that already have a timestamp
    /// in the shared ISO representation.
    init(
        operationID: String = RootineSyncIdentifiers.operationID(),
        deviceID: String,
        entity: String,
        entityID: String,
        kind: RootineSyncCommandKind = .upsert,
        baseRevision: Int64,
        payload: JSONValue,
        createdAt: String,
        retry: SyncRetryMetadata = SyncRetryMetadata()
    ) {
        self.init(
            operationID: operationID,
            deviceID: deviceID,
            entity: entity,
            entityID: entityID,
            kind: kind,
            baseRevision: baseRevision,
            payload: payload,
            createdAt: RootineDate.date(from: createdAt) ?? Date.distantPast,
            retry: retry
        )
    }

    enum CodingKeys: String, CodingKey {
        case operationID = "operation_id"
        case deviceID = "device_id"
        case entity
        case entityID = "entity_id"
        case kind
        case baseRevision = "base_revision"
        case payload
        case createdAt = "created_at"
        case retry
    }

    /// Exposes the timestamp without forcing every caller to know the
    /// in-memory representation used for deterministic retry scheduling.
    var createdAtISO8601: String { RootineDate.isoTimestamp(createdAt) }

    var operationId: String {
        get { operationID }
        set { operationID = newValue }
    }

    var entityId: String {
        get { entityID }
        set { entityID = newValue }
    }

    var retryCount: Int {
        get { retry.attemptCount }
        set { retry.attemptCount = max(0, newValue) }
    }

    var nextAttemptAt: Date? {
        get { retry.nextAttemptAt }
        set { retry.nextAttemptAt = newValue }
    }

    var lastError: String? {
        get { retry.lastError }
        set { retry.lastError = newValue }
    }
}

struct RootineSyncChange: Codable, Equatable, Sendable {
    var cursor: Int64
    var entity: String
    var entityID: String
    var operation: RootineSyncChangeOperation
    var record: JSONValue?
    var revision: Int64?

    init(
        cursor: Int64,
        entity: String,
        entityID: String,
        operation: RootineSyncChangeOperation,
        record: JSONValue? = nil,
        revision: Int64? = nil
    ) {
        self.cursor = cursor
        self.entity = entity
        self.entityID = entityID
        self.operation = operation
        self.record = record
        self.revision = revision
    }

    enum CodingKeys: String, CodingKey {
        case cursor
        case entity
        case entityID = "entity_id"
        case operation
        case record
        case revision
    }
}

struct RootineSyncCommandResult: Codable, Equatable, Sendable {
    var operationID: String
    var status: RootineSyncCommandResultStatus
    var entity: String?
    var entityID: String?
    var revision: Int64?
    var serverRevision: Int64?
    var serverRecord: JSONValue?
    var message: String?

    enum CodingKeys: String, CodingKey {
        case operationID = "operation_id"
        case status
        case entity
        case entityID = "entity_id"
        case revision
        case serverRevision = "server_revision"
        case serverRecord = "server_record"
        case message
    }

    init(
        operationID: String,
        status: RootineSyncCommandResultStatus,
        entity: String? = nil,
        entityID: String? = nil,
        revision: Int64? = nil,
        serverRevision: Int64? = nil,
        serverRecord: JSONValue? = nil,
        message: String? = nil
    ) {
        self.operationID = operationID
        self.status = status
        self.entity = entity
        self.entityID = entityID
        self.revision = revision
        self.serverRevision = serverRevision
        self.serverRecord = serverRecord
        self.message = message
    }
}

protocol RootineSyncContractVersioned: Sendable {
    var contractVersion: Int { get }
    var correlationID: String { get }
}

struct RootineSyncBootstrapResponse: Codable, Equatable, Sendable, RootineSyncContractVersioned {
    var contractVersion: Int
    var correlationID: String
    var cursor: Int64
    var changes: [RootineSyncChange]
    var hasMore: Bool
    var nextCursor: Int64?

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case correlationID = "correlation_id"
        case cursor = "server_cursor"
        case nextCursor = "next_cursor"
        case changes
        case hasMore = "has_more"
    }

    private enum DecodeKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case correlationID = "correlation_id"
        case cursor
        case serverCursor = "server_cursor"
        case nextCursor = "next_cursor"
        case changes
        case records
        case hasMore = "has_more"
    }

    init(
        contractVersion: Int = 3,
        correlationID: String = RootineSyncIdentifiers.correlationID(environment: .development),
        cursor: Int64,
        changes: [RootineSyncChange],
        hasMore: Bool = false,
        nextCursor: Int64? = nil
    ) {
        self.contractVersion = contractVersion
        self.correlationID = correlationID
        self.cursor = cursor
        self.changes = changes
        self.hasMore = hasMore
        self.nextCursor = nextCursor
    }

    /// Alias used by the HTTP contract and by callers that distinguish the
    /// bootstrap position from a record revision.
    var serverCursor: Int64 { cursor }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DecodeKeys.self)
        contractVersion = try container.decode(Int.self, forKey: .contractVersion)
        correlationID = try container.decode(String.self, forKey: .correlationID)
        let explicitCursor = try container.decodeIfPresent(Int64.self, forKey: .cursor)
        let serverCursor = try container.decodeIfPresent(Int64.self, forKey: .serverCursor)
        cursor = explicitCursor ?? serverCursor ?? 0
        let explicitChanges = try container.decodeIfPresent([RootineSyncChange].self, forKey: .changes)
        let records = try container.decodeIfPresent([RootineSyncChange].self, forKey: .records)
        changes = explicitChanges ?? records ?? []
        hasMore = try container.decodeIfPresent(Bool.self, forKey: .hasMore) ?? false
        nextCursor = try container.decodeIfPresent(Int64.self, forKey: .nextCursor)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(contractVersion, forKey: .contractVersion)
        try container.encode(correlationID, forKey: .correlationID)
        try container.encode(cursor, forKey: .cursor)
        try container.encode(nextCursor ?? cursor, forKey: .nextCursor)
        try container.encode(changes, forKey: .changes)
        try container.encode(hasMore, forKey: .hasMore)
    }
}

struct RootineSyncPullResponse: Codable, Equatable, Sendable, RootineSyncContractVersioned {
    var contractVersion: Int
    var correlationID: String
    var fromCursor: Int64?
    var nextCursor: Int64
    var hasMore: Bool
    var oldestCursor: Int64?
    var changes: [RootineSyncChange]

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case correlationID = "correlation_id"
        case fromCursor = "from_cursor"
        case nextCursor = "next_cursor"
        case hasMore = "has_more"
        case oldestCursor = "oldest_cursor"
        case changes
    }

    private enum DecodeKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case correlationID = "correlation_id"
        case fromCursor = "from_cursor"
        case nextCursor = "next_cursor"
        case serverCursor = "server_cursor"
        case hasMore = "has_more"
        case oldestCursor = "oldest_cursor"
        case changes
    }

    init(
        contractVersion: Int = 3,
        correlationID: String = RootineSyncIdentifiers.correlationID(environment: .development),
        fromCursor: Int64? = nil,
        nextCursor: Int64,
        hasMore: Bool = false,
        oldestCursor: Int64? = nil,
        changes: [RootineSyncChange]
    ) {
        self.contractVersion = contractVersion
        self.correlationID = correlationID
        self.fromCursor = fromCursor
        self.nextCursor = nextCursor
        self.hasMore = hasMore
        self.oldestCursor = oldestCursor
        self.changes = changes
    }

    /// Naming used by cursor-expiry responses from the Edge Function.
    var oldestAvailableCursor: Int64? { oldestCursor }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DecodeKeys.self)
        contractVersion = try container.decode(Int.self, forKey: .contractVersion)
        correlationID = try container.decode(String.self, forKey: .correlationID)
        fromCursor = try container.decodeIfPresent(Int64.self, forKey: .fromCursor)
        let explicitNextCursor = try container.decodeIfPresent(Int64.self, forKey: .nextCursor)
        let serverCursor = try container.decodeIfPresent(Int64.self, forKey: .serverCursor)
        nextCursor = explicitNextCursor ?? serverCursor ?? fromCursor ?? 0
        hasMore = try container.decodeIfPresent(Bool.self, forKey: .hasMore) ?? false
        oldestCursor = try container.decodeIfPresent(Int64.self, forKey: .oldestCursor)
        changes = try container.decodeIfPresent([RootineSyncChange].self, forKey: .changes) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(contractVersion, forKey: .contractVersion)
        try container.encode(correlationID, forKey: .correlationID)
        try container.encode(fromCursor ?? 0, forKey: .fromCursor)
        try container.encode(nextCursor, forKey: .nextCursor)
        try container.encode(hasMore, forKey: .hasMore)
        try container.encode(changes, forKey: .changes)
    }
}

struct RootineSyncPushResponse: Codable, Equatable, Sendable, RootineSyncContractVersioned {
    var contractVersion: Int
    var correlationID: String
    var serverCursor: Int64?
    var results: [RootineSyncCommandResult]

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case correlationID = "correlation_id"
        case serverCursor = "server_cursor"
        case results
    }

    private enum DecodeKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case correlationID = "correlation_id"
        case serverCursor = "server_cursor"
        case cursor
        case results
    }

    init(
        contractVersion: Int = 3,
        correlationID: String = RootineSyncIdentifiers.correlationID(environment: .development),
        serverCursor: Int64? = nil,
        results: [RootineSyncCommandResult]
    ) {
        self.contractVersion = contractVersion
        self.correlationID = correlationID
        self.serverCursor = serverCursor
        self.results = results
    }

    var cursor: Int64? { serverCursor }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DecodeKeys.self)
        contractVersion = try container.decode(Int.self, forKey: .contractVersion)
        correlationID = try container.decode(String.self, forKey: .correlationID)
        let explicitServerCursor = try container.decodeIfPresent(Int64.self, forKey: .serverCursor)
        let cursor = try container.decodeIfPresent(Int64.self, forKey: .cursor)
        serverCursor = explicitServerCursor ?? cursor
        results = try container.decodeIfPresent([RootineSyncCommandResult].self, forKey: .results) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(contractVersion, forKey: .contractVersion)
        try container.encode(correlationID, forKey: .correlationID)
        try container.encode(serverCursor ?? 0, forKey: .serverCursor)
        try container.encode(results, forKey: .results)
    }
}

struct RootineSyncDeviceRegistration: Codable, Equatable, Sendable, RootineSyncContractVersioned {
    var contractVersion: Int
    var correlationID: String
    var deviceID: String
    var platform: String
    var appVersion: String
    var environment: RootineSyncEnvironment
    var apnsEnvironment: String?
    var registeredAt: String?

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case correlationID = "correlation_id"
        case deviceID = "device_id"
        case platform
        case appVersion = "app_version"
        case environment
        case apnsEnvironment = "apns_environment"
        case registeredAt = "registered_at"
    }

    init(
        contractVersion: Int = 3,
        correlationID: String = RootineSyncIdentifiers.correlationID(environment: .development),
        deviceID: String,
        platform: String = "ios",
        appVersion: String,
        environment: RootineSyncEnvironment = .development,
        apnsEnvironment: String? = nil,
        registeredAt: String? = nil
    ) {
        self.contractVersion = contractVersion
        self.correlationID = correlationID
        self.deviceID = deviceID
        self.platform = platform
        self.appVersion = appVersion
        self.environment = environment
        self.apnsEnvironment = apnsEnvironment
        self.registeredAt = registeredAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        contractVersion = try container.decode(Int.self, forKey: .contractVersion)
        correlationID = try container.decode(String.self, forKey: .correlationID)
        deviceID = try container.decode(String.self, forKey: .deviceID)
        platform = try container.decodeIfPresent(String.self, forKey: .platform) ?? "ios"
        appVersion = try container.decodeIfPresent(String.self, forKey: .appVersion) ?? "unknown"
        environment = try container.decode(RootineSyncEnvironment.self, forKey: .environment)
        apnsEnvironment = try container.decodeIfPresent(String.self, forKey: .apnsEnvironment)
        registeredAt = try container.decodeIfPresent(String.self, forKey: .registeredAt)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(contractVersion, forKey: .contractVersion)
        try container.encode(correlationID, forKey: .correlationID)
        try container.encode(deviceID, forKey: .deviceID)
        try container.encode(environment, forKey: .environment)
        try container.encodeIfPresent(registeredAt, forKey: .registeredAt)
    }
}

enum RootineSyncRemoteError: LocalizedError, Equatable, Sendable {
    case unauthorized
    case timeout
    case rateLimited(retryAfter: TimeInterval?)
    case server(status: Int)
    case network
    case invalidResponse
    case invalidRequest(String)
    case cursorExpired(oldestCursor: Int64?)
    case schemaMismatch
    case cancelled

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Sesja synchronizacji wygasła."
        case .timeout: return "Synchronizacja przekroczyła limit czasu."
        case .rateLimited: return "Synchronizacja jest chwilowo ograniczona."
        case .server: return "Serwer synchronizacji zwrócił błąd."
        case .network: return "Synchronizacja jest niedostępna bez połączenia."
        case .invalidResponse: return "Serwer synchronizacji zwrócił nieprawidłową odpowiedź."
        case .invalidRequest(let reason): return reason
        case .cursorExpired: return "Kursor synchronizacji wygasł."
        case .schemaMismatch: return "Wersja kontraktu synchronizacji jest niezgodna."
        case .cancelled: return "Synchronizacja została anulowana."
        }
    }

    var isRetryable: Bool {
        switch self {
        case .timeout, .rateLimited, .server, .network: return true
        default: return false
        }
    }
}

enum RootineSyncCursorError: Error, Equatable, Sendable {
    case cursorExpired(oldestAvailable: Int64?)
    case regressed(current: Int64, requested: Int64)
    case invalid
}
