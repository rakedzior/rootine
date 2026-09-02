import CryptoKit
import Foundation

/// Shared storage primitives used by every local persistence boundary. The
/// account namespace is one-way so a user's identifier is not exposed in
/// Application Support/UserDefaults keys, while deterministic hashing keeps
/// the same account stable across launches and reinstalls.
enum RootineSecureStorageSupport {
    static let fileProtection: FileProtectionType = .completeUntilFirstUserAuthentication

    static func accountNamespace(_ accountID: String) -> String {
        "account-" + stableHash(accountID.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Keeps the pre-S19 UUID directory name readable on upgrade. IDs that
    /// contain separators/control characters get a stable hash suffix instead
    /// of being allowed to escape the account container.
    static func accountPathComponent(_ accountID: String) -> String {
        let normalized = accountID.trimmingCharacters(in: .whitespacesAndNewlines)
        let scalars = normalized.unicodeScalars.map { scalar -> Character in
            if CharacterSet.alphanumerics.contains(scalar) || scalar == "-" || scalar == "_" {
                return Character(String(scalar))
            }
            return "-"
        }
        let safe = String(scalars)
            .replacingOccurrences(of: "-{2,}", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        guard !safe.isEmpty else { return "invalid-account-\(stableHash(normalized))" }
        guard safe == normalized else {
            return "\(safe)-\(String(stableHash(normalized).prefix(16)))"
        }
        return safe
    }

    static func stableHash(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    static func defaultsKey(prefix: String, accountID: String, environment: String? = nil) -> String {
        let scope = [environment, accountID]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .joined(separator: "\u{1F}")
        return "\(prefix).\(stableHash(scope))"
    }

    static func createProtectedDirectory(
        at url: URL,
        fileManager: FileManager = .default
    ) throws {
        try fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        try fileManager.setAttributes(
            [.protectionKey: fileProtection],
            ofItemAtPath: url.path
        )
    }
}

struct PendingWorkspaceMutation: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var storageKey: String
    var payload: JSONValue
    var contentHash: String
    var expectedRevision: Int64
    var createdAt: String
    /// Last server cursor known when this operation was queued. It is not a
    /// substitute for expectedRevision; the two values advance independently.
    var cursor: Int64 = 0

    enum CodingKeys: String, CodingKey {
        case id, storageKey, payload, contentHash, expectedRevision, createdAt, cursor
    }

    init(
        id: String,
        storageKey: String,
        payload: JSONValue,
        contentHash: String,
        expectedRevision: Int64,
        createdAt: String,
        cursor: Int64 = 0
    ) {
        self.id = id
        self.storageKey = storageKey
        self.payload = payload
        self.contentHash = contentHash
        self.expectedRevision = expectedRevision
        self.createdAt = createdAt
        self.cursor = cursor
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        storageKey = try container.decode(String.self, forKey: .storageKey)
        payload = try container.decode(JSONValue.self, forKey: .payload)
        contentHash = try container.decode(String.self, forKey: .contentHash)
        expectedRevision = try container.decode(Int64.self, forKey: .expectedRevision)
        createdAt = try container.decode(String.self, forKey: .createdAt)
        cursor = try container.decodeIfPresent(Int64.self, forKey: .cursor) ?? 0
    }
}

struct WorkspaceWriteReceipt: Sendable {
    let id: String
    let key: RootineStorageKey
    fileprivate let previousData: Data?
    fileprivate let replacementData: Data
}

/// Recovery entries are deliberately typed. Diagnostic snapshots are useful
/// for support, but they are not complete archives and must never be offered
/// as a restore source in the app UI.
enum WorkspaceRecoveryKind: String, Codable, Equatable, Sendable {
    case diagnostic
    case workspaceArchive

    var isRestorable: Bool {
        self == .workspaceArchive
    }

    static func infer(from name: String) -> WorkspaceRecoveryKind {
        let normalized = name.lowercased()
        let archivePrefixes = [
            "archive-",
            "before-import-",
            "manual-export-",
            "workspace-archive-"
        ]
        return archivePrefixes.contains(where: normalized.hasPrefix) ? .workspaceArchive : .diagnostic
    }
}

struct WorkspaceRecoveryFile: Equatable, Sendable {
    let name: String
    let url: URL
    let kind: WorkspaceRecoveryKind

    init(name: String, url: URL, kind: WorkspaceRecoveryKind? = nil) {
        self.name = name
        self.url = url
        self.kind = kind ?? WorkspaceRecoveryKind.infer(from: name)
    }

    var isRestorable: Bool {
        kind.isRestorable
    }
}

/// Opaque token for an on-disk transaction. The token never exposes paths;
/// WorkspaceFileStore validates it before reading or removing a staging area.
struct WorkspaceBatchTransaction: Equatable, Sendable {
    fileprivate let id: String
}

struct WorkspaceBatchDocument: Sendable {
    let key: RootineStorageKey
    let data: Data
}

actor WorkspaceFileStore {
    private struct SyncMetadata: Codable {
        var revisions: [String: Int64] = [:]
        var cursor: Int64 = 0

        enum CodingKeys: String, CodingKey {
            case revisions, cursor
        }

        init(revisions: [String: Int64] = [:], cursor: Int64 = 0) {
            self.revisions = revisions
            self.cursor = cursor
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            revisions = try container.decodeIfPresent([String: Int64].self, forKey: .revisions) ?? [:]
            cursor = try container.decodeIfPresent(Int64.self, forKey: .cursor) ?? 0
        }
    }

    private struct VersionEnvelope: Decodable {
        let version: Int
    }

    private let fileManager: FileManager
    private let rootURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    /// An in-memory guard protects a transaction that is currently being
    /// prepared or committed. A fresh AppEnvironment starts with no active
    /// token, so a later launch can safely recover any complete snapshot left
    /// behind by a crashed import.
    private var activeTransactionID: String?

    init(userID: String, fileManager: FileManager = .default, rootURL: URL? = nil) {
        self.fileManager = fileManager
        let applicationSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        let base = rootURL
            ?? applicationSupport
                .appendingPathComponent("Rootine/Users", isDirectory: true)
                .appendingPathComponent(RootineSecureStorageSupport.accountPathComponent(userID), isDirectory: true)
        self.rootURL = base
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
    }

    func load<T: Decodable & Sendable>(_ type: T.Type, key: RootineStorageKey) throws -> T? {
        try ensureDirectories()
        let url = workspaceURL(for: key)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        let data = try Data(contentsOf: url)
        do {
            if let supportedVersion = key.supportedLocalVersion {
                let envelope = try decoder.decode(VersionEnvelope.self, from: data)
                guard envelope.version == supportedVersion else {
                    throw WorkspaceFileStoreError.unsupportedVersion(
                        key: key.rawValue,
                        found: envelope.version,
                        supported: supportedVersion
                    )
                }
            }
            return try decoder.decode(T.self, from: data)
        } catch {
            quarantine(data: data, sourceURL: url, label: safeName(key.rawValue))
            return nil
        }
    }

    func save<T: Encodable & Sendable>(_ value: T, key: RootineStorageKey) throws {
        _ = try saveWithReceipt(value, key: key)
    }

    /// Captures the local workspace directory and pending queue before a
    /// multi-file import. The caller must either commit or roll back the
    /// returned token; no partially written import is considered successful.
    func beginBatchTransaction() throws -> WorkspaceBatchTransaction {
        try ensureDirectories()
        try fileManager.createDirectory(at: transactionsDirectory, withIntermediateDirectories: true)
        guard activeTransactionID == nil else {
            throw WorkspaceFileStoreError.invalidTransaction
        }
        let transaction = WorkspaceBatchTransaction(id: UUID().uuidString)
        let transactionURL = try validatedTransactionURL(for: transaction, requireExisting: false)
        try RootineSecureStorageSupport.createProtectedDirectory(at: transactionURL, fileManager: fileManager)
        do {
            try fileManager.copyItem(at: workspaceDirectory, to: transactionURL.appendingPathComponent("Workspaces", isDirectory: true))
            if fileManager.fileExists(atPath: queueURL.path) {
                try fileManager.copyItem(at: queueURL, to: transactionURL.appendingPathComponent("pending-mutations.json"))
            } else {
                try protectedWrite(Data(), to: transactionURL.appendingPathComponent("queue-absent"))
            }
            activeTransactionID = transaction.id
            return transaction
        } catch {
            try? fileManager.removeItem(at: transactionURL)
            throw error
        }
    }

    /// Restores the exact bytes captured by `beginBatchTransaction`. The
    /// swap keeps a temporary backup until both workspace and queue are back
    /// in place, so a failed restore can still put the previous state back.
    func rollbackBatchTransaction(_ transaction: WorkspaceBatchTransaction) throws {
        defer {
            if activeTransactionID == transaction.id {
                activeTransactionID = nil
            }
        }
        let transactionURL = try validatedTransactionURL(for: transaction)
        if isCommittedTransaction(at: transactionURL) {
            // A commit marker is durable before cleanup. If the process was
            // interrupted while removing the transaction directory, the
            // imported workspace is already authoritative; never roll it back
            // to the pre-import snapshot.
            try fileManager.removeItem(at: transactionURL)
            return
        }
        let snapshotWorkspaceURL = transactionURL.appendingPathComponent("Workspaces", isDirectory: true)
        guard fileManager.fileExists(atPath: snapshotWorkspaceURL.path) else {
            throw WorkspaceFileStoreError.invalidTransaction
        }

        let rollbackID = UUID().uuidString
        let restoreWorkspaceURL = rootURL.appendingPathComponent("Workspaces.rollback-\(rollbackID)", isDirectory: true)
        let backupWorkspaceURL = rootURL.appendingPathComponent("Workspaces.rollback-backup-\(rollbackID)", isDirectory: true)
        let restoreQueueURL = rootURL.appendingPathComponent("pending-mutations.rollback-\(rollbackID).json")
        let backupQueueURL = rootURL.appendingPathComponent("pending-mutations.rollback-backup-\(rollbackID).json")
        let snapshotQueueURL = transactionURL.appendingPathComponent("pending-mutations.json")
        let snapshotQueueWasAbsent = fileManager.fileExists(atPath: transactionURL.appendingPathComponent("queue-absent").path)

        do {
            try fileManager.copyItem(at: snapshotWorkspaceURL, to: restoreWorkspaceURL)
            if fileManager.fileExists(atPath: snapshotQueueURL.path) {
                try fileManager.copyItem(at: snapshotQueueURL, to: restoreQueueURL)
            }
        } catch {
            // Preparation happens before the swap. Remove any temporary copy
            // created by the first step so a failed queue snapshot cannot
            // accumulate rollback directories in the account container.
            try? fileManager.removeItem(at: restoreWorkspaceURL)
            try? fileManager.removeItem(at: restoreQueueURL)
            throw error
        }

        var workspaceMoved = false
        var queueMoved = false
        var workspaceRestored = false
        do {
            if fileManager.fileExists(atPath: workspaceDirectory.path) {
                try fileManager.moveItem(at: workspaceDirectory, to: backupWorkspaceURL)
                workspaceMoved = true
            }
            try fileManager.moveItem(at: restoreWorkspaceURL, to: workspaceDirectory)
            workspaceRestored = true

            if fileManager.fileExists(atPath: queueURL.path) {
                try fileManager.moveItem(at: queueURL, to: backupQueueURL)
                queueMoved = true
            }
            if snapshotQueueWasAbsent {
                // The old transaction had no queue; leave the current queue
                // absent rather than manufacturing an empty mutation file.
                try? fileManager.removeItem(at: queueURL)
            } else {
                try fileManager.moveItem(at: restoreQueueURL, to: queueURL)
            }

            try? fileManager.removeItem(at: backupWorkspaceURL)
            try? fileManager.removeItem(at: backupQueueURL)
            try? fileManager.removeItem(at: transactionURL)
        } catch {
            // Put whichever side was moved back before surfacing the failure.
            if workspaceRestored, fileManager.fileExists(atPath: workspaceDirectory.path) {
                try? fileManager.removeItem(at: workspaceDirectory)
            }
            if workspaceMoved, fileManager.fileExists(atPath: backupWorkspaceURL.path) {
                if fileManager.fileExists(atPath: workspaceDirectory.path) {
                    try? fileManager.removeItem(at: workspaceDirectory)
                }
                try? fileManager.moveItem(at: backupWorkspaceURL, to: workspaceDirectory)
            }
            if queueMoved, fileManager.fileExists(atPath: backupQueueURL.path) {
                if fileManager.fileExists(atPath: queueURL.path) {
                    try? fileManager.removeItem(at: queueURL)
                }
                try? fileManager.moveItem(at: backupQueueURL, to: queueURL)
            }
            try? fileManager.removeItem(at: restoreWorkspaceURL)
            try? fileManager.removeItem(at: restoreQueueURL)
            throw error
        }
    }

    func commitBatchTransaction(_ transaction: WorkspaceBatchTransaction) throws {
        defer {
            if activeTransactionID == transaction.id {
                activeTransactionID = nil
            }
        }
        let transactionURL = try validatedTransactionURL(for: transaction)
        guard fileManager.fileExists(atPath: transactionURL.path) else {
            throw WorkspaceFileStoreError.invalidTransaction
        }
        let markerURL = transactionURL.appendingPathComponent("committed")
        try protectedWrite(Data("committed\n".utf8), to: markerURL)
        // Cleanup is deliberately best effort. The marker makes a crash
        // between this write and directory removal safe and idempotent.
        try? fileManager.removeItem(at: transactionURL)
    }

    /// Recovers snapshots left by a process that terminated during an import.
    /// Only complete transaction directories are considered. Malformed or
    /// partial entries remain untouched for diagnostics, while the token owned
    /// by this live store is always skipped so a foreground import cannot be
    /// rolled back from underneath itself.
    @discardableResult
    func recoverOrphanedBatchTransactions() throws -> Int {
        try ensureDirectories()
        guard fileManager.fileExists(atPath: transactionsDirectory.path) else { return 0 }

        let entries = try fileManager.contentsOfDirectory(
            at: transactionsDirectory,
            includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey],
            options: [.skipsHiddenFiles]
        )
        var recovered = 0
        for entry in entries.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            let values = try? entry.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard values?.isDirectory == true, values?.isSymbolicLink != true else { continue }
            guard let id = UUID(uuidString: entry.lastPathComponent), id.uuidString == entry.lastPathComponent else { continue }
            guard id.uuidString != activeTransactionID else { continue }

            if isCommittedTransaction(at: entry) {
                // The data swap and queue commit completed before the process
                // stopped; only the cleanup directory is left behind.
                try? fileManager.removeItem(at: entry)
                continue
            }
            // A malformed marker is left untouched for support diagnostics.
            // Never guess whether an import was committed from partial bytes.
            let markerURL = entry.appendingPathComponent("committed")
            if fileManager.fileExists(atPath: markerURL.path) { continue }

            let snapshotWorkspaceURL = entry.appendingPathComponent("Workspaces", isDirectory: true)
            let snapshotQueueURL = entry.appendingPathComponent("pending-mutations.json")
            let queueAbsentURL = entry.appendingPathComponent("queue-absent")
            let hasQueueSnapshot = fileManager.fileExists(atPath: snapshotQueueURL.path)
            let queueWasAbsent = fileManager.fileExists(atPath: queueAbsentURL.path)
            let snapshotValues = try? snapshotWorkspaceURL.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard snapshotValues?.isDirectory == true,
                  snapshotValues?.isSymbolicLink != true,
                  hasQueueSnapshot != queueWasAbsent else { continue }

            do {
                try rollbackBatchTransaction(WorkspaceBatchTransaction(id: id.uuidString))
                recovered += 1
            } catch {
                // A partial transaction is deliberately left in place. The
                // next launch can retry after the file system is healthy,
                // while the current workspace remains untouched.
            }
        }
        return recovered
    }

    /// Stages every workspace document before swapping the directory. This
    /// prevents a failed import from leaving a mixture of old and new modules.
    func replaceWorkspaceBatch(_ documents: [WorkspaceBatchDocument]) throws {
        guard !documents.isEmpty else { return }
        try ensureDirectories()
        let stagingURL = rootURL.appendingPathComponent("Workspaces.staging-\(UUID().uuidString)", isDirectory: true)
        let backupURL = rootURL.appendingPathComponent("Workspaces.backup-\(UUID().uuidString)", isDirectory: true)
        let hadCurrentDirectory = fileManager.fileExists(atPath: workspaceDirectory.path)
        if hadCurrentDirectory {
            // Keep files introduced by a newer client even when this archive
            // only knows about the current set of workspace keys.
            try fileManager.copyItem(at: workspaceDirectory, to: stagingURL)
        } else {
            try RootineSecureStorageSupport.createProtectedDirectory(at: stagingURL, fileManager: fileManager)
        }
        defer {
            try? fileManager.removeItem(at: stagingURL)
            try? fileManager.removeItem(at: backupURL)
        }

        var seenKeys = Set<String>()
        for document in documents where seenKeys.insert(document.key.rawValue).inserted {
            let url = stagingURL.appendingPathComponent("\(safeName(document.key.rawValue)).json")
            try protectedWrite(document.data, to: url)
        }

        if hadCurrentDirectory {
            try fileManager.moveItem(at: workspaceDirectory, to: backupURL)
        }
        do {
            try fileManager.moveItem(at: stagingURL, to: workspaceDirectory)
            if hadCurrentDirectory {
                try fileManager.removeItem(at: backupURL)
            }
        } catch {
            if fileManager.fileExists(atPath: workspaceDirectory.path) {
                try? fileManager.removeItem(at: workspaceDirectory)
            }
            if hadCurrentDirectory, fileManager.fileExists(atPath: backupURL.path) {
                try? fileManager.moveItem(at: backupURL, to: workspaceDirectory)
            }
            throw error
        }
    }

    /// Returns the exact prior bytes so a UI-level Undo can restore the local
    /// snapshot without re-encoding it or losing fields unknown to the model.
    func saveWithReceipt<T: Encodable & Sendable>(_ value: T, key: RootineStorageKey) throws -> WorkspaceWriteReceipt {
        try ensureDirectories()
        let url = workspaceURL(for: key)
        let previousData = try? Data(contentsOf: url)
        let replacementData = try encoder.encode(value)
        try protectedWrite(replacementData, to: url)
        return WorkspaceWriteReceipt(
            id: UUID().uuidString,
            key: key,
            previousData: previousData,
            replacementData: replacementData
        )
    }

    /// Undo is conditional: a stale receipt never overwrites a newer rapid
    /// mutation. The caller can surface that boundary instead of losing data.
    func undo(_ receipt: WorkspaceWriteReceipt) throws -> Bool {
        try ensureDirectories()
        let url = workspaceURL(for: receipt.key)
        let currentData = try? Data(contentsOf: url)
        guard currentData == receipt.replacementData else { return false }
        if let previousData = receipt.previousData {
            try protectedWrite(previousData, to: url)
        } else if fileManager.fileExists(atPath: url.path) {
            try fileManager.removeItem(at: url)
        }
        return true
    }

    func pendingMutations() throws -> [PendingWorkspaceMutation] {
        try ensureDirectories()
        guard fileManager.fileExists(atPath: queueURL.path) else { return [] }
        let data = try Data(contentsOf: queueURL)
        do {
            return try decoder.decode([PendingWorkspaceMutation].self, from: data)
        } catch {
            quarantine(data: data, sourceURL: queueURL, label: "pending-mutations")
            return []
        }
    }

    @discardableResult
    func enqueue(_ mutation: PendingWorkspaceMutation) throws -> PendingWorkspaceMutation {
        var queue = try pendingMutations()
        if let duplicate = queue.first(where: {
            $0.storageKey == mutation.storageKey
                && $0.contentHash == mutation.contentHash
                && $0.expectedRevision == mutation.expectedRevision
        }) {
            return duplicate
        }
        queue.removeAll { $0.storageKey == mutation.storageKey }
        queue.append(mutation)
        try protectedWrite(try encoder.encode(queue), to: queueURL)
        return mutation
    }

    func replacePendingMutations(_ mutations: [PendingWorkspaceMutation]) throws {
        try ensureDirectories()
        try protectedWrite(try encoder.encode(mutations), to: queueURL)
    }

    func removeMutation(id: String) throws {
        var queue = try pendingMutations()
        queue.removeAll { $0.id == id }
        try protectedWrite(try encoder.encode(queue), to: queueURL)
    }

    func revision(for storageKey: String) throws -> Int64 {
        try loadMetadata().revisions[storageKey] ?? 0
    }

    func setRevision(_ revision: Int64, for storageKey: String) throws {
        var metadata = try loadMetadata()
        metadata.revisions[storageKey] = revision
        try protectedWrite(try encoder.encode(metadata), to: metadataURL)
    }

    func syncCursor() throws -> Int64 {
        max(0, try loadMetadata().cursor)
    }

    func setSyncCursor(_ cursor: Int64) throws {
        guard cursor >= 0 else { return }
        var metadata = try loadMetadata()
        metadata.cursor = max(metadata.cursor, cursor)
        try protectedWrite(try encoder.encode(metadata), to: metadataURL)
    }

    /// Commits a successful CAS response and rebases a newer coalesced local
    /// mutation that arrived while the acknowledged request was in flight.
    func acknowledgeMutation(id: String, storageKey: String, revision: Int64, cursor: Int64? = nil) throws {
        var metadata = try loadMetadata()
        metadata.revisions[storageKey] = revision
        if let cursor, cursor >= 0 {
            metadata.cursor = max(metadata.cursor, cursor)
        }

        var queue = try pendingMutations()
        queue.removeAll { $0.id == id }
        if let index = queue.firstIndex(where: {
            $0.storageKey == storageKey && $0.expectedRevision < revision
        }) {
            queue[index].expectedRevision = revision
        }

        try protectedWrite(try encoder.encode(metadata), to: metadataURL)
        try protectedWrite(try encoder.encode(queue), to: queueURL)
    }

    func recoveryFiles() throws -> [WorkspaceRecoveryFile] {
        try ensureDirectories()
        return try fileManager.contentsOfDirectory(
            at: recoveryDirectory,
            includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey],
            options: [.skipsHiddenFiles]
        )
        .compactMap { url in
            let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values?.isRegularFile == true, values?.isSymbolicLink != true else { return nil }
            return WorkspaceRecoveryFile(name: url.lastPathComponent, url: url)
        }
        .sorted { $0.name < $1.name }
    }

    /// Saves a user-readable recovery copy without touching the active
    /// workspace. Import/export uses this before replacing local documents.
    @discardableResult
    func writeRecoveryCopy(
        _ data: Data,
        label: String,
        kind: WorkspaceRecoveryKind? = nil
    ) throws -> WorkspaceRecoveryFile {
        try ensureDirectories()
        let safeLabel = safeName(label).isEmpty ? "workspace" : safeName(label)
        let resolvedKind = kind ?? WorkspaceRecoveryKind.infer(from: safeLabel)
        let prefix = resolvedKind == .workspaceArchive ? "archive" : "diagnostic"
        let url = recoveryDirectory.appendingPathComponent(
            "\(prefix)-\(safeLabel)-\(UUID().uuidString).json"
        )
        try protectedWrite(data, to: url)
        return WorkspaceRecoveryFile(name: url.lastPathComponent, url: url, kind: resolvedKind)
    }

    func deleteRecoveryFile(_ file: WorkspaceRecoveryFile) throws {
        try ensureDirectories()
        let recoveryPath = recoveryDirectory.standardizedFileURL.path
        let candidate = file.url.standardizedFileURL
        guard candidate.path.hasPrefix(recoveryPath + "/") else { return }
        guard fileManager.fileExists(atPath: candidate.path) else { return }
        let values = try? candidate.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values?.isRegularFile == true, values?.isSymbolicLink != true else { return }
        try fileManager.removeItem(at: candidate)
    }

    func clearAllLocalData() throws {
        guard activeTransactionID == nil else {
            throw WorkspaceFileStoreError.invalidTransaction
        }
        // Never allow a malformed/injected root to turn account deletion into
        // a broad container deletion. Production roots are always beneath the
        // app's Application Support container; test callers may provide a
        // dedicated temporary directory, but never the filesystem root.
        guard rootURL.standardizedFileURL.path != "/",
              rootURL.standardizedFileURL.path != fileManager.temporaryDirectory.standardizedFileURL.path else {
            throw WorkspaceFileStoreError.invalidRoot
        }
        if fileManager.fileExists(atPath: rootURL.path) {
            try fileManager.removeItem(at: rootURL)
        }
    }

    private var workspaceDirectory: URL { rootURL.appendingPathComponent("Workspaces", isDirectory: true) }
    private var recoveryDirectory: URL { rootURL.appendingPathComponent("Recovery", isDirectory: true) }
    private var transactionsDirectory: URL { rootURL.appendingPathComponent("Transactions", isDirectory: true) }
    private var queueURL: URL { rootURL.appendingPathComponent("pending-mutations.json") }
    private var metadataURL: URL { rootURL.appendingPathComponent("sync-metadata.json") }

    private func workspaceURL(for key: RootineStorageKey) -> URL {
        workspaceDirectory.appendingPathComponent("\(safeName(key.rawValue)).json")
    }

    private func safeName(_ value: String) -> String {
        // File names are assembled from storage keys and user-facing labels.
        // Keep only portable alphanumerics plus '-'/'_' so separators,
        // control bytes and dot-dot traversal can never escape the account
        // directory. Repeated separators are collapsed for readable output.
        let scalars = value.unicodeScalars.map { scalar -> Character in
            if CharacterSet.alphanumerics.contains(scalar)
                || scalar == "-"
                || scalar == "_"
            {
                return Character(String(scalar))
            }
            return "-"
        }
        let raw = String(scalars)
        let collapsed = raw.replacingOccurrences(of: "-{2,}", with: "-", options: .regularExpression)
        return collapsed.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    private func ensureDirectories() throws {
        // Protect the container as well as each file. File protection is not
        // reliably inherited when an atomic replacement creates a new inode.
        try RootineSecureStorageSupport.createProtectedDirectory(at: rootURL, fileManager: fileManager)
        try RootineSecureStorageSupport.createProtectedDirectory(at: workspaceDirectory, fileManager: fileManager)
        try RootineSecureStorageSupport.createProtectedDirectory(at: recoveryDirectory, fileManager: fileManager)
        try RootineSecureStorageSupport.createProtectedDirectory(at: transactionsDirectory, fileManager: fileManager)
    }

    private func validatedTransactionURL(
        for transaction: WorkspaceBatchTransaction,
        requireExisting: Bool = true
    ) throws -> URL {
        guard UUID(uuidString: transaction.id) != nil else {
            throw WorkspaceFileStoreError.invalidTransaction
        }
        let candidate = transactionsDirectory.appendingPathComponent(transaction.id, isDirectory: true)
        let rootPath = transactionsDirectory.standardizedFileURL.path
        guard candidate.standardizedFileURL.path.hasPrefix(rootPath + "/") else {
            throw WorkspaceFileStoreError.invalidTransaction
        }
        guard !requireExisting || fileManager.fileExists(atPath: candidate.path) else {
            throw WorkspaceFileStoreError.invalidTransaction
        }
        return candidate
    }

    private func isCommittedTransaction(at transactionURL: URL) -> Bool {
        let markerURL = transactionURL.appendingPathComponent("committed")
        guard let data = try? Data(contentsOf: markerURL) else { return false }
        return data == Data("committed\n".utf8)
    }

    private func loadMetadata() throws -> SyncMetadata {
        try ensureDirectories()
        guard fileManager.fileExists(atPath: metadataURL.path) else { return SyncMetadata() }
        let data = try Data(contentsOf: metadataURL)
        do {
            return try decoder.decode(SyncMetadata.self, from: data)
        } catch {
            quarantine(data: data, sourceURL: metadataURL, label: "sync-metadata")
            return SyncMetadata()
        }
    }

    private func quarantine(data: Data, sourceURL: URL, label: String) {
        let recoveryURL = recoveryDirectory.appendingPathComponent(
            "diagnostic-\(label)-corrupt-\(UUID().uuidString).json"
        )
        do {
            try protectedWrite(data, to: recoveryURL)
            if fileManager.fileExists(atPath: sourceURL.path) {
                try fileManager.removeItem(at: sourceURL)
            }
        } catch {
            // The original remains untouched if Recovery itself is unavailable.
        }
    }

    private func protectedWrite(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: .atomic)
        try fileManager.setAttributes(
            [.protectionKey: RootineSecureStorageSupport.fileProtection],
            ofItemAtPath: url.path
        )
    }
}

enum WorkspaceFileStoreError: Error, Equatable {
    case unsupportedVersion(key: String, found: Int, supported: Int)
    case invalidTransaction
    case invalidRoot
}
