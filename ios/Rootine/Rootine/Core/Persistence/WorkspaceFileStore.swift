import Foundation

struct PendingWorkspaceMutation: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var storageKey: String
    var payload: JSONValue
    var contentHash: String
    var expectedRevision: Int64
    var createdAt: String
}

struct WorkspaceWriteReceipt: Sendable {
    let id: String
    let key: RootineStorageKey
    fileprivate let previousData: Data?
    fileprivate let replacementData: Data
}

struct WorkspaceRecoveryFile: Equatable, Sendable {
    let name: String
    let url: URL
}

actor WorkspaceFileStore {
    private struct SyncMetadata: Codable {
        var revisions: [String: Int64] = [:]
    }

    private struct VersionEnvelope: Decodable {
        let version: Int
    }

    private let fileManager: FileManager
    private let rootURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(userID: String, fileManager: FileManager = .default, rootURL: URL? = nil) {
        self.fileManager = fileManager
        let applicationSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        let base = rootURL
            ?? applicationSupport
                .appendingPathComponent("Rootine/Users", isDirectory: true)
                .appendingPathComponent(userID, isDirectory: true)
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

    /// Commits a successful CAS response and rebases a newer coalesced local
    /// mutation that arrived while the acknowledged request was in flight.
    func acknowledgeMutation(id: String, storageKey: String, revision: Int64) throws {
        var metadata = try loadMetadata()
        metadata.revisions[storageKey] = revision

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
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        )
        .map { WorkspaceRecoveryFile(name: $0.lastPathComponent, url: $0) }
        .sorted { $0.name < $1.name }
    }

    func clearAllLocalData() throws {
        if fileManager.fileExists(atPath: rootURL.path) {
            try fileManager.removeItem(at: rootURL)
        }
    }

    private var workspaceDirectory: URL { rootURL.appendingPathComponent("Workspaces", isDirectory: true) }
    private var recoveryDirectory: URL { rootURL.appendingPathComponent("Recovery", isDirectory: true) }
    private var queueURL: URL { rootURL.appendingPathComponent("pending-mutations.json") }
    private var metadataURL: URL { rootURL.appendingPathComponent("sync-metadata.json") }

    private func workspaceURL(for key: RootineStorageKey) -> URL {
        workspaceDirectory.appendingPathComponent("\(safeName(key.rawValue)).json")
    }

    private func safeName(_ value: String) -> String {
        value.replacingOccurrences(of: ".", with: "-")
    }

    private func ensureDirectories() throws {
        try fileManager.createDirectory(at: workspaceDirectory, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: recoveryDirectory, withIntermediateDirectories: true)
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
            "\(label)-corrupt-\(UUID().uuidString).json"
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
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: url.path
        )
    }
}

enum WorkspaceFileStoreError: Error, Equatable {
    case unsupportedVersion(key: String, found: Int, supported: Int)
}
