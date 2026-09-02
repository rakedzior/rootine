import Foundation

/// Errors that are safe to recover from by reading the legacy materialized
/// snapshot. They are intentionally separate from `RootineAPIError`: a
/// schema/contract problem must never be mistaken for an empty account.
enum RootineNormalizedReadError: LocalizedError, Equatable, Sendable {
    case schemaMismatch(expected: Int, actual: Int?)
    case contractMismatch(String)
    case cursorExpired
    case materializationFailed(String)

    var errorDescription: String? {
        switch self {
        case .schemaMismatch(let expected, let actual):
            let received = actual.map(String.init) ?? "brak"
            return "Niezgodna wersja modelu relacyjnego (oczekiwano \(expected), otrzymano \(received))."
        case .contractMismatch(let reason):
            return "Niezgodny kontrakt synchronizacji relacyjnej: \(reason)."
        case .cursorExpired:
            return "Cursor synchronizacji relacyjnej wygasł."
        case .materializationFailed(let reason):
            return "Nie udało się złożyć danych relacyjnych: \(reason)."
        }
    }

}

/// Stable read boundary for the cutover. B05's richer push client can be
/// bridged to this protocol without making the aggregate reader depend on
/// command/retry details. AppEnvironment does not know whether the server
/// currently materializes rows or a full bootstrap.
protocol RootineRelationalReadClient: Sendable {
    func bootstrap(accessToken: String) async throws -> RootineRelationalBootstrapResponse
    func pullChanges(cursor: Int64?, limit: Int, accessToken: String) async throws -> RootineRelationalPullResponse
}

typealias RootineNormalizedReadClient = RootineRelationalReadClient

/// Compile-safe boundary for the B05 transport while that ticket is still
/// shadow-only. The coordinator can pass `RootineSyncChange`'s stable fields
/// (including `operation.rawValue` and `record`) here after cherry-picking B05;
/// no second sync model or materializer is introduced in this branch.
enum RootineB05RelationalReadAdapter {
    static func change(
        cursor: Int64,
        entity: String,
        entityID: String,
        operation: String,
        record: JSONValue? = nil,
        revision: Int64? = nil,
        storageKey: String? = nil
    ) -> RootineRelationalPullChange {
        RootineRelationalPullChange(
            cursor: cursor,
            storageKey: storageKey,
            entity: entity,
            entityID: entityID,
            operation: operation,
            revision: revision,
            record: record
        )
    }

    static func bootstrap(
        contractVersion: Int = 3,
        serverCursor: Int64,
        changes: [RootineRelationalPullChange]
    ) -> RootineRelationalBootstrapResponse {
        RootineRelationalBootstrapResponse(
            contractVersion: contractVersion,
            serverCursor: serverCursor,
            changes: changes
        )
    }

    static func pull(
        contractVersion: Int = 3,
        fromCursor: Int64?,
        nextCursor: Int64,
        hasMore: Bool,
        changes: [RootineRelationalPullChange]
    ) -> RootineRelationalPullResponse {
        RootineRelationalPullResponse(
            contractVersion: contractVersion,
            fromCursor: fromCursor,
            nextCursor: nextCursor,
            hasMore: hasMore,
            changes: changes
        )
    }
}

protocol RootineReadFeatureFlagStore: Sendable {
    func normalizedReadEnabled(accountID: String, environment: String) -> Bool
    func setNormalizedReadEnabled(_ enabled: Bool, accountID: String, environment: String)
}

/// Account and environment are part of the key by design. A staging kill
/// switch therefore cannot leak into a production account on the same phone.
final class UserDefaultsRootineReadFeatureFlagStore: RootineReadFeatureFlagStore, @unchecked Sendable {
    private let defaults: UserDefaults
    private let prefix: String

    init(defaults: UserDefaults = .standard, prefix: String = "rootine.feature") {
        self.defaults = defaults
        self.prefix = prefix
    }

    func normalizedReadEnabled(accountID: String, environment: String) -> Bool {
        defaults.object(forKey: key(accountID: accountID, environment: environment)) as? Bool ?? false
    }

    func setNormalizedReadEnabled(_ enabled: Bool, accountID: String, environment: String) {
        defaults.set(enabled, forKey: key(accountID: accountID, environment: environment))
    }

    private func key(accountID: String, environment: String) -> String {
        "\(prefix).normalized_read_enabled.\(environment).\(accountID)"
    }
}

struct RootineRelationalPullChange: Codable, Equatable, Sendable {
    var cursor: Int64
    var storageKey: String?
    var entity: String
    var entityID: String
    var operation: String
    var revision: Int64?
    var record: JSONValue?
    var deletedAt: String?

    init(
        cursor: Int64,
        storageKey: String? = nil,
        entity: String,
        entityID: String,
        operation: String = "upsert",
        revision: Int64? = nil,
        record: JSONValue? = nil,
        deletedAt: String? = nil
    ) {
        self.cursor = cursor
        self.storageKey = storageKey
        self.entity = entity
        self.entityID = entityID
        self.operation = operation
        self.revision = revision
        self.record = record
        self.deletedAt = deletedAt
    }

    enum CodingKeys: String, CodingKey {
        case cursor
        case storageKey = "storage_key"
        case entity
        case entityID = "entity_id"
        case operation
        case revision
        case record
        case row
        case data
        case deletedAt = "deleted_at"
        case deletedAtCamel = "deletedAt"
        case kind
        case op
        case id
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        cursor = try container.decodeIfPresent(Int64.self, forKey: .cursor) ?? 0
        storageKey = try container.decodeIfPresent(String.self, forKey: .storageKey)
        entity = try container.decodeIfPresent(String.self, forKey: .entity)
            ?? (try container.decodeIfPresent(String.self, forKey: .kind))
            ?? ""
        entityID = try Self.stringValue(container, forKey: .entityID)
            ?? Self.stringValue(container, forKey: .id)
            ?? ""
        operation = try container.decodeIfPresent(String.self, forKey: .operation)
            ?? (try container.decodeIfPresent(String.self, forKey: .op))
            ?? "upsert"
        revision = try container.decodeIfPresent(Int64.self, forKey: .revision)
        record = try container.decodeIfPresent(JSONValue.self, forKey: .record)
            ?? container.decodeIfPresent(JSONValue.self, forKey: .row)
            ?? container.decodeIfPresent(JSONValue.self, forKey: .data)
        deletedAt = try container.decodeIfPresent(String.self, forKey: .deletedAt)
            ?? (try container.decodeIfPresent(String.self, forKey: .deletedAtCamel))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(cursor, forKey: .cursor)
        try container.encodeIfPresent(storageKey, forKey: .storageKey)
        try container.encode(entity, forKey: .entity)
        try container.encode(entityID, forKey: .entityID)
        try container.encode(operation, forKey: .operation)
        try container.encodeIfPresent(revision, forKey: .revision)
        try container.encodeIfPresent(record, forKey: .record)
        try container.encodeIfPresent(deletedAt, forKey: .deletedAt)
    }

    private static func stringValue(
        _ container: KeyedDecodingContainer<CodingKeys>,
        forKey key: CodingKeys
    ) throws -> String? {
        if let string = try container.decodeIfPresent(String.self, forKey: key) { return string }
        if let number = try container.decodeIfPresent(Double.self, forKey: key) {
            return number.rounded() == number ? String(Int(number)) : String(number)
        }
        return nil
    }
}

struct RootineRelationalWorkspace: Codable, Equatable, Sendable {
    var storageKey: String
    var revision: Int64
    var payload: JSONValue?
    var entities: [RootineRelationalPullChange]

    init(
        storageKey: String,
        revision: Int64 = 0,
        payload: JSONValue? = nil,
        entities: [RootineRelationalPullChange] = []
    ) {
        self.storageKey = storageKey
        self.revision = revision
        self.payload = payload
        self.entities = entities
    }

    enum CodingKeys: String, CodingKey {
        case storageKey = "storage_key"
        case revision
        case payload
        case record
        case entities
        case changes
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        storageKey = try container.decodeIfPresent(String.self, forKey: .storageKey) ?? ""
        revision = try container.decodeIfPresent(Int64.self, forKey: .revision) ?? 0
        payload = try container.decodeIfPresent(JSONValue.self, forKey: .payload)
            ?? container.decodeIfPresent(JSONValue.self, forKey: .record)
        entities = try container.decodeIfPresent([RootineRelationalPullChange].self, forKey: .entities)
            ?? container.decodeIfPresent([RootineRelationalPullChange].self, forKey: .changes)
            ?? []
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(storageKey, forKey: .storageKey)
        try container.encode(revision, forKey: .revision)
        try container.encodeIfPresent(payload, forKey: .payload)
        try container.encode(entities, forKey: .entities)
    }
}

struct RootineRelationalBootstrapResponse: Codable, Equatable, Sendable {
    var contractVersion: Int
    var serverCursor: Int64
    var oldestCursor: Int64?
    var workspaces: [RootineRelationalWorkspace]
    var changes: [RootineRelationalPullChange]

    init(
        contractVersion: Int = 1,
        serverCursor: Int64,
        oldestCursor: Int64? = nil,
        workspaces: [RootineRelationalWorkspace] = [],
        changes: [RootineRelationalPullChange] = []
    ) {
        self.contractVersion = contractVersion
        self.serverCursor = serverCursor
        self.oldestCursor = oldestCursor
        self.workspaces = workspaces
        self.changes = changes
    }

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case serverCursor = "server_cursor"
        case nextCursor = "next_cursor"
        case oldestCursor = "oldest_cursor"
        case workspaces
        case state
        case changes
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        contractVersion = try container.decodeIfPresent(Int.self, forKey: .contractVersion) ?? 1
        serverCursor = try container.decodeIfPresent(Int64.self, forKey: .serverCursor)
            ?? container.decodeIfPresent(Int64.self, forKey: .nextCursor)
            ?? 0
        oldestCursor = try container.decodeIfPresent(Int64.self, forKey: .oldestCursor)
        workspaces = try container.decodeIfPresent([RootineRelationalWorkspace].self, forKey: .workspaces) ?? []
        changes = try container.decodeIfPresent([RootineRelationalPullChange].self, forKey: .changes) ?? []
        if workspaces.isEmpty,
           let state = try container.decodeIfPresent([String: JSONValue].self, forKey: .state) {
            workspaces = state.map { storageKey, payload in
                RootineRelationalWorkspace(storageKey: storageKey, revision: serverCursor, payload: payload)
            }
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(contractVersion, forKey: .contractVersion)
        try container.encode(serverCursor, forKey: .serverCursor)
        try container.encodeIfPresent(oldestCursor, forKey: .oldestCursor)
        try container.encode(workspaces, forKey: .workspaces)
        try container.encode(changes, forKey: .changes)
    }
}

struct RootineRelationalPullResponse: Codable, Equatable, Sendable {
    var contractVersion: Int
    var fromCursor: Int64?
    var nextCursor: Int64
    var hasMore: Bool
    var oldestCursor: Int64?
    var changes: [RootineRelationalPullChange]

    init(
        contractVersion: Int = 1,
        fromCursor: Int64? = nil,
        nextCursor: Int64,
        hasMore: Bool = false,
        oldestCursor: Int64? = nil,
        changes: [RootineRelationalPullChange] = []
    ) {
        self.contractVersion = contractVersion
        self.fromCursor = fromCursor
        self.nextCursor = nextCursor
        self.hasMore = hasMore
        self.oldestCursor = oldestCursor
        self.changes = changes
    }

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case fromCursor = "from_cursor"
        case nextCursor = "next_cursor"
        case hasMore = "has_more"
        case oldestCursor = "oldest_cursor"
        case changes
    }
}

/// Persisted independently of aggregate revisions. A revision answers
/// “which version of one workspace did I write?”, while this cursor answers
/// “which ordered outbox changes have I applied?”. Mixing them causes missed
/// changes after a restart.
struct RootineNormalizedReadState: Codable, Equatable, Sendable {
    var contractVersion: Int
    var cursor: Int64?
    var documents: [String: JSONValue]

    init(contractVersion: Int = 1, cursor: Int64? = nil, documents: [String: JSONValue] = [:]) {
        self.contractVersion = contractVersion
        self.cursor = cursor
        self.documents = documents
    }
}

struct RootineRelationalMaterialization: Equatable, Sendable {
    var documents: [String: JSONValue]
    var revisions: [String: Int64]

    init(documents: [String: JSONValue] = [:], revisions: [String: Int64] = [:]) {
        self.documents = documents
        self.revisions = revisions
    }
}

/// Converts relational rows into the exact canonical/compact JSON documents
/// already consumed by `WorkspaceModels`. The adapter deliberately starts
/// from the previous full document and only changes the known entity, so
/// web-only keys survive an incremental pull and native round-trip.
enum RootineRelationalWorkspaceAdapter {
    static let supportedContractVersion = 1
    // B03 wraps the v1 relational payload in the sync-v3 transport envelope.
    // Accepting both keeps this cutover deployable while B03/B05 roll out in
    // separate branches; the materialized document schema remains v1.
    static let supportedTransportContractVersions: Set<Int> = [1, 3]

    static func materialize(
        bootstrap: RootineRelationalBootstrapResponse,
        onto base: RootineRelationalMaterialization = RootineRelationalMaterialization()
    ) throws -> RootineRelationalMaterialization {
        try validate(contractVersion: bootstrap.contractVersion)
        var result = base
        for workspace in bootstrap.workspaces {
            let key = try storageKey(for: workspace.storageKey, entity: nil)
            if let payload = workspace.payload { result.documents[key] = try fullDocument(payload, key: key) }
            // Some early B04 materializer responses omit a per-document
            // revision and only expose the global cursor. Treat that cursor
            // as the observed revision so a bootstrap cannot look older than
            // an existing local aggregate merely because `revision` was 0.
            result.revisions[key] = max(max(result.revisions[key] ?? 0, workspace.revision), bootstrap.serverCursor)
            if !workspace.entities.isEmpty {
                let scoped = workspace.entities.map { change -> RootineRelationalPullChange in
                    var copy = change; copy.storageKey = key; return copy
                }
                result = try materialize(changes: scoped, onto: result)
            }
        }
        if !bootstrap.changes.isEmpty { result = try materialize(changes: bootstrap.changes, onto: result) }
        return result
    }

    static func materialize(
        changes: [RootineRelationalPullChange],
        onto base: RootineRelationalMaterialization = RootineRelationalMaterialization()
    ) throws -> RootineRelationalMaterialization {
        var result = base
        for change in changes.sorted(by: { $0.cursor < $1.cursor }) {
            guard !change.entity.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw RootineNormalizedReadError.contractMismatch("brak encji")
            }
            let key = try storageKey(for: change.storageKey, entity: change.entity)
            let operation = normalized(change.operation)
            var document = result.documents[key] ?? emptyDocument(for: key)
            let record = change.record.map(canonicalize)
            if operation == "delete" || operation == "remove" || operation == "tombstone" {
                document = try deleting(document: document, key: key, entity: change.entity, entityID: change.entityID, record: record, deletedAt: change.deletedAt)
            } else if let record {
                document = try upserting(document: document, key: key, entity: change.entity, entityID: change.entityID, record: record)
            }
            result.documents[key] = document
            result.revisions[key] = max(result.revisions[key] ?? 0, change.revision ?? change.cursor)
        }
        return result
    }

    static func document<T: Decodable>(
        _ type: T.Type,
        key: RootineStorageKey,
        from materialization: RootineRelationalMaterialization
    ) throws -> T {
        let rawKey = canonicalStorageKey(for: key)
        guard let payload = materialization.documents[rawKey] else {
            throw RootineNormalizedReadError.materializationFailed("brak \(rawKey)")
        }
        do { return try JSONDecoder().decode(T.self, from: JSONEncoder().encode(payload)) }
        catch { throw RootineNormalizedReadError.materializationFailed("nie można zdekodować \(rawKey)") }
    }

    static func canonicalStorageKey(for key: RootineStorageKey) -> String {
        switch key {
        case .sport: return "rootine-sport-planner-v1"
        case .goals: return "rootine.goals.v1"
        case .work: return "rootine.work-workspace.v1"
        case .travel: return "rootine.travel-workspace.v1"
        case .health: return "rootine.health.workspace.v1"
        default: return key.rawValue
        }
    }

    private static func validate(contractVersion: Int) throws {
        guard supportedTransportContractVersions.contains(contractVersion) else {
            throw RootineNormalizedReadError.schemaMismatch(expected: supportedContractVersion, actual: contractVersion)
        }
    }

    private static func storageKey(for raw: String?, entity: String?) throws -> String {
        let value = normalized(raw ?? "")
        let entityName = normalized(entity ?? "")
        let known = [
            "rootine.task-workspace.v1": "rootine.task-workspace.v1",
            "rootine.nutrition-workspace.v1": "rootine.nutrition-workspace.v1",
            "rootine.notes-workspace.v1": "rootine.notes-workspace.v1",
            "rootine.sport-workspace.v1": "rootine-sport-planner-v1",
            "rootine-sport-planner-v1": "rootine-sport-planner-v1",
            "rootine.goals-workspace.v1": "rootine.goals.v1",
            "rootine.goals.v1": "rootine.goals.v1",
            "rootine.work-workspace.v1": "rootine.work-workspace.v1",
            "rootine.work.v1": "rootine.work-workspace.v1",
            "rootine.travel-workspace.v1": "rootine.travel-workspace.v1",
            "rootine.travel.v1": "rootine.travel-workspace.v1",
            "rootine.health-workspace.v1": "rootine.health.workspace.v1",
            "rootine.health.workspace.v1": "rootine.health.workspace.v1",
            "rootine.affairs.workspace.v1": "rootine.affairs.workspace.v1"
        ]
        let normalizedKnown = known.reduce(into: [String: String]()) { result, pair in
            result[normalized(pair.key)] = pair.value
        }
        if let resolved = normalizedKnown[value] { return resolved }
        if !value.isEmpty { throw RootineNormalizedReadError.contractMismatch("nieznany storage_key \(raw ?? value)") }
        switch entityName {
        case let name where name.hasPrefix("task") || name.hasPrefix("habit"): return RootineStorageKey.tasks.rawValue
        case let name where name.hasPrefix("nutrition") || name == "weight" || name == "weights" || name == "bodymeasurement" || name == "bodymeasurements": return RootineStorageKey.nutrition.rawValue
        case let name where name.hasPrefix("note"): return RootineStorageKey.notes.rawValue
        case let name where name.hasPrefix("sport") || name == "workout" || name == "workouts" || name == "exercise" || name == "exercises" || name == "template" || name == "templates" || name == "cycle" || name == "cycles" || name == "session" || name == "sessions" || name == "history" || name == "execution" || name == "executions": return canonicalStorageKey(for: .sport)
        case let name where name.hasPrefix("goal") || name == "goals" || name == "milestone" || name == "milestones" || name == "progressentry" || name == "progressentries" || name == "category" || name == "categories": return canonicalStorageKey(for: .goals)
        case let name where name.hasPrefix("work") || name == "company" || name == "companies" || name == "project" || name == "projects" || name == "focussession" || name == "focussessions": return canonicalStorageKey(for: .work)
        case let name where name.hasPrefix("travel") || name == "trip" || name == "trips" || name.hasPrefix("tripitinerary") || name == "itineraryitem" || name == "itineraryitems" || name.hasPrefix("tripbooking") || name == "booking" || name == "bookings" || name.hasPrefix("tripbudget") || name == "budgetitem" || name == "budgetitems" || name.hasPrefix("tripdocument") || name == "stay" || name == "stays" || name.hasPrefix("trippacking") || name == "packingitem" || name == "packingitems": return canonicalStorageKey(for: .travel)
        case let name where name.hasPrefix("health") || name == "checkin" || name == "checkins" || name == "reminder" || name == "reminders" || name == "visit" || name == "visits" || name == "test" || name == "tests" || name == "prescription" || name == "prescriptions" || name == "vaccination" || name == "vaccinations": return canonicalStorageKey(for: .health)
        case let name where name.hasPrefix("affair") || name.hasPrefix("jdg") || name == "matter" || name == "matters" || name == "payment" || name == "payments" || name == "subscription" || name == "subscriptions" || name == "document" || name == "documents" || name == "vehicle" || name == "vehicles" || name == "budgetline" || name == "budgetlines" || name == "budgetmonth" || name == "budgetmonths" || name == "attentionstate" || name == "attentionstates": return RootineStorageKey.affairs.rawValue
        default: throw RootineNormalizedReadError.contractMismatch("nieznana encja \(entityName)")
        }
    }

    private static func fullDocument(_ value: JSONValue, key: String) throws -> JSONValue {
        guard case .object(let object) = value else { throw RootineNormalizedReadError.materializationFailed("\(key) nie jest dokumentem") }
        return .object(object.mapValues(canonicalize))
    }

    private static func upserting(document: JSONValue, key: String, entity: String, entityID: String, record: JSONValue) throws -> JSONValue {
        if isFullDocument(record, key: key) { return record }
        if let wrapped = wrappedPayload(record), isFullDocument(wrapped, key: key) { return wrapped }
        guard case .object(var root) = document, case .object(var row) = record else {
            throw RootineNormalizedReadError.materializationFailed("wiersz \(entity) nie jest obiektem")
        }
        let id = stringValue(row["id"]) ?? normalized(entityID)
        if !id.isEmpty { row["id"] = idValue(id, like: row["id"]) }
        let name = normalized(entity)
        switch key {
        case RootineStorageKey.tasks.rawValue: try applyTask(row: row, id: id, entity: name, to: &root)
        case RootineStorageKey.nutrition.rawValue: try applyNutrition(row: row, id: id, entity: name, to: &root)
        case RootineStorageKey.notes.rawValue: try applyNotes(row: row, id: id, entity: name, to: &root)
        case "rootine-sport-planner-v1": try applyCanonicalSport(row: row, id: id, entity: name, to: &root)
        case "rootine.goals.v1": try applyCanonicalGoals(row: row, id: id, entity: name, to: &root)
        case "rootine.work-workspace.v1": try applyCanonicalWork(row: row, id: id, entity: name, to: &root)
        case "rootine.travel-workspace.v1": try applyCanonicalTravel(row: row, id: id, entity: name, to: &root)
        case "rootine.health.workspace.v1": try applyCanonicalHealth(row: row, id: id, entity: name, to: &root)
        case RootineStorageKey.affairs.rawValue: try applyAffairs(row: row, id: id, entity: name, to: &root)
        default: throw RootineNormalizedReadError.contractMismatch("nieobsługiwany dokument \(key)")
        }
        return .object(root)
    }

    private static func deleting(document: JSONValue, key: String, entity: String, entityID: String, record: JSONValue?, deletedAt: String?) throws -> JSONValue {
        guard case .object(var root) = document else { throw RootineNormalizedReadError.materializationFailed("\(key) nie jest obiektem") }
        let id = normalized(entityID.isEmpty ? stringValue(objectValue(record)?["id"]) ?? "" : entityID)
        guard !id.isEmpty else { throw RootineNormalizedReadError.contractMismatch("usuwanie \(entity) bez id") }
        let name = normalized(entity)
        var row = objectValue(record) ?? [:]
        if key == RootineStorageKey.tasks.rawValue && (name == "task" || name == "tasks") {
            let existingID = arrayValue(root["tasks"]).first(where: {
                normalized(stringValue(objectValue($0)?["id"]) ?? "") == normalized(id)
            }).flatMap { objectValue($0)?["id"] }
            row["id"] = idValue(id, like: row["id"] ?? existingID)
            row["deleted"] = .bool(true)
            if let deletedAt { row["deletedAt"] = .string(deletedAt) }
            try upsertArray(&root, key: "tasks", id: id, value: .object(row))
        } else if key == RootineStorageKey.tasks.rawValue && (name == "tasksubtask" || name == "tasksubtasks" || name == "subtask" || name == "subtasks" || name == "taskcomment" || name == "taskcomments" || name == "comment" || name == "comments") {
            let parentID = stringValue(row["taskId"] ?? row["task_id"]) ?? ""
            let childKey = name.contains("comment") ? "comments" : "subtasks"
            if !parentID.isEmpty {
                try updateArrayObject(&root, key: "tasks", id: parentID) { task in
                    task[childKey] = .array(arrayValue(task[childKey]).filter {
                        normalized(stringValue(objectValue($0)?["id"]) ?? "") != id
                    })
                }
            }
        } else if key == RootineStorageKey.notes.rawValue && (name == "notechecklistitem" || name == "notechecklistitems" || name == "checklistitem" || name == "checklistitems" || name == "notetag" || name == "notetags") {
            let noteID = stringValue(row["noteId"] ?? row["note_id"]) ?? ""
            if name.contains("checklist") && !noteID.isEmpty {
                try updateArrayObject(&root, key: "notes", id: noteID) { note in
                    note["items"] = .array(arrayValue(note["items"]).filter {
                        normalized(stringValue(objectValue($0)?["id"]) ?? "") != id
                    })
                }
            } else if !noteID.isEmpty {
                try updateArrayObject(&root, key: "notes", id: noteID) { note in
                    note["tags"] = .array(stringArray(note["tags"]).filter { normalized($0) != id }.map(JSONValue.string))
                }
            }
        } else if key == "rootine.travel-workspace.v1" && name != "trip" && name != "trips" && name != "traveltrip" && name != "traveltrips" {
            let tripID = stringValue(row["tripId"] ?? row["trip_id"]) ?? ""
            let child: String
            switch name {
            case "travelitineraryitem", "travelitineraryitems", "itineraryitem", "itineraryitems": child = "itinerary"
            case "travelbooking", "travelbookings", "booking", "bookings", "travelstay", "travelstays", "stay", "stays": child = "stays"
            case "travelbudgetitem", "travelbudgetitems", "budgetitem", "budgetitems": child = "budget"
            case "traveldocument", "traveldocuments": child = "documents"
            case "travelpackingitem", "travelpackingitems", "packingitem", "packingitems": child = "packingItems"
            case "traveltask", "traveltasks": child = "tasks"
            default: child = ""
            }
            if !tripID.isEmpty && !child.isEmpty {
                try updateArrayObject(&root, key: "trips", id: tripID) { trip in
                    trip[child] = .array(arrayValue(trip[child]).filter {
                        normalized(stringValue(objectValue($0)?["id"]) ?? "") != id
                    })
                }
            }
        } else if key == RootineStorageKey.affairs.rawValue && (name == "affairbudgetline" || name == "affairbudgetlines" || name == "budgetline" || name == "budgetlines") {
            let month = stringValue(row["month"] ?? row["budgetMonth"] ?? row["budget_month"]) ?? ""
            if !month.isEmpty {
                try updateArrayObject(&root, key: "budgets", id: month) { budget in
                    budget["lines"] = .array(arrayValue(budget["lines"]).filter {
                        normalized(stringValue(objectValue($0)?["id"]) ?? "") != id
                    })
                }
            }
        } else if let collection = collectionKey(for: name, document: key) {
            if collection.dictionary {
                if case .object(var dictionary) = root[collection.key] { dictionary.removeValue(forKey: id); root[collection.key] = .object(dictionary) }
            } else { removeArray(&root, key: collection.key, id: id) }
        }
        return .object(root)
    }

    // MARK: Domain row adapters

    private static func applyTask(row: [String: JSONValue], id: String, entity: String, to root: inout [String: JSONValue]) throws {
        switch entity {
        case "task", "tasks":
            var value = row
            let existingID = arrayValue(root["tasks"]).first(where: {
                normalized(stringValue(objectValue($0)?["id"]) ?? "") == normalized(id)
            }).flatMap { objectValue($0)?["id"] }
            value["id"] = idValue(id, like: row["id"] ?? existingID)
            value["text"] = row["text"] ?? row["title"] ?? .string("")
            value["done"] = row["done"] ?? row["completed"] ?? .bool(false)
            value["view"] = row["view"] ?? .string("dzis")
            try upsertArray(&root, key: "tasks", id: id, value: .object(value))
        case "habit", "habits":
            var value = row
            value["id"] = numericID(id, namespace: "relational-habit", like: row["id"])
            value["name"] = row["name"] ?? row["title"] ?? .string("")
            value["streak"] = row["streak"] ?? .number(0)
            value["done"] = row["done"] ?? .bool(false)
            try upsertArray(&root, key: "habits", id: id, value: .object(value))
        case "tasklist", "tasklists", "list", "lists":
            var value = row
            value["id"] = .string(id)
            value["label"] = row["label"] ?? row["name"] ?? .string("")
            value["color"] = row["color"] ?? .string("")
            try upsertArray(&root, key: "lists", id: id, value: .object(value))
        case "tasktag", "tasktags", "tag", "tags":
            var value = row
            value["id"] = .string(id)
            value["label"] = row["label"] ?? row["name"] ?? .string("")
            value["color"] = row["color"] ?? .string("")
            try upsertArray(&root, key: "tags", id: id, value: .object(value))
        case "tasksubtask", "tasksubtasks", "subtask", "subtasks":
            try applyNestedTaskRow(row, id: id, parentKey: "taskId", childKey: "subtasks", to: &root)
        case "taskcomment", "taskcomments", "comment", "comments":
            try applyNestedTaskRow(row, id: id, parentKey: "taskId", childKey: "comments", to: &root)
        case "tasksummarynote", "tasksummarynotes", "summarynote", "summarynotes":
            // Summary notes are a web-only task projection. Keep them in the
            // aggregate document even though WorkspaceTask does not surface
            // the collection yet.
            try upsertArray(&root, key: "summaryNotes", id: id, value: .object(row))
        case "taskschedule", "taskschedules", "schedule", "schedules":
            let parentID = stringValue(row["taskId"] ?? row["task_id"]) ?? id
            var schedule = row
            schedule.removeValue(forKey: "taskId")
            schedule.removeValue(forKey: "task_id")
            try updateArrayObject(&root, key: "tasks", id: parentID) { task in task["schedule"] = .object(schedule) }
        case "taskcompletion", "taskcompletions", "completion", "completions":
            let parentID = stringValue(row["taskId"] ?? row["task_id"]) ?? id
            let date = stringValue(row["date"] ?? row["completedDate"]) ?? ""
            guard !date.isEmpty else { return }
            try updateArrayObject(&root, key: "tasks", id: parentID) { task in
                var schedule = objectValue(task["schedule"]) ?? defaultTaskSchedule()
                var dates = stringArray(schedule["completedDates"])
                if !dates.contains(date) { dates.append(date); dates.sort() }
                schedule["completedDates"] = .array(dates.map(JSONValue.string))
                if let completedAt = stringValue(row["completedAt"] ?? row["completed_at"]) {
                    var byDate = objectValue(schedule["completedAtByDate"]) ?? [:]
                    byDate[date] = .string(completedAt)
                    schedule["completedAtByDate"] = .object(byDate)
                }
                task["schedule"] = .object(schedule)
            }
        case "habitschedule", "habitschedules":
            let parentID = stringValue(row["habitId"] ?? row["habit_id"]) ?? id
            var schedule: [String: JSONValue] = row
            schedule["type"] = row["scheduleType"] ?? row["schedule_type"] ?? .string("daily")
            schedule["startDate"] = row["startsOn"] ?? row["starts_on"] ?? .string(RootineDate.localDate())
            schedule["endDate"] = row["endsOn"] ?? row["ends_on"] ?? .null
            schedule.removeValue(forKey: "habitId")
            schedule.removeValue(forKey: "habit_id")
            try updateArrayObject(&root, key: "habits", id: parentID) { habit in habit["schedule"] = .object(schedule) }
        case "habitcompletion", "habitcompletions":
            let parentID = stringValue(row["habitId"] ?? row["habit_id"]) ?? id
            let date = stringValue(row["completedOn"] ?? row["completed_on"]) ?? ""
            guard !date.isEmpty else { return }
            try updateArrayObject(&root, key: "habits", id: parentID) { habit in
                var dates = stringArray(habit["completedDates"])
                if !dates.contains(date) { dates.append(date); dates.sort() }
                habit["completedDates"] = .array(dates.map(JSONValue.string))
            }
        case "habitpauseperiod", "habitpauseperiods":
            let parentID = stringValue(row["habitId"] ?? row["habit_id"]) ?? id
            var pause: [String: JSONValue] = [
                "startDate": row["startsOn"] ?? row["starts_on"] ?? .string(RootineDate.localDate())
            ]
            pause["endDate"] = row["endsOn"] ?? row["ends_on"] ?? .null
            try updateArrayObject(&root, key: "habits", id: parentID) { habit in
                var pauses = arrayValue(habit["pausePeriods"])
                upsert(&pauses, id: id, value: .object(pause)); habit["pausePeriods"] = .array(pauses)
            }
        default:
            throw RootineNormalizedReadError.contractMismatch("nieznana encja zadań \(entity)")
        }
    }

    private static func applyNutrition(row: [String: JSONValue], id: String, entity: String, to root: inout [String: JSONValue]) throws {
        switch entity {
        case "nutritionday", "nutritiondays", "day", "days":
            var value = row
            let date = stringValue(row["date"] ?? row["day"]) ?? id
            value["date"] = .string(date)
            if value["entries"] == nil { value["entries"] = defaultNutritionEntries() }
            upsertDictionary(&root, key: "days", id: date, value: .object(value))
        case "nutritionentry", "nutritionentries", "entry", "entries":
            let dayID = stringValue(row["dayId"] ?? row["day_id"] ?? row["date"]) ?? ""
            guard !dayID.isEmpty else { throw RootineNormalizedReadError.contractMismatch("wpis żywieniowy bez dnia") }
            var entry = row
            entry["id"] = .string(id)
            entry["name"] = row["name"] ?? row["title"] ?? .string("")
            entry["portion"] = row["portion"] ?? .string("")
            for field in ["calories", "protein", "carbs", "fat"] where entry[field] == nil { entry[field] = .number(0) }
            let meal = normalized(stringValue(row["meal"] ?? row["mealType"] ?? row["meal_type"]) ?? "dinner")
            try updateDictionaryObject(&root, key: "days", id: dayID) { day in
                var entries = objectValue(day["entries"]) ?? defaultNutritionEntriesObject()
                var mealRows = arrayValue(entries[meal])
                upsert(&mealRows, id: id, value: .object(entry))
                entries[meal] = .array(mealRows)
                day["entries"] = .object(entries)
            }
        case "nutritiongoal", "nutritiongoals", "goal", "goals":
            var value = row
            for field in ["calories", "protein", "carbs", "fat", "waterMl"] where value[field] == nil { value[field] = .number(0) }
            root["goals"] = .object(value)
        case "nutritionprofile", "nutritionprofiles", "profile", "profiles":
            root["calculatorProfile"] = .object(row)
        case "nutritionweightmeasurement", "nutritionweightmeasurements", "weightmeasurement", "weightmeasurements", "weight":
            let date = stringValue(row["date"]) ?? id
            upsertDictionary(&root, key: "weightMeasurements", id: date, value: .object(row))
        case "nutritionbodymeasurement", "nutritionbodymeasurements", "bodymeasurement", "bodymeasurements":
            let date = stringValue(row["date"]) ?? id
            var dates = objectValue(root["bodyMeasurements"]) ?? [:]
            var values = arrayValue(dates[date])
            upsert(&values, id: id, value: .object(row))
            dates[date] = .array(values)
            root["bodyMeasurements"] = .object(dates)
        case "nutritioncustommeal", "nutritioncustommeals", "custommeal", "custommeals":
            try upsertArray(&root, key: "customMeals", id: id, value: .object(row))
        case "nutritioncustommealingredient", "nutritioncustommealingredients", "custommealingredient", "custommealingredients":
            let mealID = stringValue(row["mealId"] ?? row["meal_id"] ?? row["customMealId"] ?? row["custom_meal_id"]) ?? ""
            guard !mealID.isEmpty else { throw RootineNormalizedReadError.contractMismatch("składnik bez posiłku") }
            try updateArrayObject(&root, key: "customMeals", id: mealID) { meal in
                var ingredients = arrayValue(meal["ingredients"])
                upsert(&ingredients, id: id, value: .object(row))
                meal["ingredients"] = .array(ingredients)
            }
        default:
            throw RootineNormalizedReadError.contractMismatch("nieznana encja odżywiania \(entity)")
        }
    }

    private static func applyNotes(row: [String: JSONValue], id: String, entity: String, to root: inout [String: JSONValue]) throws {
        switch entity {
        case "notelist", "notelists", "list", "lists":
            try upsertArray(&root, key: "lists", id: id, value: .object(row))
        case "note", "notes":
            var value = row
            value["id"] = .string(id)
            value["title"] = row["title"] ?? .string("")
            value["body"] = row["body"] ?? .string("")
            value["kind"] = row["kind"] ?? .string("text")
            value["items"] = row["items"] ?? .array([])
            value["tags"] = row["tags"] ?? .array([])
            value["listId"] = row["listId"] ?? row["list_id"] ?? .string("")
            value["color"] = row["color"] ?? .string("graphite")
            value["pinned"] = row["pinned"] ?? .bool(false)
            value["archived"] = row["archived"] ?? .bool(false)
            try upsertArray(&root, key: "notes", id: id, value: .object(value))
        case "notechecklistitem", "notechecklistitems", "checklistitem", "checklistitems":
            let noteID = stringValue(row["noteId"] ?? row["note_id"]) ?? ""
            guard !noteID.isEmpty else { throw RootineNormalizedReadError.contractMismatch("element checklisty bez notatki") }
            try updateArrayObject(&root, key: "notes", id: noteID) { note in
                var items = arrayValue(note["items"])
                upsert(&items, id: id, value: .object(row))
                note["items"] = .array(items)
            }
        case "notetag", "notetags", "tag", "tags":
            let noteID = stringValue(row["noteId"] ?? row["note_id"]) ?? ""
            guard !noteID.isEmpty else {
                // B03 exposes note_tags as a reusable catalogue; the
                // note_tag_links relation is intentionally not part of the
                // pull allow-list. Retain the catalogue row until a note
                // association arrives instead of treating it as malformed.
                try upsertArray(&root, key: "tagRecords", id: id, value: .object(row))
                return
            }
            try updateArrayObject(&root, key: "notes", id: noteID) { note in
                var tags = stringArray(note["tags"])
                let label = stringValue(row["label"] ?? row["name"]) ?? id
                if !tags.contains(label) { tags.append(label); tags.sort() }
                note["tags"] = .array(tags.map(JSONValue.string))
            }
        default:
            throw RootineNormalizedReadError.contractMismatch("nieznana encja notatek \(entity)")
        }
    }

    private static func applyCanonicalSport(row: [String: JSONValue], id: String, entity: String, to root: inout [String: JSONValue]) throws {
        var value = row
        value["id"] = .string(id)
        switch entity {
        case "sportexercise", "sportexercises", "exercise", "exercises":
            try upsertArray(&root, key: "exercises", id: id, value: .object(value)); return
        case "sporttemplate", "sporttemplates", "template", "templates":
            value["name"] = row["name"] ?? .string("Trening")
            try upsertArray(&root, key: "templates", id: id, value: .object(value)); return
        case "sporttemplatesection", "sporttemplatesections":
            try upsertArray(&root, key: "templateSections", id: id, value: .object(value)); return
        case "sporttemplateitem", "sporttemplateitems":
            try upsertArray(&root, key: "templateItems", id: id, value: .object(value)); return
        case "sportcycle", "sportcycles", "cycle", "cycles":
            value["name"] = row["name"] ?? .string("Cykl treningowy")
            value["startDate"] = row["startsOn"] ?? row["starts_on"] ?? .string(RootineDate.localDate())
            value["weeks"] = row["weeks"] ?? .number(1)
            value["repeatWeekly"] = row["repeatWeekly"] ?? row["repeat_weekly"] ?? .bool(false)
            value["workouts"] = row["workouts"] ?? .array([])
            value["updatedAt"] = row["updatedAt"] ?? row["updated_at"] ?? .string(RootineDate.isoTimestamp())
            try upsertArray(&root, key: "cycles", id: id, value: .object(value)); return
        case "sportcycleworkout", "sportcycleworkouts":
            value["planId"] = row["templateId"] ?? row["template_id"] ?? .string("relational")
            value["date"] = row["scheduledOn"] ?? row["scheduled_on"] ?? .string(RootineDate.localDate())
            value["name"] = row["name"] ?? row["title"] ?? .string("Trening")
            value["sportCategory"] = row["sportCategory"] ?? row["discipline"] ?? .string("custom")
            value["plannedDuration"] = row["plannedDuration"] ?? row["durationMinutes"] ?? .number(1)
            value["status"] = row["status"] ?? .string("scheduled")
            value["contentSnapshot"] = row["contentSnapshot"] ?? .array([])
            value["createdAt"] = row["createdAt"] ?? row["created_at"] ?? .string(RootineDate.isoTimestamp())
            value["updatedAt"] = row["updatedAt"] ?? row["updated_at"] ?? .string(RootineDate.isoTimestamp())
            try upsertArray(&root, key: "scheduledWorkouts", id: id, value: .object(value)); return
        case "sportsession", "sportsessions", "session", "sessions":
            let startedAt = stringValue(row["startedAt"] ?? row["started_at"]) ?? RootineDate.isoTimestamp()
            let endedAt = stringValue(row["endedAt"] ?? row["ended_at"])
            value["cycleWorkoutId"] = row["cycleWorkoutId"] ?? row["cycle_workout_id"] ?? .null
            value["title"] = row["title"] ?? row["notes"] ?? .string("Sesja treningowa")
            value["discipline"] = row["discipline"] ?? .string("custom")
            value["date"] = .string(String(startedAt.prefix(10)))
            value["plannedDurationMinutes"] = row["plannedDurationMinutes"] ?? .number(0)
            value["durationMinutes"] = row["durationMinutes"] ?? .number(0)
            value["status"] = row["status"] ?? (endedAt == nil ? .string("in_progress") : .string("completed"))
            value["exercises"] = row["exercises"] ?? .array([])
            value["updatedAt"] = row["updatedAt"] ?? row["updated_at"] ?? endedAt.map(JSONValue.string) ?? .string(startedAt)
            try upsertArray(&root, key: "sessions", id: id, value: .object(value)); return
        case "sportsessionset", "sportsessionsets":
            try upsertArray(&root, key: "sessionSets", id: id, value: .object(value)); return
        case "sporthistory", "sporthistories", "history", "histories":
            value["title"] = row["title"] ?? row["name"] ?? .string("Trening")
            value["discipline"] = row["discipline"] ?? .string("custom")
            value["date"] = row["occurredOn"] ?? row["occurred_on"] ?? row["date"] ?? .string(RootineDate.localDate())
            value["plannedDurationMinutes"] = row["plannedDurationMinutes"] ?? .number(0)
            value["durationMinutes"] = row["durationMinutes"] ?? .number(0)
            value["status"] = row["status"] ?? .string("completed")
            value["updatedAt"] = row["updatedAt"] ?? row["updated_at"] ?? .string(RootineDate.isoTimestamp())
            try upsertArray(&root, key: "history", id: id, value: .object(value)); return
        case "sportoutcome", "sportoutcomes", "outcome", "outcomes":
            value["status"] = row["status"] ?? row["outcome"] ?? .string("completed")
            value["sessionId"] = row["sessionId"] ?? row["session_id"] ?? .null
            value["updatedAt"] = row["updatedAt"] ?? row["updated_at"] ?? .string(RootineDate.isoTimestamp())
            var values = objectValue(root["workoutOutcomes"]) ?? [:]
            values[id] = .object(value)
            root["workoutOutcomes"] = .object(values)
            return
        case "sportscheduledworkout", "sportscheduledworkouts", "scheduledworkout", "scheduledworkouts", "workout", "workouts":
            value["planId"] = row["planId"] ?? row["plan_id"] ?? .string("relational")
            value["date"] = row["date"] ?? row["scheduledOn"] ?? row["scheduled_on"] ?? .string(RootineDate.localDate())
            value["name"] = row["name"] ?? row["title"] ?? .string("Trening")
            value["sportCategory"] = row["sportCategory"] ?? row["discipline"] ?? .string("custom")
            value["plannedDuration"] = row["plannedDuration"] ?? row["durationMinutes"] ?? .number(1)
            value["status"] = row["status"] ?? .string("scheduled")
            value["contentSnapshot"] = row["contentSnapshot"] ?? .array([])
            value["createdAt"] = row["createdAt"] ?? row["created_at"] ?? .string(RootineDate.isoTimestamp())
            value["updatedAt"] = row["updatedAt"] ?? row["updated_at"] ?? .string(RootineDate.isoTimestamp())
            try upsertArray(&root, key: "scheduledWorkouts", id: id, value: .object(value)); return
        case "sportexecution", "sportexecutions", "execution", "executions":
            try upsertArray(&root, key: "executions", id: id, value: .object(value)); return
        default: throw RootineNormalizedReadError.contractMismatch("nieznana encja sportu \(entity)")
        }
    }

    private static func applyCanonicalGoals(row: [String: JSONValue], id: String, entity: String, to root: inout [String: JSONValue]) throws {
        var value = row
        value["id"] = .string(id)
        switch entity {
        case "goal", "goals":
            value["title"] = row["title"] ?? .string("Cel")
            value["description"] = row["description"] ?? .string("")
            value["categoryId"] = row["categoryId"] ?? row["category_id"] ?? .string("")
            value["iconKey"] = row["iconKey"] ?? row["icon"] ?? .string("target")
            value["color"] = row["color"] ?? .string("#8793A1")
            value["status"] = row["status"] ?? .string("active")
            value["health"] = row["health"] ?? .string("unknown")
            value["priority"] = row["priority"] ?? .string("medium")
            value["startDate"] = row["startDate"] ?? row["start_date"] ?? .string(RootineDate.localDate())
            value["dueDate"] = row["dueDate"] ?? row["due_date"] ?? value["startDate"]!
            value["progressMode"] = row["progressMode"] ?? row["progress_mode"] ?? .string("manual")
            value["initialValue"] = row["initialValue"] ?? row["initial_value"] ?? .number(0)
            value["targetValue"] = row["targetValue"] ?? row["target_value"] ?? .number(1)
            value["unit"] = row["unit"] ?? .string("")
            value["manualProgress"] = row["manualProgress"] ?? row["manual_progress"] ?? .number(0)
            value["milestones"] = row["milestones"] ?? .array([])
            value["progressEntries"] = row["progressEntries"] ?? .array([])
            value["note"] = row["note"] ?? .string("")
            value["createdAt"] = row["createdAt"] ?? row["created_at"] ?? .string(RootineDate.isoTimestamp())
            value["updatedAt"] = row["updatedAt"] ?? row["updated_at"] ?? value["createdAt"]!
            try upsertArray(&root, key: "goals", id: id, value: .object(value)); return
        case "goalmilestone", "goalmilestones", "milestone", "milestones":
            value["title"] = row["title"] ?? .string("Etap")
            value["dueDate"] = row["dueDate"] ?? row["due_date"] ?? .string(RootineDate.localDate())
            value["done"] = row["done"] ?? .bool(false)
            value["weight"] = row["weight"] ?? .number(1)
            try attachGoalChild(&root, parentID: stringValue(row["goalId"] ?? row["goal_id"]), collection: "milestones", id: id, value: .object(value)); return
        case "goalprogressentry", "goalprogressentries", "progressentry", "progressentries":
            value["date"] = row["entryDate"] ?? row["entry_date"] ?? row["date"] ?? .string(RootineDate.localDate())
            value["value"] = row["value"] ?? .number(0)
            value["kind"] = row["kind"] ?? .string("absolute")
            value["note"] = row["note"] ?? .string("")
            value["createdAt"] = row["createdAt"] ?? row["created_at"] ?? .string(RootineDate.isoTimestamp())
            try attachGoalChild(&root, parentID: stringValue(row["goalId"] ?? row["goal_id"]), collection: "progressEntries", id: id, value: .object(value)); return
        case "goalcategory", "goalcategories", "category", "categories":
            value["label"] = row["name"] ?? row["label"] ?? .string("Kategoria")
            value["color"] = row["color"] ?? .string("#8793A1")
            value["iconKey"] = row["iconKey"] ?? .string("circle")
            try upsertArray(&root, key: "categories", id: id, value: .object(value)); return
        case "goalnote", "goalnotes":
            try attachGoalChild(&root, parentID: stringValue(row["goalId"] ?? row["goal_id"]), collection: "goalNotes", id: id, value: .object(value)); return
        default: throw RootineNormalizedReadError.contractMismatch("nieznana encja celów \(entity)")
        }
    }

    private static func attachGoalChild(
        _ root: inout [String: JSONValue],
        parentID: String?,
        collection: String,
        id: String,
        value: JSONValue
    ) throws {
        guard let parentID, !parentID.isEmpty else {
            try upsertArray(&root, key: "orphan\(collection)", id: id, value: value)
            return
        }
        var goals = arrayValue(root["goals"])
        guard let index = goals.firstIndex(where: { normalized(stringValue(objectValue($0)?["id"]) ?? "") == normalized(parentID) }),
              case .object(var goal) = goals[index] else {
            try upsertArray(&root, key: "orphan\(collection)", id: id, value: value)
            return
        }
        var children = arrayValue(goal[collection])
        upsert(&children, id: id, value: value)
        goal[collection] = .array(children)
        goals[index] = .object(goal)
        root["goals"] = .array(goals)
    }

    private static func applyCanonicalWork(row: [String: JSONValue], id: String, entity: String, to root: inout [String: JSONValue]) throws {
        var value = row
        value["id"] = .string(id)
        let collection: String
        switch entity {
        case "workcompany", "workcompanies", "company", "companies": collection = "companies"
        case "workproject", "workprojects", "project", "projects": collection = "projects"
        case "worktask", "worktasks": collection = "tasks"
        case "workfocussession", "workfocussessions", "focussession", "focussessions":
            value["startedAt"] = row["startedAt"] ?? row["started_at"] ?? .string(RootineDate.isoTimestamp())
            value["endedAt"] = row["endedAt"] ?? row["ended_at"] ?? value["startedAt"]!
            value["minutes"] = row["minutes"] ?? row["durationMinutes"] ?? row["duration_minutes"] ?? .number(0)
            try upsertArray(&root, key: "focusSessions", id: id, value: .object(value)); return
        default: throw RootineNormalizedReadError.contractMismatch("nieznana encja pracy \(entity)")
        }
        if collection == "companies" { value["name"] = row["name"] ?? .string("Firma") }
        if collection == "projects" { value["name"] = row["name"] ?? .string("Projekt") }
        if collection == "tasks" { value["title"] = row["title"] ?? .string("Zadanie") }
        try upsertArray(&root, key: collection, id: id, value: .object(value))
    }

    private static func applyCanonicalTravel(row: [String: JSONValue], id: String, entity: String, to root: inout [String: JSONValue]) throws {
        if entity == "trip" || entity == "trips" || entity == "traveltrip" || entity == "traveltrips" {
            var value = row
            value["id"] = .string(id)
            value["name"] = row["name"] ?? .string("Podróż")
            value["destination"] = row["destination"] ?? .string("")
            value["startDate"] = row["startDate"] ?? row["start_date"] ?? .string(RootineDate.localDate())
            value["endDate"] = row["endDate"] ?? row["end_date"] ?? value["startDate"]!
            value["status"] = row["status"] ?? .string("planning")
            value["travelers"] = row["travelers"] ?? .array([])
            value["baseCurrency"] = row["baseCurrency"] ?? row["base_currency"] ?? .string("PLN")
            value["note"] = row["note"] ?? .string("")
            value["stays"] = row["stays"] ?? .array([])
            value["transports"] = row["transports"] ?? .array([])
            value["itinerary"] = row["itinerary"] ?? .array([])
            value["budget"] = row["budget"] ?? .array([])
            value["documents"] = row["documents"] ?? .array([])
            value["tasks"] = row["tasks"] ?? .array([])
            try upsertArray(&root, key: "trips", id: id, value: .object(value)); return
        }
        let tripID = stringValue(row["tripId"] ?? row["trip_id"]) ?? ""
        guard !tripID.isEmpty else { throw RootineNormalizedReadError.contractMismatch("element podróży bez trip") }
        let child: String
        switch entity {
        case "travelitineraryitem", "travelitineraryitems", "tripitineraryitem", "tripitineraryitems", "itineraryitem", "itineraryitems": child = "itinerary"
        case "travelbooking", "travelbookings", "tripbooking", "tripbookings", "booking", "bookings", "travelstay", "travelstays", "tripstay", "tripstays", "stay", "stays": child = "stays"
        case "travelbudgetitem", "travelbudgetitems", "tripbudgetitem", "tripbudgetitems", "budgetitem", "budgetitems": child = "budget"
        case "traveldocument", "traveldocuments", "tripdocument", "tripdocuments": child = "documents"
        case "travelpackingitem", "travelpackingitems", "trippackingitem", "trippackingitems", "packingitem", "packingitems": child = "packingItems"
        case "traveltask", "traveltasks": child = "tasks"
        default: throw RootineNormalizedReadError.contractMismatch("nieznana encja podróży \(entity)")
        }
        var value = row
        value["id"] = .string(id)
        if child == "itinerary" {
            value["date"] = row["date"] ?? .string(RootineDate.localDate())
            value["time"] = row["time"] ?? .string("")
            value["title"] = row["title"] ?? .string("Aktywność")
            value["location"] = row["location"] ?? .string("")
            value["kind"] = row["kind"] ?? .string("activity")
            value["note"] = row["note"] ?? .string("")
            value["reserved"] = row["reserved"] ?? .bool(false)
        }
        try updateArrayObject(&root, key: "trips", id: tripID) { trip in
            var values = arrayValue(trip[child]); upsert(&values, id: id, value: .object(value)); trip[child] = .array(values)
        }
    }

    private static func applyCanonicalHealth(row: [String: JSONValue], id: String, entity: String, to root: inout [String: JSONValue]) throws {
        var value = row
        value["id"] = .string(id)
        switch entity {
        case "healthcheckin", "healthcheckins", "checkin", "checkins":
            var values = objectValue(root["checkIns"]) ?? [:]
            let date = stringValue(row["date"] ?? row["checkinDate"] ?? row["checkin_date"]) ?? id
            value["date"] = .string(date)
            value["energy"] = row["energy"] ?? row["mood"] ?? .number(0)
            value["updatedAt"] = row["updatedAt"] ?? row["updated_at"] ?? .string(RootineDate.isoTimestamp())
            values[date] = .object(value); root["checkIns"] = .object(values)
        case "healthreminder", "healthreminders", "reminder", "reminders":
            value["title"] = row["title"] ?? .string("Przypomnienie")
            value["detail"] = row["detail"] ?? row["note"] ?? .string("")
            value["completedDates"] = row["completedDates"] ?? .array([])
            try upsertArray(&root, key: "reminders", id: id, value: .object(value))
        case "healthvisit", "healthvisits", "healthtest", "healthtests", "healthprescription", "healthprescriptions", "healthvaccination", "healthvaccinations", "visit", "visits", "test", "tests", "prescription", "prescriptions", "vaccination", "vaccinations":
            value["title"] = row["title"] ?? row["provider"] ?? row["testType"] ?? row["test_type"] ?? row["medication"] ?? row["vaccine"] ?? .string("Wpis zdrowotny")
            value["kind"] = row["kind"] ?? .string(entity)
            let dueDate = row["dueDate"]
                ?? row["visitAt"]
                ?? row["visit_at"]
                ?? row["testedAt"]
                ?? row["tested_at"]
                ?? row["administeredOn"]
                ?? row["administered_on"]
                ?? row["startsOn"]
                ?? row["starts_on"]
                ?? .string(RootineDate.localDate())
            value["dueDate"] = dueDate
            value["time"] = row["time"] ?? .string("")
            value["location"] = row["location"] ?? row["provider"] ?? .string("")
            value["note"] = row["note"] ?? row["notes"] ?? .string("")
            value["status"] = row["status"] ?? .string("planned")
            value["createdAt"] = row["createdAt"] ?? row["created_at"] ?? .string(RootineDate.isoTimestamp())
            try upsertArray(&root, key: "entries", id: id, value: .object(value))
        default: throw RootineNormalizedReadError.contractMismatch("nieznana encja zdrowia \(entity)")
        }
    }

    private static func applyAffairs(row: [String: JSONValue], id: String, entity: String, to root: inout [String: JSONValue]) throws {
        var value = row
        value["id"] = .string(id)
        let collection: String
        switch entity {
        case "affairmatter", "affairmatters", "matter", "matters":
            value["title"] = row["title"] ?? row["description"] ?? .string("Sprawa")
            value["category"] = row["category"] ?? .string("finanse")
            value["priority"] = row["priority"] ?? .string("medium")
            value["status"] = row["status"] ?? .string("open")
            value["dueDate"] = row["dueDate"] ?? row["due_date"] ?? .string(RootineDate.localDate())
            value["note"] = row["note"] ?? row["description"] ?? .string("")
            value["createdAt"] = row["createdAt"] ?? row["created_at"] ?? .string(RootineDate.isoTimestamp())
            collection = "matters"
        case "affaironetimepayment", "affaironetimepayments", "onetimepayment", "onetimepayments":
            value["title"] = row["title"] ?? row["description"] ?? .string("Płatność")
            value["category"] = row["category"] ?? .string("finanse")
            value["amount"] = row["amount"] ?? row["amountMinor"] ?? row["amount_minor"] ?? .number(0)
            value["dueDate"] = row["dueDate"] ?? row["due_date"] ?? .string(RootineDate.localDate())
            value["paid"] = row["paid"] ?? row["status"].map { value in stringValue(value) == "paid" ? .bool(true) : .bool(false) } ?? .bool(false)
            value["paidAt"] = row["paidAt"] ?? row["paid_at"] ?? .string("")
            value["note"] = row["note"] ?? row["description"] ?? .string("")
            collection = "oneTimePayments"
        case "affairrecurringpayment", "affairrecurringpayments", "recurringpayment", "recurringpayments", "payment", "payments":
            value["name"] = row["name"] ?? row["description"] ?? .string("Płatność")
            value["category"] = row["category"] ?? .string("finanse")
            value["amount"] = row["amount"] ?? row["amountMinor"] ?? row["amount_minor"] ?? .number(0)
            value["cadence"] = row["cadence"] ?? .string("monthly")
            value["nextDueDate"] = row["nextDueDate"] ?? row["next_due_on"] ?? .string(RootineDate.localDate())
            value["automatic"] = row["automatic"] ?? .bool(false)
            value["active"] = row["active"] ?? (row["status"].map { .bool(stringValue($0) != "cancelled") } ?? .bool(true))
            value["note"] = row["note"] ?? row["description"] ?? .string("")
            collection = "payments"
        case "affairsubscription", "affairsubscriptions", "subscription", "subscriptions":
            value["name"] = row["name"] ?? .string("Subskrypcja")
            value["category"] = row["category"] ?? .string("finanse")
            value["amount"] = row["amount"] ?? row["amountMinor"] ?? row["amount_minor"] ?? .number(0)
            value["cadence"] = row["cadence"] ?? .string("monthly")
            value["nextBillingDate"] = row["nextBillingDate"] ?? row["nextDueOn"] ?? row["next_due_on"] ?? .string(RootineDate.localDate())
            value["renewal"] = row["renewal"] ?? .string("")
            value["commitmentEndDate"] = row["commitmentEndDate"] ?? .string("")
            value["active"] = row["active"] ?? .bool(true)
            value["note"] = row["note"] ?? .string("")
            collection = "subscriptions"
        case "affairdocument", "affairdocuments", "document", "documents":
            value["name"] = row["name"] ?? .string("Dokument")
            value["category"] = row["category"] ?? row["documentType"] ?? .string("dokumenty")
            value["holder"] = row["holder"] ?? row["owner"] ?? .string("")
            value["expiresAt"] = row["expiresAt"] ?? row["expires_at"] ?? .string("")
            value["reminderDays"] = row["reminderDays"] ?? .number(0)
            value["note"] = row["note"] ?? .string("")
            collection = "documents"
        case "affairvehicle", "affairvehicles", "vehicle", "vehicles":
            let makeModel = [row["make"], row["model"]].compactMap { stringValue($0) }.joined(separator: " ")
            value["name"] = row["name"] ?? .string(makeModel.isEmpty ? "Pojazd" : makeModel)
            value["registration"] = row["registration"] ?? row["registrationNumber"] ?? row["registration_number"] ?? .string("")
            value["mileage"] = row["mileage"] ?? .number(0)
            collection = "vehicles"
        case "affairvehicleitem", "affairvehicleitems", "vehicleserviceitem", "vehicleserviceitems", "vehicleitem", "vehicleitems":
            value["vehicleId"] = row["vehicleId"] ?? row["vehicle_id"] ?? .string("")
            value["title"] = row["title"] ?? row["serviceType"] ?? row["service_type"] ?? .string("Serwis")
            value["type"] = row["type"] ?? row["serviceType"] ?? row["service_type"] ?? .string("service")
            value["dueDate"] = row["dueDate"] ?? row["nextDueOn"] ?? row["next_due_on"] ?? .string(RootineDate.localDate())
            value["done"] = row["done"] ?? .bool(false)
            value["note"] = row["note"] ?? .string("")
            collection = "vehicleItems"
        case "affairbudgetmonth", "affairbudgetmonths", "budgetmonth", "budgetmonths":
            let month = stringValue(row["month"] ?? row["id"]) ?? id
            value["month"] = .string(month)
            value["lines"] = row["lines"] ?? .array([])
            try upsertArray(&root, key: "budgets", id: month, value: .object(value))
            return
        case "affairattentionstate", "affairattentionstates", "attentionstate", "attentionstates":
            value["key"] = row["key"] ?? .string(id)
            value["status"] = row["status"] ?? .string("open")
            value["snoozedUntil"] = row["snoozedUntil"] ?? .string("")
            value["updatedAt"] = row["updatedAt"] ?? row["updated_at"] ?? .string(RootineDate.isoTimestamp())
            collection = "attentionStates"
        case "jdgperiod", "jdgperiods", "period", "periods":
            try upsertArray(&root, key: "jdgPeriods", id: id, value: .object(value)); return
        case "jdgchecklistitem", "jdgchecklistitems":
            try upsertArray(&root, key: "jdgChecklistItems", id: id, value: .object(value)); return
        case "affairbudgetline", "affairbudgetlines", "budgetline", "budgetlines":
            let month = stringValue(row["month"] ?? row["budgetMonth"] ?? row["budget_month"]) ?? ""
            guard !month.isEmpty else { throw RootineNormalizedReadError.contractMismatch("linia budżetu bez miesiąca") }
            try updateArrayObject(&root, key: "budgets", id: month) { budget in
                var line = value
                line["label"] = row["label"] ?? row["title"] ?? .string("Pozycja")
                line["kind"] = row["kind"] ?? row["category"] ?? .string("other")
                line["planned"] = row["planned"] ?? row["plannedMinor"] ?? row["planned_minor"] ?? .number(0)
                line["actual"] = row["actual"] ?? row["actualMinor"] ?? row["actual_minor"] ?? .number(0)
                var lines = arrayValue(budget["lines"]); upsert(&lines, id: id, value: .object(line)); budget["lines"] = .array(lines)
            }
            return
        default: throw RootineNormalizedReadError.contractMismatch("nieznana encja spraw \(entity)")
        }
        try upsertArray(&root, key: collection, id: id, value: .object(value))
    }

    // MARK: Generic JSON helpers

    private static func collectionKey(for entity: String, document: String) -> (key: String, dictionary: Bool)? {
        switch document {
        case RootineStorageKey.tasks.rawValue:
            if entity == "task" { return ("tasks", false) }
            if entity == "habit" { return ("habits", false) }
            if entity.contains("list") { return ("lists", false) }
            if entity.contains("tag") { return ("tags", false) }
        case RootineStorageKey.nutrition.rawValue:
            if entity.contains("day") { return ("days", true) }
        case RootineStorageKey.notes.rawValue:
            if entity == "note" { return ("notes", false) }
            if entity.contains("list") { return ("lists", false) }
        case "rootine-sport-planner-v1": return (entity.contains("outcome") ? "workoutOutcomes" : "history", false)
        case "rootine.goals.v1": return ("goals", false)
        case "rootine.work-workspace.v1": return ("focusSessions", false)
        case "rootine.travel-workspace.v1": return ("trips", false)
        case "rootine.health.workspace.v1": return ("reminders", false)
        case RootineStorageKey.affairs.rawValue: return ("matters", false)
        default: break
        }
        return nil
    }

    private static func applyNestedTaskRow(_ row: [String: JSONValue], id: String, parentKey: String, childKey: String, to root: inout [String: JSONValue]) throws {
        let parentID = stringValue(row[parentKey] ?? row[snakeCase(parentKey)]) ?? ""
        guard !parentID.isEmpty else { throw RootineNormalizedReadError.contractMismatch("(childKey) bez rodzica") }
        var value = row
        value["id"] = numericID(id, namespace: "relational-task-\(childKey)", like: row["id"])
        try updateArrayObject(&root, key: "tasks", id: parentID) { task in
            var children = arrayValue(task[childKey]); upsert(&children, id: id, value: .object(value)); task[childKey] = .array(children)
        }
    }

    private static func upsertArray(_ root: inout [String: JSONValue], key: String, id: String, value: JSONValue) throws {
        var values = arrayValue(root[key]); upsert(&values, id: id, value: value); root[key] = .array(values)
    }

    private static func upsert(_ values: inout [JSONValue], id: String, value: JSONValue) {
        if let index = values.firstIndex(where: { normalized(stringValue(objectValue($0)?["id"]) ?? "") == normalized(id) }) {
            if case .object(let existing) = values[index], case .object(let incoming) = value {
                values[index] = .object(existing.merging(incoming) { _, incoming in incoming })
            } else {
                values[index] = value
            }
        }
        else { values.append(value) }
    }

    private static func upsertDictionary(_ root: inout [String: JSONValue], key: String, id: String, value: JSONValue) {
        var values = objectValue(root[key]) ?? [:]
        if case .object(let existing) = values[id], case .object(let incoming) = value {
            values[id] = .object(existing.merging(incoming) { _, incoming in incoming })
        } else {
            values[id] = value
        }
        root[key] = .object(values)
    }

    private static func updateArrayObject(_ root: inout [String: JSONValue], key: String, id: String, update: (inout [String: JSONValue]) -> Void) throws {
        var values = arrayValue(root[key])
        guard let index = values.firstIndex(where: { normalized(stringValue(objectValue($0)?["id"]) ?? "") == normalized(id) }) else { return }
        guard case .object(var object) = values[index] else { return }
        update(&object); values[index] = .object(object); root[key] = .array(values)
    }

    private static func updateDictionaryObject(_ root: inout [String: JSONValue], key: String, id: String, update: (inout [String: JSONValue]) -> Void) throws {
        var values = objectValue(root[key]) ?? [:]
        guard case .object(var object) = values[id] else { return }
        update(&object); values[id] = .object(object); root[key] = .object(values)
    }

    private static func removeArray(_ root: inout [String: JSONValue], key: String, id: String) {
        root[key] = .array(arrayValue(root[key]).filter { normalized(stringValue(objectValue($0)?["id"]) ?? "") != normalized(id) })
    }

    private static func objectValue(_ value: JSONValue?) -> [String: JSONValue]? { guard case .object(let value) = value else { return nil }; return value }
    private static func arrayValue(_ value: JSONValue?) -> [JSONValue] { guard case .array(let value) = value else { return [] }; return value }
    private static func stringValue(_ value: JSONValue?) -> String? {
        switch value {
        case .string(let value): return value
        case .number(let value): return value.rounded() == value ? String(Int(value)) : String(value)
        default: return nil
        }
    }
    private static func intValue(_ value: JSONValue) -> JSONValue { guard case .number(let value) = value else { return value }; return .number(value.rounded()) }
    private static func idValue(_ value: String, like original: JSONValue?) -> JSONValue {
        numericID(value, namespace: "relational-task", like: original)
    }
    private static func numericID(_ value: String, namespace: String, like original: JSONValue?) -> JSONValue {
        if case .number = original, let number = Int(value) { return .number(Double(number)) }
        if let number = Int(value) { return .number(Double(number)) }
        return .number(Double(RootineLocalIdentifier.integer(namespace: namespace, operationID: value)))
    }

    private static func stringArray(_ value: JSONValue?) -> [String] { arrayValue(value).compactMap(stringValue) }
    private static func normalized(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            .replacingOccurrences(of: "_", with: "")
            .replacingOccurrences(of: "-", with: "")
    }
    private static func snakeCase(_ value: String) -> String {
        value.replacingOccurrences(of: "([a-z])([A-Z])", with: "$1_$2", options: .regularExpression).lowercased()
    }
    private static func canonicalize(_ value: JSONValue) -> JSONValue {
        switch value {
        case .array(let values): return .array(values.map(canonicalize))
        case .object(let object):
            return .object(object.reduce(into: [:]) { result, pair in result[camelCase(pair.key)] = canonicalize(pair.value) })
        default: return value
        }
    }
    private static func camelCase(_ value: String) -> String {
        let parts = value.split(separator: "_").map(String.init)
        guard let first = parts.first else { return value }
        return first + parts.dropFirst().map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined()
    }
    private static func wrappedPayload(_ value: JSONValue) -> JSONValue? {
        guard case .object(let object) = value else { return nil }
        return object["payload"] ?? object["workspace"] ?? object["snapshot"]
    }
    private static func isFullDocument(_ value: JSONValue, key: String) -> Bool {
        guard case .object(let object) = value else { return false }
        let roots: Set<String>
        switch key {
        case RootineStorageKey.tasks.rawValue: roots = ["tasks", "habits", "lists", "tags"]
        case RootineStorageKey.nutrition.rawValue: roots = ["days", "goals", "macroConfiguration"]
        case RootineStorageKey.notes.rawValue: roots = ["notes", "lists"]
        case "rootine-sport-planner-v1": roots = ["history", "sessions", "scheduledWorkouts"]
        case "rootine.goals.v1": roots = ["goals", "categories"]
        case "rootine.work-workspace.v1": roots = ["companies", "projects", "focusSessions"]
        case "rootine.travel-workspace.v1": roots = ["trips"]
        case "rootine.health.workspace.v1": roots = ["entries", "checkIns", "reminders"]
        case RootineStorageKey.affairs.rawValue: roots = ["matters", "payments", "documents"]
        default: return false
        }
        return !roots.isDisjoint(with: Set(object.keys)) && object["version"] != nil
    }
    private static func emptyDocument(for key: String) -> JSONValue {
        let now = JSONValue.string(RootineDate.isoTimestamp())
        switch key {
        case RootineStorageKey.tasks.rawValue:
            return .object(["version": .number(2), "updatedAt": now, "tasks": .array([]), "habits": .array([]), "lists": .array([]), "tags": .array([])])
        case RootineStorageKey.nutrition.rawValue:
            return .object(["version": .number(6), "updatedAt": now, "goals": .object(["calories": .number(0), "protein": .number(0), "carbs": .number(0), "fat": .number(0), "waterMl": .number(0)]), "macroConfiguration": .object(["mode": .string("grams"), "preset": .string("balanced"), "proteinPercent": .number(25), "carbsPercent": .number(45), "fatPercent": .number(30)]), "weightMeasurements": .object([:]), "bodyMeasurements": .object([:]), "customMeals": .array([]), "days": .object([:])])
        case RootineStorageKey.notes.rawValue:
            return .object(["version": .number(1), "updatedAt": now, "lists": .array([]), "notes": .array([])])
        case "rootine-sport-planner-v1":
            return .object(["version": .number(5), "storageSchemaVersion": .number(5), "templates": .array([]), "activeCycle": .null, "cycles": .array([]), "activeCycleId": .null, "history": .array([]), "sessions": .array([]), "workoutOutcomes": .object([:]), "exercises": .array([]), "scheduledWorkouts": .array([]), "executions": .array([])])
        case "rootine.goals.v1": return .object(["version": .number(1), "goals": .array([]), "categories": .array([])])
        case "rootine.work-workspace.v1": return .object(["version": .number(3), "updatedAt": now, "companies": .array([]), "projects": .array([]), "tasks": .array([]), "focusSessions": .array([])])
        case "rootine.travel-workspace.v1": return .object(["version": .number(2), "updatedAt": now, "trips": .array([])])
        case "rootine.health.workspace.v1": return .object(["version": .number(1), "updatedAt": now, "entries": .array([]), "checkIns": .object([:]), "reminders": .array([])])
        case RootineStorageKey.affairs.rawValue: return .object(["version": .number(2), "matters": .array([]), "oneTimePayments": .array([]), "payments": .array([]), "subscriptions": .array([]), "documents": .array([]), "vehicles": .array([]), "vehicleItems": .array([]), "budgets": .array([]), "attentionStates": .array([])])
        default: return .object([:])
        }
    }
    private static func defaultTaskSchedule() -> [String: JSONValue] { ["allDay": .bool(false), "startTime": .string(""), "timezone": .string("UTC")] }
    private static func defaultNutritionEntriesObject() -> [String: JSONValue] { ["breakfast": .array([]), "lunch": .array([]), "snack": .array([]), "dinner": .array([])] }
    private static func defaultNutritionEntries() -> JSONValue { .object(defaultNutritionEntriesObject()) }
}
