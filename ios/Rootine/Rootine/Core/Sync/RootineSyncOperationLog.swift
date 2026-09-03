import Foundation

enum RootineSyncOperationState: Codable, Equatable, Sendable {
    case pending
    case deadLetter
    case custom(String)

    var rawValue: String {
        switch self {
        case .pending: return "pending"
        case .deadLetter: return "dead_letter"
        case .custom(let value): return value
        }
    }

    init(rawValue: String) {
        switch rawValue {
        case "pending": self = .pending
        case "dead_letter": self = .deadLetter
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

struct RootineSyncOperationEntry: Codable, Equatable, Identifiable, Sendable {
    var command: PendingSyncCommand
    var state: RootineSyncOperationState
    var updatedAt: Date
    var failureReason: String?

    var id: String { command.operationID }

    init(
        command: PendingSyncCommand,
        state: RootineSyncOperationState = .pending,
        updatedAt: Date = Date(),
        failureReason: String? = nil
    ) {
        self.command = command
        self.state = state
        self.updatedAt = updatedAt
        self.failureReason = failureReason
    }
}

/// Durable, account/device-scoped operation log. It intentionally does not
/// share `pending-mutations.json`: legacy snapshots can continue to be
/// reconciled while v3 commands are rolled out in shadow mode.
actor RootineSyncOperationLog {
    private struct Envelope: Codable {
        var contractVersion: Int
        var accountID: String
        var deviceID: String
        var operations: [RootineSyncOperationEntry]
    }

    private let fileManager: FileManager
    private let directoryURL: URL
    private let fileURL: URL
    private let recoveryDirectoryURL: URL
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
        fileURL = directoryURL.appendingPathComponent("operations.json")
        recoveryDirectoryURL = directoryURL.appendingPathComponent("Recovery", isDirectory: true)
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
        fileURL = directoryURL.appendingPathComponent("operations.json")
        recoveryDirectoryURL = directoryURL.appendingPathComponent("Recovery", isDirectory: true)
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
    }

    func append(_ command: PendingSyncCommand) throws -> PendingSyncCommand {
        guard !command.operationID.isEmpty,
              !command.deviceID.isEmpty,
              command.deviceID == deviceID,
              !command.entity.isEmpty,
              !command.entityID.isEmpty,
              command.baseRevision >= 0 else {
            throw RootineSyncOperationLogError.invalidCommand
        }

        var operations = try readEnvelope().operations
        if let existing = operations.first(where: { $0.command.operationID == command.operationID }) {
            guard sameOperation(existing.command, command) else {
                throw RootineSyncOperationLogError.operationIDCollision
            }
            return existing.command
        }
        operations.append(RootineSyncOperationEntry(command: command))
        try write(operations)
        return command
    }

    func pending(now: Date = Date(), limit: Int? = nil) throws -> [PendingSyncCommand] {
        let sorted = try readEnvelope().operations
            .filter { $0.state == .pending }
            .sorted {
                if $0.command.createdAt == $1.command.createdAt {
                    return $0.command.operationID < $1.command.operationID
                }
                return $0.command.createdAt < $1.command.createdAt
            }

        // Reserve the record key before checking backoff. Otherwise a
        // successor could pass through while its predecessor is waiting for
        // retry, violating per-record ordering.
        var seenRecordKeys = Set<String>()
        let eligible = sorted.compactMap { entry -> PendingSyncCommand? in
            let recordKey = "\(entry.command.entity)\u{1F}\(entry.command.entityID)"
            guard seenRecordKeys.insert(recordKey).inserted else { return nil }
            guard entry.command.retry.nextAttemptAt == nil || entry.command.retry.nextAttemptAt! <= now else {
                return nil
            }
            return entry.command
        }

        guard let limit, limit >= 0 else { return eligible }
        return Array(eligible.prefix(limit))
    }

    func pendingCommands(now: Date = Date(), limit: Int? = nil) throws -> [PendingSyncCommand] {
        try pending(now: now, limit: limit)
    }

    func allEntries() throws -> [RootineSyncOperationEntry] {
        try readEnvelope().operations
    }

    func entry(operationID: String) throws -> RootineSyncOperationEntry? {
        try readEnvelope().operations.first { $0.command.operationID == operationID }
    }

    func markApplied(operationID: String) throws {
        var operations = try readEnvelope().operations
        operations.removeAll { $0.command.operationID == operationID }
        try write(operations)
    }

    func recordRetry(
        operationID: String,
        at date: Date = Date(),
        error: String,
        nextAttemptAt: Date
    ) throws {
        var operations = try readEnvelope().operations
        guard let index = operations.firstIndex(where: { $0.command.operationID == operationID }) else { return }
        operations[index].command.retry.attemptCount += 1
        operations[index].command.retry.lastAttemptAt = date
        operations[index].command.retry.nextAttemptAt = nextAttemptAt
        operations[index].command.retry.lastError = error
        operations[index].updatedAt = date
        try write(operations)
    }

    func markDeadLetter(operationID: String, reason: String, at date: Date = Date()) throws {
        var operations = try readEnvelope().operations
        guard let index = operations.firstIndex(where: { $0.command.operationID == operationID }) else { return }
        operations[index].state = .deadLetter
        operations[index].failureReason = reason
        operations[index].command.retry.lastAttemptAt = date
        operations[index].command.retry.lastError = reason
        operations[index].updatedAt = date
        try write(operations)
    }

    func remove(operationID: String) throws {
        try markApplied(operationID: operationID)
    }

    func clearDeadLetters() throws {
        var operations = try readEnvelope().operations
        operations.removeAll { $0.state == .deadLetter }
        try write(operations)
    }

    func location() -> URL { fileURL }

    private func readEnvelope() throws -> Envelope {
        try ensureDirectories()
        guard fileManager.fileExists(atPath: fileURL.path) else {
            return Envelope(contractVersion: 1, accountID: accountID, deviceID: deviceID, operations: [])
        }
        do {
            let envelope = try decoder.decode(Envelope.self, from: Data(contentsOf: fileURL))
            guard envelope.contractVersion == 1,
                  envelope.accountID == accountID,
                  envelope.deviceID == deviceID,
                  envelope.operations.allSatisfy(isValidEntry) else {
                throw RootineSyncOperationLogError.invalidEnvelope
            }
            return envelope
        } catch let error as RootineSyncOperationLogError {
            // The log contains retry payloads and can include private domain
            // records. Quarantine malformed/cross-scope bytes inside the
            // protected account container before starting from an empty log.
            quarantineCorruptLog()
            if case .invalidEnvelope = error {
                return Envelope(contractVersion: 1, accountID: accountID, deviceID: deviceID, operations: [])
            }
            throw error
        } catch {
            quarantineCorruptLog()
            return Envelope(contractVersion: 1, accountID: accountID, deviceID: deviceID, operations: [])
        }
    }

    private func write(_ operations: [RootineSyncOperationEntry]) throws {
        try ensureDirectories()
        let envelope = Envelope(contractVersion: 1, accountID: accountID, deviceID: deviceID, operations: operations)
        let data = try encoder.encode(envelope)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private func sameOperation(_ lhs: PendingSyncCommand, _ rhs: PendingSyncCommand) -> Bool {
        lhs.operationID == rhs.operationID
            && lhs.deviceID == rhs.deviceID
            && lhs.entity == rhs.entity
            && lhs.entityID == rhs.entityID
            && lhs.kind == rhs.kind
            && lhs.baseRevision == rhs.baseRevision
            && lhs.payload == rhs.payload
    }

    private func isValidEntry(_ entry: RootineSyncOperationEntry) -> Bool {
        let command = entry.command
        return !command.operationID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && command.deviceID == deviceID
            && !command.entity.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !command.entityID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && command.baseRevision >= 0
    }

    private func ensureDirectories() throws {
        try RootineSecureStorageSupport.createProtectedDirectory(at: directoryURL, fileManager: fileManager)
        try RootineSecureStorageSupport.createProtectedDirectory(at: recoveryDirectoryURL, fileManager: fileManager)
    }

    private func quarantineCorruptLog() {
        guard fileManager.fileExists(atPath: fileURL.path) else { return }
        let url = recoveryDirectoryURL.appendingPathComponent("operations-corrupt-\(UUID().uuidString).json")
        do {
            try fileManager.moveItem(at: fileURL, to: url)
            try fileManager.setAttributes(
                [.protectionKey: RootineSecureStorageSupport.fileProtection],
                ofItemAtPath: url.path
            )
        } catch {
            // Keep the original log if the protected recovery move fails.
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

enum RootineSyncOperationLogError: Error, Equatable, Sendable {
    case invalidCommand
    case operationIDCollision
    case invalidEnvelope
}

enum RootineSyncRetryPolicy {
    static let maxAttempts = 8

    static func delay(
        attempt: Int,
        base: TimeInterval = 1,
        maximum: TimeInterval = 300,
        jitter: TimeInterval = 0.25,
        random: Double = Double.random(in: -1...1)
    ) -> TimeInterval {
        let safeAttempt = max(0, min(attempt, 20))
        let exponential = min(maximum, base * pow(2, Double(safeAttempt)))
        return min(maximum, max(0, exponential + exponential * jitter * random))
    }
}
