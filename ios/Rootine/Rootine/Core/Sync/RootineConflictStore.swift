import Foundation

enum RootineConflictResolution: Codable, Equatable, Sendable {
    case unresolved
    case keepLocal
    case keepServer
    case merged

    var rawValue: String {
        switch self {
        case .unresolved: return "unresolved"
        case .keepLocal: return "keep_local"
        case .keepServer: return "keep_server"
        case .merged: return "merged"
        }
    }

    init(rawValue: String) {
        switch rawValue {
        case "keep_local": self = .keepLocal
        case "keep_server": self = .keepServer
        case "merged": self = .merged
        default: self = .unresolved
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

struct RootineSyncConflict: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var operationID: String?
    var entity: String
    var entityID: String
    var localRecord: JSONValue
    var serverRecord: JSONValue?
    var localBaseRevision: Int64?
    var serverRevision: Int64?
    var recoveryCopyName: String?
    var createdAt: Date
    var resolution: RootineConflictResolution

    enum CodingKeys: String, CodingKey {
        case id
        case operationID = "operation_id"
        case entity
        case entityID = "entity_id"
        case localRecord = "local_record"
        case serverRecord = "server_record"
        case localBaseRevision = "local_base_revision"
        case serverRevision = "server_revision"
        case recoveryCopyName = "recovery_copy_name"
        case createdAt = "created_at"
        case resolution
    }

    init(
        id: String = UUID().uuidString,
        operationID: String? = nil,
        entity: String,
        entityID: String,
        localRecord: JSONValue,
        serverRecord: JSONValue?,
        localBaseRevision: Int64? = nil,
        serverRevision: Int64? = nil,
        recoveryCopyName: String? = nil,
        createdAt: Date = Date(),
        resolution: RootineConflictResolution = .unresolved
    ) {
        self.id = id
        self.operationID = operationID
        self.entity = entity
        self.entityID = entityID
        self.localRecord = localRecord
        self.serverRecord = serverRecord
        self.localBaseRevision = localBaseRevision
        self.serverRevision = serverRevision
        self.recoveryCopyName = recoveryCopyName
        self.createdAt = createdAt
        self.resolution = resolution
    }
}

/// Conflicts are append-only until the user explicitly chooses a resolution.
/// This prevents a failed sync from replacing the local aggregate or losing
/// the server representation needed for a merge UI.
actor RootineConflictStore {
    private let fileManager: FileManager
    private let directoryURL: URL
    private let fileURL: URL
    private let accountID: String
    private let deviceID: String
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        accountID: String,
        deviceID: String,
        fileManager: FileManager = .default,
        rootURL: URL? = nil
    ) {
        self.fileManager = fileManager
        self.accountID = accountID
        self.deviceID = deviceID
        directoryURL = Self.directoryURL(
            accountID: accountID,
            deviceID: deviceID,
            fileManager: fileManager,
            rootURL: rootURL
        )
        fileURL = directoryURL.appendingPathComponent("conflicts.json")
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
    }

    init(
        userID: String,
        deviceID: String,
        fileManager: FileManager = .default,
        rootURL: URL? = nil
    ) {
        self.fileManager = fileManager
        self.accountID = userID
        self.deviceID = deviceID
        directoryURL = Self.directoryURL(
            accountID: userID,
            deviceID: deviceID,
            fileManager: fileManager,
            rootURL: rootURL
        )
        fileURL = directoryURL.appendingPathComponent("conflicts.json")
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
    }

    @discardableResult
    func record(_ conflict: RootineSyncConflict) throws -> RootineSyncConflict {
        var conflicts = try read()
        if let existing = conflicts.first(where: { $0.id == conflict.id }) { return existing }
        if let existing = conflicts.first(where: {
            $0.resolution == .unresolved
                && $0.operationID == conflict.operationID
                && $0.entity == conflict.entity
                && $0.entityID == conflict.entityID
                && ($0.operationID != nil || $0.serverRevision == conflict.serverRevision)
        }) {
            return existing
        }
        conflicts.append(conflict)
        try write(conflicts)
        return conflict
    }

    @discardableResult
    func create(
        operationID: String?,
        entity: String,
        entityID: String,
        localRecord: JSONValue,
        serverRecord: JSONValue?,
        localBaseRevision: Int64?,
        serverRevision: Int64?,
        recoveryCopyName: String?
    ) throws -> RootineSyncConflict {
        let conflict = RootineSyncConflict(
            operationID: operationID,
            entity: entity,
            entityID: entityID,
            localRecord: localRecord,
            serverRecord: serverRecord,
            localBaseRevision: localBaseRevision,
            serverRevision: serverRevision,
            recoveryCopyName: recoveryCopyName
        )
        return try record(conflict)
    }

    func list(unresolvedOnly: Bool = false) throws -> [RootineSyncConflict] {
        let conflicts = try read().sorted { $0.createdAt < $1.createdAt }
        return unresolvedOnly ? conflicts.filter { $0.resolution == .unresolved } : conflicts
    }

    func unresolved() throws -> [RootineSyncConflict] { try list(unresolvedOnly: true) }

    func resolve(id: String, with resolution: RootineConflictResolution) throws {
        var conflicts = try read()
        guard let index = conflicts.firstIndex(where: { $0.id == id }) else { return }
        conflicts[index].resolution = resolution
        try write(conflicts)
    }

    func remove(id: String) throws {
        var conflicts = try read()
        conflicts.removeAll { $0.id == id }
        try write(conflicts)
    }

    func location() -> URL { fileURL }

    private func read() throws -> [RootineSyncConflict] {
        try ensureDirectory()
        guard fileManager.fileExists(atPath: fileURL.path) else { return [] }
        do { return try decoder.decode([RootineSyncConflict].self, from: Data(contentsOf: fileURL)) }
        catch {
            // Conflict records are recoverable support data, not a reason to
            // strand sync forever. Keep the original bytes in the protected
            // per-account sync directory and continue with an empty unresolved
            // set.
            quarantineCorruptStore()
            return []
        }
    }

    private func write(_ conflicts: [RootineSyncConflict]) throws {
        try ensureDirectory()
        try encoder.encode(conflicts).write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private func ensureDirectory() throws {
        try RootineSecureStorageSupport.createProtectedDirectory(at: directoryURL, fileManager: fileManager)
    }

    private func quarantineCorruptStore() {
        guard fileManager.fileExists(atPath: fileURL.path) else { return }
        let url = directoryURL.appendingPathComponent("conflicts-corrupt-\(UUID().uuidString).json")
        do {
            try fileManager.moveItem(at: fileURL, to: url)
            try fileManager.setAttributes(
                [.protectionKey: RootineSecureStorageSupport.fileProtection],
                ofItemAtPath: url.path
            )
        } catch {
            // Keep the original conflict file if quarantine cannot complete.
        }
    }

    private static func safeName(_ value: String) -> String {
        let scalars = value.unicodeScalars.map { scalar -> Character in
            if CharacterSet.alphanumerics.contains(scalar) || scalar == "-" || scalar == "_" {
                return Character(String(scalar))
            }
            return "-"
        }
        let result = String(scalars).replacingOccurrences(of: "-{2,}", with: "-", options: .regularExpression)
        return result.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    private static func directoryURL(
        accountID: String,
        deviceID: String,
        fileManager: FileManager,
        rootURL: URL?
    ) -> URL {
        let base: URL
        if let rootURL {
            base = rootURL
        } else {
            base = (fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? fileManager.temporaryDirectory)
                .appendingPathComponent("Rootine/Users", isDirectory: true)
                .appendingPathComponent(RootineSecureStorageSupport.accountPathComponent(accountID), isDirectory: true)
        }
        return base
            .appendingPathComponent("Sync", isDirectory: true)
            .appendingPathComponent(Self.safeName(deviceID), isDirectory: true)
    }
}

enum RootineConflictStoreError: Error, Equatable, Sendable {
    case invalidStore
}
